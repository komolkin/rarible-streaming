import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const bucket = formData.get("bucket") as string || "avatars"

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Check if Supabase is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ 
        error: "Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL environment variable." 
      }, { status: 500 })
    }

    const supabase = createServerClient()
    const buffer = await file.arrayBuffer()
    const bytes = Buffer.from(buffer)

    const fileName = `${Date.now()}-${file.name}`
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, bytes, {
        contentType: file.type,
      })

    if (error) {
      console.error("Error uploading file to bucket:", bucket, error)
      // Return more detailed error message
      const errorMessage = error.message || error.error || "Failed to upload file"
      const errorString = typeof error === 'string' ? error : JSON.stringify(error)
      
      // Check if bucket doesn't exist
      if (errorMessage?.includes("Bucket not found") || 
          errorMessage?.includes("not found") ||
          errorString?.includes("Bucket not found") ||
          errorString?.includes("not found")) {
        return NextResponse.json({ 
          error: `Storage bucket "${bucket}" not found. Please create it in Supabase Storage.`,
          details: errorMessage 
        }, { status: 404 })
      }
      
      return NextResponse.json({ 
        error: errorMessage,
        details: errorString 
      }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName)

    return NextResponse.json({ url: publicUrl })
  } catch (error: any) {
    console.error("Error in upload route:", error)
    return NextResponse.json({ 
      error: error?.message || "Failed to upload file",
      details: error?.stack 
    }, { status: 500 })
  }
}

