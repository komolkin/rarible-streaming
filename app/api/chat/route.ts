import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { chatMessages } from "@/lib/db/schema"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { streamId, senderAddress, message } = body

    const [chatMessage] = await db.insert(chatMessages).values({
      streamId,
      senderAddress,
      message,
    }).returning()

    return NextResponse.json(chatMessage)
  } catch (error) {
    console.error("Error sending chat message:", error)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}

