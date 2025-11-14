import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { streams, categories } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getStreamStatus } from "@/lib/livepeer"

// Increase timeout for Vercel functions (max 60s on Pro, 10s on Hobby)
export const maxDuration = 30

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Fetch stream
    const [stream] = await db.select().from(streams).where(eq(streams.id, params.id))

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 })
    }

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
      
      try {
        const { getStream, getStreamAsset, getStreamRecording, getStreamSessions } = await import("@/lib/livepeer")
        
        console.log(`[GET Stream ${params.id}] Finding recording for ended stream: ${stream.livepeerStreamId}`)
        
        // METHOD 1: Check stream sessions first (fastest method)
        try {
          console.log(`[GET Stream ${params.id}] Method 1: Checking stream sessions...`)
          const streamData = await getStream(stream.livepeerStreamId)
          let sessions: any[] = []
          
          if (streamData?.sessions && Array.isArray(streamData.sessions) && streamData.sessions.length > 0) {
            sessions = streamData.sessions
          }

          if (sessions.length === 0) {
            sessions = await getStreamSessions(stream.livepeerStreamId, { limit: 10, recordOnly: true })
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
        } catch (sessionError: any) {
          console.warn(`[GET Stream ${params.id}] Error checking stream sessions:`, sessionError?.message)
        }
        
        // METHOD 2: Check assets API (if session method didn't work)
        if (!vodUrl) {
          try {
            console.log(`[GET Stream ${params.id}] Method 2: Checking assets API...`)
            // Add timeout to prevent Vercel function timeout (8 seconds max for asset fetch)
            const assetFetchPromise = getStreamAsset(stream.livepeerStreamId)
            const timeoutPromise = new Promise<null>((resolve) => 
              setTimeout(() => {
                console.warn(`[GET Stream ${params.id}] Asset fetch timeout after 8 seconds`)
                resolve(null)
              }, 8000)
            )
            
            const asset = await Promise.race([assetFetchPromise, timeoutPromise])
            
            if (asset) {
              console.log(`[GET Stream ${params.id}] Asset details:`, {
                id: asset.id,
                status: asset.status,
                playbackId: asset.playbackId,
                playbackUrl: asset.playbackUrl,
                sourceStreamId: asset.sourceStreamId || asset.source?.streamId,
                hasExistingVodUrl: !!vodUrl
              })
              
              // CRITICAL: Only use asset if it's ready - unready assets will cause format errors
              if (asset.status !== "ready") {
                console.warn(`[GET Stream ${params.id}] Asset ${asset.id} is not ready yet. Status: ${asset.status}. Will not set vodUrl yet.`)
                // Don't set vodUrl if asset is not ready - this prevents format errors
                // The stream will be checked again on next request
              } else if (asset.playbackId) {
                // Asset is ready - use the asset's playbackId to construct HLS URL for VOD
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
          
          return NextResponse.json({
            ...updated,
            category: updatedCategory,
          })
        } else if (!vodUrl) {
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
    if (stream.livepeerStreamId && !isManuallyEnded) {
      try {
        const { isActive, stream: livepeerStreamData, viewerCount: livepeerViewerCount } = await getStreamStatus(stream.livepeerStreamId)
        
        // Always update playbackId if it's available from Livepeer (in case it was missing during creation)
        const needsPlaybackIdUpdate = !stream.livepeerPlaybackId && livepeerStreamData?.playbackId
        
        // Also update streamKey if missing
        const needsStreamKeyUpdate = !stream.livepeerStreamKey && livepeerStreamData?.streamKey
        
        // Generate preview image for live streams if missing (don't overwrite user-uploaded images)
        const needsPreviewImage = !stream.previewImageUrl && livepeerStreamData?.playbackId
        let previewImageUrl = stream.previewImageUrl
        
        if (needsPreviewImage) {
          const { generateAndVerifyThumbnail } = await import("@/lib/livepeer")
          // For live streams, use async generation but don't block on verification
          // Live stream thumbnails may not be immediately available
          // Only generate if user hasn't uploaded a cover image
          previewImageUrl = await generateAndVerifyThumbnail(livepeerStreamData.playbackId, {
            isVod: false,
            maxRetries: 2, // Fewer retries for live streams
            retryDelay: 1500,
          })
          console.log(`[Stream ${params.id}] Generated preview image for live stream: ${previewImageUrl}`)
        } else if (stream.previewImageUrl) {
          console.log(`[Stream ${params.id}] Preserving user-uploaded cover image: ${stream.previewImageUrl}`)
        }
        
        // Always update viewer count from Livepeer (for real-time accuracy)
        const needsViewerCountUpdate = livepeerViewerCount !== undefined && livepeerViewerCount !== stream.viewerCount
        
        // Debug logging
        console.log(`[Stream ${params.id}] Livepeer status check:`, {
          streamId: stream.livepeerStreamId,
          isActive,
          currentIsLive: stream.isLive,
          currentPlaybackId: stream.livepeerPlaybackId,
          livepeerPlaybackId: livepeerStreamData?.playbackId,
          currentViewerCount: stream.viewerCount,
          livepeerViewerCount,
          needsPlaybackIdUpdate,
          needsPreviewImage,
          needsViewerCountUpdate,
          livepeerData: livepeerStreamData ? {
            id: livepeerStreamData.id,
            isActive: livepeerStreamData.isActive,
            sessions: livepeerStreamData.sessions?.length || 0,
            playbackId: livepeerStreamData.playbackId,
          } : null
        })
        
        // Ensure isActive is a boolean
        const isActiveBool = Boolean(isActive)
        
        // Update stream if status changed or playbackId/streamKey/previewImage/viewerCount needs update
        if (isActiveBool !== stream.isLive || needsPlaybackIdUpdate || needsStreamKeyUpdate || needsPreviewImage || needsViewerCountUpdate) {
          console.log(`[Stream ${params.id}] Updating stream:`, {
            isLive: `${stream.isLive} -> ${isActiveBool}`,
            playbackId: needsPlaybackIdUpdate ? `missing -> ${livepeerStreamData?.playbackId}` : 'ok',
            streamKey: needsStreamKeyUpdate ? `missing -> ${livepeerStreamData?.streamKey}` : 'ok',
            previewImage: needsPreviewImage ? `missing -> ${previewImageUrl}` : 'ok',
            viewerCount: needsViewerCountUpdate ? `${stream.viewerCount} -> ${livepeerViewerCount}` : 'ok',
            isActiveValue: isActive,
            isActiveBool
          })
          
          await db
            .update(streams)
            .set({
              isLive: isActiveBool,
              livepeerPlaybackId: needsPlaybackIdUpdate ? livepeerStreamData?.playbackId : stream.livepeerPlaybackId,
              livepeerStreamKey: needsStreamKeyUpdate ? livepeerStreamData?.streamKey : stream.livepeerStreamKey,
              previewImageUrl: needsPreviewImage ? previewImageUrl : stream.previewImageUrl,
              viewerCount: needsViewerCountUpdate ? livepeerViewerCount : stream.viewerCount,
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
            
            return NextResponse.json({
              ...updatedStream,
              category: updatedCategory,
            })
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
              
              return NextResponse.json({
                ...updated,
                category: updatedCategory,
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

    // Return stream with category
    return NextResponse.json({
      ...stream,
      category: category,
    })
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
      await db.delete(streams).where(eq(streams.id, params.id))
      return NextResponse.json({ message: "Stream deleted successfully" })
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
        
        return NextResponse.json({
          ...finalUpdated,
          category: category,
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

    return NextResponse.json({
      ...updated,
      category: category,
    })
  } catch (error) {
    console.error("Error ending stream:", error)
    return NextResponse.json({ error: "Failed to end stream" }, { status: 500 })
  }
}

