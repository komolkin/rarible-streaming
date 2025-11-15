import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { streams, streamViews } from "@/lib/db/schema"
import { eq, and, sql, gt } from "drizzle-orm"

/**
 * POST /api/streams/[id]/views
 * Track a view event for a stream
 * Records when a user views a stream (live or replay)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const userAddress = body.userAddress

    if (!userAddress) {
      return NextResponse.json(
        { error: "userAddress is required" },
        { status: 400 }
      )
    }

    // Verify stream exists
    const [stream] = await db
      .select()
      .from(streams)
      .where(eq(streams.id, params.id))

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 })
    }

    // Check if user has viewed this stream recently (within last hour) to prevent spam
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recentView = await db
      .select()
      .from(streamViews)
      .where(
        and(
          eq(streamViews.streamId, params.id),
          eq(streamViews.userAddress, userAddress.toLowerCase()),
          gt(streamViews.viewedAt, oneHourAgo)
        )
      )
      .limit(1)

    // Only record view if user hasn't viewed recently (prevents spam)
    if (recentView.length === 0) {
      try {
        await db.insert(streamViews).values({
          streamId: params.id,
          userAddress: userAddress.toLowerCase(),
          viewedAt: new Date(),
        })
      } catch (error: any) {
        console.error(`[Views API] Error inserting view:`, error)
        throw error
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error(`[Views API] Error tracking view for stream ${params.id}:`, error)
    return NextResponse.json(
      { error: error?.message || "Failed to track view" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/streams/[id]/views
 * Get total views count (unique users) for a stream
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Count distinct users who viewed this stream
    const result = await db
      .select({
        totalViews: sql<number>`COUNT(DISTINCT ${streamViews.userAddress})::int`,
      })
      .from(streamViews)
      .where(eq(streamViews.streamId, params.id))

    const totalViews = result[0]?.totalViews || 0

    return NextResponse.json({
      streamId: params.id,
      totalViews,
    })
  } catch (error: any) {
    console.error(`[Views API] Error fetching total views for stream ${params.id}:`, error)
    return NextResponse.json(
      { error: error?.message || "Failed to fetch total views" },
      { status: 500 }
    )
  }
}
