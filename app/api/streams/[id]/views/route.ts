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

    let playbackId: string | null = null
    let assetInfo: any = null
    const isEnded = !!stream.endedAt
    
    // CRITICAL: According to Livepeer docs, for ended streams we MUST use asset playbackId
    // The Livepeer dashboard shows views for the asset (VOD), not the stream playbackId
    // Reference: https://docs.livepeer.org/developers/guides/get-engagement-analytics-via-api
    // "The playbackId can be a canonical playback ID from a specific Livepeer asset or stream objects"
    // For ended streams, assets have their own playbackId which tracks views separately
    
    if (isEnded && stream.livepeerStreamId) {
      // For ended streams: ONLY use asset playbackId, don't fall back to stream playbackId
      // This is critical because stream playbackId views don't match asset views for VOD
      try {
        console.log(`[Views API] Stream has ended - fetching asset playbackId for views (stream: ${stream.livepeerStreamId})`)
        
        // Add timeout to prevent hanging (10 seconds max - longer for ended streams)
        const assetPromise = getStreamAsset(stream.livepeerStreamId)
        const assetTimeout = new Promise<null>((resolve) => 
          setTimeout(() => {
            console.warn(`[Views API] Asset fetch timeout after 10 seconds for ended stream`)
            resolve(null)
          }, 10000)
        )
        const asset = await Promise.race([assetPromise, assetTimeout])
        
        if (asset?.playbackId) {
          assetInfo = {
            id: asset.id,
            playbackId: asset.playbackId,
            status: asset.status,
            sourceStreamId: asset.sourceStreamId || asset.source?.streamId,
          }
          playbackId = asset.playbackId
          console.log(`[Views API] ✅ Using asset playbackId ${playbackId} for ended stream views (matches Livepeer dashboard)`)
          
          // Log asset status for debugging
          if (asset.status !== "ready") {
            console.log(`[Views API] ⚠️ Asset status is "${asset.status}" but using playbackId for views (views may still be available)`)
          }
        } else if (asset) {
          // Asset exists but no playbackId yet
          console.warn(`[Views API] ⚠️ Asset found but has no playbackId yet (status: ${asset.status}). Asset may still be processing.`)
          // Return null - don't use stream playbackId for ended streams
        } else {
          // No asset found - might still be processing
          console.warn(`[Views API] ⚠️ No asset found for ended stream ${stream.livepeerStreamId}. Asset may still be processing after stream ended.`)
          // Return null - don't use stream playbackId for ended streams
        }
      } catch (assetError: any) {
        // Handle timeout and other errors - but DON'T fall back to stream playbackId for ended streams
        if (assetError?.name === 'AbortError' || assetError?.message?.includes('timeout') || assetError?.message?.includes('aborted')) {
          console.warn(`[Views API] Asset fetch timed out for ended stream. Cannot get views without asset playbackId.`)
        } else {
          console.error(`[Views API] Error fetching asset for ended stream:`, assetError?.message || assetError)
        }
        // Don't fall back to stream playbackId - return null instead
      }
      
      // If we don't have asset playbackId for ended stream, return null
      if (!playbackId) {
        console.log(`[Views API] No asset playbackId available for ended stream - views not available yet`)
        return NextResponse.json({
          streamId: params.id,
          totalViews: null,
          message: "Asset playbackId not available yet. Views will be available once the asset is processed.",
          playbackId: null,
          isAssetPlaybackId: false,
        }, {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        })
      }
    } else if (!isEnded && stream.livepeerStreamId) {
      // For live streams: ALWAYS try to get asset playbackId first if available
      // The Livepeer dashboard shows views for assets/recordings, not stream playbackId
      // Even for live streams, if there's a recording, the dashboard shows asset views
      try {
        console.log(`[Views API] Stream is live - checking for asset playbackId (stream: ${stream.livepeerStreamId})`)
        console.log(`[Views API] NOTE: Livepeer dashboard shows asset views, so we prefer asset playbackId if available`)
        
        // Longer timeout for live streams to ensure we get asset if it exists (8 seconds)
        const assetPromise = getStreamAsset(stream.livepeerStreamId)
        const assetTimeout = new Promise<null>((resolve) => 
          setTimeout(() => {
            console.log(`[Views API] Asset fetch timeout for live stream, will use stream playbackId`)
            resolve(null)
          }, 8000)
        )
        const asset = await Promise.race([assetPromise, assetTimeout])
        
        if (asset?.playbackId) {
          assetInfo = {
            id: asset.id,
            playbackId: asset.playbackId,
            status: asset.status,
            sourceStreamId: asset.sourceStreamId || asset.source?.streamId,
          }
          playbackId = asset.playbackId
          console.log(`[Views API] ✅ Using asset playbackId ${playbackId} for live stream views (matches dashboard - recording available)`)
        } else {
          // For live streams without asset, use stream playbackId
          playbackId = stream.playbackId
          console.log(`[Views API] No asset found for live stream, using stream playbackId ${playbackId}`)
          console.log(`[Views API] NOTE: This may not match dashboard if asset exists but wasn't found`)
        }
      } catch (assetError: any) {
        // For live streams, fall back to stream playbackId on error
        playbackId = stream.playbackId
        console.log(`[Views API] Error fetching asset for live stream, using stream playbackId: ${playbackId}`)
        console.log(`[Views API] Error details:`, assetError?.message || assetError)
      }
    } else {
      // No livepeerStreamId - use stream playbackId if available
      playbackId = stream.playbackId
      if (playbackId) {
        console.log(`[Views API] Using stream playbackId ${playbackId} (no livepeerStreamId available)`)
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
    console.log(`[Views API] ========== FETCHING VIEWS ==========`)
    console.log(`[Views API] Stream ID: ${params.id}`)
    console.log(`[Views API] Stream ended: ${isEnded}`)
    console.log(`[Views API] Stream playbackId: ${stream.playbackId}`)
    console.log(`[Views API] Asset playbackId: ${assetInfo?.playbackId || 'N/A'}`)
    console.log(`[Views API] Using playbackId for views: ${playbackId}`)
    console.log(`[Views API] Is asset playbackId: ${assetInfo?.playbackId === playbackId}`)
    console.log(`[Views API] ====================================`)
    
    const totalViews = await getTotalViews(playbackId)
    
    // totalViews can be:
    // - number (including 0): valid view count from Livepeer
    // - null: endpoint unavailable, error, or views not available yet
    // We want to return null only if getTotalViews returned null (not available)
    // If it returned 0, that's a valid number and should be returned as 0
    const responseTotalViews = typeof totalViews === "number" ? totalViews : null
    
    console.log(`[Views API] ========== VIEWS RESULT ==========`)
    console.log(`[Views API] Stream ID: ${params.id}`)
    console.log(`[Views API] PlaybackId used: ${playbackId}`)
    console.log(`[Views API] Is asset playbackId: ${assetInfo?.playbackId === playbackId}`)
    console.log(`[Views API] Asset ID: ${assetInfo?.id || 'N/A'}`)
    console.log(`[Views API] Asset status: ${assetInfo?.status || 'N/A'}`)
    console.log(`[Views API] Total views returned: ${responseTotalViews}`)
    console.log(`[Views API] Raw totalViews: ${totalViews}`)
    console.log(`[Views API] ====================================`)

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
