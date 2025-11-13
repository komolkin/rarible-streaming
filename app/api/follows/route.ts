import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { follows } from "@/lib/db/schema"
import { eq, and, count } from "drizzle-orm"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const followerAddress = searchParams.get("follower")?.toLowerCase()
    const followingAddress = searchParams.get("following")?.toLowerCase()
    const address = searchParams.get("address")?.toLowerCase()
    const type = searchParams.get("type") // "followers" or "following"

    // Check if a specific user is following another user
    if (followerAddress && followingAddress) {
      const [follow] = await db
        .select()
        .from(follows)
        .where(
          and(
            eq(follows.followerAddress, followerAddress),
            eq(follows.followingAddress, followingAddress)
          )
        )
        .limit(1)

      return NextResponse.json({ isFollowing: !!follow })
    }

    // Get follower or following count
    if (address && type) {
      if (type === "followers") {
        const [result] = await db
          .select({ count: count() })
          .from(follows)
          .where(eq(follows.followingAddress, address))

        return NextResponse.json({ count: result?.count || 0 })
      } else if (type === "following") {
        const [result] = await db
          .select({ count: count() })
          .from(follows)
          .where(eq(follows.followerAddress, address))

        return NextResponse.json({ count: result?.count || 0 })
      }
    }

    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 })
  } catch (error) {
    console.error("Error fetching follow data:", error)
    return NextResponse.json({ error: "Failed to fetch follow data" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const followerAddress = body.followerAddress?.toLowerCase()
    const followingAddress = body.followingAddress?.toLowerCase()

    if (!followerAddress || !followingAddress) {
      return NextResponse.json({ error: "Missing required addresses" }, { status: 400 })
    }

    const [follow] = await db
      .insert(follows)
      .values({
        followerAddress,
        followingAddress,
      })
      .onConflictDoNothing()
      .returning()

    return NextResponse.json(follow)
  } catch (error) {
    console.error("Error creating follow:", error)
    return NextResponse.json({ error: "Failed to follow user" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const followerAddress = searchParams.get("follower")?.toLowerCase()
    const followingAddress = searchParams.get("following")?.toLowerCase()

    if (!followerAddress || !followingAddress) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
    }

    await db
      .delete(follows)
      .where(
        and(
          eq(follows.followerAddress, followerAddress),
          eq(follows.followingAddress, followingAddress)
        )
      )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error unfollowing user:", error)
    return NextResponse.json({ error: "Failed to unfollow user" }, { status: 500 })
  }
}

