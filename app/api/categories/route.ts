import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { categories } from "@/lib/db/schema"

export async function GET(request: NextRequest) {
  try {
    const allCategories = await db.select().from(categories)
    return NextResponse.json(allCategories)
  } catch (error) {
    console.error("Error fetching categories:", error)
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, slug, description, imageUrl } = body

    const [category] = await db.insert(categories).values({
      name,
      slug,
      description,
      imageUrl,
    }).returning()

    return NextResponse.json(category)
  } catch (error) {
    console.error("Error creating category:", error)
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 })
  }
}

