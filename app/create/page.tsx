"use client"

import { useState, useEffect, useRef } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Upload, X } from "lucide-react"

interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  imageUrl: string | null
}

export default function CreateStreamPage() {
  const { ready, authenticated, user } = usePrivy()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null)
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null)
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    categoryId: "",
    scheduledAt: "",
    hasMinting: false,
  })

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch("/api/categories")
        if (response.ok) {
          const data = await response.json()
          setCategories(data)
        } else {
          console.error("Failed to fetch categories:", response.status, response.statusText)
        }
      } catch (error) {
        console.error("Error fetching categories:", error)
      } finally {
        // Always enable the dropdown, even if categories fail to load
        // Category selection is optional, so users should be able to proceed
        setCategoriesLoading(false)
      }
    }

    if (ready && authenticated) {
      fetchCategories()
    } else {
      // If not ready or not authenticated, still enable the dropdown
      // It will just show "No categories available" until categories are loaded
      setCategoriesLoading(false)
    }
  }, [ready, authenticated])

  if (!ready) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center px-8">
        <Card>
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>
              Please connect your wallet to launch a stream
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setCoverImageFile(file)
      // Create preview URL
      const reader = new FileReader()
      reader.onloadend = () => {
        setCoverImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeCoverImage = () => {
    setCoverImageFile(null)
    setCoverImagePreview(null)
    setCoverImageUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const uploadFile = async (file: File, bucket: string) => {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("bucket", bucket)

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error || "Failed to upload file"
      throw new Error(errorMessage)
    }

    const data = await response.json()
    return data.url
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const walletAddress = user?.wallet?.address
      if (!walletAddress) {
        throw new Error("No wallet address found")
      }

      let previewImageUrl = coverImageUrl

      // Upload cover image if provided
      if (coverImageFile) {
        previewImageUrl = await uploadFile(coverImageFile, "covers")
        setCoverImageUrl(previewImageUrl)
      }

      // If no image provided, previewImageUrl will be null
      // The StreamCoverPlaceholder component will handle the display

      const response = await fetch("/api/streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          creatorAddress: walletAddress,
          previewImageUrl: previewImageUrl || null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to launch stream")
      }

      const stream = await response.json()
      router.push(`/stream/${stream.id}/setup`)
    } catch (error: any) {
      console.error("Error launching stream:", error)
      alert(error?.message || "Failed to launch stream")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen pt-24 pb-8 px-8">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Launch New Stream</CardTitle>
            <CardDescription>
              Set up your livestream and configure NFT minting
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="coverImage">Stream Cover Image (optional)</Label>
                <div className="space-y-4">
                  {coverImagePreview ? (
                    <div className="relative">
                      <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border">
                        <img
                          src={coverImagePreview}
                          alt="Cover preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={removeCoverImage}
                          className="absolute top-2 right-2 p-2 bg-background/80 hover:bg-background rounded-full transition-colors"
                          aria-label="Remove cover image"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="relative w-full aspect-video border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary/20 transition-colors"
                    >
                      <Upload className="h-8 w-8 mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Click to upload cover image
                      </p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    id="coverImage"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-4 sm:gap-4">
                <div className="space-y-2 flex-1">
                  <Label htmlFor="categoryId">Category (optional)</Label>
                  <Select
                    value={formData.categoryId || undefined}
                    onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
                    disabled={categoriesLoading}
                  >
                    <SelectTrigger id="categoryId">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.length === 0 && !categoriesLoading ? (
                        <SelectItem value="no-categories" disabled>
                          No categories available
                        </SelectItem>
                      ) : (
                        categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 flex-1">
                  <Label htmlFor="scheduledAt">Scheduled At (optional)</Label>
                  <Input
                    id="scheduledAt"
                    type="datetime-local"
                    value={formData.scheduledAt}
                    onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="hasMinting"
                  checked={formData.hasMinting}
                  onChange={(e) => setFormData({ ...formData, hasMinting: e.target.checked })}
                  className="rounded"
                />
                <Label htmlFor="hasMinting">Enable NFT Minting</Label>
              </div>

              <Button type="submit" disabled={loading}>
                {loading ? "Launching..." : "Launch Stream"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

