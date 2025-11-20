import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { chatMessages, users } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"

export async function GET(
  request: NextRequest,
  { params }: { params: { streamId: string } }
) {
  try {
    const messages = await db
      .select({
        id: chatMessages.id,
        streamId: chatMessages.streamId,
        senderAddress: chatMessages.senderAddress,
        message: chatMessages.message,
        createdAt: chatMessages.createdAt,
        user: {
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          walletAddress: users.walletAddress,
        },
      })
      .from(chatMessages)
      .leftJoin(users, eq(sql`lower(${chatMessages.senderAddress})`, users.walletAddress))
      .where(eq(chatMessages.streamId, params.streamId))
      .orderBy(chatMessages.createdAt)

    return NextResponse.json(messages)
  } catch (error) {
    console.error("Error fetching chat messages:", error)
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 })
  }
}
