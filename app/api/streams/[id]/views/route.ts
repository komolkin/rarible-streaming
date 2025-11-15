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
    let assetInfo: any = null
    
    // CRITICAL: For ended streams (and live streams with recordings), use asset playbackId
    // The Livepeer dashboard shows views for the asset (VOD), not the stream
    // Always try to get asset for accurate view counts
    if (stream.livepeerStreamId) {
      try {
        console.log(`[Views API] Fetching asset for stream ${stream.livepeerStreamId} (ended: ${!!stream.endedAt})`)
        const asset = await getStreamAsset(stream.livepeerStreamId)
        
        if (asset) {
          assetInfo = {
            id: asset.id,
            playbackId: asset.playbackId,
            status: asset.status,
            sourceStreamId: asset.sourceStreamId || asset.source?.streamId,
          }
          console.log(`[Views API] Asset found:`, assetInfo)
          
          if (asset.playbackId) {
            // Use asset playbackId for views (this matches what Livepeer dashboard shows)
            playbackId = asset.playbackId
            console.log(`[Views API] ✅ Using asset playbackId ${playbackId} for views (matches dashboard)`)
            
            // Log if asset is not ready (views might still be available)
            if (asset.status !== "ready") {
              console.log(`[Views API] ⚠️ Asset status is "${asset.status}" but using playbackId for views`)
            }
          } else {
            console.warn(`[Views API] ⚠️ Asset found but has no playbackId, using stream playbackId`)
          }
        } else {
          console.log(`[Views API] No asset found for stream ${stream.livepeerStreamId}, using stream playbackId`)
        }
      } catch (assetError: any) {
        console.error(`[Views API] Error fetching asset:`, assetError?.message || assetError)
        console.log(`[Views API] Falling back to stream playbackId: ${stream.playbackId}`)
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
    console.log(`[Views API] Fetching views from Livepeer API for playbackId: ${playbackId}`)
    const totalViews = await getTotalViews(playbackId)
    
    console.log(`[Views API] Result:`, {
      streamId: params.id,
      playbackIdUsed: playbackId,
      isAssetPlaybackId: assetInfo?.playbackId === playbackId,
      assetId: assetInfo?.id,
      assetStatus: assetInfo?.status,
      totalViews: totalViews,
    })

    return NextResponse.json(
      {
        streamId: params.id,
        totalViews: totalViews ?? null,
        playbackId: playbackId, // Include which playbackId was used
        isAssetPlaybackId: assetInfo?.playbackId === playbackId, // Indicate if asset playbackId was used
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
