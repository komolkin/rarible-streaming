import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { streams } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getTotalViews, getStreamAsset } from "@/lib/livepeer"

// Disable caching for this route to ensure fresh view counts
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/streams/[id]/views
 * Get total views count from Livepeer API (if available)
 * For ended streams, uses asset playbackId instead of stream playbackId
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const [stream] = await db
      .select({
        id: streams.id,
        playbackId: streams.livepeerPlaybackId,
        endedAt: streams.endedAt,
        livepeerStreamId: streams.livepeerStreamId,
      })
      .from(streams)
      .where(eq(streams.id, params.id))

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 })
    }

    let playbackId = stream.playbackId
    
    // CRITICAL: For ended streams, use asset playbackId instead of stream playbackId
    // The Livepeer dashboard shows views for the asset (VOD), not the stream
    if (stream.endedAt && stream.livepeerStreamId) {
      try {
        console.log(`[Views API] Stream has ended, fetching asset playbackId for views`)
        const asset = await getStreamAsset(stream.livepeerStreamId)
        if (asset?.playbackId && asset.status === "ready") {
          playbackId = asset.playbackId
          console.log(`[Views API] ✅ Using asset playbackId ${playbackId} for views (matches dashboard)`)
        } else if (asset?.playbackId) {
          // Asset exists but not ready - still use it for views (views might be available before asset is ready)
          playbackId = asset.playbackId
          console.log(`[Views API] ⚠️ Using asset playbackId ${playbackId} (status: ${asset.status})`)
        }
      } catch (assetError: any) {
        console.warn(`[Views API] Could not fetch asset for ended stream:`, assetError?.message)
        // Fall back to stream playbackId
      }
    }
    
    if (!playbackId) {
      return NextResponse.json({
        streamId: params.id,
        totalViews: null,
        message: "Stream has no playbackId yet",
      })
    }

    // Try to get total views from Livepeer API
    // For ended streams, this will use asset playbackId which matches the dashboard
    const totalViews = await getTotalViews(playbackId)
    
    console.log(`[Views API] Fetched views for playbackId ${playbackId}: ${totalViews}`)

    return NextResponse.json(
      {
        streamId: params.id,
        totalViews: totalViews ?? null,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    )
  } catch (error: any) {
    console.error(`[Views API] Error fetching total views for stream ${params.id}:`, error)
    return NextResponse.json(
      { 
        streamId: params.id,
        totalViews: null,
        error: error?.message || "Failed to fetch total views" 
      },
      { status: 500 }
    )
  }
}
