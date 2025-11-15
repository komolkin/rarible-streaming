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
    
    // CRITICAL: Always try to get asset playbackId for views
    // The Livepeer dashboard shows views for the asset (VOD), not the stream
    // Even for live streams, if there's a recording/asset, the dashboard shows asset views
    // This ensures we match what the Livepeer dashboard displays
    // According to Livepeer docs: views are tracked per playbackId, and assets have their own playbackId
    if (stream.livepeerStreamId) {
      try {
        console.log(`[Views API] Fetching asset for stream ${stream.livepeerStreamId} (ended: ${!!stream.endedAt})`)
        
        // Add timeout to prevent hanging (8 seconds max)
        const assetPromise = getStreamAsset(stream.livepeerStreamId)
        const assetTimeout = new Promise<null>((resolve) => 
          setTimeout(() => {
            console.warn(`[Views API] Asset fetch timeout after 8 seconds`)
            resolve(null)
          }, 8000)
        )
        const asset = await Promise.race([assetPromise, assetTimeout])
        
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
            // Even if asset is not "ready", the playbackId might still have views data
            playbackId = asset.playbackId
            console.log(`[Views API] ✅ Using asset playbackId ${playbackId} for views (matches dashboard)`)
            
            // Log asset status for debugging
            if (asset.status !== "ready") {
              console.log(`[Views API] ⚠️ Asset status is "${asset.status}" but using playbackId for views (views may still be available)`)
            }
          } else {
            console.warn(`[Views API] ⚠️ Asset found but has no playbackId, using stream playbackId`)
          }
        } else {
          console.log(`[Views API] No asset found for stream ${stream.livepeerStreamId}, using stream playbackId`)
        }
      } catch (assetError: any) {
        // Handle timeout and other errors gracefully
        if (assetError?.name === 'AbortError' || assetError?.message?.includes('timeout') || assetError?.message?.includes('aborted')) {
          console.warn(`[Views API] Asset fetch timed out, using stream playbackId: ${stream.playbackId}`)
        } else {
          console.error(`[Views API] Error fetching asset:`, assetError?.message || assetError)
          console.log(`[Views API] Falling back to stream playbackId: ${stream.playbackId}`)
        }
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
    
    // totalViews can be:
    // - number (including 0): valid view count from Livepeer
    // - null: endpoint unavailable, error, or views not available yet
    // We want to return null only if getTotalViews returned null (not available)
    // If it returned 0, that's a valid number and should be returned as 0
    const responseTotalViews = typeof totalViews === "number" ? totalViews : null
    
    console.log(`[Views API] Result:`, {
      streamId: params.id,
      playbackIdUsed: playbackId,
      isAssetPlaybackId: assetInfo?.playbackId === playbackId,
      assetId: assetInfo?.id,
      assetStatus: assetInfo?.status,
      totalViews: responseTotalViews,
      rawTotalViews: totalViews,
    })

    return NextResponse.json(
      {
        streamId: params.id,
        totalViews: responseTotalViews, // null if unavailable, number (including 0) if available
        playbackId: playbackId, // Include which playbackId was used
        isAssetPlaybackId: assetInfo?.playbackId === playbackId, // Indicate if asset playbackId was used
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Content-Type-Options': 'nosniff',
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
