"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import Link from "next/link"
import { Player } from "@livepeer/react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { usePrivy } from "@privy-io/react-auth"
import { supabase } from "@/lib/supabase/client"
import { formatRelativeTime, formatAddress } from "@/lib/utils"
import { useEnsName } from "@/lib/hooks/use-ens"
import { BadgeCheck } from "lucide-react"

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
  }
}

export function StreamPreviewLarge({ stream }: StreamPreviewLargeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isInViewport, setIsInViewport] = useState<boolean>(false)
  const { authenticated, user } = usePrivy()
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [message, setMessage] = useState("")
  const creatorEnsName = useEnsName(stream.creatorAddress)

  const fetchChatMessages = useCallback(async () => {
    const response = await fetch(`/api/chat/${stream.id}`)
    if (response.ok) {
      const data = await response.json()
      setChatMessages(data)
    }
  }, [stream.id])

  const subscribeToChat = useCallback(() => {
    if (!stream.id) return () => {}

    const channel = supabase
      .channel(`chat:${stream.id}`, {
        config: {
          broadcast: { self: true },
        },
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `stream_id=eq.${stream.id}`,
        },
        (payload) => {
          if (payload.new) {
            const newMessage = {
              id: payload.new.id,
              streamId: payload.new.stream_id,
              senderAddress: payload.new.sender_address,
              message: payload.new.message,
              createdAt: payload.new.created_at,
            }
            setChatMessages((prev) => {
              const exists = prev.some((msg) => msg.id === newMessage.id)
              if (exists) {
                return prev
              }
              const updated = [...prev, newMessage]
              setTimeout(() => {
                const chatContainer = document.getElementById(`chat-messages-${stream.id}`)
                if (chatContainer) {
                  chatContainer.scrollTop = chatContainer.scrollHeight
                }
              }, 100)
              return updated
            })
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`Successfully subscribed to chat for stream ${stream.id}`)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [stream.id])

  useEffect(() => {
    fetchChatMessages()
    const unsubscribe = subscribeToChat()
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [fetchChatMessages, subscribeToChat])

  const sendMessage = async () => {
    if (!message.trim() || !authenticated) return

    if (stream.endedAt) {
      return
    }

    const walletAddress = user?.wallet?.address
    if (!walletAddress) return

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamId: stream.id,
          senderAddress: walletAddress,
          message: message.trim(),
        }),
      })

      if (response.ok) {
        setMessage("")
      }
    } catch (error) {
      console.error("Error sending message:", error)
    }
  }

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
        {/* Combined Title/Metadata and Chat Section */}
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

            {/* Chat Section - Hidden on mobile */}
            <div className="hidden lg:block flex-1 flex flex-col min-h-0">
            <h3 className="font-medium mb-3 sm:mb-4 flex-shrink-0 text-sm sm:text-base">
              Chat
            </h3>
            <div
              id={`chat-messages-${stream.id}`}
              className="space-y-2 mb-3 sm:mb-4 flex-1 overflow-y-auto min-h-0"
            >
              {chatMessages.length === 0 ? (
                <p className="text-xs sm:text-sm text-muted-foreground">
                  No messages.
                </p>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="text-xs sm:text-sm">
                    <span className="font-semibold">
                      {msg.senderAddress
                        ? `${msg.senderAddress.slice(0, 6)}...`
                        : "Unknown"}
                    </span>
                    <span className="ml-2">{msg.message}</span>
                  </div>
                ))
              )}
            </div>
            {!stream.endedAt && (
              <div className="flex-shrink-0">
                <div className="flex gap-2">
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                    placeholder="Say something..."
                    disabled={!authenticated}
                    className="text-xs sm:text-sm"
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!authenticated || !message.trim()}
                    size="sm"
                    className="px-3 sm:px-4 text-xs sm:text-sm"
                  >
                    Send
                  </Button>
                </div>
              </div>
            )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

