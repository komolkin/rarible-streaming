import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { streamLikes, streams } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

// Mark this route as dynamic since it uses request.url
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const userAddress = searchParams.get("userAddress")

    // Get stream with cached likeCount
    const [stream] = await db
      .select()
      .from(streams)
      .where(eq(streams.id, params.id))
      .limit(1)

    if (!stream) {
      return NextResponse.json(
        { error: "Stream not found" },
        { status: 404 }
      )
    }

    // Use cached likeCount from stream, fallback to counting if not available
    let likeCount = stream.likeCount || 0

    // Check if specific user has liked the stream
    let isLiked = false
    if (userAddress) {
      const userLike = await db
        .select()
        .from(streamLikes)
        .where(
          and(
            eq(streamLikes.streamId, params.id),
            eq(streamLikes.userAddress, userAddress.toLowerCase())
          )
        )
        .limit(1)

      isLiked = userLike.length > 0
    }

    return NextResponse.json({
      likeCount,
      isLiked,
    })
  } catch (error: any) {
    console.error("Error fetching stream likes:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to fetch stream likes" },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { userAddress } = body

    if (!userAddress) {
      return NextResponse.json(
        { error: "userAddress is required" },
        { status: 400 }
      )
    }

    // Check if user already liked the stream
    const existingLike = await db
      .select()
      .from(streamLikes)
      .where(
        and(
          eq(streamLikes.streamId, params.id),
          eq(streamLikes.userAddress, userAddress.toLowerCase())
        )
      )
      .limit(1)

    if (existingLike.length > 0) {
      // Get current like count
      const likes = await db
        .select()
        .from(streamLikes)
        .where(eq(streamLikes.streamId, params.id))
      
      return NextResponse.json({
        likeCount: likes.length,
        isLiked: true,
        message: "Stream already liked",
      })
    }

    // Add like
    await db.insert(streamLikes).values({
      streamId: params.id,
      userAddress: userAddress.toLowerCase(),
    })

    // Get updated like count
    const likes = await db
      .select()
      .from(streamLikes)
      .where(eq(streamLikes.streamId, params.id))

    const newLikeCount = likes.length

    // Update cached likeCount in streams table
    await db
      .update(streams)
      .set({ likeCount: newLikeCount })
      .where(eq(streams.id, params.id))

    return NextResponse.json({
      likeCount: newLikeCount,
      isLiked: true,
    })
  } catch (error: any) {
    console.error("Error liking stream:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to like stream" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const userAddress = searchParams.get("userAddress")

    if (!userAddress) {
      return NextResponse.json(
        { error: "userAddress is required" },
        { status: 400 }
      )
    }

    // Remove like
    await db
      .delete(streamLikes)
      .where(
        and(
          eq(streamLikes.streamId, params.id),
          eq(streamLikes.userAddress, userAddress.toLowerCase())
        )
      )

    // Get updated like count
    const likes = await db
      .select()
      .from(streamLikes)
      .where(eq(streamLikes.streamId, params.id))

    const newLikeCount = likes.length

    // Update cached likeCount in streams table
    await db
      .update(streams)
      .set({ likeCount: newLikeCount })
      .where(eq(streams.id, params.id))

    return NextResponse.json({
      likeCount: newLikeCount,
      isLiked: false,
    })
  } catch (error: any) {
    console.error("Error unliking stream:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to unlike stream" },
      { status: 500 }
    )
  }
}

