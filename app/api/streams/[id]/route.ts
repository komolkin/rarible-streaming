import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { streams, categories, chatMessages, streamLikes } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getStreamStatus, getTotalViews as getLivepeerTotalViews } from "@/lib/livepeer"

// Increase timeout for Vercel functions (max 60s on Pro, 10s on Hobby)
export const maxDuration = 30

// Helper function to get the correct playbackId for views
// CRITICAL: For ended streams, MUST use asset playbackId (matches Livepeer dashboard)
// Reference: https://docs.livepeer.org/developers/guides/get-engagement-analytics-via-api
// Following Livepeer docs: https://docs.livepeer.org/api-reference/asset/get
// For live streams, uses stream playbackId (or asset playbackId if recording is available)
async function getViewsPlaybackId(
  streamId: string,
  streamPlaybackId: string | null | undefined,
  endedAt: Date | null | undefined,
  livepeerStreamId: string | null | undefined,
  cachedAssetPlaybackId?: string | null | undefined,
  cachedAssetId?: string | null | undefined
): Promise<string | null> {
  const isEnded = !!endedAt
  
  // Priority 1: Use cached asset playbackId from database (fastest, avoids API call)
  if (cachedAssetPlaybackId) {
    console.log(
      `[Views] ✅ Using stored asset playbackId ${cachedAssetPlaybackId} from database for stream ${streamId}`
    )
    return cachedAssetPlaybackId
  }
  
  // Priority 2: For ended streams, fetch asset playbackId from Livepeer API if not cached
  // Following Livepeer docs: If we have assetId, directly call /api/asset/{assetId} to get playbackId
  // This is critical because stream playbackId views don't match asset views for VOD
  if (isEnded && livepeerStreamId) {
    try {
      // Priority 2a: If we have stored assetId, directly fetch asset using /api/asset/{assetId}
      // This follows the Livepeer docs pattern: https://docs.livepeer.org/api-reference/asset/get
      if (cachedAssetId) {
        try {
          const { getAsset } = await import("@/lib/livepeer")
          const asset = await getAsset(cachedAssetId)
          if (asset?.playbackId) {
            console.log(`[Views] ✅ Fetched asset playbackId ${asset.playbackId} directly using assetId ${cachedAssetId} (matches Livepeer dashboard)`)
            return asset.playbackId
          }
        } catch (assetError) {
          console.warn(`[Views] Failed to fetch asset by ID ${cachedAssetId}, falling back to getStreamAsset`)
          // Fall through to getStreamAsset
        }
      }
      
      // Priority 2b: Fallback to getStreamAsset if no assetId or direct fetch failed
      const { getStreamAsset } = await import("@/lib/livepeer")
      const asset = await getStreamAsset(livepeerStreamId)
      if (asset?.playbackId) {
        console.log(`[Views] ✅ Using asset playbackId ${asset.playbackId} for ended stream ${streamId} (matches Livepeer dashboard)`)
        // Note: Asset metadata should be stored by the stream detail route, so this is a fallback
        return asset.playbackId
      } else {
        // Asset not ready yet - return null instead of falling back to stream playbackId
        console.warn(`[Views] Asset not ready for ended stream ${streamId} - views not available yet`)
        return null
      }
    } catch (error) {
      // Don't fall back to stream playbackId for ended streams
      console.warn(`[Views] Could not fetch asset for ended stream ${streamId} - views not available yet`)
      return null
    }
  }
  
  // Priority 3: For live streams, use stream playbackId (or try asset if available)
  if (!isEnded && livepeerStreamId) {
    try {
      // Try using stored assetId first if available
      if (cachedAssetId) {
        try {
          const { getAsset } = await import("@/lib/livepeer")
          const asset = await getAsset(cachedAssetId)
          if (asset?.playbackId) {
            console.log(`[Views] Using asset playbackId ${asset.playbackId} for live stream ${streamId} (recording available)`)
            return asset.playbackId
          }
        } catch (assetError) {
          // Fall through to getStreamAsset
        }
      }
      
      const { getStreamAsset } = await import("@/lib/livepeer")
      const asset = await getStreamAsset(livepeerStreamId)
      if (asset?.playbackId) {
        // Use asset playbackId if available (for recordings during live stream)
        console.log(`[Views] Using asset playbackId ${asset.playbackId} for live stream ${streamId} (recording available)`)
        return asset.playbackId
      }
    } catch (error) {
      // Fall back to stream playbackId for live streams
      console.log(`[Views] Using stream playbackId for live stream ${streamId}`)
    }
  }
  
  // Fallback to stream playbackId (for live streams or when no livepeerStreamId)
  return streamPlaybackId || null
}


// Helper function to get total views from Livepeer API only
async function getTotalViews(streamId: string, playbackId?: string | null): Promise<number | null> {
  if (!playbackId) {
    return null
  }
  
  try {
    const livepeerTotalViews = await getLivepeerTotalViews(playbackId)
    if (livepeerTotalViews !== null && livepeerTotalViews !== undefined) {
      console.log(`[GET Stream ${streamId}] Using Livepeer total views: ${livepeerTotalViews} for playbackId: ${playbackId}`)
      return livepeerTotalViews
    }
  } catch (error) {
    console.log(`[GET Stream ${streamId}] Livepeer total views not available`)
  }
  
  return null
}

