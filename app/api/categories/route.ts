import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { categories } from "@/lib/db/schema"
import { asc, eq } from "drizzle-orm"

export async function GET(request: NextRequest) {
  try {
    const allCategories = await db
      .select()
      .from(categories)
      .orderBy(asc(categories.order), asc(categories.name))
    return NextResponse.json(allCategories)
  } catch (error) {
    console.error("Error fetching categories:", error)
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, slug, description, imageUrl, order } = body

    const [category] = await db.insert(categories).values({
      name,
      slug,
      description,
      imageUrl,
      order: order ?? 0,
    }).returning()

    return NextResponse.json(category)
  } catch (error) {
    console.error("Error creating category:", error)
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Accept either a single category update or an array of updates
    const updates = Array.isArray(body) ? body : [body]
    
    // Update each category
    const updatedCategories = await Promise.all(
      updates.map(async (update: { id: string; order?: number; name?: string; description?: string; imageUrl?: string }) => {
        if (!update.id) {
          throw new Error("Category id is required")
        }
        
        const updateData: any = {}
        if (update.order !== undefined) updateData.order = update.order
        if (update.name !== undefined) updateData.name = update.name
        if (update.description !== undefined) updateData.description = update.description
        if (update.imageUrl !== undefined) updateData.imageUrl = update.imageUrl
        
        const [updated] = await db
          .update(categories)
          .set(updateData)
          .where(eq(categories.id, update.id))
          .returning()
        
        return updated
      })
    )

    return NextResponse.json(Array.isArray(body) ? updatedCategories : updatedCategories[0])
  } catch (error) {
    console.error("Error updating categories:", error)
    return NextResponse.json({ error: "Failed to update categories" }, { status: 500 })
  }
}

