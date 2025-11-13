import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { chatMessages } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET(
  request: NextRequest,
  { params }: { params: { streamId: string } }
) {
  try {
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.streamId, params.streamId))
      .orderBy(chatMessages.createdAt)

    return NextResponse.json(messages)
  } catch (error) {
    console.error("Error fetching chat messages:", error)
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 })
  }
}

