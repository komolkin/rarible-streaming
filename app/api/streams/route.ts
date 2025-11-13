import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { streams, categories } from "@/lib/db/schema"
import { createStream, getStream } from "@/lib/livepeer"
import { eq, and, isNotNull, desc, sql } from "drizzle-orm"

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

    let query = db.select().from(streams)
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions))
    }
    
    // Order by endedAt DESC for ended streams, or createdAt DESC for others
    if (ended === "true") {
      query = query.orderBy(desc(streams.endedAt))
    } else {
      query = query.orderBy(desc(streams.createdAt))
    }
    
    // Apply limit if specified
    if (limit) {
      query = query.limit(limit)
    }

    const allStreams = await query

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
            // For all streams with playbackId (live, scheduled, or any state), generate thumbnail
            // This ensures thumbnails are available for preview components
            const isVod = !!stream.endedAt
            console.log(`[Streams API] 📡 Generating thumbnail for ${stream.isLive ? 'live' : 'scheduled'} stream using playbackId: ${stream.livepeerPlaybackId}`)
            thumbnailUrl = await generateAndVerifyThumbnail(stream.livepeerPlaybackId, {
              isVod: isVod,
              maxRetries: stream.isLive ? 1 : 2, // Quick check for live streams, more retries for others
              retryDelay: stream.isLive ? 1000 : 1500,
            })
            console.log(`[Streams API] ✅ Generated thumbnail for stream ${stream.id}: ${thumbnailUrl}`)
          } else {
            console.log(`[Streams API] ⏭️ Skipping thumbnail generation - missing playbackId`)
          }
          
          // Save thumbnail URL if we got one (even if verification failed, it might become available later)
          if (thumbnailUrl) {
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

    // Fetch categories for all streams and attach them
    const streamsWithCategories = await Promise.all(
      streamsWithThumbnails.map(async (stream) => {
        if (stream.categoryId) {
          try {
            const [categoryData] = await db
              .select()
              .from(categories)
              .where(eq(categories.id, stream.categoryId))
            
            return {
              ...stream,
              category: categoryData || null,
            }
          } catch (error) {
            console.warn(`[Streams API] Could not fetch category for stream ${stream.id}:`, error)
            return {
              ...stream,
              category: null,
            }
          }
        }
        
        return {
          ...stream,
          category: null,
        }
      })
    )

    return NextResponse.json(streamsWithCategories)
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

