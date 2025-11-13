import { NextRequest, NextResponse } from "next/server"
import { pinJSONToIPFS } from "@/lib/pinata"
import { db } from "@/lib/db"
import { streams } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { streamId, imageUri, description, maxSupply, perWalletLimit } = body

    const metadata = {
      name: `Stream Mint #${streamId}`,
      description,
      image: imageUri,
      attributes: [
        { trait_type: "Stream ID", value: streamId },
      ],
    }

    const metadataUri = await pinJSONToIPFS(metadata)

    await db
      .update(streams)
      .set({
        mintMetadataUri: metadataUri,
        mintMaxSupply: maxSupply,
        mintPerWalletLimit: perWalletLimit,
      })
      .where(eq(streams.id, streamId))

    return NextResponse.json({ metadataUri })
  } catch (error) {
    console.error("Error creating mint:", error)
    return NextResponse.json({ error: "Failed to create mint" }, { status: 500 })
  }
}

