import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { follows, users } from "@/lib/db/schema"
import { eq, and, count, desc, sql } from "drizzle-orm"

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

    // Get follower or following count or list
    if (address && type) {
      const list = searchParams.get("list") === "true"
      
      if (type === "followers") {
        if (list) {
          // Get list of followers with their profile data
          const followersData = await db
            .select({
              followerAddress: follows.followerAddress,
              createdAt: follows.createdAt,
            })
            .from(follows)
            .where(eq(follows.followingAddress, address))
            .orderBy(desc(follows.createdAt))

          // Batch fetch profiles for all followers
          const followerAddresses = followersData.map(f => f.followerAddress.toLowerCase())
          const profilesMap = new Map<string, any>()

          if (followerAddresses.length > 0) {
            const profiles = await db
              .select({
                walletAddress: users.walletAddress,
                username: users.username,
                displayName: users.displayName,
                avatarUrl: users.avatarUrl,
              })
              .from(users)
              .where(sql`LOWER(${users.walletAddress}) = ANY(ARRAY[${sql.join(
                followerAddresses.map(addr => sql`${addr}`),
                sql`, `
              )}])`)

            profiles.forEach(profile => {
              profilesMap.set(profile.walletAddress.toLowerCase(), {
                walletAddress: profile.walletAddress,
                username: profile.username,
                displayName: profile.displayName,
                avatarUrl: profile.avatarUrl,
              })
            })
          }

          // Combine followers with their profiles
          const followersList = followersData.map(follow => ({
            followerAddress: follow.followerAddress,
            createdAt: follow.createdAt,
            profile: profilesMap.get(follow.followerAddress.toLowerCase()) || null,
          }))

          return NextResponse.json({ followers: followersList })
        } else {
          // Get count only
          const [result] = await db
            .select({ count: count() })
            .from(follows)
            .where(eq(follows.followingAddress, address))

          return NextResponse.json({ count: result?.count || 0 })
        }
      } else if (type === "following") {
        if (list) {
          // Get list of following with their profile data
          const followingData = await db
            .select({
              followingAddress: follows.followingAddress,
              createdAt: follows.createdAt,
            })
            .from(follows)
            .where(eq(follows.followerAddress, address))
            .orderBy(desc(follows.createdAt))

          // Batch fetch profiles for all following
          const followingAddresses = followingData.map(f => f.followingAddress.toLowerCase())
          const profilesMap = new Map<string, any>()

          if (followingAddresses.length > 0) {
            const profiles = await db
              .select({
                walletAddress: users.walletAddress,
                username: users.username,
                displayName: users.displayName,
                avatarUrl: users.avatarUrl,
              })
              .from(users)
              .where(sql`LOWER(${users.walletAddress}) = ANY(ARRAY[${sql.join(
                followingAddresses.map(addr => sql`${addr}`),
                sql`, `
              )}])`)

            profiles.forEach(profile => {
              profilesMap.set(profile.walletAddress.toLowerCase(), {
                walletAddress: profile.walletAddress,
                username: profile.username,
                displayName: profile.displayName,
                avatarUrl: profile.avatarUrl,
              })
            })
          }

          // Combine following with their profiles
          const followingList = followingData.map(follow => ({
            followingAddress: follow.followingAddress,
            createdAt: follow.createdAt,
            profile: profilesMap.get(follow.followingAddress.toLowerCase()) || null,
          }))

          return NextResponse.json({ following: followingList })
        } else {
          // Get count only
          const [result] = await db
            .select({ count: count() })
            .from(follows)
            .where(eq(follows.followerAddress, address))

          return NextResponse.json({ count: result?.count || 0 })
        }
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

