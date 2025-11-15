import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { streams } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getViewerCount, getTotalViews, getPeakViewers, getHistoricalViews } from "@/lib/livepeer"

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
      return NextResponse.json({ error: "Stream has no playbackId yet" }, { status: 400 })
    }

    // Get real-time concurrent viewers (always available)
    const viewerCount = await getViewerCount(playbackId)

    // Try to get historical data from Livepeer (if available)
    const [totalViews, peakViewers, historicalData] = await Promise.all([
      getTotalViews(playbackId),
      getPeakViewers(playbackId),
      getHistoricalViews(playbackId),
    ])

    return NextResponse.json({
      playbackId,
      viewerCount, // Real-time concurrent viewers
      totalViews: totalViews ?? null, // Total lifetime views from Livepeer (if available)
      peakViewers: peakViewers ?? null, // Peak concurrent viewers (if available)
      historicalData: historicalData ?? null, // Full historical data (if available)
      fetchedAt: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error(`[Viewer Count] Error fetching viewers for stream ${params.id}:`, error)
    return NextResponse.json(
      { error: error?.message || "Failed to fetch viewer count" },
      { status: 500 }
    )
  }
}


