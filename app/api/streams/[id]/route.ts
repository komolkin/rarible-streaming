import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { streams, categories } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getStreamStatus } from "@/lib/livepeer"

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

    // For ended streams without vodUrl, try to fetch asset from Livepeer
    if (isManuallyEnded && stream.livepeerStreamId && !stream.vodUrl) {
      try {
        const { getStreamAsset, getThumbnailUrl } = await import("@/lib/livepeer")
        
        console.log(`Fetching asset for ended stream: ${stream.livepeerStreamId}`)
        
        const asset = await getStreamAsset(stream.livepeerStreamId)
        
        if (asset) {
          let vodUrl = null
          // Preserve user-uploaded cover image - only generate thumbnail if none exists
          let previewImageUrl = stream.previewImageUrl || null
          
          console.log(`Asset details:`, {
            id: asset.id,
            status: asset.status,
            playbackId: asset.playbackId,
            playbackUrl: asset.playbackUrl,
            sourceStreamId: asset.sourceStreamId
          })
          
          // For VOD, we MUST use the asset's playbackId, not the stream's playbackId
          // The asset playbackId is what works for VOD playback
          if (asset.playbackId) {
            // Use the asset's playbackId to construct HLS URL for VOD
            // This is the correct playbackId for VOD assets
            vodUrl = `https://playback.livepeer.com/hls/${asset.playbackId}/index.m3u8`
            console.log(`Using asset playbackId for VOD: ${asset.playbackId}, HLS URL: ${vodUrl}`)
          } else if (asset.playbackUrl) {
            // Use asset playback URL if available (could be HLS or MP4)
            vodUrl = asset.playbackUrl
            console.log(`Using asset playbackUrl: ${vodUrl}`)
          } else {
            console.warn(`Asset ${asset.id} has no playbackId or playbackUrl. Status: ${asset.status}`)
            // Don't use stream playbackId for VOD - it won't work
          }
          
          // Only generate thumbnail if user hasn't uploaded a cover image
          // This preserves user-uploaded cover images
          if (!previewImageUrl && asset.playbackId) {
            const { generateAndVerifyThumbnail } = await import("@/lib/livepeer")
            previewImageUrl = await generateAndVerifyThumbnail(asset.playbackId, {
              isVod: true,
              duration: asset.duration,
              maxRetries: 3,
              retryDelay: 2000, // 2 seconds between retries
            })
            console.log(`Generated and verified preview image URL from asset playbackId: ${previewImageUrl}`)
          } else if (!previewImageUrl && stream.livepeerPlaybackId) {
            // Fallback to stream playbackId if asset doesn't have playbackId and no user image
            const { generateAndVerifyThumbnail } = await import("@/lib/livepeer")
            previewImageUrl = await generateAndVerifyThumbnail(stream.livepeerPlaybackId, {
              isVod: false,
              maxRetries: 2, // Fewer retries for fallback
              retryDelay: 2000,
            })
            console.log(`Generated preview image URL from stream playbackId (fallback): ${previewImageUrl}`)
          } else if (previewImageUrl) {
            console.log(`Preserving user-uploaded cover image: ${previewImageUrl}`)
          }
          
          // Update stream with asset information
          if (vodUrl || previewImageUrl) {
            const [updated] = await db
              .update(streams)
              .set({
                vodUrl: vodUrl || stream.vodUrl,
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
            
            return NextResponse.json({
              ...updated,
              category: updatedCategory,
            })
          }
        }
      } catch (error) {
        console.warn(`Could not fetch asset for ended stream ${params.id}:`, error)
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

    if (updated.livepeerStreamId && updated.livepeerPlaybackId) {
      try {
        const { 
          waitForVOD, 
          getStreamRecording, 
          getThumbnailUrl,
          getPlaybackInfo,
          getStreamAsset
        } = await import("@/lib/livepeer")
        
        console.log(`Preparing recording and preview for stream: ${updated.livepeerStreamId}, playbackId: ${updated.livepeerPlaybackId}`)
        
        // Wait a bit for Livepeer to process the recording (assets are created asynchronously)
        await new Promise(resolve => setTimeout(resolve, 5000))
        
        // Try to get asset from Livepeer (this is the preferred method for recordings)
        // For VOD preview images, we should use the asset's playbackId, not the stream's playbackId
        try {
          const asset = await getStreamAsset(updated.livepeerStreamId)
          
          if (asset) {
            console.log(`Found asset for stream:`, {
              assetId: asset.id,
              playbackUrl: asset.playbackUrl,
              playbackId: asset.playbackId,
              status: asset.status
            })
            
            // For VOD, we MUST use the asset's playbackId, not the stream's playbackId
            // The asset playbackId is what works for VOD playback and thumbnails
            if (asset.playbackId) {
              // Use the asset's playbackId to construct HLS URL for VOD
              // This is the correct playbackId for VOD assets
              vodUrl = `https://playback.livepeer.com/hls/${asset.playbackId}/index.m3u8`
              console.log(`Using asset playbackId for VOD: ${asset.playbackId}, HLS URL: ${vodUrl}`)
              
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
                console.log(`Generated and verified preview image URL from asset playbackId: ${previewImageUrl}`)
              } else {
                console.log(`Preserving user-uploaded cover image: ${previewImageUrl}`)
              }
            } else if (asset.playbackUrl) {
              // Use asset playback URL if available (could be HLS or MP4)
              vodUrl = asset.playbackUrl
              console.log(`Using asset playbackUrl: ${vodUrl}`)
            } else {
              console.warn(`Asset ${asset.id} has no playbackId or playbackUrl. Status: ${asset.status}`)
            }
          }
        } catch (assetError) {
          console.warn("Could not fetch asset:", assetError)
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
          console.log(`Generated preview image URL from stream playbackId (fallback): ${previewImageUrl}`)
        }
        
        // Fallback: Try to get recording/asset information from stream sessions
        if (!vodUrl) {
          try {
            const recording = await getStreamRecording(updated.livepeerStreamId)
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
        const [finalUpdated] = await db
          .update(streams)
          .set({
            previewImageUrl: previewImageUrl || null,
            vodUrl: vodUrl || null,
            updatedAt: new Date(),
          })
          .where(eq(streams.id, params.id))
          .returning()
        
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
      } catch (error) {
        console.error("Error preparing recording and preview:", error)
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

