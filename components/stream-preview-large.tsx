import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Player } from "@livepeer/react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { formatRelativeTime, formatAddress } from "@/lib/utils"
import { useEnsName } from "@/lib/hooks/use-ens"
import { BadgeCheck } from "lucide-react"
import { RaribleProductCard } from "@/components/rarible-product-card"

interface StreamPreviewLargeProps {
  stream: {
    id: string
    title: string
    description?: string | null
    livepeerPlaybackId?: string | null
    creatorAddress: string
    creator?: {
      displayName?: string | null
      username?: string | null
      avatarUrl?: string | null
      verified?: boolean
    } | null
    isLive?: boolean
    endedAt?: string | Date | null
    createdAt?: string | Date | null
    viewerCount?: number
    totalViews?: number
    category?: {
      name: string
      slug: string
    } | null
    products?: string[] | null
  }
}

export function StreamPreviewLarge({ stream }: StreamPreviewLargeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isInViewport, setIsInViewport] = useState<boolean>(false)
  const creatorEnsName = useEnsName(stream.creatorAddress)

  // Intersection Observer for viewport-based playback control
  useEffect(() => {
    if (!containerRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsInViewport(entry.isIntersecting)
        })
      },
      {
        threshold: 1.0, // Trigger when 100% of the preview is visible
      }
    )

    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
    }
  }, [])

  // Control playback based on viewport visibility
  useEffect(() => {
    if (!containerRef.current || !stream.livepeerPlaybackId) return

    const findVideoElement = (): HTMLVideoElement | null => {
      return containerRef.current?.querySelector("video") || null
    }

    const handlePlayback = async () => {
      const videoElement = findVideoElement()
      if (!videoElement) return

      try {
        if (isInViewport) {
          // Video is in viewport - play if paused
          if (videoElement.paused) {
            await videoElement.play().catch((error) => {
              console.warn("Autoplay prevented:", error)
            })
          }
        } else {
          // Video is out of viewport - pause if playing
          if (!videoElement.paused) {
            videoElement.pause()
          }
        }
      } catch (error) {
        console.warn("Playback control error:", error)
      }
    }

    // Use MutationObserver to detect when video element is added to DOM
    const observer = new MutationObserver(() => {
      handlePlayback()
    })

    // Start observing when component mounts
    const checkInterval = setInterval(() => {
      const videoElement = findVideoElement()
      if (videoElement) {
        clearInterval(checkInterval)
        observer.disconnect()
        handlePlayback()
      }
    }, 200)

    // Also observe DOM changes
    if (containerRef.current) {
      observer.observe(containerRef.current, {
        childList: true,
        subtree: true,
      })
    }

    // Initial check
    handlePlayback()

    return () => {
      clearInterval(checkInterval)
      observer.disconnect()
    }
  }, [isInViewport, stream.livepeerPlaybackId])

  return (
    <div ref={containerRef} className="w-full mb-6 flex flex-col lg:flex-row gap-4">
      {/* Player Section */}
      <Card className="flex-1 flex flex-col min-h-0 p-0 overflow-hidden">
        <CardContent className="p-0 flex-1 flex items-center justify-center bg-black relative aspect-video lg:h-auto">
          {stream.livepeerPlaybackId ? (
            <div className="w-full h-full flex items-center justify-center relative">
              <div className="w-full h-full max-w-full max-h-full">
                <Player
                  playbackId={stream.livepeerPlaybackId}
                  playRecording={!!stream.endedAt}
                  autoPlay={false}
                  muted
                  showTitle={false}
                  showPipButton={false}
                  objectFit="contain"
                  priority={false}
                  showUploadingIndicator={true}
                />
              </div>

              {/* Live badge */}
              {stream.isLive && !stream.endedAt && (
                <div className="absolute top-2 left-2 sm:top-4 sm:left-4 bg-red-500 text-white px-2 py-1 sm:px-3 rounded-full text-xs sm:text-sm font-semibold flex items-center gap-1.5 sm:gap-2 z-10">
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full animate-pulse"></span>
                  LIVE
                </div>
              )}

              {/* Ended badge */}
              {stream.endedAt && (
                <div className="absolute top-2 left-2 sm:top-4 sm:left-4 bg-black/70 text-white px-2 py-1 sm:px-3 rounded-full text-xs sm:text-sm font-semibold z-10">
                  Ended
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/60">
              <p>No playback available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Right Sidebar */}
      <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4">
        {/* Combined Title/Metadata and Products Section */}
        <Card className="flex-1 flex flex-col min-h-0">
          <CardContent className="p-3 sm:p-4 flex flex-col flex-1 min-h-0">
            {/* Title and Metadata Section */}
            <div className="flex flex-col gap-1.5 mb-4 flex-shrink-0">
              {/* Category */}
              {stream.category && (
                <Link 
                  href={`/browse/${stream.category.slug}`}
                  className="text-xs sm:text-sm font-medium text-[#FAFF00] hover:opacity-80 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  {stream.category.name}
                </Link>
              )}
              
              {/* Title */}
              <Link href={`/stream/${stream.id}`}>
                <h3 className="text-lg sm:text-xl lg:text-2xl xl:text-3xl font-medium text-white mb-1 line-clamp-2 hover:opacity-80 transition-opacity">
                  {stream.title}
                </h3>
              </Link>
              
              {/* Creator and Timestamp */}
              <div className="flex items-center gap-2">
                <Link
                  href={`/profile/${stream.creatorAddress}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <Avatar className="h-6 w-6 sm:h-7 sm:w-7">
                    <AvatarImage src={stream.creator?.avatarUrl || ""} />
                    <AvatarFallback
                      seed={(stream.creatorAddress || "").toLowerCase()}
                    />
                  </Avatar>
                  <span className="text-xs sm:text-sm text-white font-medium flex items-center gap-1">
                    {stream.creator?.displayName || stream.creator?.username || creatorEnsName || formatAddress(stream.creatorAddress)}
                    {stream.creator?.verified && <BadgeCheck className="h-3.5 w-3.5 text-black fill-[#FAFF00]" />}
                  </span>
                </Link>
                {(stream.createdAt || stream.endedAt) && (
                  <span className="text-xs sm:text-sm text-gray-400">
                    {stream.endedAt
                      ? formatRelativeTime(stream.endedAt)
                      : stream.createdAt
                      ? formatRelativeTime(stream.createdAt)
                      : null}
                  </span>
                )}
              </div>
            </div>

            {/* Products Section - Hidden on mobile, replaces Chat */}
            {stream.products && stream.products.length > 0 && (
              <div className="hidden lg:block flex-1 flex flex-col min-h-0">
                <h3 className="font-medium mb-3 sm:mb-4 flex-shrink-0 text-sm sm:text-base">
                  Products
                </h3>
                <div className="space-y-3 overflow-y-auto min-h-0 scrollbar-hide">
                  {stream.products.map((url, index) => (
                    <RaribleProductCard key={index} url={url} />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

