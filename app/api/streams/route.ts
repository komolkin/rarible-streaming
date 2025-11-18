import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { streams, categories, users } from "@/lib/db/schema"
import { createStream, getStream } from "@/lib/livepeer"
import { eq, and, isNotNull, desc, sql, inArray, or } from "drizzle-orm"

// Cache streams list for 30 seconds (ISR)
export const revalidate = 30

type StreamRecord = typeof streams.$inferSelect

async function resolveViewsPlaybackId(stream: StreamRecord) {
  // Priority 1: If we have assetId, fetch asset playbackId from Livepeer API
  const isEnded = !!stream.endedAt

  if (isEnded && stream.assetId) {
    try {
      const { getAsset } = await import("@/lib/livepeer")
      const asset = await getAsset(stream.assetId)
      if (asset?.playbackId) {
        console.log(
          `[Streams API] ✅ Fetched asset playbackId ${asset.playbackId} from Livepeer API for ended stream ${stream.id}`
        )
        return { playbackId: asset.playbackId, isAssetPlaybackId: true }
      }
    } catch (error) {
      console.warn(`[Streams API] Failed to fetch asset by ID ${stream.assetId}:`, error)
    }
  }

  // Priority 2: For ended streams without assetId, fetch from Livepeer API
  if (isEnded && stream.livepeerStreamId) {
    try {
      const { getStreamAsset } = await import("@/lib/livepeer")
      const asset = await getStreamAsset(stream.livepeerStreamId)
      if (asset?.playbackId) {
        console.log(
          `[Streams API] ✅ Fetched asset playbackId ${asset.playbackId} from Livepeer API for ended stream ${stream.id}`
        )
        // Store asset metadata in database for future use
        if (asset.id) {
          try {
            await db
              .update(streams)
              .set({
                assetId: asset.id,
                updatedAt: new Date(),
              })
              .where(eq(streams.id, stream.id))
            console.log(`[Streams API] ✅ Stored asset metadata for stream ${stream.id}`)
          } catch (dbError) {
            console.warn(`[Streams API] Failed to store asset metadata for stream ${stream.id}:`, dbError)
          }
        }
        return { playbackId: asset.playbackId, isAssetPlaybackId: true }
      }

        console.warn(
          `[Streams API] Asset found for ended stream ${stream.id} but playbackId missing - views unavailable until asset is ready`
        )
        return { playbackId: null, isAssetPlaybackId: false }
    } catch (error: any) {
      const message = error?.message || error
        console.warn(
          `[Streams API] Could not fetch asset for ended stream ${stream.id}: ${message}`
        )
        return { playbackId: null, isAssetPlaybackId: false }
    }
  }

  // For live streams or when no asset available, use stream playbackId
  return { playbackId: stream.livepeerPlaybackId || null, isAssetPlaybackId: false }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const creatorAddress = searchParams.get("creator")
    const isLive = searchParams.get("live")
    const ended = searchParams.get("ended")
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined

    const conditions = []
    if (creatorAddress) {
      // Normalize to lowercase for case-insensitive comparison
      const normalizedCreatorAddress = creatorAddress.toLowerCase()
      conditions.push(sql`LOWER(${streams.creatorAddress}) = ${normalizedCreatorAddress}`)
    }
    if (isLive === "true") {
      conditions.push(eq(streams.isLive, true))
    }
    if (ended === "true") {
      // Fetch streams that have ended (endedAt is not null)
      conditions.push(isNotNull(streams.endedAt))
    }

    // Build query conditionally to avoid type issues
    const baseQuery = db.select().from(streams)
    
    const queryWithConditions = conditions.length > 0
      ? baseQuery.where(and(...conditions))
      : baseQuery
    
    const queryWithOrder = ended === "true"
      ? queryWithConditions.orderBy(desc(streams.endedAt))
      : queryWithConditions.orderBy(desc(streams.createdAt))
    
    // Apply limit if specified and execute query
    const allStreams = limit 
      ? await queryWithOrder.limit(limit)
      : await queryWithOrder

    // Debug: log streams before processing
    console.log(`[Streams API] Fetched ${allStreams.length} streams from database`)
    const endedStreamsWithoutThumbnails = allStreams.filter(s => s.endedAt && !s.previewImageUrl)
    console.log(`[Streams API] Found ${endedStreamsWithoutThumbnails.length} ended streams without thumbnails`)

    // Generate thumbnails for streams that don't have preview images
    // This ensures thumbnails are available for both live and ended streams
    const streamsWithThumbnails = await Promise.all(
      allStreams.map(async (stream) => {
        // Skip if already has preview image
        if (stream.previewImageUrl) {
          return stream
        }
        
        // Need livepeerStreamId or livepeerPlaybackId to generate thumbnail
        if (!stream.livepeerStreamId && !stream.livepeerPlaybackId) {
          return stream
        }
        
        try {
          console.log(`[Streams API] 🔍 Processing stream ${stream.id} (${stream.title}) for thumbnail generation`)
          console.log(`[Streams API] Stream details:`, {
            id: stream.id,
            title: stream.title,
            endedAt: stream.endedAt,
            isLive: stream.isLive,
            livepeerStreamId: stream.livepeerStreamId,
            livepeerPlaybackId: stream.livepeerPlaybackId,
          })
          
          const { getStreamAsset, generateAndVerifyThumbnail } = await import("@/lib/livepeer")
          
          let thumbnailUrl: string | null = null
          
          if (stream.endedAt) {
            // For ended streams, try to get asset playbackId (preferred for VOD)
            if (stream.livepeerStreamId) {
              try {
                console.log(`[Streams API] 📦 Fetching asset for ended stream ${stream.id}, streamId: ${stream.livepeerStreamId}`)
                const asset = await getStreamAsset(stream.livepeerStreamId)
                
                console.log(`[Streams API] Asset result:`, {
                  hasAsset: !!asset,
                  assetId: asset?.id,
                  assetStatus: asset?.status,
                  assetPlaybackId: asset?.playbackId,
                  assetDuration: asset?.duration,
                })
                
                if (asset?.playbackId) {
                  // Store asset metadata in database for future use (especially for views)
                  if (asset.id) {
                    try {
                      await db
                        .update(streams)
                        .set({
                          assetId: asset.id,
                          updatedAt: new Date(),
                        })
                        .where(eq(streams.id, stream.id))
                      console.log(`[Streams API] ✅ Stored asset metadata for stream ${stream.id}`)
                    } catch (dbError) {
                      console.warn(`[Streams API] Failed to store asset metadata for stream ${stream.id}:`, dbError)
                    }
                  }
                  // Use asset playbackId for VOD thumbnail (better quality)
                  console.log(`[Streams API] 🎬 Generating VOD thumbnail using asset playbackId: ${asset.playbackId}`)
                  thumbnailUrl = await generateAndVerifyThumbnail(asset.playbackId, {
                    isVod: true,
                    duration: asset.duration,
                    maxRetries: 2, // Fewer retries for list API
                    retryDelay: 1500,
                  })
                  console.log(`[Streams API] ✅ Generated VOD thumbnail for stream ${stream.id}: ${thumbnailUrl}`)
                } else {
                  console.warn(`[Streams API] ⚠️ Asset found but no playbackId. Asset status: ${asset?.status}`)
                }
              } catch (assetError: any) {
                console.error(`[Streams API] ❌ Could not get asset for stream ${stream.id}:`, assetError?.message || assetError)
              }
            }
            
            // Fallback to stream playbackId if asset not available
            if (!thumbnailUrl && stream.livepeerPlaybackId) {
              console.log(`[Streams API] 🔄 Fallback: Using stream playbackId for thumbnail: ${stream.livepeerPlaybackId}`)
              thumbnailUrl = await generateAndVerifyThumbnail(stream.livepeerPlaybackId, {
                isVod: true, // Ended stream, treat as VOD
                maxRetries: 2,
                retryDelay: 1500,
              })
              console.log(`[Streams API] ✅ Generated thumbnail from stream playbackId (fallback): ${thumbnailUrl}`)
            }
          } else if (stream.livepeerPlaybackId) {
            // For live streams, use the auto-updating thumbnail from playback info API
            // This provides the latest frame from the stream (updates every few seconds)
            if (stream.isLive) {
              console.log(`[Streams API] 📡 Fetching live thumbnail from playback info for stream ${stream.id}`)
              const { getLiveThumbnailUrl } = await import("@/lib/livepeer")
              thumbnailUrl = await getLiveThumbnailUrl(stream.livepeerPlaybackId)
              if (thumbnailUrl) {
                console.log(`[Streams API] ✅ Got live thumbnail URL for stream ${stream.id}: ${thumbnailUrl}`)
              } else {
                console.log(`[Streams API] ⚠️ Live thumbnail not available yet for stream ${stream.id}`)
              }
            } else {
              // For scheduled/non-live streams, use thumbnailer service
            const isVod = !!stream.endedAt
              console.log(`[Streams API] 📡 Generating thumbnail for scheduled stream using playbackId: ${stream.livepeerPlaybackId}`)
            thumbnailUrl = await generateAndVerifyThumbnail(stream.livepeerPlaybackId, {
              isVod: isVod,
                maxRetries: 2,
                retryDelay: 1500,
            })
            console.log(`[Streams API] ✅ Generated thumbnail for stream ${stream.id}: ${thumbnailUrl}`)
            }
          } else {
            console.log(`[Streams API] ⏭️ Skipping thumbnail generation - missing playbackId`)
          }
          
          // For live streams, don't save thumbnail URL to DB (it's auto-updating from playback info)
          // For ended streams, save the thumbnail URL to DB for persistence
          if (thumbnailUrl) {
            if (stream.isLive) {
              // For live streams, return thumbnail URL in response but don't save to DB
              // The thumbnail URL updates automatically from playback info
              console.log(`[Streams API] ✅ Returning live thumbnail URL for stream ${stream.id} (not saving to DB)`)
              return {
                ...stream,
                thumbnailUrl: thumbnailUrl, // Add as separate field for live streams
                previewImageUrl: thumbnailUrl, // Also include in previewImageUrl for compatibility
              }
            } else {
              // For ended/scheduled streams, save thumbnail URL to database
            console.log(`[Streams API] 💾 Saving thumbnail URL to database: ${thumbnailUrl}`)
            try {
              const [updated] = await db
                .update(streams)
                .set({
                  previewImageUrl: thumbnailUrl,
                  updatedAt: new Date(),
                })
                .where(eq(streams.id, stream.id))
                .returning()
              
              console.log(`[Streams API] Successfully saved thumbnail for stream ${stream.id}`)
              
              // Return stream with thumbnail URL
              return {
                ...stream,
                previewImageUrl: thumbnailUrl,
              }
            } catch (dbError) {
              console.error(`[Streams API] Failed to save thumbnail for stream ${stream.id}:`, dbError)
              // Still return the thumbnail URL in response even if DB save failed
              return {
                ...stream,
                previewImageUrl: thumbnailUrl,
                }
              }
            }
          } else {
            console.log(`[Streams API] Could not generate thumbnail for stream ${stream.id}`)
          }
        } catch (error) {
          console.warn(`[Streams API] Error generating thumbnail for stream ${stream.id}:`, error)
          // Continue with original stream data
        }
        
        return stream
      })
    )

    // Debug: log final streams with thumbnails
    const streamsWithThumbnailsCount = streamsWithThumbnails.filter(s => s.endedAt && s.previewImageUrl).length
    console.log(`[Streams API] Returning ${streamsWithThumbnails.length} streams, ${streamsWithThumbnailsCount} ended streams have thumbnails`)

    // Fetch viewer counts from Livepeer API for live streams (not stored in DB)
    const streamsWithViewerCounts = await Promise.all(
      streamsWithThumbnails.map(async (stream) => {
        // Only fetch viewer count for live streams with playbackId
        if (stream.livepeerPlaybackId && !stream.endedAt) {
          try {
            const { getViewerCount } = await import("@/lib/livepeer")
            const viewerCount = await getViewerCount(stream.livepeerPlaybackId)
            
            return {
              ...stream,
              viewerCount: viewerCount, // Fetched from Livepeer API, not stored in DB
            }
          } catch (error) {
            console.warn(`[Streams API] Could not fetch viewer count for stream ${stream.id}:`, error)
            // Return 0 if fetch fails
            return {
              ...stream,
              viewerCount: 0,
            }
          }
        }
        
        // For ended streams, no concurrent viewers
        return {
          ...stream,
          viewerCount: 0,
        }
      })
    )

    // Batch fetch creator profiles for all streams (much faster than individual requests)
    const uniqueCreatorAddresses = Array.from(new Set(streamsWithViewerCounts.map(s => s.creatorAddress.toLowerCase())))
    const creatorProfilesMap = new Map<string, any>()
    
    if (uniqueCreatorAddresses.length > 0) {
      try {
        // Batch fetch creator profiles with case-insensitive comparison
        const creatorProfiles = await db
          .select({
            walletAddress: users.walletAddress,
            displayName: users.displayName,
            username: users.username,
            avatarUrl: users.avatarUrl,
          })
          .from(users)
          .where(sql`LOWER(${users.walletAddress}) = ANY(ARRAY[${sql.join(
            uniqueCreatorAddresses.map(addr => sql`${addr}`),
            sql`, `
          )}])`)
        
        // Create a map for O(1) lookup
        creatorProfiles.forEach(profile => {
          creatorProfilesMap.set(profile.walletAddress.toLowerCase(), {
            displayName: profile.displayName,
            username: profile.username,
            avatarUrl: profile.avatarUrl,
          })
        })
      } catch (error) {
        console.warn(`[Streams API] Could not batch fetch creator profiles:`, error)
      }
    }

    // Batch fetch all categories once (optimization: prevents N+1 queries)
    const allCategories = await db.select().from(categories)
    const categoriesMap = new Map(allCategories.map(cat => [cat.id, cat]))

    // Fetch total views for all streams, and attach creator data and categories
    const streamsWithCategories = await Promise.all(
      streamsWithViewerCounts.map(async (stream) => {
        // Get category from map (already fetched in batch)
        const category = stream.categoryId ? categoriesMap.get(stream.categoryId) || null : null
        
        // Get creator profile from map (already fetched in batch)
        const creator = creatorProfilesMap.get(stream.creatorAddress.toLowerCase()) || null
        
        // Get total views from Livepeer API
        let totalViews: number | null = null
        let totalViewsPlaybackId: string | null = null
        
        try {
          const { playbackId: viewsPlaybackId, isAssetPlaybackId } = await resolveViewsPlaybackId(stream)
          totalViewsPlaybackId = viewsPlaybackId

          if (viewsPlaybackId) {
            const { getTotalViews: getLivepeerTotalViews } = await import("@/lib/livepeer")
            totalViews = await getLivepeerTotalViews(viewsPlaybackId)
          } else {
            console.log(
              `[Streams API] No playbackId available for total views (stream ${stream.id}). Asset may not be ready yet.`
            )
          }
        } catch (error) {
          console.warn(
            `[Streams API] Could not resolve total views playbackId for stream ${stream.id}:`,
            error
          )
        }
        
        return {
          ...stream,
          category: category,
          creator: creator,
          totalViews: totalViews,
          totalViewsPlaybackId,
        }
      })
    )

    // Determine cache time based on query type
    // Live streams: shorter cache (10s), ended streams: longer cache (60s)
    const hasLiveStreams = streamsWithCategories.some(s => s.isLive && !s.endedAt)
    const cacheTime = hasLiveStreams ? 10 : 60

    return NextResponse.json(streamsWithCategories, {
      headers: {
        'Cache-Control': `public, s-maxage=${cacheTime}, stale-while-revalidate=${cacheTime * 2}`,
      },
    })
  } catch (error) {
    console.error("Error fetching streams:", error)
    return NextResponse.json({ error: "Failed to fetch streams" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { creatorAddress, title, description, categoryId, scheduledAt, hasMinting, previewImageUrl } = body

    if (!process.env.LIVEPEER_API_KEY) {
      console.error("LIVEPEER_API_KEY is not set")
      return NextResponse.json({ error: "Livepeer API key not configured" }, { status: 500 })
    }

    const livepeerStream = await createStream(title)

    // Debug: log the full Livepeer response
    console.log("Livepeer stream creation response:", JSON.stringify(livepeerStream, null, 2))

    if (!livepeerStream || !livepeerStream.id) {
      console.error("Invalid Livepeer stream response:", livepeerStream)
      return NextResponse.json({ error: "Invalid response from Livepeer" }, { status: 500 })
    }

    // Extract playbackId and streamKey from Livepeer response
    // Livepeer API returns: { id, playbackId, streamKey, rtmpIngestUrl, ... }
    // rtmpIngestUrl format: rtmp://ingest.livepeer.studio/live/{streamKey}
    let playbackId = livepeerStream.playbackId || livepeerStream.playback?.id || null
    let streamKey = livepeerStream.streamKey || livepeerStream.key || null
    
    // If streamKey is not directly available, extract from rtmpIngestUrl
    if (!streamKey && livepeerStream.rtmpIngestUrl) {
      const urlParts = livepeerStream.rtmpIngestUrl.split('/')
      streamKey = urlParts[urlParts.length - 1] || null
    }
    
    // If playbackId is not available, try to get it from the stream object after fetching
    if (!playbackId && livepeerStream.id) {
      try {
        // Fetch the stream again to get playbackId (sometimes it's not in creation response)
        const fullStream = await getStream(livepeerStream.id)
        playbackId = fullStream.playbackId || playbackId
      } catch (e) {
        console.warn("Could not fetch playbackId:", e)
      }
    }

    console.log("Extracted Livepeer data:", {
      id: livepeerStream.id,
      playbackId,
      streamKey,
      rtmpIngestUrl: livepeerStream.rtmpIngestUrl,
      hasPlaybackId: !!playbackId,
      hasStreamKey: !!streamKey,
      fullResponseKeys: Object.keys(livepeerStream)
    })

    const [stream] = await db.insert(streams).values({
      creatorAddress: creatorAddress.toLowerCase(),
      title,
      description,
      categoryId: categoryId || null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      livepeerStreamId: livepeerStream.id,
      livepeerPlaybackId: playbackId,
      livepeerStreamKey: streamKey,
      hasMinting: hasMinting || false,
      previewImageUrl: previewImageUrl || null,
    }).returning()

    // Generate thumbnail for streams without uploaded cover image
    // According to Livepeer docs: Use playback info API for live streams, thumbnailer service for VOD
    if (!previewImageUrl && playbackId) {
      try {
        console.log(`[POST Stream] Generating thumbnail for newly created stream ${stream.id} with playbackId: ${playbackId}`)
        
        const { getLiveThumbnailUrl, generateAndVerifyThumbnail } = await import("@/lib/livepeer")
        
        // Try to get live thumbnail from playback info API first (for streams that have started)
        // This returns the auto-updating thumbnail URL for live streams
        let thumbnailUrl: string | null = null
        
        try {
          thumbnailUrl = await getLiveThumbnailUrl(playbackId)
          if (thumbnailUrl) {
            console.log(`[POST Stream] ✅ Got live thumbnail from playback info API: ${thumbnailUrl}`)
          }
        } catch (playbackInfoError: any) {
          console.log(`[POST Stream] Playback info API not ready yet (stream may not have started): ${playbackInfoError?.message}`)
        }
        
        // If playback info didn't work, try thumbnailer service
        // This works for both live and VOD streams, but may not be available immediately
        if (!thumbnailUrl) {
          try {
            // Use shorter timeout and fewer retries for newly created streams
            // The stream might not have started streaming yet, so thumbnail may not be available
            thumbnailUrl = await generateAndVerifyThumbnail(playbackId, {
              isVod: false, // Newly created streams are not VOD yet
              maxRetries: 1, // Only try once - if not available, GET endpoints will handle it later
              retryDelay: 1000,
            })
            
            if (thumbnailUrl) {
              console.log(`[POST Stream] ✅ Generated thumbnail using thumbnailer service: ${thumbnailUrl}`)
            } else {
              console.log(`[POST Stream] ⏳ Thumbnail not available yet - stream may not have started. Will be generated when stream is fetched.`)
            }
          } catch (thumbError: any) {
            console.log(`[POST Stream] ⏳ Thumbnail generation failed (stream may not have started): ${thumbError?.message}`)
            // This is expected for newly created streams that haven't started yet
            // The GET endpoints will handle thumbnail generation when the stream is fetched
          }
        }
        
        // Update stream with thumbnail URL if we got one
        if (thumbnailUrl) {
          try {
            const [updated] = await db
              .update(streams)
              .set({
                previewImageUrl: thumbnailUrl,
                updatedAt: new Date(),
              })
              .where(eq(streams.id, stream.id))
              .returning()
            
            console.log(`[POST Stream] ✅ Successfully saved thumbnail for stream ${stream.id}`)
            
            // Return updated stream with thumbnail
            return NextResponse.json(updated)
          } catch (dbError) {
            console.error(`[POST Stream] Failed to save thumbnail for stream ${stream.id}:`, dbError)
            // Continue to return stream without thumbnail - GET endpoints will handle it later
          }
        }
      } catch (error: any) {
        console.warn(`[POST Stream] Error generating thumbnail for stream ${stream.id}:`, error?.message || error)
        // Don't fail stream creation if thumbnail generation fails
        // The GET endpoints will handle thumbnail generation when the stream is fetched
      }
    }

    return NextResponse.json(stream)
  } catch (error: any) {
    console.error("Error launching stream:", error)
    const errorMessage = error?.message || "Failed to launch stream"
    return NextResponse.json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    }, { status: 500 })
  }
}

