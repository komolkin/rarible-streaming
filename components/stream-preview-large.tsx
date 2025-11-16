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
  const { authenticated, user } = usePrivy()
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [message, setMessage] = useState("")

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
    <div ref={containerRef} className="w-full h-[60vh] mb-6 flex gap-4">
      {/* Player Section */}
      <div className="flex-1 rounded-lg overflow-hidden bg-black relative">
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

      {/* Right Sidebar */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-4">
        {/* Stream Info Section */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3 sm:gap-4">
              <Link
                href={`/profile/${stream.creatorAddress}`}
                onClick={(e) => e.stopPropagation()}
                className="flex-shrink-0"
              >
                <Avatar className="h-10 w-10 sm:h-12 sm:w-12">
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
                  <h3 className="text-base sm:text-lg font-bold mb-1 line-clamp-2 hover:underline">
                    {stream.title}
                  </h3>
                </Link>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
                  <Link
                    href={`/profile/${stream.creatorAddress}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-foreground transition-colors"
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
          </CardContent>
        </Card>

        {/* Chat Section */}
        <Card className="flex-1 flex flex-col min-h-0">
          <CardContent className="p-4 flex flex-col flex-1 min-h-0">
            <h3 className="font-semibold mb-4 flex-shrink-0 text-sm sm:text-base">
              Chat
            </h3>
            <div
              id={`chat-messages-${stream.id}`}
              className="space-y-2 mb-4 flex-1 overflow-y-auto min-h-0"
            >
              {chatMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No messages yet. Be the first to chat!
                </p>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="text-sm">
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
            <div className="flex-shrink-0">
              <div className="flex gap-2">
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                  placeholder={
                    stream.endedAt ? "Stream has ended" : "Say something..."
                  }
                  disabled={!authenticated || !!stream.endedAt}
                  className="text-sm"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!authenticated || !!stream.endedAt || !message.trim()}
                  size="sm"
                  className="px-4"
                >
                  Send
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

