"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { StreamPreviewCard } from "@/components/stream-preview-card"
import { Card, CardContent } from "@/components/ui/card"

export default function CategoryPage() {
  const params = useParams()
  const [streams, setStreams] = useState<any[]>([])
  const [category, setCategory] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (params.slug) {
      fetchCategoryAndStreams()
    }
  }, [params.slug])

  const fetchCategoryAndStreams = async () => {
    try {
      setLoading(true)
      
      // Fetch all categories to find the one matching the slug
      const categoriesResponse = await fetch("/api/categories")
      if (categoriesResponse.ok) {
        const categories = await categoriesResponse.json()
        const foundCategory = categories.find((cat: any) => cat.slug === params.slug)
        
        if (foundCategory) {
          setCategory(foundCategory)
          
          // Fetch streams with this category
          const streamsResponse = await fetch("/api/streams")
          if (streamsResponse.ok) {
            const allStreams = await streamsResponse.json()
            // Filter streams by category ID
            const categoryStreams = allStreams.filter(
              (stream: any) => stream.categoryId === foundCategory.id
            )
            
            // Fetch creator profiles for each stream
            const streamsWithCreators = await Promise.all(
              categoryStreams.map(async (stream: any) => {
                try {
                  const creatorResponse = await fetch(
                    `/api/profiles?wallet=${stream.creatorAddress}`
                  )
                  if (creatorResponse.ok) {
                    const creator = await creatorResponse.json()
                    return { ...stream, creator }
                  }
                } catch (error) {
                  console.error(
                    `Error fetching creator for stream ${stream.id}:`,
                    error
                  )
                }
                return stream
              })
            )
            
            setStreams(streamsWithCreators)
          }
        }
      }
    } catch (error) {
      console.error("Error fetching category and streams:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen pt-24 pb-8 px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </main>
    )
  }

  if (!category) {
    return (
      <main className="min-h-screen pt-24 pb-8 px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">Category not found</p>
            <Link href="/browse" className="text-blue-400 hover:underline">
              Back to Browse
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen pt-24 pb-8 px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link href="/browse" className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
            ← Back to Categories
          </Link>
          <div className="flex items-center gap-4 mb-4">
            {category.imageUrl && (
              <div className="w-16 h-16 rounded-lg overflow-hidden">
                <img
                  src={category.imageUrl}
                  alt={category.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div>
              <h1 className="text-4xl font-bold">{category.name}</h1>
              {category.description && (
                <p className="text-muted-foreground mt-2">{category.description}</p>
              )}
            </div>
          </div>
        </div>
        
        {streams.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No streams in this category yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {streams.map((stream) => (
              <StreamPreviewCard key={stream.id} stream={stream} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

