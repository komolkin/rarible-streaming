import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { streams } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getStreamAsset, getStreamSessions, getStream } from "@/lib/livepeer"

/**
 * GET /api/streams/[id]/recording
 * 
 * Fetches the recording/asset for an ended stream from Livepeer by stream ID.
 * 
 * How Livepeer Recording Works:
 * 1. When a stream ends with recording enabled, Livepeer automatically creates an Asset
 * 2. The Asset can be queried by sourceStreamId (the original stream's ID)
 * 3. Assets API: GET /api/asset?sourceStreamId={streamId} - returns assets created from the stream
 * 4. Sessions API: GET /api/stream/{streamId}/sessions - surfaces recordings quickly after stream ends
 * 5. The Asset has its own playbackId which is used for VOD playback
 * 6. Asset status can be: "ready", "processing", "failed", etc.
 * 
 * This endpoint tries multiple methods in order:
 * 1. Assets API (most reliable for VOD playback)
 * 2. Sessions API (fastest, available immediately after stream ends)
 * 3. Stream metadata (fallback)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get stream from database
    const [stream] = await db.select().from(streams).where(eq(streams.id, params.id))

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 })
    }

    if (!stream.livepeerStreamId) {
      return NextResponse.json({ error: "Stream has no Livepeer stream ID" }, { status: 400 })
    }

    if (!stream.endedAt) {
      return NextResponse.json({ error: "Stream has not ended yet" }, { status: 400 })
    }

    console.log(`[Recording API] Fetching recording for stream ${stream.livepeerStreamId}`)

    // METHOD 1: Try Assets API first (most reliable for VOD playback)
    // Assets are created from recorded streams and have their own playbackId
    try {
      console.log(`[Recording API] Method 1: Checking Assets API...`)
      const asset = await getStreamAsset(stream.livepeerStreamId)

      if (asset && asset.status === "ready" && asset.playbackId) {
        console.log(`[Recording API] ✅ Found ready asset:`, {
          assetId: asset.id,
          playbackId: asset.playbackId,
          status: asset.status,
          duration: asset.duration,
          playbackUrl: asset.playbackUrl,
        })

        return NextResponse.json({
          success: true,
          source: "asset",
          recording: {
            id: asset.id,
            playbackId: asset.playbackId,
            playbackUrl: asset.playbackUrl || `https://playback.livepeer.com/hls/${asset.playbackId}/index.m3u8`,
            status: asset.status,
            duration: asset.duration,
            createdAt: asset.createdAt,
            sourceStreamId: asset.sourceStreamId || stream.livepeerStreamId,
          },
        })
      } else if (asset && asset.status !== "ready") {
        console.log(`[Recording API] ⚠️ Asset found but not ready (status: ${asset.status})`)
        return NextResponse.json({
          success: false,
          source: "asset",
          status: asset.status,
          message: `Asset is ${asset.status}. Please try again in a few moments.`,
        }, { status: 202 }) // 202 Accepted - processing
      }
    } catch (assetError: any) {
      console.warn(`[Recording API] Assets API failed:`, assetError?.message)
    }

    // METHOD 2: Try Sessions API (fastest, available immediately after stream ends)
    // Sessions surface recordings quickly but may not have full asset metadata
    try {
      console.log(`[Recording API] Method 2: Checking Sessions API...`)
      const sessions = await getStreamSessions(stream.livepeerStreamId, {
        limit: 10,
        recordOnly: true,
      })

      if (sessions && sessions.length > 0) {
        // Find the most recent session with recording
        const recordingSession = sessions.find(
          (s: any) => s.record && (s.recordingUrl || s.playbackUrl || s.playbackId)
        )

        if (recordingSession) {
          const recordingUrl =
            recordingSession.recordingUrl ||
            recordingSession.playbackUrl ||
            recordingSession?.playback?.hls ||
            recordingSession?.playback?.url

          const playbackId =
            recordingSession.playbackId ||
            recordingSession?.playback?.id ||
            stream.livepeerPlaybackId

          console.log(`[Recording API] ✅ Found recording in session:`, {
            sessionId: recordingSession.id,
            playbackId,
            recordingUrl,
            duration: recordingSession.duration,
          })

          return NextResponse.json({
            success: true,
            source: "session",
            recording: {
              id: recordingSession.id,
              playbackId: playbackId || stream.livepeerPlaybackId,
              playbackUrl: recordingUrl || (playbackId ? `https://playback.livepeer.com/hls/${playbackId}/index.m3u8` : null),
              status: "ready",
              duration: recordingSession.duration || recordingSession.recordingDuration,
              createdAt: recordingSession.createdAt || recordingSession.createdAtTimestamp,
              sourceStreamId: stream.livepeerStreamId,
            },
          })
        }
      }
    } catch (sessionError: any) {
      console.warn(`[Recording API] Sessions API failed:`, sessionError?.message)
    }

    // METHOD 3: Check stream metadata (fallback)
    // Sometimes recordings are included in the stream response
    try {
      console.log(`[Recording API] Method 3: Checking stream metadata...`)
      const streamData = await getStream(stream.livepeerStreamId)

      if (streamData?.recordings && Array.isArray(streamData.recordings) && streamData.recordings.length > 0) {
        const recording = streamData.recordings[0]
        console.log(`[Recording API] ✅ Found recording in stream metadata`)

        return NextResponse.json({
          success: true,
          source: "stream_metadata",
          recording: {
            id: recording.id || stream.livepeerStreamId,
            playbackId: recording.playbackId || stream.livepeerPlaybackId,
            playbackUrl: recording.recordingUrl || recording.playbackUrl,
            status: "ready",
            duration: recording.duration,
            createdAt: recording.createdAt,
            sourceStreamId: stream.livepeerStreamId,
          },
        })
      }
    } catch (streamError: any) {
      console.warn(`[Recording API] Stream metadata check failed:`, streamError?.message)
    }

    // If stream has playbackId, we can still use it for VOD playback
    // According to Livepeer docs, the Player can handle VOD with stream playbackId
    if (stream.livepeerPlaybackId) {
      console.log(`[Recording API] ⚠️ No asset/session found, but stream has playbackId - Player can handle VOD`)
      return NextResponse.json({
        success: true,
        source: "stream_playbackId",
        recording: {
          id: stream.livepeerStreamId,
          playbackId: stream.livepeerPlaybackId,
          playbackUrl: `https://playback.livepeer.com/hls/${stream.livepeerPlaybackId}/index.m3u8`,
          status: "ready",
          sourceStreamId: stream.livepeerStreamId,
          note: "Using stream playbackId - Livepeer Player handles VOD automatically",
        },
      })
    }

    // No recording found
    console.warn(`[Recording API] ⚠️ No recording found for stream ${stream.livepeerStreamId}`)
    return NextResponse.json({
      success: false,
      message: "Recording not available yet. Livepeer is still processing the recording. Please try again in a few minutes.",
    }, { status: 404 })
  } catch (error: any) {
    console.error(`[Recording API] Error fetching recording:`, error)
    return NextResponse.json(
      { error: error?.message || "Failed to fetch recording" },
      { status: 500 }
    )
  }
}

