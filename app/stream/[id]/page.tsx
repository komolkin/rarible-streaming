"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { Player } from "@livepeer/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { usePrivy } from "@privy-io/react-auth";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";
import { ShareModal } from "@/components/share-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Heart, Share2, MoreVertical, Trash2, Eye } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

export default function StreamPage() {
  const params = useParams();
  const { authenticated, user } = usePrivy();
  const [stream, setStream] = useState<any>(null);
  const [creator, setCreator] = useState<any>(null);
  const [followerCount, setFollowerCount] = useState<number>(0);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [likeCount, setLikeCount] = useState<number>(0);
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [mintAmount, setMintAmount] = useState("1");
  const [playerIsStreaming, setPlayerIsStreaming] = useState<boolean>(false);
  const playerOfflineTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const streamLiveStatusRef = useRef<boolean>(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [totalViews, setTotalViews] = useState<number | null>(null);
  const [assetPlaybackId, setAssetPlaybackId] = useState<string | null>(null);
  const [assetPlaybackUrl, setAssetPlaybackUrl] = useState<string | null>(null);
  const [streamJustEnded, setStreamJustEnded] = useState<boolean>(false);

  const fetchChatMessages = useCallback(async () => {
    const response = await fetch(`/api/chat/${params.id}`);
    if (response.ok) {
      const data = await response.json();
      setChatMessages(data);
    }
  }, [params.id]);

  // Fetch asset playback ID when stream ends
  // CRITICAL: Asset playbackId must come from Assets API, not sessions or stream metadata
  // Asset playbackId is different from stream playbackId - they serve different purposes
  const fetchAssetPlaybackId = useCallback(async () => {
    if (!stream?.endedAt || assetPlaybackId) return;

    const livepeerStreamId = stream?.livepeerStreamId;

    if (!livepeerStreamId) return;

    try {
      // Use the stream detail API which fetches from Assets API
      // This ensures we get the correct asset playbackId (not stream playbackId)
      const url = `/api/streams/${params.id}?t=${Date.now()}`;

      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      if (response.ok) {
        const data = await response.json();

        // CRITICAL: Only use assetPlaybackId if it's different from stream playbackId
        if (
          data.assetPlaybackId &&
          data.assetPlaybackId !== data.livepeerPlaybackId
        ) {
          console.log(
            `[StreamPage] ✅ Fetched asset playbackId from Assets API: ${data.assetPlaybackId} (stream playbackId: ${data.livepeerPlaybackId})`
          );
          setAssetPlaybackId(data.assetPlaybackId);
          setStreamJustEnded(false); // Recording is available

          // Also set playback URL if available
          if (data.vodUrl) {
            setAssetPlaybackUrl(data.vodUrl);
          }
        } else if (data.assetPlaybackId === data.livepeerPlaybackId) {
          console.warn(
            `[StreamPage] ⚠️ Asset playbackId matches stream playbackId - this is incorrect! Not setting asset playbackId.`
          );
          console.warn(
            `[StreamPage] This indicates the asset hasn't been created yet or the API returned incorrect data.`
          );
        } else {
          console.log(
            `[StreamPage] Asset playbackId not available yet - asset may still be processing`
          );
        }
      }
    } catch (error) {
      console.error("Error fetching asset playback ID:", error);
    }
  }, [stream?.endedAt, stream?.livepeerStreamId, params.id, assetPlaybackId]);

  const fetchStream = useCallback(async () => {
    try {
      // Add timeout to prevent hanging (15 seconds max)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(
        `/api/streams/${params.id}?t=${Date.now()}`,
        {
          signal: controller.signal,
          cache: "no-store", // Prevent caching to get fresh view counts
          headers: {
            "Cache-Control": "no-cache",
          },
        }
      ).finally(() => {
        clearTimeout(timeoutId);
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Failed to fetch stream:", response.status, errorData);
        setPageError(
          errorData.error || `Failed to load stream (${response.status})`
        );
        return;
      }
      const data = await response.json();

      // Update stream live status ref for player offline detection
      streamLiveStatusRef.current = !!data.isLive;

      setStream(data);
      setPageError(null); // Clear any previous errors

      // Fetch creator profile if we have creator address
      if (data.creatorAddress) {
        try {
          const creatorResponse = await fetch(
            `/api/profiles?wallet=${data.creatorAddress}`
          );
          if (creatorResponse.ok) {
            const creatorData = await creatorResponse.json();
            setCreator(creatorData);
          } else {
            // If no profile exists, create a default one
            setCreator({
              walletAddress: data.creatorAddress,
              displayName: `${data.creatorAddress.slice(
                0,
                6
              )}...${data.creatorAddress.slice(-4)}`,
              username: null,
              avatarUrl: null,
            });
          }
        } catch (error) {
          console.error("Error fetching creator profile:", error);
          // Set default creator info
          setCreator({
            walletAddress: data.creatorAddress,
            displayName: `${data.creatorAddress.slice(
              0,
              6
            )}...${data.creatorAddress.slice(-4)}`,
            username: null,
            avatarUrl: null,
          });
        }

        // Fetch follower count for creator
        try {
          const followerResponse = await fetch(
            `/api/follows?address=${encodeURIComponent(
              data.creatorAddress.toLowerCase()
            )}&type=followers`
          );
          if (followerResponse.ok) {
            const followerData = await followerResponse.json();
            setFollowerCount(followerData.count || 0);
          }
        } catch (error) {
          console.error("Error fetching follower count:", error);
        }

        // Check if current user is following the creator (only if authenticated and not own stream)
        if (
          authenticated &&
          user?.wallet?.address &&
          data.creatorAddress.toLowerCase() !==
            user.wallet.address.toLowerCase()
        ) {
          try {
            const followStatusResponse = await fetch(
              `/api/follows?follower=${encodeURIComponent(
                user.wallet.address.toLowerCase()
              )}&following=${encodeURIComponent(
                data.creatorAddress.toLowerCase()
              )}`
            );
            if (followStatusResponse.ok) {
              const followStatusData = await followStatusResponse.json();
              setIsFollowing(followStatusData.isFollowing || false);
            }
          } catch (error) {
            console.error("Error checking follow status:", error);
          }
        }
      }

      // Fetch like count and check if user has liked
      try {
        const userAddress = user?.wallet?.address || null;
        const likesUrl = `/api/streams/${params.id}/likes${
          userAddress ? `?userAddress=${userAddress}` : ""
        }`;
        const likesResponse = await fetch(likesUrl);
        if (likesResponse.ok) {
          const likesData = await likesResponse.json();
          setLikeCount(likesData.likeCount || 0);
          setIsLiked(likesData.isLiked || false);
        }
      } catch (error) {
        console.error("Error fetching stream likes:", error);
      }

      // Set total views from stream data
      // Always use the value from API to ensure we have the latest data
      if (typeof data.totalViews === "number") {
        setTotalViews((prevViews) => {
          const newViews = data.totalViews;
          if (prevViews !== newViews) {
            console.log(
              `[Views] Updated total views: ${
                prevViews ?? "null"
              } -> ${newViews}`,
              {
                playbackIdUsed: data.playbackId,
                isAssetPlaybackId: data.isAssetPlaybackId,
                source: "initial fetch",
              }
            );
          }
          return newViews;
        });
      } else if (data.totalViews === null) {
        // If null, views aren't available yet - keep current value or leave as null
        console.log(`[Views] No views data available yet (null response)`);
        // Don't update state - keep current value (might be from previous page load or polling)
      } else {
        // Unexpected format - log but don't update
        console.warn(
          `[Views] Unexpected totalViews format:`,
          typeof data.totalViews,
          data.totalViews
        );
      }

      // Store asset playbackId if available (from database or fetched dynamically)
      // CRITICAL: asset_playback_id is different from livepeer_playback_id and is needed for VOD views
      // The asset playbackId comes from the Assets API and is different from the stream playbackId
      if (data.assetPlaybackId) {
        // Verify it's different from stream playbackId (they should never be the same)
        if (data.assetPlaybackId === data.livepeerPlaybackId) {
          console.warn(
            `[StreamPage] ⚠️ Asset playbackId matches stream playbackId - this is incorrect! Asset: ${data.assetPlaybackId}, Stream: ${data.livepeerPlaybackId}`
          );
          // Don't set it if they're the same - this indicates an error
        } else {
          console.log(
            `[StreamPage] ✅ Setting asset playbackId: ${data.assetPlaybackId} (different from stream playbackId: ${data.livepeerPlaybackId})`
          );
          setAssetPlaybackId(data.assetPlaybackId);
        }
      }

      // Log stream status for debugging
      if (data.livepeerPlaybackId) {
        console.log("Stream playback ID:", data.livepeerPlaybackId);
        console.log("Stream is live:", data.isLive);
      }
    } catch (error: any) {
      console.error("Error fetching stream:", error);
      // Handle timeout/abort errors gracefully
      if (error?.name === "AbortError" || error?.message?.includes("aborted")) {
        console.warn(
          "Stream fetch timeout - this may be due to slow API response"
        );
        setPageError(
          "Request timed out. The stream may be loading slowly. Please try refreshing."
        );
      } else {
        // Set page error so user sees what went wrong
        const errorMessage = error?.message || "Failed to fetch stream";
        setPageError(errorMessage);
      }
      // Don't throw - allow component to render error state
    }
  }, [params.id, authenticated, user?.wallet?.address]);

  const subscribeToChat = useCallback(() => {
    if (!params.id) return () => {};

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
          console.log("New chat message received:", payload);
          if (payload.new) {
            // Map database field names to schema field names
            const newMessage = {
              id: payload.new.id,
              streamId: payload.new.stream_id,
              senderAddress: payload.new.sender_address,
              message: payload.new.message,
              createdAt: payload.new.created_at,
            };
            setChatMessages((prev) => {
              // Check if message already exists to avoid duplicates
              const exists = prev.some((msg) => msg.id === newMessage.id);
              if (exists) {
                return prev;
              }
              const updated = [...prev, newMessage];
              // Auto-scroll to bottom when new message arrives
              setTimeout(() => {
                const chatContainer = document.getElementById("chat-messages");
                if (chatContainer) {
                  chatContainer.scrollTop = chatContainer.scrollHeight;
                }
              }, 100);
              return updated;
            });
          }
        }
      )
      .subscribe((status) => {
        console.log("Chat subscription status:", status);
        if (status === "SUBSCRIBED") {
          console.log("Successfully subscribed to chat messages");
        } else if (status === "CHANNEL_ERROR") {
          console.error("Chat subscription error");
        }
      });

    return () => {
      console.log("Unsubscribing from chat channel");
      supabase.removeChannel(channel);
    };
  }, [params.id]);

  // Subscribe to real-time stream status updates via WebSocket (isLive, endedAt)
  const subscribeToStreamStatus = useCallback(() => {
    if (!params.id) return () => {};

    const channel = supabase
      .channel(`stream-status:${params.id}`, {
        config: {
          broadcast: { self: true },
        },
      })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "streams",
          filter: `id=eq.${params.id}`,
        },
        (payload) => {
          console.log("Stream status update received:", payload);
          if (payload.new) {
            setStream((prev: any) => {
              if (!prev) return prev;
              // Update stream status fields
              if (
                payload.new.is_live !== undefined ||
                payload.new.ended_at !== undefined
              ) {
                return {
                  ...prev,
                  isLive: payload.new.is_live ?? prev.isLive,
                  endedAt: payload.new.ended_at ?? prev.endedAt,
                };
              }
              return prev;
            });
          }
        }
      )
      .subscribe((status) => {
        console.log("Stream status subscription status:", status);
        if (status === "SUBSCRIBED") {
          console.log("Successfully subscribed to stream status updates");
        } else if (status === "CHANNEL_ERROR") {
          console.error("Stream status subscription error");
        }
      });

    return () => {
      console.log("Unsubscribing from stream status channel");
      supabase.removeChannel(channel);
    };
  }, [params.id]);

  // Fetch viewer count from Livepeer API (for live streams)
  const fetchViewerCount = useCallback(async () => {
    if (!stream?.livepeerPlaybackId || stream?.endedAt) {
      return;
    }

    try {
      const response = await fetch(`/api/streams/${params.id}/viewers`);
      if (response.ok) {
        const data = await response.json();
        if (typeof data.viewerCount === "number") {
          setStream((prev: any) => {
            if (!prev) return prev;
            return {
              ...prev,
              viewerCount: data.viewerCount,
            };
          });
        }
      }
    } catch (error) {
      console.error("Error fetching viewer count:", error);
    }
  }, [params.id, stream?.livepeerPlaybackId, stream?.endedAt]);

  useEffect(() => {
    // Reset player streaming override whenever playbackId changes
    if (playerOfflineTimeoutRef.current) {
      clearTimeout(playerOfflineTimeoutRef.current);
      playerOfflineTimeoutRef.current = null;
    }
    setPlayerIsStreaming(false);

    // Cleanup timeout on unmount
    return () => {
      if (playerOfflineTimeoutRef.current) {
        clearTimeout(playerOfflineTimeoutRef.current);
        playerOfflineTimeoutRef.current = null;
      }
    };
  }, [stream?.livepeerPlaybackId]);

  const handleStreamStatusChange = useCallback((isLive: boolean) => {
    if (playerOfflineTimeoutRef.current) {
      clearTimeout(playerOfflineTimeoutRef.current);
      playerOfflineTimeoutRef.current = null;
    }
    if (isLive) {
      setPlayerIsStreaming(true);
    } else {
      playerOfflineTimeoutRef.current = setTimeout(() => {
        if (!streamLiveStatusRef.current) {
          setPlayerIsStreaming(false);
        }
      }, 10000);
    }
  }, []);

  // Function to fetch views - extracted to avoid closure issues
  const fetchViews = useCallback(async () => {
    const timestamp = Date.now();
    const playbackOverride =
      assetPlaybackId || stream?.livepeerPlaybackId || null;
    const query = new URLSearchParams({
      _: timestamp.toString(),
    });
    if (playbackOverride) {
      query.set("playbackId", playbackOverride);
    }

    try {
      const response = await fetch(
        `/api/streams/${params.id}/views?${query.toString()}`,
        {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          console.log(
            `[Views] Stream not found (404) - keeping current view count`
          );
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data) {
        return;
      }

      // Always update views if we get a number (including 0)
      if (typeof data.totalViews === "number") {
        setTotalViews((prevViews) => {
          const newViews = data.totalViews;

          // Always update to ensure we have the latest value from API
          if (prevViews !== newViews) {
            console.log(
              `[Views] Updated views: ${prevViews ?? "null"} -> ${newViews}`,
              {
                playbackIdUsed: data.playbackId,
                isAssetPlaybackId: data.isAssetPlaybackId,
                timestamp: new Date().toISOString(),
              }
            );
          }

          // Always return the new value to ensure state is fresh
          return newViews;
        });
      } else if (data.totalViews === null) {
        // If API returns null, views aren't available yet
        console.log(`[Views] Views not available yet (null response)`);
      } else {
        console.warn(`[Views] Unexpected response format:`, data);
      }
    } catch (error: any) {
      console.error(`[Views] Error fetching views:`, error?.message || error);
      // Don't clear totalViews on error - keep showing last known value
    }
  }, [params.id, assetPlaybackId, stream?.livepeerPlaybackId]);

  useEffect(() => {
    try {
      fetchStream();
      fetchChatMessages();
      // Fetch views immediately on mount
      fetchViews();
    } catch (error: any) {
      console.error("Error during initial fetch:", error);
      setPageError(error?.message || "Failed to load stream");
    }

    // Set up real-time subscriptions
    const chatCleanup = subscribeToChat();
    const streamStatusCleanup = subscribeToStreamStatus();

    // Fetch viewer count for live streams
    fetchViewerCount();

    // Poll for stream status updates every 30 seconds (reduced frequency since we have WebSocket)
    // This serves as a fallback and updates other stream metadata including views
    const interval = setInterval(() => {
      fetchStream().catch((error) => {
        console.error("Error during poll:", error);
      });
    }, 30000);

    // Poll for views every 15 seconds to ensure we get latest data quickly
    // Livepeer updates views every 5 minutes, but we check frequently to catch updates quickly
    // Note: This uses the backend API which correctly identifies asset playbackId for ended streams
    const viewsInterval = setInterval(() => {
      fetchViews();
    }, 15000); // Check every 15 seconds for faster updates

    // Poll for viewer count every 10 seconds for live streams
    const viewerCountInterval =
      stream?.livepeerPlaybackId && !stream?.endedAt
        ? setInterval(() => {
            fetchViewerCount();
          }, 10000)
        : null;

    return () => {
      chatCleanup();
      streamStatusCleanup();
      clearInterval(interval);
      clearInterval(viewsInterval);
      if (viewerCountInterval) {
        clearInterval(viewerCountInterval);
      }
    };
  }, [
    params.id,
    fetchStream,
    fetchChatMessages,
    fetchViews,
    fetchViewerCount,
    subscribeToChat,
    subscribeToStreamStatus,
    stream?.livepeerPlaybackId,
    stream?.endedAt,
  ]);

  // Fetch asset playback ID when stream ends and refresh views
  useEffect(() => {
    if (stream?.endedAt && !assetPlaybackId) {
      fetchAssetPlaybackId();
      // When stream ends, fetch views immediately to get asset views
      // Asset playbackId becomes available after stream ends
      fetchViews();
    }
  }, [stream?.endedAt, assetPlaybackId, fetchAssetPlaybackId, fetchViews]);

  useEffect(() => {
    if (assetPlaybackId) {
      fetchViews();
    }
  }, [assetPlaybackId, fetchViews]);

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
        title: stream.title,
      });

      // For ended streams: According to Livepeer docs, Player handles VOD automatically
      // with the stream playbackId - no need for complex logic here
      if (stream.endedAt && stream.livepeerPlaybackId) {
        console.log(
          "✅ Stream ended - Player will handle VOD playback with playbackId:",
          stream.livepeerPlaybackId
        );
      }

      if (stream.livepeerStreamId && !stream.livepeerPlaybackId) {
        console.warn("Stream missing playbackId, will be fetched on next poll");
      }
    }
  }, [stream]);

  const handleFollow = async () => {
    if (!authenticated || !user?.wallet?.address || !stream?.creatorAddress)
      return;

    try {
      const response = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followerAddress: user.wallet.address.toLowerCase(),
          followingAddress: stream.creatorAddress.toLowerCase(),
        }),
      });

      if (response.ok) {
        setIsFollowing(true);
        setFollowerCount((prev) => prev + 1);
      }
    } catch (error) {
      console.error("Error following user:", error);
    }
  };

  const handleUnfollow = async () => {
    if (!authenticated || !user?.wallet?.address || !stream?.creatorAddress)
      return;

    try {
      const response = await fetch(
        `/api/follows?follower=${encodeURIComponent(
          user.wallet.address.toLowerCase()
        )}&following=${encodeURIComponent(
          stream.creatorAddress.toLowerCase()
        )}`,
        { method: "DELETE" }
      );

      if (response.ok) {
        setIsFollowing(false);
        setFollowerCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error("Error unfollowing user:", error);
    }
  };

  const handleLike = async () => {
    if (!authenticated || !user?.wallet?.address) {
      alert("Please connect your wallet to like streams");
      return;
    }

    try {
      if (isLiked) {
        // Unlike
        const response = await fetch(
          `/api/streams/${params.id}/likes?userAddress=${encodeURIComponent(
            user.wallet.address
          )}`,
          {
            method: "DELETE",
          }
        );
        if (response.ok) {
          const data = await response.json();
          setLikeCount(data.likeCount || 0);
          setIsLiked(false);
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error("Failed to unlike:", errorData);
          alert(errorData.error || "Failed to unlike stream");
        }
      } else {
        // Like
        const response = await fetch(`/api/streams/${params.id}/likes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userAddress: user.wallet.address,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          setLikeCount(data.likeCount || 0);
          setIsLiked(true);
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error("Failed to like:", errorData);
          alert(errorData.error || "Failed to like stream");
        }
      }
    } catch (error: any) {
      console.error("Error toggling like:", error);
      alert(error?.message || "An error occurred while toggling like");
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || !authenticated) return;

    // Prevent sending messages if stream has ended
    if (stream?.endedAt) {
      return;
    }

    const walletAddress = user?.wallet?.address;
    if (!walletAddress) return;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamId: params.id,
          senderAddress: walletAddress,
          message: message.trim(),
        }),
      });

      if (response.ok) {
        setMessage("");
        // Message will appear via real-time subscription, no need to manually add it
      } else {
        console.error("Failed to send message");
      }
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const { writeContract, data: hash } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash,
  });

  const handleMint = async () => {
    if (!stream?.mintContractAddress) return;

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
      args: [
        user?.wallet?.address as `0x${string}`,
        stream.mintMetadataUri || "",
      ],
    });
  };

  const handleEndStream = async () => {
    if (!authenticated || !user?.wallet?.address) {
      alert("Please connect your wallet");
      return;
    }

    if (
      user.wallet.address.toLowerCase() !==
      stream?.creatorAddress?.toLowerCase()
    ) {
      alert("Only the stream creator can end the stream");
      return;
    }

    if (
      !confirm(
        "Are you sure you want to end this stream? Make sure OBS has stopped streaming."
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/streams/${params.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to end stream");
      }

      const updatedStream = await response.json();
      setStream(updatedStream);
      setStreamJustEnded(true);
    } catch (error: any) {
      console.error("Error ending stream:", error);
      alert(error?.message || "Failed to end stream");
    }
  };

  const handleDeleteStream = async () => {
    if (!authenticated || !user?.wallet?.address) {
      alert("Please connect your wallet");
      return;
    }

    if (
      user.wallet.address.toLowerCase() !==
      stream?.creatorAddress?.toLowerCase()
    ) {
      alert("Only the stream creator can delete the stream");
      return;
    }

    if (
      !confirm(
        "Are you sure you want to permanently delete this stream? This action cannot be undone. All chat messages and likes will also be deleted."
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/streams/${params.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ permanent: true }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete stream");
      }

      // Redirect to home page after successful deletion
      window.location.href = "/";
    } catch (error: any) {
      console.error("Error deleting stream:", error);
      alert(error?.message || "Failed to delete stream");
    }
  };

  // Show live player if we have a playbackId and stream hasn't ended
  // Use useMemo to prevent unnecessary recalculations (must be before early returns)
  const showLivePlayer = useMemo(
    () => !!stream?.livepeerPlaybackId && !stream?.endedAt,
    [stream?.livepeerPlaybackId, stream?.endedAt]
  );
  const showOfflineOverlay = useMemo(
    () => showLivePlayer && !stream?.isLive && !playerIsStreaming,
    [showLivePlayer, stream?.isLive, playerIsStreaming]
  );

  if (pageError) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-red-500 mb-2">
            Error Loading Stream
          </h2>
          <p className="text-muted-foreground mb-4">{pageError}</p>
          <Button onClick={() => window.location.reload()}>Reload Page</Button>
        </div>
      </div>
    );
  }

  if (!stream) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div>Loading stream data...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen pt-14 sm:pt-20 lg:pt-24 pb-4 sm:pb-8">
      <div className="w-full flex flex-col lg:grid lg:grid-cols-12 gap-4 px-2 sm:px-4 lg:px-8">
        {/* Video Player - Full Width */}
        <div className="w-full lg:col-span-9">
          <Card>
            <CardContent className="p-0">
              <div className="w-full aspect-video bg-black relative">
                {stream.livepeerPlaybackId ||
                (stream.endedAt &&
                  (assetPlaybackId || stream.livepeerStreamId)) ? (
                  <>
                    {stream.endedAt ? (
                      assetPlaybackUrl || assetPlaybackId ? (
                        <Player
                          src={assetPlaybackUrl || undefined}
                          playbackId={
                            assetPlaybackUrl
                              ? undefined
                              : assetPlaybackId || undefined
                          }
                          autoPlay
                          muted={false}
                          showTitle={false}
                          showPipButton={true}
                          objectFit="contain"
                          showUploadingIndicator={true}
                        />
                      ) : streamJustEnded ? (
                        <div className="absolute inset-0 flex items-center justify-center text-white bg-black">
                          <div className="text-center max-w-md px-4">
                            <div className="text-xl sm:text-2xl mb-3 sm:mb-4">
                              ⏳
                            </div>
                            <h3 className="text-lg sm:text-xl font-semibold mb-2 px-2">
                              Recording Processing
                            </h3>
                            <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4 px-2">
                              Your recording will be available shortly. Please
                              check back in a few minutes.
                            </p>
                            <p className="text-xs sm:text-sm text-muted-foreground px-2">
                              The recording is being processed and will appear
                              here once ready.
                            </p>
                          </div>
                        </div>
                      ) : null
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
                          showUploadingIndicator={true}
                          onStreamStatusChange={handleStreamStatusChange}
                        />
                        {showOfflineOverlay && (
                          <div className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-yellow-500 text-black px-2 py-1 sm:px-3 rounded text-xs sm:text-sm font-semibold z-10 max-w-[calc(100%-1rem)] sm:max-w-xs">
                            <div className="font-bold mb-1 text-[10px] sm:text-sm">
                              ⚠️ Stream Offline
                            </div>
                            {stream.livepeerStreamKey ? (
                              <>
                                <div className="text-[10px] sm:text-xs mt-1">
                                  <div className="font-semibold hidden sm:block">
                                    OBS Settings:
                                  </div>
                                  <div className="bg-black/20 p-1 rounded mt-1 font-mono text-[9px] sm:text-[10px] break-all">
                                    <div className="hidden sm:block">
                                      Server: rtmp://ingest.livepeer.studio/live
                                    </div>
                                    <div>
                                      Key:{" "}
                                      {stream.livepeerStreamKey.slice(0, 20)}...
                                    </div>
                                  </div>
                                </div>
                                <div className="text-[10px] sm:text-xs mt-2 opacity-90 hidden sm:block">
                                  <div>1. Go to OBS → Settings → Stream</div>
                                  <div>
                                    2. Set Service to &quot;Custom&quot;
                                  </div>
                                  <div>
                                    3. Paste Server and Stream Key above
                                  </div>
                                  <div>
                                    4. Click &quot;Start Streaming&quot;
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="text-[10px] sm:text-xs mt-1">
                                Stream ID:{" "}
                                {stream.livepeerStreamId?.slice(0, 20)}...
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : stream.livepeerPlaybackId ? (
                      // SCHEDULED/NON-LIVE STREAM - Use Player component
                      <Player
                        key={`scheduled-${stream.livepeerPlaybackId}`}
                        playbackId={stream.livepeerPlaybackId}
                        autoPlay={false}
                        muted
                        showTitle={false}
                        showPipButton={false}
                        objectFit="contain"
                        showUploadingIndicator={true}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-white">
                        <div className="text-center px-4">
                          <p className="text-base sm:text-lg mb-2">
                            Stream offline
                          </p>
                          {stream.livepeerStreamKey ? (
                            <>
                              <p className="text-xs sm:text-sm text-muted-foreground mb-3">
                                Make sure OBS is connected with the settings
                                below:
                              </p>
                              <div className="text-[10px] sm:text-xs text-left space-y-2 font-mono bg-black/40 p-2 sm:p-3 rounded max-w-full overflow-hidden">
                                <div className="break-all">
                                  Server: rtmp://ingest.livepeer.studio/live
                                </div>
                                <div className="break-all">
                                  Stream Key: {stream.livepeerStreamKey}
                                </div>
                              </div>
                            </>
                          ) : (
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              Waiting for the creator to start streaming...
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : stream.endedAt ? (
                  assetPlaybackUrl || assetPlaybackId ? (
                    <Player
                      src={assetPlaybackUrl || undefined}
                      playbackId={
                        assetPlaybackUrl
                          ? undefined
                          : assetPlaybackId || undefined
                      }
                      autoPlay
                      muted={false}
                      showTitle={false}
                      showPipButton={true}
                      objectFit="contain"
                      showUploadingIndicator={true}
                    />
                  ) : streamJustEnded ? (
                    <div className="absolute inset-0 flex items-center justify-center text-white bg-black">
                      <div className="text-center max-w-md px-4">
                        <div className="text-xl sm:text-2xl mb-3 sm:mb-4">
                          ⏳
                        </div>
                        <h3 className="text-lg sm:text-xl font-semibold mb-2 px-2">
                          Recording Processing
                        </h3>
                        <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4 px-2">
                          Your recording will be available shortly. Please check
                          back in a few minutes.
                        </p>
                        <p className="text-xs sm:text-sm text-muted-foreground px-2">
                          The recording is being processed and will appear here
                          once ready.
                        </p>
                      </div>
                    </div>
                  ) : null
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white">
                    <div className="text-center px-4">
                      <p className="text-base sm:text-lg mb-2">
                        Stream offline
                      </p>
                      {stream.livepeerStreamKey ? (
                        <>
                          <p className="text-xs sm:text-sm text-muted-foreground mb-3">
                            Make sure OBS is connected with the settings below:
                          </p>
                          <div className="text-[10px] sm:text-xs text-left space-y-2 font-mono bg-black/40 p-2 sm:p-3 rounded max-w-full overflow-hidden">
                            <div className="break-all">
                              Server: rtmp://ingest.livepeer.studio/live
                            </div>
                            <div className="break-all">
                              Stream Key: {stream.livepeerStreamKey}
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          Waiting for the creator to start streaming...
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-0">
                  <div className="flex-1 min-w-0">
                    {stream.category && (
                      <Link
                        href={`/browse/${stream.category.slug}`}
                        className="text-xs sm:text-sm text-blue-400 mb-2 hover:underline inline-block"
                      >
                        {stream.category.name}
                      </Link>
                    )}
                    <h1 className="text-lg sm:text-xl lg:text-2xl font-bold mb-2 sm:mb-3 break-words">
                      {stream.title}
                    </h1>
                    {creator && (
                      <div className="flex items-center gap-2 sm:gap-3 mb-3">
                        <Link
                          href={`/profile/${creator.walletAddress}`}
                          className="flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0 flex-1"
                        >
                          {/* Only show avatar from database - use consistent seed for fallback */}
                          <Avatar className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
                            {creator.avatarUrl ? (
                              <AvatarImage
                                src={creator.avatarUrl}
                                alt={
                                  creator.displayName ||
                                  creator.username ||
                                  "Creator"
                                }
                              />
                            ) : null}
                            <AvatarFallback
                              seed={(creator.walletAddress || "").toLowerCase()}
                            />
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 flex-wrap">
                              <span className="truncate">
                                {creator.displayName ||
                                  creator.username ||
                                  `${creator.walletAddress.slice(
                                    0,
                                    6
                                  )}...${creator.walletAddress.slice(-4)}`}
                              </span>
                              {authenticated &&
                                user?.wallet?.address?.toLowerCase() !==
                                  stream.creatorAddress?.toLowerCase() && (
                                  <Button
                                    variant={
                                      isFollowing ? "outline" : "default"
                                    }
                                    size="sm"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      isFollowing
                                        ? handleUnfollow()
                                        : handleFollow();
                                    }}
                                    className="h-6 px-2 text-xs flex-shrink-0"
                                  >
                                    {isFollowing ? "Unfollow" : "Follow"}
                                  </Button>
                                )}
                            </div>
                            <div className="text-[10px] sm:text-xs text-muted-foreground">
                              {followerCount}{" "}
                              {followerCount === 1 ? "follower" : "followers"}
                            </div>
                          </div>
                        </Link>
                      </div>
                    )}
                    <p className="text-sm sm:text-base text-muted-foreground break-words">
                      {stream.description}
                    </p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {stream.isLive ? (
                        <span className="inline-block px-2 py-1 bg-red-500 text-white rounded text-xs sm:text-sm">
                          Live
                        </span>
                      ) : stream.endedAt ? (
                        <span className="inline-block px-2 py-1 bg-muted text-muted-foreground rounded text-xs sm:text-sm">
                          Ended {formatRelativeTime(stream.endedAt)}
                        </span>
                      ) : null}
                    </div>
                    {/* Playback IDs Information */}
                    {(stream.livepeerPlaybackId ||
                      assetPlaybackId ||
                      stream.assetPlaybackId) && (
                      <div className="mt-3 p-2 bg-muted/50 rounded text-xs text-muted-foreground space-y-1">
                        {stream.livepeerPlaybackId && (
                          <div>
                            <span className="font-semibold">
                              Stream Playback ID:
                            </span>{" "}
                            <span className="font-mono break-all">
                              {stream.livepeerPlaybackId}
                            </span>
                            <span className="ml-1 text-[10px]">
                              (for live stream)
                            </span>
                          </div>
                        )}
                        {(assetPlaybackId || stream.assetPlaybackId) &&
                          (assetPlaybackId || stream.assetPlaybackId) !==
                            stream.livepeerPlaybackId && (
                            <div>
                              <span className="font-semibold">
                                Asset Playback ID:
                              </span>{" "}
                              <span className="font-mono break-all">
                                {assetPlaybackId || stream.assetPlaybackId}
                              </span>
                              <span className="ml-1 text-[10px]">
                                (for video recording/VOD)
                              </span>
                            </div>
                          )}
                        {(assetPlaybackId || stream.assetPlaybackId) &&
                          (assetPlaybackId || stream.assetPlaybackId) ===
                            stream.livepeerPlaybackId && (
                            <div className="text-yellow-600 dark:text-yellow-400">
                              <span className="font-semibold">
                                ⚠️ Asset Playback ID:
                              </span>{" "}
                              Not available yet (asset still processing)
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-row sm:flex-col sm:items-end gap-2 sm:gap-3 sm:ml-4">
                    <div className="flex flex-row flex-wrap gap-1.5 sm:gap-2">
                      {/* Total Views counter - updates dynamically */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        className="flex items-center gap-1 sm:gap-2 cursor-default hover:bg-muted h-8 sm:h-9 px-2 sm:px-3"
                        title={`Total views: ${totalViews ?? 0}`}
                      >
                        <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span className="text-xs sm:text-sm">
                          {totalViews ?? 0}
                        </span>
                      </Button>
                      <Button
                        variant={isLiked ? "default" : "outline"}
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleLike();
                        }}
                        className="flex items-center gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3"
                      >
                        <Heart
                          className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${
                            isLiked ? "fill-current" : ""
                          }`}
                        />
                        <span className="text-xs sm:text-sm">{likeCount}</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsShareModalOpen(true);
                        }}
                        className="flex items-center gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3"
                      >
                        <Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span className="hidden sm:inline">Share</span>
                      </Button>
                      {authenticated &&
                        user?.wallet?.address?.toLowerCase() ===
                          stream.creatorAddress?.toLowerCase() && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
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
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleEndStream();
                                    }}
                                    className="text-white"
                                  >
                                    End Stream
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDeleteStream();
                                }}
                                className="text-white"
                              >
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
        <div className="w-full lg:col-span-3 flex flex-col gap-4 lg:h-[calc(100vh-8rem)]">
          {/* NFT Minting Section */}
          {stream.hasMinting && stream.mintContractAddress && (
            <Card className="flex-shrink-0">
              <CardContent className="p-4">
                <h3 className="font-semibold mb-4">Mint NFT</h3>
                <div className="space-y-3">
                  {stream.mintMaxSupply && (
                    <div className="text-sm text-muted-foreground">
                      {stream.mintCurrentSupply || 0} / {stream.mintMaxSupply}{" "}
                      minted
                    </div>
                  )}
                  {stream.mintPerWalletLimit && (
                    <div className="text-xs text-muted-foreground">
                      Limit: {stream.mintPerWalletLimit} per wallet
                    </div>
                  )}
                  <Button
                    onClick={handleMint}
                    disabled={
                      !authenticated || isConfirming || !!stream.endedAt
                    }
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

          <Card className="flex-1 flex flex-col min-h-0 lg:max-h-[calc(100vh-20rem)]">
            <CardContent className="p-3 sm:p-4 flex flex-col flex-1 min-h-0">
              <h3 className="font-semibold mb-3 sm:mb-4 flex-shrink-0 text-sm sm:text-base">
                Chat
              </h3>
              <div
                id="chat-messages"
                className="space-y-2 mb-3 sm:mb-4 flex-1 overflow-y-auto min-h-0 max-h-[300px] sm:max-h-[400px] lg:max-h-none"
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
                    disabled={!authenticated || !!stream.endedAt}
                    title={
                      stream.endedAt
                        ? "Stream has ended. Chat is read-only."
                        : ""
                    }
                    size="sm"
                    className="px-3 sm:px-4"
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
  );
}
