import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { reviews } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const revieweeAddress = searchParams.get("reviewee")

    if (!revieweeAddress) {
      return NextResponse.json({ error: "Missing reviewee parameter" }, { status: 400 })
    }

    const reviewsList = await db
      .select()
      .from(reviews)
      .where(eq(reviews.revieweeAddress, revieweeAddress))
      .orderBy(desc(reviews.createdAt))

    return NextResponse.json(reviewsList)
  } catch (error) {
    console.error("Error fetching reviews:", error)
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { reviewerAddress, revieweeAddress, rating, comment } = body

    const [review] = await db.insert(reviews).values({
      reviewerAddress,
      revieweeAddress,
      rating,
      comment,
    }).returning()

    return NextResponse.json(review)
  } catch (error) {
    console.error("Error creating review:", error)
    return NextResponse.json({ error: "Failed to create review" }, { status: 500 })
  }
}

