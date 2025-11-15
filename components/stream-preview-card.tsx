"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { StreamCoverPlaceholder } from "@/components/stream-cover-placeholder"

interface StreamPreviewCardProps {
  stream: {
    id: string
    title: string
    description?: string | null
    previewImageUrl?: string | null
    thumbnailUrl?: string | null // Live thumbnail URL from playback info (auto-updates)
    livepeerPlaybackId?: string | null
    creatorAddress: string
    creator?: {
      displayName?: string | null
      username?: string | null
      avatarUrl?: string | null
    } | null
    isLive?: boolean
    endedAt?: string | Date | null
    createdAt?: string | Date | null
    viewerCount?: number
    category?: {
      name: string
      slug: string
    } | null
  }
  showCreator?: boolean
  showDate?: boolean
}

export function StreamPreviewCard({ 
  stream, 
  showCreator = true,
  showDate = true 
}: StreamPreviewCardProps) {
  const [liveThumbnailUrl, setLiveThumbnailUrl] = useState<string | null>(stream.thumbnailUrl || null)
  const [thumbnailRefreshKey, setThumbnailRefreshKey] = useState(Date.now())

  // For live streams without previewImageUrl, use thumbnailUrl from stream or fetch from playback info
  // and refresh it every 5 seconds to get the latest frame
  useEffect(() => {
    if (!stream.isLive || stream.previewImageUrl || !stream.livepeerPlaybackId) {
      return
    }

    // If thumbnailUrl is already provided in stream object, use it
    if (stream.thumbnailUrl) {
      setLiveThumbnailUrl(stream.thumbnailUrl)
      // Still refresh the image every 5 seconds to get latest frame
      const interval = setInterval(() => {
        setThumbnailRefreshKey(Date.now()) // Force image refresh
      }, 5000)
      return () => clearInterval(interval)
    }

    // Otherwise, fetch thumbnail from playback info API
    const fetchLiveThumbnail = async () => {
      try {
        const response = await fetch(`/api/streams/${stream.id}/playback?playbackId=${stream.livepeerPlaybackId}`)
        if (response.ok) {
          const data = await response.json()
          // Use thumbnailUrl from API response if available
          if (data.thumbnailUrl) {
            setLiveThumbnailUrl(data.thumbnailUrl)
            return
          }
          // Fallback: Extract thumbnail URL from playback info
          // Livepeer returns thumbnail in meta.source array with type "image/png"
          if (data.playbackInfo?.meta?.source) {
            const thumbnailSource = data.playbackInfo.meta.source.find(
              (s: any) => s.type === "image/png" || s.hrn === "Thumbnail (PNG)"
            )
            if (thumbnailSource?.url) {
              setLiveThumbnailUrl(thumbnailSource.url)
              return
            }
          }
          // Fallback: check direct source array
          if (data.playbackInfo?.source) {
            const thumbnailSource = data.playbackInfo.source.find(
              (s: any) => s.type === "image/png" || s.hrn === "Thumbnail (PNG)"
            )
            if (thumbnailSource?.url) {
              setLiveThumbnailUrl(thumbnailSource.url)
            }
          }
        }
      } catch (error) {
        console.warn(`[StreamPreviewCard] Failed to fetch live thumbnail for stream ${stream.id}:`, error)
      }
    }

    // Fetch immediately
    fetchLiveThumbnail()

    // Refresh every 5 seconds for live streams (as per Livepeer docs)
    const interval = setInterval(() => {
      fetchLiveThumbnail()
      setThumbnailRefreshKey(Date.now()) // Force image refresh
    }, 5000)

    return () => clearInterval(interval)
  }, [stream.id, stream.isLive, stream.livepeerPlaybackId, stream.previewImageUrl, stream.thumbnailUrl])

  // Use previewImageUrl if available, otherwise use live thumbnail URL
  const imageUrl = stream.previewImageUrl || liveThumbnailUrl

  return (
    <Link href={`/stream/${stream.id}`}>
      <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
        <div className="aspect-video w-full overflow-hidden rounded-t-lg bg-black relative">
          {imageUrl ? (
            <>
              <img
                key={thumbnailRefreshKey} // Force refresh by changing key
                src={`${imageUrl}${stream.isLive ? `?refresh=${thumbnailRefreshKey}` : ''}`}
                alt={stream.title}
                className="w-full h-full object-cover"
                loading="lazy"
                onLoad={() => {
                  console.log(`[StreamPreviewCard] Image loaded successfully for stream ${stream.id}`)
                }}
                onError={(e) => {
                  // If image fails to load, hide it and show placeholder instead
                  console.error(`[StreamPreviewCard] Image failed to load for stream ${stream.id}:`, imageUrl)
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                  const placeholder = target.parentElement?.querySelector('.placeholder-fallback') as HTMLElement
                  if (placeholder) {
                    placeholder.style.display = 'block'
                  }
                }}
              />
              <div className="placeholder-fallback hidden absolute inset-0">
                <StreamCoverPlaceholder
                  title={stream.title}
                  isLive={stream.isLive}
                  endedAt={stream.endedAt}
                  creatorAddress={stream.creatorAddress}
                />
              </div>
            </>
          ) : (
            <StreamCoverPlaceholder
              title={stream.title}
              isLive={stream.isLive}
              endedAt={stream.endedAt}
              creatorAddress={stream.creatorAddress}
            />
          )}
          {stream.endedAt && (
            <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-semibold">
              Ended
            </div>
          )}
          {/* Viewers counter - left bottom corner */}
          <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm text-white px-2 py-1 rounded text-xs font-medium">
            <span>{stream.viewerCount ?? 0} {stream.viewerCount === 1 ? 'viewer' : 'viewers'}</span>
          </div>
        </div>
        <CardHeader className="p-3 pb-2">
          {stream.category && (
            <Link 
              href={`/browse/${stream.category.slug}`}
              className="text-xs text-blue-400 mb-1 hover:underline inline-block"
              onClick={(e) => e.stopPropagation()}
            >
              {stream.category.name}
            </Link>
          )}
          <CardTitle className="line-clamp-2 text-sm font-semibold">
            {stream.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {showCreator && (
            <div className="flex items-center justify-between">
              <Link
                href={`/profile/${stream.creatorAddress}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-2 hover:opacity-80"
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src={stream.creator?.avatarUrl || ""} />
                  <AvatarFallback
                    seed={(stream.creatorAddress || "").toLowerCase()}
                  />
                </Avatar>
                <span className="text-xs text-muted-foreground">
                  {stream.creator?.displayName || stream.creator?.username || `${stream.creatorAddress?.slice(0, 6)}...${stream.creatorAddress?.slice(-4)}`}
                </span>
              </Link>
              {showDate && (stream.createdAt || stream.endedAt) && (
                <span className="text-xs text-muted-foreground">
                  {stream.endedAt
                    ? new Date(stream.endedAt).toLocaleDateString()
                    : stream.createdAt
                    ? new Date(stream.createdAt).toLocaleDateString()
                    : null}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

