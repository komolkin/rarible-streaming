"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Player } from "@livepeer/react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { formatRelativeTime } from "@/lib/utils"

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
  }
}

export function StreamPreviewLarge({ stream }: StreamPreviewLargeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isInViewport, setIsInViewport] = useState<boolean>(false)

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
    <div ref={containerRef} className="w-full h-[80vh] mb-6 rounded-lg overflow-hidden bg-black relative">
      {stream.livepeerPlaybackId ? (
        <div className="w-full h-full relative">
          <Player
            playbackId={stream.livepeerPlaybackId}
            playRecording
            autoPlay={false}
            muted
            showTitle={false}
            showPipButton={false}
            objectFit="contain"
            priority={false}
            showUploadingIndicator={true}
          />
          
          {/* Overlay with stream info */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 sm:p-6">
            <div className="flex items-start gap-3 sm:gap-4">
              <Link
                href={`/profile/${stream.creatorAddress}`}
                onClick={(e) => e.stopPropagation()}
                className="flex-shrink-0"
              >
                <Avatar className="h-10 w-10 sm:h-12 sm:w-12 border-2 border-white/20">
                  <AvatarImage src={stream.creator?.avatarUrl || ""} />
                  <AvatarFallback
                    seed={(stream.creatorAddress || "").toLowerCase()}
                  />
                </Avatar>
              </Link>
              <div className="flex-1 min-w-0">
                {stream.category && (
                  <Link 
                    href={`/browse/${stream.category.slug}`}
                    className="text-xs sm:text-sm text-blue-400 mb-1 inline-block"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {stream.category.name}
                  </Link>
                )}
                <Link href={`/stream/${stream.id}`}>
                  <h3 className="text-lg sm:text-xl font-bold text-white mb-1 line-clamp-2 hover:underline">
                    {stream.title}
                  </h3>
                </Link>
                <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-white/80">
                  <Link
                    href={`/profile/${stream.creatorAddress}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-white transition-colors"
                  >
                    {stream.creator?.displayName || stream.creator?.username || `${stream.creatorAddress?.slice(0, 6)}...${stream.creatorAddress?.slice(-4)}`}
                  </Link>
                  {stream.isLive && (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                      {stream.viewerCount ?? 0} live
                    </span>
                  )}
                  {typeof stream.totalViews === 'number' && (
                    <span>{stream.totalViews} {stream.totalViews === 1 ? 'view' : 'views'}</span>
                  )}
                  {(stream.createdAt || stream.endedAt) && (
                    <span>
                      {stream.endedAt
                        ? formatRelativeTime(stream.endedAt)
                        : stream.createdAt
                        ? formatRelativeTime(stream.createdAt)
                        : null}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Live badge */}
          {stream.isLive && !stream.endedAt && (
            <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-xs sm:text-sm font-semibold flex items-center gap-2">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              LIVE
            </div>
          )}

          {/* Ended badge */}
          {stream.endedAt && (
            <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-1 rounded-full text-xs sm:text-sm font-semibold">
              Ended
            </div>
          )}
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white/60">
          <p>No playback available</p>
        </div>
      )}
    </div>
  )
}

