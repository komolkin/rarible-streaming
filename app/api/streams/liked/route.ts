import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { streamLikes, streams, categories } from "@/lib/db/schema"
import { eq, desc, inArray } from "drizzle-orm"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userAddress = searchParams.get("userAddress")

    if (!userAddress) {
      return NextResponse.json(
        { error: "userAddress is required" },
        { status: 400 }
      )
    }

    // Get all stream IDs that the user has liked
    const userLikes = await db
      .select({
        streamId: streamLikes.streamId,
        likedAt: streamLikes.createdAt,
      })
      .from(streamLikes)
      .where(eq(streamLikes.userAddress, userAddress.toLowerCase()))
      .orderBy(desc(streamLikes.createdAt))

    if (userLikes.length === 0) {
      return NextResponse.json([])
    }

    // Get all stream IDs that the user has liked
    const streamIds = userLikes.map((like) => like.streamId)
    
    // Fetch all streams that the user has liked using inArray
    const likedStreams = await db
      .select()
      .from(streams)
      .where(inArray(streams.id, streamIds))

    // Create a map for quick lookup of liked dates
    const likedAtMap = new Map(
      userLikes.map((like) => [like.streamId, like.likedAt])
    )

    // Sort by liked date (most recent first)
    const sortedStreams = likedStreams.sort((a, b) => {
      const aLikedAt = likedAtMap.get(a.id)
      const bLikedAt = likedAtMap.get(b.id)
      if (!aLikedAt || !bLikedAt) return 0
      return new Date(bLikedAt).getTime() - new Date(aLikedAt).getTime()
    })

    // Fetch categories and creator profiles for all streams
    const streamsWithCategories = await Promise.all(
      sortedStreams.map(async (stream) => {
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
            console.warn(`Could not fetch category for stream ${stream.id}:`, error)
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
  } catch (error: any) {
    console.error("Error fetching liked streams:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to fetch liked streams" },
      { status: 500 }
    )
  }
}

