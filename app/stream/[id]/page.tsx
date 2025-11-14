"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams } from "next/navigation"
import { Player } from "@livepeer/react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { usePrivy } from "@privy-io/react-auth"
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import { supabase } from "@/lib/supabase/client"
import Link from "next/link"
import { HlsVideoPlayer, isHlsUrl } from "@/components/hls-video-player"
import { ShareModal } from "@/components/share-modal"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Heart, Share2, MoreVertical, Trash2 } from "lucide-react"

export default function StreamPage() {
  const params = useParams()
  const { authenticated, user } = usePrivy()
  const [stream, setStream] = useState<any>(null)
  const [creator, setCreator] = useState<any>(null)
  const [followerCount, setFollowerCount] = useState<number>(0)
  const [isFollowing, setIsFollowing] = useState<boolean>(false)
  const [likeCount, setLikeCount] = useState<number>(0)
  const [isLiked, setIsLiked] = useState<boolean>(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false)
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [message, setMessage] = useState("")
  const [mintAmount, setMintAmount] = useState("1")
  const [vodReady, setVodReady] = useState(false)
  const [checkingVod, setCheckingVod] = useState(false)
  const [hlsPlaybackUrl, setHlsPlaybackUrl] = useState<string | null>(null)
  const [mp4PlaybackUrl, setMp4PlaybackUrl] = useState<string | null>(null)
  const [hlsError, setHlsError] = useState(false)
  const [assetPlaybackId, setAssetPlaybackId] = useState<string | null>(null)
  const [assetReady, setAssetReady] = useState<boolean>(false)
  const [playerIsStreaming, setPlayerIsStreaming] = useState<boolean>(false)
  const playerOfflineTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const streamLiveStatusRef = useRef<boolean>(false)
  const [liveViewerCount, setLiveViewerCount] = useState<number | null>(null)
  const [viewerCountError, setViewerCountError] = useState<string | null>(null)
  const [hasRealtimeViewerData, setHasRealtimeViewerData] = useState<boolean>(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [playbackType, setPlaybackType] = useState<"live" | "vod" | null>(null)
  const [isCheckingPlaybackType, setIsCheckingPlaybackType] = useState<boolean>(false)
  
  // Extract playbackId from HLS URL
  const extractPlaybackIdFromHlsUrl = (url: string): string | null => {
    if (!url) return null
    // Match pattern: https://playback.livepeer.com/hls/{playbackId}/index.m3u8
    const match = url.match(/\/hls\/([^\/]+)\/index\.m3u8/)
    return match ? match[1] : null
  }

  // Verify that a playbackId is ready for VOD playback
  const verifyPlaybackIdReady = useCallback(async (playbackId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/streams/${params.id}/playback?playbackId=${playbackId}`)
      if (response.ok) {
        const data = await response.json()
        // Check if playbackInfo indicates VOD is ready
        const playbackInfo = data.playbackInfo || {}
        const isVod = playbackInfo.type === "vod" || data.type === "vod"
        const hasUrls = !!(data.hlsUrl || data.mp4Url || playbackInfo.hlsUrl || playbackInfo.playbackUrl)
        
        if (isVod && hasUrls) {
          console.log(`✅ PlaybackId ${playbackId} is ready for VOD playback (type: ${playbackInfo.type || data.type})`)
          return true
        } else if (hasUrls) {
          // Has URLs but type might not be set yet - still try it
          console.log(`⚠️ PlaybackId ${playbackId} has URLs but type is ${playbackInfo.type || data.type || 'unknown'}. Will attempt playback.`)
          return true
        } else {
          console.warn(`⚠️ PlaybackId ${playbackId} is not ready yet - no URLs available, type: ${playbackInfo.type || data.type || 'unknown'}`)
          return false
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.warn(`⚠️ PlaybackId ${playbackId} verification failed: ${response.status} - ${errorData.error || 'Unknown error'}`)
        return false
      }
    } catch (error: any) {
      console.error(`Error verifying playbackId ${playbackId}:`, error?.message || error)
      return false
    }
  }, [params.id])

  const fetchChatMessages = useCallback(async () => {
    const response = await fetch(`/api/chat/${params.id}`)
    if (response.ok) {
      const data = await response.json()
      setChatMessages(data)
    }
  }, [params.id])

  const fetchStream = useCallback(async () => {
    try {
      const response = await fetch(`/api/streams/${params.id}`)
      if (!response.ok) {
        console.error("Failed to fetch stream:", response.status)
        return
      }
      const data = await response.json()
      
      // Update stream live status ref for player offline detection
      streamLiveStatusRef.current = !!data.isLive
      
      setStream(data)
      
      // If stream has ended and API returned asset playbackId, use it immediately
      if (data.endedAt && data.assetPlaybackId && !assetPlaybackId) {
        console.log(`[Stream Fetch] ✅ Found asset playbackId from API: ${data.assetPlaybackId}`)
        setAssetPlaybackId(data.assetPlaybackId)
        setAssetReady(true)
        setVodReady(true)
        setPlaybackType("vod")
      }
      
      // Fetch creator profile if we have creator address
      if (data.creatorAddress) {
        try {
          const creatorResponse = await fetch(`/api/profiles?wallet=${data.creatorAddress}`)
          if (creatorResponse.ok) {
            const creatorData = await creatorResponse.json()
            setCreator(creatorData)
          } else {
            // If no profile exists, create a default one
            setCreator({
              walletAddress: data.creatorAddress,
              displayName: `${data.creatorAddress.slice(0, 6)}...${data.creatorAddress.slice(-4)}`,
              username: null,
              avatarUrl: null,
            })
          }
        } catch (error) {
          console.error("Error fetching creator profile:", error)
          // Set default creator info
          setCreator({
            walletAddress: data.creatorAddress,
            displayName: `${data.creatorAddress.slice(0, 6)}...${data.creatorAddress.slice(-4)}`,
            username: null,
            avatarUrl: null,
          })
        }
        
        // Fetch follower count for creator
        try {
          const followerResponse = await fetch(`/api/follows?address=${encodeURIComponent(data.creatorAddress.toLowerCase())}&type=followers`)
          if (followerResponse.ok) {
            const followerData = await followerResponse.json()
            setFollowerCount(followerData.count || 0)
          }
        } catch (error) {
          console.error("Error fetching follower count:", error)
        }
        
        // Check if current user is following the creator (only if authenticated and not own stream)
        if (authenticated && user?.wallet?.address && data.creatorAddress.toLowerCase() !== user.wallet.address.toLowerCase()) {
          try {
            const followStatusResponse = await fetch(
              `/api/follows?follower=${encodeURIComponent(user.wallet.address.toLowerCase())}&following=${encodeURIComponent(data.creatorAddress.toLowerCase())}`
            )
            if (followStatusResponse.ok) {
              const followStatusData = await followStatusResponse.json()
              setIsFollowing(followStatusData.isFollowing || false)
            }
          } catch (error) {
            console.error("Error checking follow status:", error)
          }
        }
      }
      
      // Fetch like count and check if user has liked
      try {
        const userAddress = user?.wallet?.address || null
        const likesUrl = `/api/streams/${params.id}/likes${userAddress ? `?userAddress=${userAddress}` : ""}`
        const likesResponse = await fetch(likesUrl)
        if (likesResponse.ok) {
          const likesData = await likesResponse.json()
          setLikeCount(likesData.likeCount || 0)
          setIsLiked(likesData.isLiked || false)
        }
      } catch (error) {
        console.error("Error fetching stream likes:", error)
      }
      
      // Log stream status for debugging
      if (data.livepeerPlaybackId) {
        console.log("Stream playback ID:", data.livepeerPlaybackId)
        console.log("Stream is live:", data.isLive)
      }
    } catch (error) {
      console.error("Error fetching stream:", error)
    }
  }, [params.id, authenticated, user?.wallet?.address])

  const fetchLiveViewerCount = useCallback(async () => {
    if (!stream?.livepeerPlaybackId || !stream) {
      console.log("[Viewer Count] No playbackId available yet")
      return
    }
    try {
      console.log(`[Viewer Count] Fetching from /api/streams/${params.id}/viewers for playbackId: ${stream.livepeerPlaybackId}`)
      const response = await fetch(`/api/streams/${params.id}/viewers`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error(`[Viewer Count] API error ${response.status}:`, errorData)
        throw new Error(errorData.error || `Viewer API error ${response.status}`)
      }
      const data = await response.json()
      console.log("[Viewer Count] API response:", data)
      if (typeof data.viewerCount === "number") {
        console.log(`[Viewer Count] Setting viewer count to ${data.viewerCount}`)
        setLiveViewerCount(data.viewerCount)
        setViewerCountError(null)
      } else {
        console.warn("[Viewer Count] No viewerCount in response:", data)
      }
    } catch (error: any) {
      console.error("[Viewer Count] Failed to fetch:", error?.message || error)
      setViewerCountError(error?.message || "Viewer count unavailable")
    }
  }, [params.id, stream?.livepeerPlaybackId])

  const subscribeToChat = useCallback(() => {
    if (!params.id) return () => {}

    const channel = supabase
      .channel(`chat:${params.id}`, {
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
          filter: `stream_id=eq.${params.id}`,
        },
        (payload) => {
          console.log("New chat message received:", payload)
          if (payload.new) {
            // Map database field names to schema field names
            const newMessage = {
              id: payload.new.id,
              streamId: payload.new.stream_id,
              senderAddress: payload.new.sender_address,
              message: payload.new.message,
              createdAt: payload.new.created_at,
            }
            setChatMessages((prev) => {
              // Check if message already exists to avoid duplicates
              const exists = prev.some((msg) => msg.id === newMessage.id)
              if (exists) {
                return prev
              }
              const updated = [...prev, newMessage]
              // Auto-scroll to bottom when new message arrives
              setTimeout(() => {
                const chatContainer = document.getElementById("chat-messages")
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
        console.log("Chat subscription status:", status)
        if (status === "SUBSCRIBED") {
          console.log("Successfully subscribed to chat messages")
        } else if (status === "CHANNEL_ERROR") {
          console.error("Chat subscription error")
        }
      })

    return () => {
      console.log("Unsubscribing from chat channel")
      supabase.removeChannel(channel)
    }
  }, [params.id])

  // Fetch playback URLs (HLS and/or MP4) from Livepeer for ended streams
  const fetchHlsPlaybackUrl = useCallback(async (playbackId: string) => {
    try {
      console.log("Fetching playback URLs for playbackId:", playbackId)
      // Fetch playback info from Livepeer API to get the actual playback URLs
      const response = await fetch(`/api/streams/${params.id}/playback?playbackId=${playbackId}`)
      if (response.ok) {
        const data = await response.json()
        console.log("Playback API response:", data)
        let foundUrl = false
        
        if (data.hlsUrl) {
          console.log("Found HLS playback URL:", data.hlsUrl)
          setHlsPlaybackUrl(data.hlsUrl)
          foundUrl = true
        }
        
        if (data.mp4Url) {
          console.log("Found MP4 playback URL:", data.mp4Url)
          setMp4PlaybackUrl(data.mp4Url)
          foundUrl = true
        }
        
        if (foundUrl) {
          setVodReady(true)
          return true
        } else {
          console.warn("No HLS or MP4 URL in playback API response")
        }
      } else {
        const errorText = await response.text()
        console.error("Playback API error:", response.status, errorText)
      }
    } catch (error) {
      console.error("Error fetching playback URLs:", error)
    }
    return false
  }, [params.id])

  // Check playback type to determine if VOD is ready
  // The Player shows "offline" if playback type is still "live" after stream ends
  const checkPlaybackType = useCallback(async (playbackId: string) => {
    if (!playbackId) return

    setIsCheckingPlaybackType(true)
    try {
      const response = await fetch(`/api/streams/${params.id}/playback?playbackId=${playbackId}`)
      if (response.ok) {
        const data = await response.json()
        const type = data.type || data.playbackInfo?.type
        const actualPlaybackId = data.playbackId || playbackId // Use asset playbackId if returned
        
        console.log(`[Playback Type] PlaybackId ${playbackId} type: ${type}, actualPlaybackId: ${actualPlaybackId}`)
        setPlaybackType(type === "vod" ? "vod" : type === "live" ? "live" : null)
        
        // If playback API returned an asset playbackId (different from original), use it
        if (actualPlaybackId && actualPlaybackId !== playbackId && !assetPlaybackId) {
          console.log(`[Playback Type] ✅ Found asset playbackId from playback API: ${actualPlaybackId}`)
          setAssetPlaybackId(actualPlaybackId)
          setAssetReady(true)
        }
        
        // If it's VOD, mark as ready
        if (type === "vod") {
          setVodReady(true)
        }
      } else if (response.status === 202) {
        // Asset is processing (202 Accepted)
        console.log(`[Playback Type] ⚠️ Asset is still processing (202 Accepted)`)
        // Don't set playbackType yet - will retry
      }
    } catch (error) {
      console.error("[Playback Type] Error checking playback type:", error)
    } finally {
      setIsCheckingPlaybackType(false)
    }
  }, [params.id, assetPlaybackId])

  // Fetch recording from Livepeer by stream ID when stream ends
  // According to Livepeer docs: When a stream ends with recording enabled,
  // Livepeer creates an Asset that can be queried by sourceStreamId
  // The Asset has its own playbackId which is optimal for VOD playback
  const fetchStreamRecording = useCallback(async () => {
    if (!stream?.endedAt || !stream?.livepeerStreamId) return
    // Don't return early if vodReady - we still want to fetch asset playbackId for better VOD support

    setCheckingVod(true)
    try {
      console.log(`[VOD] Fetching recording for stream ${stream.livepeerStreamId}...`)
      const response = await fetch(`/api/streams/${params.id}/recording`)

      if (response.ok) {
        const data = await response.json()

        if (data.success && data.recording) {
          const recording = data.recording
          console.log(`[VOD] ✅ Recording found via ${data.source}:`, {
            playbackId: recording.playbackId,
            status: recording.status,
            duration: recording.duration,
            playbackUrl: recording.playbackUrl,
          })

          // Use the recording's playbackId for VOD playback
          // This is the asset's playbackId, which is optimal for VOD
          if (recording.playbackId) {
            console.log(`[VOD] Setting asset playbackId: ${recording.playbackId}`)
            setAssetPlaybackId(recording.playbackId)
            setAssetReady(true)
            setVodReady(true)
            setPlaybackType("vod") // Asset playbackId is always VOD

            // Also update stream with recording info if available
            if (recording.playbackUrl && !stream.vodUrl) {
              setHlsPlaybackUrl(recording.playbackUrl)
            }
          }
        } else if (response.status === 202) {
          // Asset is processing (202 Accepted)
          console.log(`[VOD] ⚠️ Recording is still processing: ${data.message || data.status}`)
          // Will retry on next poll
        } else {
          console.warn(`[VOD] ⚠️ No recording available yet: ${data.message || "Unknown error"}`)
        }
      } else if (response.status === 404) {
        // Recording not found yet - this is normal, Livepeer needs time to process
        console.log(`[VOD] ⚠️ Recording not available yet, will retry...`)
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error(`[VOD] Error fetching recording: ${response.status}`, errorData)
      }
    } catch (error) {
      console.error("[VOD] Error fetching recording:", error)
    } finally {
      setCheckingVod(false)
    }
  }, [stream?.endedAt, stream?.livepeerStreamId, stream?.vodUrl, params.id])

  // Check if VOD is ready for ended streams
  // According to Livepeer docs: Player automatically handles VOD with stream playbackId
  // But we prefer to use the asset's playbackId if available (more reliable for VOD)
  const checkVodAvailability = useCallback(async () => {
    if (!stream?.endedAt || vodReady || !stream) return

    // If we already have a playbackId, we can use it immediately
    // The Player component handles VOD playback automatically
    if (stream.livepeerPlaybackId && !assetPlaybackId) {
      console.log("✅ Stream ended - using playbackId for VOD playback:", stream.livepeerPlaybackId)
      setVodReady(true)
      // Also try to fetch the asset recording for better VOD support
      fetchStreamRecording()
      return
    }

    // If we don't have playbackId yet, fetch updated stream data first
    if (!stream.livepeerPlaybackId) {
      setCheckingVod(true)
      try {
        const response = await fetch(`/api/streams/${params.id}`)
        if (response.ok) {
          const updatedStream = await response.json()
          setStream(updatedStream)

          // If we now have playbackId, mark as ready and fetch recording
          if (updatedStream.livepeerPlaybackId) {
            console.log("✅ Got playbackId after fetch - ready for VOD:", updatedStream.livepeerPlaybackId)
            setVodReady(true)
            // Fetch the recording asset for optimal VOD playback
            if (updatedStream.livepeerStreamId) {
              fetchStreamRecording()
            }
          }
        }
      } catch (error) {
        console.error("Error checking VOD availability:", error)
      } finally {
        setCheckingVod(false)
      }
    } else {
      // We have playbackId but no asset yet - fetch recording asset
      fetchStreamRecording()
    }
  }, [stream?.endedAt, stream?.livepeerPlaybackId, stream?.livepeerStreamId, vodReady, assetPlaybackId, params.id, fetchStreamRecording])

  useEffect(() => {
    // Reset player streaming override whenever playbackId changes
    if (playerOfflineTimeoutRef.current) {
      clearTimeout(playerOfflineTimeoutRef.current)
      playerOfflineTimeoutRef.current = null
    }
    setPlayerIsStreaming(false)
  }, [stream?.livepeerPlaybackId])

  useEffect(() => {
    // Reset realtime viewer data flag when stream goes offline
    if (stream && !stream.isLive) {
      setHasRealtimeViewerData(false)
    }
  }, [stream])

  useEffect(() => {
    if (!stream?.livepeerPlaybackId) {
      setLiveViewerCount(null)
      return
    }

    const shouldPoll =
      !hasRealtimeViewerData &&
      (stream?.isLive || playerIsStreaming || (!stream?.endedAt && stream?.livepeerStreamId))

    if (!shouldPoll) {
      return
    }

    fetchLiveViewerCount()
    const interval = setInterval(fetchLiveViewerCount, 5000)
    return () => clearInterval(interval)
  }, [
    stream?.livepeerPlaybackId,
    stream?.isLive,
    stream?.endedAt,
    stream?.livepeerStreamId,
    playerIsStreaming,
    hasRealtimeViewerData,
    fetchLiveViewerCount,
  ])

  const handlePlaybackStatusUpdate = useCallback((status: any) => {
    // Extract viewer count from Livepeer's player status
    const viewerCount =
      typeof status?.viewerCount === "number"
        ? status.viewerCount
        : typeof status?.metrics?.viewCount === "number"
          ? status.metrics.viewCount
          : undefined

    if (typeof viewerCount === "number") {
      console.log(`[Viewer Count] Player reports ${viewerCount} viewers`)
      setLiveViewerCount(viewerCount)
      setViewerCountError(null)
      setHasRealtimeViewerData(true)
    }
  }, [])
  
  const handleStreamStatusChange = useCallback((isLive: boolean) => {
    if (playerOfflineTimeoutRef.current) {
      clearTimeout(playerOfflineTimeoutRef.current)
      playerOfflineTimeoutRef.current = null
    }
    if (isLive) {
      setPlayerIsStreaming(true)
    } else {
      playerOfflineTimeoutRef.current = setTimeout(() => {
        if (!streamLiveStatusRef.current) {
          setPlayerIsStreaming(false)
        }
      }, 10000)
    }
  }, [])

  useEffect(() => {
    try {
      fetchStream()
      fetchChatMessages()
    } catch (error: any) {
      console.error("Error during initial fetch:", error)
      setPageError(error?.message || "Failed to load stream")
    }
    
    // Set up real-time subscription for chat
    const cleanup = subscribeToChat()
    
    // Poll for stream status updates every 10 seconds (reduced from 5s to minimize re-renders)
    const interval = setInterval(() => {
      fetchStream().catch((error) => {
        console.error("Error during poll:", error)
      })
    }, 10000)
    
    return () => {
      cleanup()
      clearInterval(interval)
    }
  }, [params.id, fetchStream, fetchChatMessages, subscribeToChat])
  
  // Separate effect for VOD checking to avoid circular dependencies
  // When stream ends, IMMEDIATELY fetch recording from Livepeer by stream ID
  useEffect(() => {
    if (stream?.endedAt) {
      // CRITICAL: Always try to fetch asset playbackId for ended streams
      // Asset playbackId is guaranteed to be VOD-ready, while stream playbackId might still be "live" type
      if (stream.livepeerStreamId) {
        console.log("📹 Stream ended - fetching recording asset for VOD playback...")
        // Fetch immediately
        fetchStreamRecording()
        
        // Poll for recording asset every 10 seconds until found
        const vodCheckInterval = setInterval(() => {
          if (!assetPlaybackId) {
            console.log("📹 Polling for recording asset...")
            fetchStreamRecording()
          } else {
            console.log("📹 Asset playbackId found, stopping poll")
            clearInterval(vodCheckInterval)
          }
        }, 10000)
        
        return () => clearInterval(vodCheckInterval)
      }
      
      // Also check playback type for stream playbackId as fallback
      // This helps detect when Livepeer converts stream playbackId to VOD
      if (stream.livepeerPlaybackId && playbackType !== "vod" && !assetPlaybackId) {
        console.log("📹 Checking playback type for stream playbackId...")
        checkPlaybackType(stream.livepeerPlaybackId)
        
        const typeCheckInterval = setInterval(() => {
          if (!assetPlaybackId && playbackType !== "vod") {
            checkPlaybackType(stream.livepeerPlaybackId)
          } else {
            clearInterval(typeCheckInterval)
          }
        }, 10000)
        return () => clearInterval(typeCheckInterval)
      }
    }
  }, [stream?.endedAt, stream?.livepeerPlaybackId, stream?.livepeerStreamId, playbackType, assetPlaybackId, fetchStreamRecording, checkPlaybackType])

  // Debug: log stream data when it changes
  useEffect(() => {
    if (stream) {
      console.log("Stream data:", {
        id: stream.id,
        livepeerStreamId: stream.livepeerStreamId,
        livepeerPlaybackId: stream.livepeerPlaybackId,
        livepeerStreamKey: stream.livepeerStreamKey,
        isLive: stream.isLive,
        hasPlaybackId: !!stream.livepeerPlaybackId,
        vodUrl: stream.vodUrl,
        endedAt: stream.endedAt,
        title: stream.title
      })
      
      // For ended streams: According to Livepeer docs, Player handles VOD automatically
      // with the stream playbackId - no need for complex logic here
      if (stream.endedAt && stream.livepeerPlaybackId) {
        console.log("✅ Stream ended - Player will handle VOD playback with playbackId:", stream.livepeerPlaybackId)
      }
      
      if (stream.livepeerStreamId && !stream.livepeerPlaybackId) {
        console.warn("Stream missing playbackId, will be fetched on next poll")
      }
    }
  }, [stream])

  const handleFollow = async () => {
    if (!authenticated || !user?.wallet?.address || !stream?.creatorAddress) return

    try {
      const response = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followerAddress: user.wallet.address.toLowerCase(),
          followingAddress: stream.creatorAddress.toLowerCase(),
        }),
      })

      if (response.ok) {
        setIsFollowing(true)
        setFollowerCount((prev) => prev + 1)
      }
    } catch (error) {
      console.error("Error following user:", error)
    }
  }

  const handleUnfollow = async () => {
    if (!authenticated || !user?.wallet?.address || !stream?.creatorAddress) return

    try {
      const response = await fetch(
        `/api/follows?follower=${encodeURIComponent(user.wallet.address.toLowerCase())}&following=${encodeURIComponent(stream.creatorAddress.toLowerCase())}`,
        { method: "DELETE" }
      )

      if (response.ok) {
        setIsFollowing(false)
        setFollowerCount((prev) => Math.max(0, prev - 1))
      }
    } catch (error) {
      console.error("Error unfollowing user:", error)
    }
  }

  const handleLike = async () => {
    if (!authenticated || !user?.wallet?.address) {
      alert("Please connect your wallet to like streams")
      return
    }

    try {
      if (isLiked) {
        // Unlike
        const response = await fetch(`/api/streams/${params.id}/likes?userAddress=${encodeURIComponent(user.wallet.address)}`, {
          method: "DELETE",
        })
        if (response.ok) {
          const data = await response.json()
          setLikeCount(data.likeCount || 0)
          setIsLiked(false)
        } else {
          const errorData = await response.json().catch(() => ({}))
          console.error("Failed to unlike:", errorData)
          alert(errorData.error || "Failed to unlike stream")
        }
      } else {
        // Like
        const response = await fetch(`/api/streams/${params.id}/likes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userAddress: user.wallet.address,
          }),
        })
        if (response.ok) {
          const data = await response.json()
          setLikeCount(data.likeCount || 0)
          setIsLiked(true)
        } else {
          const errorData = await response.json().catch(() => ({}))
          console.error("Failed to like:", errorData)
          alert(errorData.error || "Failed to like stream")
        }
      }
    } catch (error: any) {
      console.error("Error toggling like:", error)
      alert(error?.message || "An error occurred while toggling like")
    }
  }

  const sendMessage = async () => {
    if (!message.trim() || !authenticated) return
    
    // Prevent sending messages if stream has ended
    if (stream?.endedAt) {
      return
    }

    const walletAddress = user?.wallet?.address
    if (!walletAddress) return

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamId: params.id,
          senderAddress: walletAddress,
          message: message.trim(),
        }),
      })

      if (response.ok) {
        setMessage("")
        // Message will appear via real-time subscription, no need to manually add it
      } else {
        console.error("Failed to send message")
      }
    } catch (error) {
      console.error("Error sending message:", error)
    }
  }

  const { writeContract, data: hash } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash,
  })

  const handleMint = async () => {
    if (!stream?.mintContractAddress) return

    writeContract({
      address: stream.mintContractAddress as `0x${string}`,
      abi: [
        {
          inputs: [
            { name: "to", type: "address" },
            { name: "tokenURI", type: "string" },
          ],
          name: "mint",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function",
        },
      ],
      functionName: "mint",
      args: [user?.wallet?.address as `0x${string}`, stream.mintMetadataUri || ""],
    })
  }

  const handleEndStream = async () => {
    if (!authenticated || !user?.wallet?.address) {
      alert("Please connect your wallet")
      return
    }

    if (user.wallet.address.toLowerCase() !== stream?.creatorAddress?.toLowerCase()) {
      alert("Only the stream creator can end the stream")
      return
    }

    if (!confirm("Are you sure you want to end this stream? Make sure OBS has stopped streaming.")) {
      return
    }

    try {
      const response = await fetch(`/api/streams/${params.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to end stream")
      }

      const updatedStream = await response.json()
      setStream(updatedStream)
      if (updatedStream.livepeerPlaybackId) {
        setAssetPlaybackId(updatedStream.livepeerPlaybackId)
        setAssetReady(true)
      }
      setVodReady(Boolean(updatedStream.vodUrl))
      
      // Refresh stream data after a short delay to ensure VOD is available
      // The stream page will automatically show the VOD player when endedAt is set
      setTimeout(() => {
        fetchStream()
        checkVodAvailability()
      }, 3000)
    } catch (error: any) {
      console.error("Error ending stream:", error)
      alert(error?.message || "Failed to end stream")
    }
  }

  const handleDeleteStream = async () => {
    if (!authenticated || !user?.wallet?.address) {
      alert("Please connect your wallet")
      return
    }

    if (user.wallet.address.toLowerCase() !== stream?.creatorAddress?.toLowerCase()) {
      alert("Only the stream creator can delete the stream")
      return
    }

    if (!confirm("Are you sure you want to permanently delete this stream? This action cannot be undone. All chat messages and likes will also be deleted.")) {
      return
    }

    try {
      const response = await fetch(`/api/streams/${params.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ permanent: true }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to delete stream")
      }

      // Redirect to home page after successful deletion
      window.location.href = "/"
    } catch (error: any) {
      console.error("Error deleting stream:", error)
      alert(error?.message || "Failed to delete stream")
    }
  }

  // Show live player if we have a playbackId and stream hasn't ended
  // Use useMemo to prevent unnecessary recalculations (must be before early returns)
  const showLivePlayer = useMemo(() => !!stream?.livepeerPlaybackId && !stream?.endedAt, [stream?.livepeerPlaybackId, stream?.endedAt])
  const showOfflineOverlay = useMemo(() => showLivePlayer && !stream?.isLive && !playerIsStreaming, [showLivePlayer, stream?.isLive, playerIsStreaming])
  const effectiveViewerCount = liveViewerCount ?? stream?.viewerCount ?? 0

  if (pageError) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-red-500 mb-2">Error Loading Stream</h2>
          <p className="text-muted-foreground mb-4">{pageError}</p>
          <Button onClick={() => window.location.reload()}>Reload Page</Button>
        </div>
      </div>
    )
  }

  if (!stream) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div>Loading stream data...</div>
      </div>
    )
  }

  return (
    <main className="min-h-screen pt-24 pb-8">
      <div className="w-full grid grid-cols-12 gap-4 px-4 lg:px-8 h-[calc(100vh-8rem)]">
        {/* Video Player - Full Width */}
        <div className="col-span-12 lg:col-span-9">
          <Card>
            <CardContent className="p-0">
              <div className="w-full aspect-video bg-black relative">
                {stream.livepeerPlaybackId ? (
                  <>
                    <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs z-20">
                      {stream.isLive ? (
                        <>
                          Playback ID: {stream.livepeerPlaybackId}
                          <span className="ml-2 text-green-400">● LIVE</span>
                        </>
                      ) : stream.endedAt ? (
                        <>
                          Recording • Playback ID: {stream.livepeerPlaybackId}
                        </>
                      ) : (
                        <>Playback ID: {stream.livepeerPlaybackId}</>
                      )}
                    </div>
                    {stream.endedAt ? (
                      // STREAM ENDED - Show recording playback
                      // CRITICAL: For ended streams, prefer asset playbackId (always VOD-ready)
                      // Only use stream playbackId if asset playbackId is not available yet
                      // The Player will show "offline" if stream playbackId is still marked as "live" type
                      (assetPlaybackId || stream.livepeerPlaybackId) ? (
                        <>
                          {/* Show Player with asset playbackId (preferred) or stream playbackId (fallback) */}
                          <Player
                            key={`vod-${assetPlaybackId || stream.livepeerPlaybackId}`}
                            playbackId={assetPlaybackId || stream.livepeerPlaybackId!}
                            autoPlay={false}
                            muted={false}
                            showTitle={false}
                            showPipButton={true}
                            showUploadingIndicator={false}
                            objectFit="contain"
                            lowLatency={false}
                            theme={{
                              borderStyles: {
                                containerBorderStyle: "solid",
                              },
                              colors: {
                                accent: "#00a55f",
                              },
                            }}
                            onError={(error) => {
                              console.error("Livepeer Player error for VOD:", error)
                              console.error("PlaybackId used:", assetPlaybackId || stream.livepeerPlaybackId)
                              console.error("Has asset playbackId:", !!assetPlaybackId)
                              // If player errors and we don't have asset playbackId, try fetching it
                              if (!assetPlaybackId && stream.livepeerStreamId) {
                                console.log("Player error - attempting to fetch asset playbackId...")
                                fetchStreamRecording()
                              }
                            }}
                          />
                          {/* Show message if we're still using stream playbackId (might show offline) */}
                          {!assetPlaybackId && stream.livepeerPlaybackId && (
                            <div className="absolute bottom-4 left-4 bg-black/70 text-white px-3 py-2 rounded text-xs z-20">
                              <div className="flex items-center gap-2">
                                <div className="inline-block animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                                <span>Fetching recording playback...</span>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        // Show loading state while waiting for playbackId
                        <div className="absolute inset-0 flex items-center justify-center text-white bg-black">
                          <div className="text-center max-w-md px-6">
                            <div className="mb-4">
                              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent"></div>
                            </div>
                            <p className="text-xl font-semibold mb-2">Processing Recording</p>
                            <p className="text-sm text-muted-foreground mb-1">
                              The recording is being processed by Livepeer...
                            </p>
                            <p className="text-xs text-muted-foreground">
                              This usually takes 1-2 minutes. The video will appear automatically when ready.
                            </p>
                            {(checkingVod || isCheckingPlaybackType) && (
                              <p className="text-xs text-blue-400 mt-3">
                                Checking for recording...
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    ) : showLivePlayer ? (
                      // LIVE STREAM - Show live player
                      <>
                        <Player
                          key={`live-${stream.livepeerPlaybackId}`}
                          playbackId={stream.livepeerPlaybackId}
                          autoPlay
                          muted
                          showTitle={false}
                          showPipButton={false}
                          objectFit="contain"
                          priority
                          showUploadingIndicator={false}
                          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                          onStreamStatusChange={handleStreamStatusChange}
                        />
                        {showOfflineOverlay && (
                          <div className="absolute top-4 right-4 bg-yellow-500 text-black px-3 py-1 rounded text-sm font-semibold z-10 max-w-xs">
                            <div className="font-bold mb-1">⚠️ Stream Offline</div>
                            {stream.livepeerStreamKey ? (
                              <>
                                <div className="text-xs mt-1">
                                  <div className="font-semibold">OBS Settings:</div>
                                  <div className="bg-black/20 p-1 rounded mt-1 font-mono text-[10px]">
                                    <div>Server: rtmp://ingest.livepeer.studio/live</div>
                                    <div>Stream Key: {stream.livepeerStreamKey}</div>
                                  </div>
                                </div>
                                <div className="text-xs mt-2 opacity-90">
                                  <div>1. Go to OBS → Settings → Stream</div>
                                  <div>2. Set Service to &quot;Custom&quot;</div>
                                  <div>3. Paste Server and Stream Key above</div>
                                  <div>4. Click &quot;Start Streaming&quot;</div>
                                </div>
                              </>
                            ) : (
                              <div className="text-xs mt-1">
                                Stream ID: {stream.livepeerStreamId}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : hlsPlaybackUrl ? (
                        <>
                          {/* Fallback to HLS player if we have HLS URL but no asset playbackId */}
                          <HlsVideoPlayer
                            key={`hls-playback-${hlsPlaybackUrl}`}
                            src={hlsPlaybackUrl}
                            autoPlay={false}
                            onError={(error) => {
                              console.error("HLS Video player error:", error)
                              console.error("HLS URL:", hlsPlaybackUrl)
                            }}
                          />
                        </>
                      ) : mp4PlaybackUrl ? (
                        <>
                          {/* Fallback to MP4 player if we have MP4 URL but no HLS URL */}
                          <video 
                            key={`mp4-playback-${mp4PlaybackUrl}`}
                            className="w-full h-full object-contain"
                            controls
                            autoPlay={false}
                            src={mp4PlaybackUrl}
                            onError={(e) => {
                              console.error("MP4 Video player error:", e)
                              console.error("MP4 URL:", mp4PlaybackUrl)
                            }}
                          >
                            Your browser does not support the video tag.
                          </video>
                        </>
                      ) : stream.vodUrl ? (
                        // If vodUrl is HLS, try to use Livepeer Player with extracted playbackId or stream playbackId
                        isHlsUrl(stream.vodUrl) && (assetPlaybackId || extractPlaybackIdFromHlsUrl(stream.vodUrl) || stream.livepeerPlaybackId) && assetReady ? (
                          <Player
                            key={`vod-from-url-${assetPlaybackId || extractPlaybackIdFromHlsUrl(stream.vodUrl) || stream.livepeerPlaybackId}`}
                            playbackId={assetPlaybackId || extractPlaybackIdFromHlsUrl(stream.vodUrl) || stream.livepeerPlaybackId!}
                            autoPlay={false}
                            muted={false}
                            showTitle={false}
                            showPipButton={true}
                            showUploadingIndicator={false}
                            objectFit="contain"
                            lowLatency={false}
                            theme={{
                              borderStyles: {
                                containerBorderStyle: "solid",
                              },
                              colors: {
                                accent: "#00a55f",
                              },
                            }}
                            onError={(error) => {
                              console.error("Livepeer Player error with asset playbackId from vodUrl:", error)
                              console.error("Asset playbackId:", assetPlaybackId || extractPlaybackIdFromHlsUrl(stream.vodUrl))
                              console.error("Stream vodUrl:", stream.vodUrl)
                              // If player errors, mark as not ready and fall back to HLS player
                              setAssetReady(false)
                            }}
                          />
                        ) : isHlsUrl(stream.vodUrl) ? (
                          <HlsVideoPlayer
                            key={`hls-vod-${stream.vodUrl}`}
                            src={stream.vodUrl}
                            autoPlay={false}
                            onError={(error) => {
                              console.error("HLS Video player error:", error)
                            }}
                          />
                        ) : (
                          // Fallback: Use HTML5 video player for direct video URLs (mp4, webm, etc.)
                          <video 
                            key={`vod-${stream.vodUrl}`}
                            className="w-full h-full object-contain"
                            controls
                            autoPlay={false}
                            src={stream.vodUrl}
                            onError={(e) => {
                              console.error("Video player error:", e)
                            }}
                          >
                            Your browser does not support the video tag.
                          </video>
                        )
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-white">
                          <div className="text-center">
                            <p className="text-lg mb-2">Stream offline</p>
                            {stream.livepeerStreamKey ? (
                              <>
                                <p className="text-sm text-muted-foreground mb-3">
                                  Make sure OBS is connected with the settings below:
                                </p>
                                <div className="text-xs text-left space-y-2 font-mono bg-black/40 p-3 rounded">
                                  <div>Server: rtmp://ingest.livepeer.studio/live</div>
                                  <div>Stream Key: {stream.livepeerStreamKey}</div>
                                </div>
                              </>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Waiting for the creator to start streaming...
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    }
                  </>
                ) : stream.endedAt && stream.vodUrl ? (
                  // Handle ended streams without playbackId but with vodUrl
                  // If vodUrl is HLS and we can extract asset playbackId, use Livepeer Player (preferred for VOD)
                  // CRITICAL: Only use Livepeer Player if asset is verified ready to prevent format errors
                  isHlsUrl(stream.vodUrl) && (assetPlaybackId || extractPlaybackIdFromHlsUrl(stream.vodUrl)) && assetReady ? (
                    <Player
                      key={`vod-asset-no-playback-${assetPlaybackId || extractPlaybackIdFromHlsUrl(stream.vodUrl)}`}
                      playbackId={assetPlaybackId || extractPlaybackIdFromHlsUrl(stream.vodUrl)!}
                      autoPlay={false}
                      muted={false}
                      showTitle={false}
                      showPipButton={true}
                      showUploadingIndicator={false}
                      objectFit="contain"
                      lowLatency={false}
                      theme={{
                        borderStyles: {
                          containerBorderStyle: "solid",
                        },
                        colors: {
                          accent: "#00a55f",
                        },
                      }}
                      onError={(error) => {
                        console.error("Livepeer Player error with asset playbackId from vodUrl:", error)
                        console.error("Asset playbackId:", assetPlaybackId || extractPlaybackIdFromHlsUrl(stream.vodUrl))
                        console.error("Stream vodUrl:", stream.vodUrl)
                        // If player errors, mark as not ready and fall back to HLS player
                        setAssetReady(false)
                      }}
                    />
                  ) : isHlsUrl(stream.vodUrl) ? (
                    <HlsVideoPlayer
                      key={`hls-vod-no-playback-${stream.vodUrl}`}
                      src={stream.vodUrl}
                      autoPlay={false}
                      onError={(error) => {
                        console.error("HLS Video player error:", error)
                      }}
                    />
                  ) : (
                    <video 
                      key={`vod-no-playback-${stream.vodUrl}`}
                      className="w-full h-full object-contain"
                      controls
                      autoPlay={false}
                      src={stream.vodUrl}
                      onError={(e) => {
                        console.error("Video player error:", e)
                      }}
                    >
                      Your browser does not support the video tag.
                    </video>
                  )
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white">
                    <div className="text-center">
                      <p className="text-lg mb-2">No playback ID available</p>
                      <p className="text-sm text-muted-foreground">Stream ID: {stream.livepeerStreamId || "N/A"}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        The playback ID will be fetched automatically. Refresh in a few seconds.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {stream.category && (
                      <div className="text-sm text-blue-400 mb-2">
                        {stream.category.name}
                      </div>
                    )}
                    <h1 className="text-2xl font-bold mb-3">{stream.title}</h1>
                    {creator && (
                      <div className="flex items-center gap-3 mb-3">
                        <Link 
                          href={`/profile/${creator.walletAddress}`}
                          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                        >
                          {/* Only show avatar from database - use consistent seed for fallback */}
                          <Avatar>
                            {creator.avatarUrl ? (
                              <AvatarImage src={creator.avatarUrl} alt={creator.displayName || creator.username || "Creator"} />
                            ) : null}
                            <AvatarFallback seed={(creator.walletAddress || "").toLowerCase()} />
                          </Avatar>
                          <div>
                            <div className="font-semibold text-sm flex items-center gap-2">
                              {creator.displayName || creator.username || `${creator.walletAddress.slice(0, 6)}...${creator.walletAddress.slice(-4)}`}
                              {authenticated && 
                               user?.wallet?.address?.toLowerCase() !== stream.creatorAddress?.toLowerCase() && (
                                <Button
                                  variant={isFollowing ? "outline" : "default"}
                                  size="sm"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    isFollowing ? handleUnfollow() : handleFollow()
                                  }}
                                  className="h-6 px-2 text-xs"
                                >
                                  {isFollowing ? "Unfollow" : "Follow"}
                                </Button>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
                            </div>
                          </div>
                        </Link>
                      </div>
                    )}
                    <p className="text-muted-foreground">{stream.description}</p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {stream.isLive ? (
                        <span className="inline-block px-2 py-1 bg-red-500 text-white rounded text-sm">
                          Live
                        </span>
                      ) : stream.endedAt ? (
                        <span className="inline-block px-2 py-1 bg-muted text-muted-foreground rounded text-sm">
                          Ended {new Date(stream.endedAt).toLocaleDateString()}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-3 ml-4">
                    {/* Viewers counter */}
                    <div className="flex items-center gap-3 px-3 py-2 bg-muted rounded-md">
                      <div className="flex flex-col">
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Live viewers</span>
                        <span className="text-lg font-semibold">{effectiveViewerCount}</span>
                      </div>
                      {viewerCountError && (
                        <span className="text-[11px] text-destructive">{viewerCountError}</span>
                      )}
                    </div>
                    <div className="flex flex-row gap-2">
                    <Button
                      variant={isLiked ? "default" : "outline"}
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleLike()
                      }}
                      className="flex items-center gap-2"
                    >
                      <Heart className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`} />
                      <span>{likeCount}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setIsShareModalOpen(true)
                      }}
                      className="flex items-center gap-2"
                    >
                      <Share2 className="h-4 w-4" />
                      <span>Share</span>
                    </Button>
                    {authenticated && 
                     user?.wallet?.address?.toLowerCase() === stream.creatorAddress?.toLowerCase() && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                            }}
                            className="flex items-center gap-2"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {stream.isLive && !stream.endedAt && (
                            <>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  handleEndStream()
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                End Stream
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleDeleteStream()
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Stream
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar - Chat */}
        <div className="col-span-3 flex flex-col gap-4 h-full">
          {/* NFT Minting Section */}
          {stream.hasMinting && stream.mintContractAddress && (
            <Card className="flex-shrink-0">
              <CardContent className="p-4">
                <h3 className="font-semibold mb-4">Mint NFT</h3>
                <div className="space-y-3">
                  {stream.mintMaxSupply && (
                    <div className="text-sm text-muted-foreground">
                      {stream.mintCurrentSupply || 0} / {stream.mintMaxSupply} minted
                    </div>
                  )}
                  {stream.mintPerWalletLimit && (
                    <div className="text-xs text-muted-foreground">
                      Limit: {stream.mintPerWalletLimit} per wallet
                    </div>
                  )}
                  <Button
                    onClick={handleMint}
                    disabled={!authenticated || isConfirming || !!stream.endedAt}
                    className="w-full"
                  >
                    {isConfirming ? "Minting..." : "Mint NFT"}
                  </Button>
                  {hash && (
                    <div className="text-xs text-muted-foreground break-all">
                      TX: {hash.slice(0, 10)}...{hash.slice(-8)}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="flex-1 flex flex-col min-h-0">
            <CardContent className="p-4 flex flex-col flex-1 min-h-0">
              <h3 className="font-semibold mb-4 flex-shrink-0">Chat</h3>
              <div 
                id="chat-messages" 
                className="space-y-2 mb-4 flex-1 overflow-y-auto min-h-0"
              >
                {chatMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No messages yet. Be the first to chat!</p>
                ) : (
                  chatMessages.map((msg) => (
                    <div key={msg.id} className="text-sm">
                      <span className="font-semibold">
                        {msg.senderAddress ? `${msg.senderAddress.slice(0, 6)}...` : "Unknown"}
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
                    placeholder={stream.endedAt ? "Stream has ended" : "Say something..."}
                    disabled={!authenticated || !!stream.endedAt}
                  />
                  <Button 
                    onClick={sendMessage} 
                    disabled={!authenticated || !!stream.endedAt}
                    title={stream.endedAt ? "Stream has ended. Chat is read-only." : ""}
                  >
                    Send
                  </Button>
                </div>
                {stream.endedAt && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Stream has ended. Chat is read-only.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <ShareModal
        streamId={params.id as string}
        streamTitle={stream?.title || ""}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />
    </main>
  )
}

