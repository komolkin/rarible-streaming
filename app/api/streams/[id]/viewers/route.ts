import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { streams } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getViewerCount } from "@/lib/livepeer"

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

    // Get real-time concurrent viewers from Livepeer API
    const viewerCount = await getViewerCount(playbackId)

    return NextResponse.json({
      playbackId,
      viewerCount,
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


