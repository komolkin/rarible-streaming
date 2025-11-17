"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"

interface Category {
  id: string
  name: string
  slug: string
  description?: string | null
  imageUrl?: string | null
}

export default function BrowsePage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/categories")
      if (response.ok) {
        const categoriesData = await response.json()
        setCategories(categoriesData)
      }
    } catch (error) {
      console.error("Error fetching categories:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen pt-24 pb-8 px-2 md:px-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-16 text-center">Browse Categories</h1>
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin"></div>
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No categories available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {categories.map((category) => (
              <Link key={category.id} href={`/browse/${category.slug}`}>
                <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                  {category.imageUrl ? (
                    <div className="aspect-video w-full overflow-hidden rounded-t-lg bg-black">
                      <img
                        src={category.imageUrl}
                        alt={category.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div 
                      className="aspect-video w-full overflow-hidden rounded-t-lg flex items-center justify-center"
                    >
                      <span className="text-4xl font-bold">
                        {category.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-lg mb-1">{category.name}</h3>
                    {category.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {category.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

