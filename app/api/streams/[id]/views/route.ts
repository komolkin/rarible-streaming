import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { streams } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getTotalViews } from "@/lib/livepeer"

/**
 * GET /api/streams/[id]/views
 * Get total views count from Livepeer API (if available)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const [stream] = await db
      .select({
        id: streams.id,
        playbackId: streams.livepeerPlaybackId,
      })
      .from(streams)
      .where(eq(streams.id, params.id))

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 })
    }

    const playbackId = stream.playbackId
    if (!playbackId) {
      return NextResponse.json({
        streamId: params.id,
        totalViews: null,
        message: "Stream has no playbackId yet",
      })
    }

    // Try to get total views from Livepeer API
    const totalViews = await getTotalViews(playbackId)

    return NextResponse.json({
      streamId: params.id,
      totalViews: totalViews ?? null,
    })
  } catch (error: any) {
    console.error(`[Views API] Error fetching total views for stream ${params.id}:`, error)
    return NextResponse.json(
      { 
        streamId: params.id,
        totalViews: null,
        error: error?.message || "Failed to fetch total views" 
      },
      { status: 500 }
    )
  }
}
