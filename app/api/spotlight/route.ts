import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { streams, categories, users, spotlights } from "@/lib/db/schema"
import { eq, desc, sql } from "drizzle-orm"

export const revalidate = 60

export async function GET(request: NextRequest) {
  try {
    // 1. Get the active spotlight
    const spotlight = await db.select()
      .from(spotlights)
      .where(eq(spotlights.spotlighted, true))
      .orderBy(desc(spotlights.createdAt))
      .limit(1)

    if (!spotlight.length) {
      return NextResponse.json(null)
    }

    const streamId = spotlight[0].streamId

    // 2. Fetch the stream details with category
    const streamResults = await db.select({
        stream: streams,
        category: categories
      })
      .from(streams)
      .leftJoin(categories, eq(streams.categoryId, categories.id))
      .where(eq(streams.id, streamId))
      .limit(1)

    if (!streamResults.length) {
      return NextResponse.json(null)
    }

    const { stream, category } = streamResults[0]

    // 3. Fetch creator details
    // Note: Creator address in stream is lowercase, but check both just in case
    const creator = await db.select()
      .from(users)
      .where(sql`LOWER(${users.walletAddress}) = ${stream.creatorAddress.toLowerCase()}`)
      .limit(1)
      .then(res => res[0] || null)

    // 4. Enrich with Livepeer data (viewer count, etc.)
    // This mirrors logic from /api/streams/route.ts but simplified for single stream
    let viewerCount = 0
    if (stream.livepeerPlaybackId && stream.isLive && !stream.endedAt) {
      try {
        const { getViewerCount } = await import("@/lib/livepeer")
        viewerCount = await getViewerCount(stream.livepeerPlaybackId)
      } catch (error) {
        console.warn(`[Spotlight API] Could not fetch viewer count:`, error)
      }
    }

    // 5. Get total views
    let totalViews = 0
    let totalViewsPlaybackId = null
    try {
      // Simplified view logic - mostly relying on playbackId
      // For full logic we'd need to replicate resolveViewsPlaybackId
      const playbackId = stream.assetId ? (await import("@/lib/livepeer").then(m => m.getAsset(stream.assetId!))).playbackId : stream.livepeerPlaybackId
      
      if (playbackId) {
        totalViewsPlaybackId = playbackId
        const { getTotalViews } = await import("@/lib/livepeer")
        totalViews = await getTotalViews(playbackId)
      }
    } catch (error) {
      console.warn(`[Spotlight API] Could not fetch total views:`, error)
    }

    // 6. Construct response
    const enrichedStream = {
      ...stream,
      category: category || null,
      creator: creator,
      viewerCount,
      totalViews,
      totalViewsPlaybackId
    }

    return NextResponse.json(enrichedStream)

  } catch (error) {
    console.error("Error fetching spotlight:", error)
    return NextResponse.json({ error: "Failed to fetch spotlight" }, { status: 500 })
  }
}