// Disable caching for this route to ensure fresh view counts
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Fetch stream (including asset metadata)
    const [stream] = await db.select().from(streams).where(eq(streams.id, params.id))

    if (!stream) {
      console.error(`[GET Stream ${params.id}] Stream not found in database`)
      return NextResponse.json({ error: "Stream not found" }, { status: 404 })
    }
    
    console.log(`[GET Stream ${params.id}] Found stream:`, {
      id: stream.id,
      title: stream.title,
      endedAt: stream.endedAt,
      livepeerStreamId: stream.livepeerStreamId,
      livepeerPlaybackId: stream.livepeerPlaybackId,
      isLive: stream.isLive
    })

    // Fetch category if categoryId exists
    let category = null
    if (stream.categoryId) {
      const [categoryData] = await db.select().from(categories).where(eq(categories.id, stream.categoryId))
      category = categoryData || null
    }

    // If stream has been manually ended (endedAt is set), don't check/update Livepeer status
    const isManuallyEnded = !!stream.endedAt

    // For ended streams without vodUrl, try multiple methods to find recordings
    // Method 1: Check stream sessions (fastest, most reliable)
    // Method 2: Check assets API
    // Method 3: Use stream playbackId as fallback (may not work for VOD but worth trying)
    if (isManuallyEnded && stream.livepeerStreamId) {
      let vodUrl = stream.vodUrl || null
      let previewImageUrl = stream.previewImageUrl || null
      let assetPlaybackId = null // Track asset playbackId for Player component (not stored in DB)
      
      try {
        const { getStream, getStreamAsset, getStreamRecording, getStreamSessions } = await import("@/lib/livepeer")
        
        console.log(`[GET Stream ${params.id}] Finding recording for ended stream: ${stream.livepeerStreamId}`)
        
        // METHOD 1: Check stream sessions first (fastest method)
        // Add timeout to prevent hanging
          try {
            console.log(`[GET Stream ${params.id}] Method 1: Checking stream sessions...`)
            
            // Add timeout for getStream call (5 seconds max)
            const streamDataPromise = getStream(stream.livepeerStreamId)
            const streamDataTimeout = new Promise<null>((resolve) => 
              setTimeout(() => {
                console.warn(`[GET Stream ${params.id}] getStream timeout after 5 seconds`)
                resolve(null)
              }, 5000)
            )
            const streamData = await Promise.race([streamDataPromise, streamDataTimeout])
            
            let sessions: any[] = []
            
            if (streamData?.sessions && Array.isArray(streamData.sessions) && streamData.sessions.length > 0) {
              sessions = streamData.sessions
            }

            if (sessions.length === 0 && streamData) {
              // Add timeout for getStreamSessions call (5 seconds max)
              const sessionsPromise = getStreamSessions(stream.livepeerStreamId, { limit: 10, recordOnly: true })
              const sessionsTimeout = new Promise<any[]>((resolve) => 
                setTimeout(() => {
                  console.warn(`[GET Stream ${params.id}] getStreamSessions timeout after 5 seconds`)
                  resolve([])
                }, 5000)
              )
              sessions = await Promise.race([sessionsPromise, sessionsTimeout])
            }

            if (sessions.length > 0) {
              for (const session of sessions) {
                if (session.record && (session.recordingUrl || session.playbackUrl)) {
                  const recordingUrl = session.recordingUrl || session.playbackUrl
                  console.log(`[GET Stream ${params.id}] ✅ Found recording in session ${session.id}: ${recordingUrl}`)
                  if (!vodUrl) {
                    vodUrl = recordingUrl
                    console.log(`[GET Stream ${params.id}] Using session recording URL for VOD`)
                  }
                  break
                }
              }
            } else {
              console.log(`[GET Stream ${params.id}] No session recordings available yet`)
            }
            
            // Also check recordings array if it exists
            if (!vodUrl && streamData?.recordings && Array.isArray(streamData.recordings) && streamData.recordings.length > 0) {
              const recording = streamData.recordings[0]
              const recordingUrl = recording.recordingUrl || recording.playbackUrl
              if (recordingUrl) {
                console.log(`[GET Stream ${params.id}] ✅ Found recording in stream.recordings: ${recordingUrl}`)
                vodUrl = recordingUrl
              }
            }
            
            // Try to get thumbnail from playback info API for ended streams
            // According to Livepeer docs: playback info API returns thumbnail URL in meta.source
            // Add timeout to prevent hanging (3 seconds max)
            if (!previewImageUrl && stream.livepeerPlaybackId) {
              try {
                const { getLiveThumbnailUrl } = await import("@/lib/livepeer")
                const thumbnailPromise = getLiveThumbnailUrl(stream.livepeerPlaybackId)
                const thumbnailTimeout = new Promise<null>((resolve) => 
                  setTimeout(() => {
                    console.warn(`[GET Stream ${params.id}] Thumbnail fetch timeout after 3 seconds`)
                    resolve(null)
                  }, 3000)
                )
                const thumbnailUrl = await Promise.race([thumbnailPromise, thumbnailTimeout])
                if (thumbnailUrl) {
                  previewImageUrl = thumbnailUrl
                  console.log(`[GET Stream ${params.id}] ✅ Got thumbnail from playback info API: ${thumbnailUrl}`)
                }
              } catch (thumbError: any) {
                console.warn(`[GET Stream ${params.id}] Could not get thumbnail from playback info:`, thumbError?.message)
              }
            }
          } catch (sessionError: any) {
            console.warn(`[GET Stream ${params.id}] Error checking stream sessions:`, sessionError?.message)
          }
        
        // METHOD 2: Check assets API (if session method didn't work)
        // Following Livepeer docs: https://docs.livepeer.org/api-reference/asset/get
        // If we have assetId stored, directly call /api/asset/{assetId} to get playbackId
        if (!vodUrl) {
          try {
            console.log(`[GET Stream ${params.id}] Method 2: Checking assets API...`)
            
            let asset: any = null
            
            // Priority 1: If we have assetId stored, directly fetch asset using /api/asset/{assetId}
            // This follows the Livepeer docs pattern: https://docs.livepeer.org/api-reference/asset/get
            if (stream.assetId) {
              try {
                console.log(`[GET Stream ${params.id}] Using stored assetId ${stream.assetId} to fetch asset directly`)
                const { getAsset } = await import("@/lib/livepeer")
                const assetFetchPromise = getAsset(stream.assetId)
                const timeoutPromise = new Promise<null>((resolve) => 
                  setTimeout(() => {
                    console.warn(`[GET Stream ${params.id}] Asset fetch timeout after 8 seconds`)
                    resolve(null)
                  }, 8000)
                )
                asset = await Promise.race([assetFetchPromise, timeoutPromise])
                
                if (asset) {
                  console.log(`[GET Stream ${params.id}] ✅ Fetched asset directly using assetId: ${asset.id}, playbackId: ${asset.playbackId}`)
                }
              } catch (assetError: any) {
                console.warn(`[GET Stream ${params.id}] Failed to fetch asset by ID ${stream.assetId}:`, assetError?.message)
                // Fall through to getStreamAsset fallback
              }
            }
            
            // Priority 2: If no stored assetId or direct fetch failed, use getStreamAsset to find asset
            if (!asset && stream.livepeerStreamId) {
              console.log(`[GET Stream ${params.id}] No stored assetId or direct fetch failed, using getStreamAsset to find asset`)
              const assetFetchPromise = getStreamAsset(stream.livepeerStreamId)
              const timeoutPromise = new Promise<null>((resolve) => 
                setTimeout(() => {
                  console.warn(`[GET Stream ${params.id}] Asset fetch timeout after 8 seconds`)
                  resolve(null)
                }, 8000)
              )
              
              asset = await Promise.race([assetFetchPromise, timeoutPromise])
            }
            
            if (asset) {
              // Use helper function to check if asset is ready
              // According to Livepeer docs: status is an object with phase property
              // https://docs.livepeer.org/api-reference/asset/get
              const { isAssetReady } = await import("@/lib/livepeer")
              const assetReady = isAssetReady(asset)
              const assetStatus = typeof asset.status === 'object' ? asset.status?.phase : asset.status
              
              console.log(`[GET Stream ${params.id}] Asset details (from /api/asset/{assetId}):`, {
                id: asset.id,
                status: assetStatus,
                statusObject: asset.status,
                playbackId: asset.playbackId,
                playbackUrl: asset.playbackUrl,
                sourceStreamId: asset.sourceStreamId || asset.source?.streamId,
                hasExistingVodUrl: !!vodUrl,
                isReady: assetReady
              })
              
              // Store assetId and playbackId even if not ready (so frontend knows asset exists)
              if (asset.id) {
                // Always store assetId when we fetch it (even if not ready)
                if (asset.id !== stream.assetId) {
                  try {
                    await db
                      .update(streams)
                      .set({
                        assetId: asset.id,
                        updatedAt: new Date(),
                      })
                      .where(eq(streams.id, params.id))
                    console.log(`[GET Stream ${params.id}] ✅ Stored assetId: ${asset.id}`)
                  } catch (dbError) {
                    console.warn(`[GET Stream ${params.id}] Failed to store assetId:`, dbError)
                  }
                }
              }
              
              // CRITICAL: Only use asset playbackId and set vodUrl if asset is ready
              // Unready assets will cause format errors in the player
              if (!assetReady) {
                console.log(`[GET Stream ${params.id}] Asset ${asset.id} is processing. Status phase: ${assetStatus}. Asset exists but not ready yet.`)
                // Store assetId so we can check again later, but don't set vodUrl yet
                // The frontend will see assetPlaybackId is null and know to wait
              } else if (asset.playbackId) {
                // Asset is ready - store the asset playbackId and ID for Player component
                assetPlaybackId = asset.playbackId
                // Store asset metadata in database for future use (especially for views)
                // asset_playback_id is different from livepeer_playback_id and is needed for VOD views
                if (asset.id && asset.playbackId) {
                  try {
                    await db
                      .update(streams)
                      .set({
                        assetId: asset.id,
                        assetPlaybackId: asset.playbackId,
                        updatedAt: new Date(),
                      })
                      .where(eq(streams.id, params.id))
                    console.log(`[GET Stream ${params.id}] ✅ Stored asset metadata: assetId=${asset.id}, assetPlaybackId=${asset.playbackId}`)
                  } catch (dbError) {
                    console.warn(`[GET Stream ${params.id}] Failed to store asset metadata:`, dbError)
                  }
                }
                // Use the asset's playbackId to construct HLS URL for VOD
                // This is the correct playbackId for VOD assets
                const newVodUrl = `https://playback.livepeer.com/hls/${asset.playbackId}/index.m3u8`
                if (!vodUrl || vodUrl !== newVodUrl) {
                  vodUrl = newVodUrl
                  console.log(`[GET Stream ${params.id}] ✅ Asset is ready! Using asset playbackId for VOD: ${asset.playbackId}, HLS URL: ${vodUrl}`)
                }
              } else if (asset.playbackUrl) {
                // Use asset playback URL if available (could be HLS or MP4)
                // Only if asset is ready
                if (!vodUrl || vodUrl !== asset.playbackUrl) {
                  vodUrl = asset.playbackUrl
                  console.log(`[GET Stream ${params.id}] ✅ Asset is ready! Using asset playbackUrl: ${vodUrl}`)
                }
              } else {
                console.warn(`[GET Stream ${params.id}] Asset ${asset.id} has no playbackId or playbackUrl. Status: ${asset.status}`)
              }
              
              
              // Only generate thumbnail if user hasn't uploaded a cover image
              // Skip thumbnail generation if we're running low on time (non-blocking)
              if (!previewImageUrl && asset.playbackId) {
                try {
                  const { generateAndVerifyThumbnail } = await import("@/lib/livepeer")
                  const thumbnailPromise = generateAndVerifyThumbnail(asset.playbackId, {
                    isVod: true,
                    duration: asset.duration,
                    maxRetries: 2,
                    retryDelay: 1500,
                  })
                  
                  const thumbnailTimeout = new Promise<null>((resolve) => 
                    setTimeout(() => resolve(null), 3000)
                  )
                  
                  previewImageUrl = await Promise.race([thumbnailPromise, thumbnailTimeout])
                  if (previewImageUrl) {
                    console.log(`Generated preview image URL from asset playbackId: ${previewImageUrl}`)
                  }
                } catch (thumbError: any) {
                  console.warn(`[GET Stream ${params.id}] Thumbnail generation error:`, thumbError?.message)
                }
              }
            } else {
              console.warn(`[GET Stream ${params.id}] No asset found via assets API`)
            }
          } catch (assetError: any) {
            console.warn(`[GET Stream ${params.id}] Error fetching asset:`, assetError?.message)
          }
        }
        
        // METHOD 3: Fallback to stream playbackId (may not work for VOD but worth trying)
        if (!vodUrl && stream.livepeerPlaybackId) {
          console.log(`[GET Stream ${params.id}] Method 3: Trying stream playbackId as fallback...`)
          // Try constructing HLS URL from stream playbackId
          // Note: This may not work for VOD, but some streams might have it available
          const fallbackUrl = `https://playback.livepeer.com/hls/${stream.livepeerPlaybackId}/index.m3u8`
          console.log(`[GET Stream ${params.id}] ⚠️ Using stream playbackId as fallback (may not work for VOD): ${fallbackUrl}`)
          vodUrl = fallbackUrl
        }
        
        // Update stream with recording information if we found something
        if (vodUrl && vodUrl !== stream.vodUrl) {
          console.log(`[GET Stream ${params.id}] Updating stream with vodUrl: ${vodUrl}`)
          try {
          const [updated] = await db
            .update(streams)
            .set({
              vodUrl: vodUrl,
              previewImageUrl: previewImageUrl || stream.previewImageUrl,
              updatedAt: new Date(),
            })
            .where(eq(streams.id, params.id))
            .returning()
          
          // Fetch category for updated stream
          let updatedCategory = null
          if (updated.categoryId) {
            const [categoryData] = await db.select().from(categories).where(eq(categories.id, updated.categoryId))
            updatedCategory = categoryData || null
          }
          
          console.log(`[GET Stream ${params.id}] ✅ Stream updated with vodUrl`)
          
          // For ended streams, use asset playbackId for views (matches Livepeer dashboard)
          const viewsPlaybackId = assetPlaybackId || updated.livepeerPlaybackId
          const totalViews = await getTotalViews(params.id, viewsPlaybackId)
          console.log(`[GET Stream ${params.id}] Using playbackId ${viewsPlaybackId} for views: ${totalViews}`)
          return NextResponse.json({
            ...updated,
            category: updatedCategory,
            assetPlaybackId: assetPlaybackId, // Include asset playbackId for Player component
            totalViews: totalViews,
          })
          } catch (dbError: any) {
            console.error(`[GET Stream ${params.id}] Database update error:`, dbError?.message)
          }
        }
        
        // If we found assetPlaybackId, return it immediately (even if vodUrl didn't change)
        // This ensures frontend gets the correct playbackId
        if (assetPlaybackId) {
          console.log(`[GET Stream ${params.id}] ✅ Returning with asset playbackId: ${assetPlaybackId}`)
          // For ended streams, use asset playbackId for views (matches Livepeer dashboard)
          const totalViews = await getTotalViews(params.id, assetPlaybackId)
          console.log(`[GET Stream ${params.id}] Using asset playbackId ${assetPlaybackId} for views: ${totalViews}`)
          return NextResponse.json({
            ...stream,
            category: category,
            assetPlaybackId: assetPlaybackId,
            totalViews: totalViews,
          })
        }
        
        // If no vodUrl found, log warning but continue
        if (!vodUrl) {
          console.warn(`[GET Stream ${params.id}] ⚠️ No recording found via any method. Stream may need more time to process.`)
          console.warn(`[GET Stream ${params.id}] Livepeer Stream ID: ${stream.livepeerStreamId}`)
          console.warn(`[GET Stream ${params.id}] This is normal - recordings can take a few minutes to appear after stream ends.`)
        }
      } catch (error: any) {
        console.error(`[GET Stream ${params.id}] Error fetching asset for ended stream:`, error?.message || error)
        // Log full error for debugging
        if (error?.stack) {
          console.error(`[GET Stream ${params.id}] Error stack:`, error.stack)
        }
        // Check if it's a timeout error
        if (error?.name === 'AbortError' || error?.message?.includes('timeout') || error?.message?.includes('aborted')) {
          console.warn(`[GET Stream ${params.id}] Asset fetch timed out - this is normal on Vercel. Will retry on next request.`)
        }
        // Continue to return stream even if asset fetch fails
      }
    }

    // Check Livepeer stream status if we have a stream ID and stream hasn't been manually ended
    // Add timeout to prevent hanging (10 seconds max for status check)
    if (stream.livepeerStreamId && !isManuallyEnded) {
      try {
        const statusPromise = getStreamStatus(stream.livepeerStreamId)
        const statusTimeout = new Promise<{ isActive: boolean; stream: null }>((resolve) => 
          setTimeout(() => {
            console.warn(`[Stream ${params.id}] getStreamStatus timeout after 10 seconds`)
            resolve({ isActive: false, stream: null })
          }, 10000)
        )
        const { isActive, stream: livepeerStreamData } = await Promise.race([statusPromise, statusTimeout])
        
        // If timeout occurred, skip status check
        if (!livepeerStreamData) {
          console.warn(`[Stream ${params.id}] Skipping status check due to timeout`)
          // Return stream as-is without status update
          const totalViews = await getTotalViews(params.id, stream.livepeerPlaybackId)
          const timeoutResponse: any = {
            ...stream,
            category: category,
            totalViews: totalViews,
          }
          
          // Include assetPlaybackId if it exists
          if (stream.assetPlaybackId) {
            timeoutResponse.assetPlaybackId = stream.assetPlaybackId
          }
          
          return NextResponse.json(timeoutResponse)
        }
        
        // Always update playbackId if it's available from Livepeer (in case it was missing during creation)
        const needsPlaybackIdUpdate = !stream.livepeerPlaybackId && livepeerStreamData?.playbackId
        
        // Also update streamKey if missing
        const needsStreamKeyUpdate = !stream.livepeerStreamKey && livepeerStreamData?.streamKey
        
        // Generate preview image for live streams if missing (don't overwrite user-uploaded images)
        // According to Livepeer docs: playback info API returns thumbnail URL in meta.source array
        const needsPreviewImage = !stream.previewImageUrl && livepeerStreamData?.playbackId
        let previewImageUrl = stream.previewImageUrl
        
        if (needsPreviewImage) {
          try {
          const { getLiveThumbnailUrl, generateAndVerifyThumbnail } = await import("@/lib/livepeer")
          // Try Livepeer playback info API first (returns thumbnail in meta.source)
          // This works for both live and VOD streams
            // Add timeout to prevent hanging (3 seconds max)
            const thumbnailPromise = getLiveThumbnailUrl(livepeerStreamData.playbackId)
            const thumbnailTimeout = new Promise<null>((resolve) => 
              setTimeout(() => {
                console.warn(`[Stream ${params.id}] Thumbnail fetch timeout after 3 seconds`)
                resolve(null)
              }, 3000)
            )
            previewImageUrl = await Promise.race([thumbnailPromise, thumbnailTimeout])

          if (!previewImageUrl) {
            // Fallback to thumbnailer service if playback info not ready yet
              // Add timeout for this too (5 seconds max)
              const generateThumbnailPromise = generateAndVerifyThumbnail(livepeerStreamData.playbackId, {
              isVod: false,
                maxRetries: 1, // Reduce retries for speed
                retryDelay: 1000,
            })
              const generateThumbnailTimeout = new Promise<null>((resolve) => 
                setTimeout(() => {
                  console.warn(`[Stream ${params.id}] Thumbnail generation timeout after 5 seconds`)
                  resolve(null)
                }, 5000)
              )
              previewImageUrl = await Promise.race([generateThumbnailPromise, generateThumbnailTimeout])
          }

          if (previewImageUrl) {
            console.log(`[Stream ${params.id}] ✅ Generated preview image from playback info: ${previewImageUrl}`)
          } else {
            console.warn(`[Stream ${params.id}] ⚠️ Could not generate preview image for playbackId: ${livepeerStreamData.playbackId}`)
            }
          } catch (thumbError: any) {
            console.warn(`[Stream ${params.id}] Error generating preview image:`, thumbError?.message)
            // Continue without preview image
          }
        } else if (stream.previewImageUrl) {
          console.log(`[Stream ${params.id}] Preserving user-uploaded cover image: ${stream.previewImageUrl}`)
        }
        
        // Debug logging
        console.log(`[Stream ${params.id}] Livepeer status check:`, {
          streamId: stream.livepeerStreamId,
          isActive,
          currentIsLive: stream.isLive,
          currentPlaybackId: stream.livepeerPlaybackId,
          livepeerPlaybackId: livepeerStreamData?.playbackId,
          needsPlaybackIdUpdate,
          needsPreviewImage,
          livepeerData: livepeerStreamData ? {
            id: livepeerStreamData.id,
            isActive: livepeerStreamData.isActive,
            sessions: livepeerStreamData.sessions?.length || 0,
            playbackId: livepeerStreamData.playbackId,
          } : null
        })
        
        // Ensure isActive is a boolean
        const isActiveBool = Boolean(isActive)
        
        // Detect if stream has ended naturally (was live, now inactive, and not already marked as ended)
        const streamEndedNaturally = stream.isLive && !isActiveBool && !stream.endedAt
        
        // Update stream if status changed or playbackId/streamKey/previewImage needs update
        if (isActiveBool !== stream.isLive || needsPlaybackIdUpdate || needsStreamKeyUpdate || needsPreviewImage || streamEndedNaturally) {
          console.log(`[Stream ${params.id}] Updating stream:`, {
            isLive: `${stream.isLive} -> ${isActiveBool}`,
            endedNaturally: streamEndedNaturally,
            playbackId: needsPlaybackIdUpdate ? `missing -> ${livepeerStreamData?.playbackId}` : 'ok',
            streamKey: needsStreamKeyUpdate ? `missing -> ${livepeerStreamData?.streamKey}` : 'ok',
            previewImage: needsPreviewImage ? `missing -> ${previewImageUrl}` : 'ok',
            isActiveValue: isActive,
            isActiveBool
          })
          
          await db
            .update(streams)
            .set({
              isLive: isActiveBool,
              endedAt: streamEndedNaturally ? new Date() : stream.endedAt, // Mark as ended if stream ended naturally
              livepeerPlaybackId: needsPlaybackIdUpdate ? livepeerStreamData?.playbackId : stream.livepeerPlaybackId,
              livepeerStreamKey: needsStreamKeyUpdate ? livepeerStreamData?.streamKey : stream.livepeerStreamKey,
              previewImageUrl: needsPreviewImage ? previewImageUrl : stream.previewImageUrl,
              startedAt: isActiveBool && !stream.startedAt ? new Date() : stream.startedAt,
              updatedAt: new Date(),
            })
            .where(eq(streams.id, params.id))
          
          // Fetch updated stream and category
          const [updatedStream] = await db.select().from(streams).where(eq(streams.id, params.id))
          
          if (updatedStream) {
            let updatedCategory = null
            if (updatedStream.categoryId) {
              const [categoryData] = await db.select().from(categories).where(eq(categories.id, updatedStream.categoryId))
              updatedCategory = categoryData || null
            }
            
            const totalViews = await getTotalViews(params.id, updatedStream.livepeerPlaybackId)
            
            // Fetch viewer count from Livepeer API for live streams
            let viewerCount = 0
            if (updatedStream.livepeerPlaybackId && !updatedStream.endedAt) {
              try {
                const { getViewerCount } = await import("@/lib/livepeer")
                viewerCount = await getViewerCount(updatedStream.livepeerPlaybackId)
              } catch (error) {
                console.warn(`[Stream ${params.id}] Could not fetch viewer count:`, error)
              }
            }
            
            const liveStreamResponse: any = {
              ...updatedStream,
              category: updatedCategory,
              totalViews: totalViews,
              viewerCount: viewerCount, // Fetched from Livepeer API, not stored in DB
            }
            
            // Include assetPlaybackId if it exists (for recordings during live streams)
            if (updatedStream.assetPlaybackId) {
              liveStreamResponse.assetPlaybackId = updatedStream.assetPlaybackId
            }
            
            return NextResponse.json(liveStreamResponse)
          }
        }
      } catch (error: any) {
        // If Livepeer check fails, just return the current stream data
        console.error(`[Stream ${params.id}] Error checking Livepeer status:`, error?.message || error)
      }
    } else if (isManuallyEnded) {
      console.log(`[Stream ${params.id}] Stream has been manually ended, skipping Livepeer status check`)
      
      // Generate thumbnail if missing (only if user hasn't uploaded a cover image)
      // This preserves user-uploaded cover images
      if (!stream.previewImageUrl && (stream.livepeerStreamId || stream.livepeerPlaybackId)) {
        try {
          const { getStreamAsset, generateAndVerifyThumbnail } = await import("@/lib/livepeer")
          
          let previewImageUrl: string | null = null
          
          // Try to get asset for ended streams (preferred method)
          if (stream.endedAt && stream.livepeerStreamId) {
            try {
              const asset = await getStreamAsset(stream.livepeerStreamId)
              if (asset?.playbackId) {
                previewImageUrl = await generateAndVerifyThumbnail(asset.playbackId, {
                  isVod: true,
                  duration: asset.duration,
                  maxRetries: 2,
                  retryDelay: 1500,
                })
                console.log(`[Stream ${params.id}] Generated thumbnail from asset playbackId: ${previewImageUrl}`)
              }
            } catch (assetError) {
              console.warn(`[Stream ${params.id}] Could not get asset:`, assetError)
            }
          }
          
          // Fallback to stream playbackId (works for live streams and as fallback for ended)
          if (!previewImageUrl && stream.livepeerPlaybackId) {
            previewImageUrl = await generateAndVerifyThumbnail(stream.livepeerPlaybackId, {
              isVod: !!stream.endedAt,
              maxRetries: 2,
              retryDelay: 1500,
            })
            console.log(`[Stream ${params.id}] Generated thumbnail from stream playbackId: ${previewImageUrl}`)
          }
          
          // Save thumbnail URL if we got one (even if verification failed, it might become available later)
          // Only save if user hasn't uploaded a cover image
          if (previewImageUrl && !stream.previewImageUrl) {
            const [updated] = await db
              .update(streams)
              .set({
                previewImageUrl: previewImageUrl,
                updatedAt: new Date(),
              })
              .where(eq(streams.id, params.id))
              .returning()
            
            if (updated) {
              let updatedCategory = null
              if (updated.categoryId) {
                const [categoryData] = await db.select().from(categories).where(eq(categories.id, updated.categoryId))
                updatedCategory = categoryData || null
              }
              
              console.log(`[Stream ${params.id}] Successfully saved thumbnail: ${previewImageUrl}`)
              
              const totalViews = await getTotalViews(params.id, updated.livepeerPlaybackId)
              return NextResponse.json({
                ...updated,
                category: updatedCategory,
                totalViews: totalViews,
              })
            }
          }
        } catch (error) {
          console.warn(`[Stream ${params.id}] Could not generate preview image:`, error)
        }
      } else if (stream.previewImageUrl) {
        console.log(`[Stream ${params.id}] Preserving user-uploaded cover image: ${stream.previewImageUrl}`)
      }
    } else {
      console.log(`[Stream ${params.id}] No livepeerStreamId found`)
    }

    // Return stream with category and totalViews
    // This is the fallback return for all other cases
    // For ended streams, use asset playbackId for views (matches Livepeer dashboard)
    // Following Livepeer docs: If we have assetId, directly call /api/asset/{assetId} to get playbackId
    const viewsPlaybackId = await getViewsPlaybackId(
      params.id,
      stream.livepeerPlaybackId,
      stream.endedAt,
      stream.livepeerStreamId,
      stream.assetPlaybackId, // Use stored asset playbackId from database if available
      stream.assetId // Use stored assetId to directly fetch asset if needed (follows Livepeer docs)
    )
    const totalViews = await getTotalViews(params.id, viewsPlaybackId)
    
    // Fetch viewer count from Livepeer API for live streams
    let viewerCount = 0
    if (stream.livepeerPlaybackId && !stream.endedAt) {
      try {
        const { getViewerCount } = await import("@/lib/livepeer")
        viewerCount = await getViewerCount(stream.livepeerPlaybackId)
      } catch (error) {
        console.warn(`[Stream ${params.id}] Could not fetch viewer count:`, error)
      }
    }
    
    // Ensure assetPlaybackId is included in response if it exists in database
    // This is critical for the frontend to use the correct playbackId for VOD
    const responseData: any = {
      ...stream,
      category: category,
      totalViews: totalViews,
      viewerCount: viewerCount, // Fetched from Livepeer API, not stored in DB
    }
    
    // Explicitly include assetPlaybackId if it exists (don't include null/undefined)
    if (stream.assetPlaybackId) {
      responseData.assetPlaybackId = stream.assetPlaybackId
    }
    
    return NextResponse.json(
      responseData,
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    )
  } catch (error) {
    console.error("Error fetching stream:", error)
    return NextResponse.json({ error: "Failed to fetch stream" }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const [updated] = await db
      .update(streams)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(streams.id, params.id))
      .returning()

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating stream:", error)
    return NextResponse.json({ error: "Failed to update stream" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const [stream] = await db.select().from(streams).where(eq(streams.id, params.id))

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 })
    }

    // Check if this is a permanent deletion request
    let body: { permanent?: boolean } = {}
    try {
      body = await request.json()
    } catch {
      // If no body, treat as regular end stream request
    }

    // If permanent deletion is requested, delete the stream entirely
    // Related chat messages and likes will be deleted automatically via CASCADE
    if (body.permanent === true) {
      try {
        await db.transaction(async (tx) => {
          // Delete related records first to avoid foreign key violations.
          await Promise.all([
            tx.delete(chatMessages).where(eq(chatMessages.streamId, stream.id)),
            tx.delete(streamLikes).where(eq(streamLikes.streamId, stream.id)),
          ])
          await tx.delete(streams).where(eq(streams.id, stream.id))
        })
        return NextResponse.json({ message: "Stream deleted successfully" })
      } catch (error: any) {
        console.error(`[DELETE Stream ${params.id}] Failed to permanently delete stream:`, error)
        const errorMessage = error?.message || "Failed to delete stream permanently"
        return NextResponse.json({ error: errorMessage }, { status: 500 })
      }
    }

    // Otherwise, just mark the stream as ended (existing behavior)
    // First, mark the stream as ended in the database
    // This prevents Livepeer status checks from reactivating it
    const [updated] = await db
      .update(streams)
      .set({
        isLive: false,
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(streams.id, params.id))
      .returning()

    // Prepare recording and preview image
    // Preserve user-uploaded cover image - only generate thumbnail if none exists
    let vodUrl = updated.vodUrl || null
    let previewImageUrl = updated.previewImageUrl || null

    // CRITICAL: Store the stream ID and Livepeer stream ID for verification
    const streamId = params.id
    const livepeerStreamId = updated.livepeerStreamId

    if (livepeerStreamId && updated.livepeerPlaybackId) {
      try {
        const { 
          waitForVOD, 
          getStreamRecording, 
          getThumbnailUrl,
          getPlaybackInfo,
          getStreamAsset
        } = await import("@/lib/livepeer")
        
        console.log(`[DELETE Stream ${streamId}] Preparing recording and preview for Livepeer stream: ${livepeerStreamId}, playbackId: ${updated.livepeerPlaybackId}`)
        console.log(`[DELETE Stream ${streamId}] Database stream ID: ${streamId}, Livepeer stream ID: ${livepeerStreamId}`)
        
        // Wait a bit for Livepeer to process the recording (assets are created asynchronously)
        await new Promise(resolve => setTimeout(resolve, 5000))
        
        // Try to get asset from Livepeer (this is the preferred method for recordings)
        // For VOD preview images, we should use the asset's playbackId, not the stream's playbackId
        try {
          const asset = await getStreamAsset(livepeerStreamId)
          
          if (asset) {
            // CRITICAL: Verify the asset actually belongs to this stream
            const assetSourceStreamId = asset.sourceStreamId || asset.source?.streamId
            if (assetSourceStreamId !== livepeerStreamId) {
              console.error(`[DELETE Stream ${streamId}] SECURITY ISSUE: Asset ${asset.id} does not belong to stream!`)
              console.error(`[DELETE Stream ${streamId}] Expected sourceStreamId: ${livepeerStreamId}, Got: ${assetSourceStreamId}`)
              throw new Error(`Asset ${asset.id} does not belong to stream ${livepeerStreamId}`)
            }
            
            console.log(`[DELETE Stream ${streamId}] Found asset for stream:`, {
              assetId: asset.id,
              playbackUrl: asset.playbackUrl,
              playbackId: asset.playbackId,
              status: asset.status,
              sourceStreamId: assetSourceStreamId,
              verified: assetSourceStreamId === livepeerStreamId
            })
            
            // CRITICAL: Only use asset if it's ready - unready assets will cause format errors
            if (asset.status !== "ready") {
              console.warn(`[DELETE Stream ${streamId}] Asset ${asset.id} is not ready yet. Status: ${asset.status}. Will not set vodUrl yet.`)
              console.warn(`[DELETE Stream ${streamId}] The asset will be checked again when the stream is fetched.`)
              // Don't set vodUrl if asset is not ready - this prevents format errors
              // The GET endpoint will check again and set vodUrl when asset is ready
            } else if (asset.playbackId) {
              // Asset is ready - use the asset's playbackId to construct HLS URL for VOD
              // This is the correct playbackId for VOD assets
              vodUrl = `https://playback.livepeer.com/hls/${asset.playbackId}/index.m3u8`
              console.log(`[DELETE Stream ${streamId}] ✅ Asset is ready! Using asset playbackId for VOD: ${asset.playbackId}, HLS URL: ${vodUrl}`)
              
              // Only generate thumbnail if user hasn't uploaded a cover image
              // This preserves user-uploaded cover images
              if (!previewImageUrl) {
                const { generateAndVerifyThumbnail } = await import("@/lib/livepeer")
                previewImageUrl = await generateAndVerifyThumbnail(asset.playbackId, {
                  isVod: true,
                  duration: asset.duration,
                  maxRetries: 3,
                  retryDelay: 2000, // 2 seconds between retries
                })
                console.log(`[DELETE Stream ${streamId}] Generated and verified preview image URL from asset playbackId: ${previewImageUrl}`)
              } else {
                console.log(`[DELETE Stream ${streamId}] Preserving user-uploaded cover image: ${previewImageUrl}`)
              }
            } else if (asset.playbackUrl) {
              // Use asset playback URL if available (could be HLS or MP4)
              // Only if asset is ready
              vodUrl = asset.playbackUrl
              console.log(`[DELETE Stream ${streamId}] ✅ Asset is ready! Using asset playbackUrl: ${vodUrl}`)
            } else {
              console.warn(`[DELETE Stream ${streamId}] Asset ${asset.id} has no playbackId or playbackUrl. Status: ${asset.status}`)
            }
          } else {
            console.warn(`[DELETE Stream ${streamId}] No asset found for Livepeer stream ${livepeerStreamId}`)
          }
        } catch (assetError: any) {
          console.error(`[DELETE Stream ${streamId}] Could not fetch asset for stream ${livepeerStreamId}:`, assetError?.message || assetError)
          // Don't throw - continue with fallbacks
        }
        
        // Fallback: Generate thumbnail using stream playbackId if we don't have asset playbackId
        // Only if user hasn't uploaded a cover image
        if (!previewImageUrl && updated.livepeerPlaybackId) {
          const { generateAndVerifyThumbnail } = await import("@/lib/livepeer")
          previewImageUrl = await generateAndVerifyThumbnail(updated.livepeerPlaybackId, {
            isVod: false,
            maxRetries: 2, // Fewer retries for fallback
            retryDelay: 2000,
          })
          console.log(`[DELETE Stream ${streamId}] Generated preview image URL from stream playbackId (fallback): ${previewImageUrl}`)
        }
        
        // Fallback: Try to get recording/asset information from stream sessions
        if (!vodUrl) {
          try {
            console.log(`[DELETE Stream ${streamId}] Trying to get recording from stream sessions for ${livepeerStreamId}`)
            const recording = await getStreamRecording(livepeerStreamId)
            if (recording?.recordingUrl) {
              vodUrl = recording.recordingUrl
              console.log(`Found recording URL: ${vodUrl}`)
            } else if (recording?.playbackUrl) {
              vodUrl = recording.playbackUrl
              console.log(`Found playback URL: ${vodUrl}`)
            }
          } catch (recordingError) {
            console.warn("Could not fetch recording info:", recordingError)
          }
        }
        
        // Fallback: Try to get playback info for VOD URL
        // NOTE: Stream playbackId may not work for VOD - we need asset playbackId
        // This is a last resort fallback
        if (!vodUrl) {
          try {
            // Wait for VOD to be available (with timeout)
            const vodReady = await waitForVOD(updated.livepeerPlaybackId, 20000, 2000)
            
            if (vodReady || updated.livepeerPlaybackId) {
              const playbackInfo = await getPlaybackInfo(updated.livepeerPlaybackId)
              if (playbackInfo?.source?.[0]?.url) {
                vodUrl = playbackInfo.source[0].url
                console.log(`Found VOD URL from playback info: ${vodUrl}`)
              } else {
                console.warn(`Could not get VOD URL from playback info for stream playbackId: ${updated.livepeerPlaybackId}`)
                console.warn(`Note: Stream playbackId may not work for VOD. Asset playbackId is required.`)
                // Don't try to construct HLS URL from stream playbackId - it likely won't work for VOD
              }
            }
          } catch (playbackError) {
            console.warn("Could not fetch playback info:", playbackError)
            console.warn(`Note: Stream playbackId ${updated.livepeerPlaybackId} may not work for VOD. Asset playbackId is required.`)
          }
        }
        
        // Update database with preview image and VOD URL
        // CRITICAL: Always use params.id (the database stream ID) to ensure we update the correct stream
        console.log(`[DELETE Stream ${streamId}] Updating database stream ${streamId} with vodUrl: ${vodUrl}, previewImageUrl: ${previewImageUrl ? 'set' : 'null'}`)
        const [finalUpdated] = await db
          .update(streams)
          .set({
            previewImageUrl: previewImageUrl || null,
            vodUrl: vodUrl || null,
            updatedAt: new Date(),
          })
          .where(eq(streams.id, streamId)) // Use streamId variable, not params.id directly
          .returning()
        
        // Verify we updated the correct stream
        if (finalUpdated.id !== streamId) {
          console.error(`[DELETE Stream ${streamId}] CRITICAL ERROR: Updated wrong stream! Expected ${streamId}, got ${finalUpdated.id}`)
          throw new Error(`Updated wrong stream: expected ${streamId}, got ${finalUpdated.id}`)
        }
        
        console.log(`[DELETE Stream ${streamId}] Successfully updated stream ${finalUpdated.id} with VOD URL and preview image`)
        
        // Fetch category for the response
        let category = null
        if (finalUpdated.categoryId) {
          const [categoryData] = await db.select().from(categories).where(eq(categories.id, finalUpdated.categoryId))
          category = categoryData || null
        }
        
        const totalViews = await getTotalViews(streamId, finalUpdated.livepeerPlaybackId)
        return NextResponse.json({
          ...finalUpdated,
          category: category,
          totalViews: totalViews,
        })
      } catch (error: any) {
        console.error(`[DELETE Stream ${streamId}] Error preparing recording and preview:`, error?.message || error)
        // Continue even if recording/preview preparation fails
        // The stream is still marked as ended
      }
    }

    // Fetch category for the response
    let category = null
    if (updated.categoryId) {
      const [categoryData] = await db.select().from(categories).where(eq(categories.id, updated.categoryId))
      category = categoryData || null
    }

    const totalViews = await getTotalViews(params.id, updated.livepeerPlaybackId)
    return NextResponse.json({
      ...updated,
      category: category,
      totalViews: totalViews,
    })
  } catch (error) {
    console.error("Error ending stream:", error)
    return NextResponse.json({ error: "Failed to end stream" }, { status: 500 })
  }
}

