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
import { Heart, Share2, MoreVertical, Trash2, BadgeCheck, ExternalLink } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { RaribleProductCard } from "@/components/rarible-product-card";

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
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const [isInViewport, setIsInViewport] = useState<boolean>(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [totalViews, setTotalViews] = useState<number | null>(null);
  const [isMetadataLoading, setIsMetadataLoading] = useState<boolean>(true);

  const fetchChatMessages = useCallback(async () => {
    const response = await fetch(`/api/chat/${params.id}`);
    if (response.ok) {
      const data = await response.json();
      setChatMessages(data);
    }
  }, [params.id]);

  const fetchStream = useCallback(
    async (isInitialLoad: boolean = false) => {
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

        // Fetch all metadata in parallel for initial load
        const metadataPromises: Promise<void>[] = [];

        // Fetch creator profile if we have creator address
        if (data.creatorAddress) {
          const creatorPromise = (async () => {
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
          })();
          metadataPromises.push(creatorPromise);

          // Fetch follower count for creator
          const followerPromise = (async () => {
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
          })();
          metadataPromises.push(followerPromise);

          // Check if current user is following the creator (only if authenticated and not own stream)
          if (
            authenticated &&
            user?.wallet?.address &&
            data.creatorAddress.toLowerCase() !==
              user.wallet.address.toLowerCase()
          ) {
            const walletAddress = user.wallet.address;
            const followStatusPromise = (async () => {
              try {
                const followStatusResponse = await fetch(
                  `/api/follows?follower=${encodeURIComponent(
                    walletAddress.toLowerCase()
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
            })();
            metadataPromises.push(followStatusPromise);
          }
        }

        // Fetch like count and check if user has liked
        const likesPromise = (async () => {
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
        })();
        metadataPromises.push(likesPromise);

        // Set total views from stream data
        if (typeof data.totalViews === "number") {
          setTotalViews(data.totalViews);
        }

        // Wait for all metadata to load on initial load
        if (isInitialLoad) {
          await Promise.all(metadataPromises);
        }
      } catch (error: any) {
        console.error("Error fetching stream:", error);
        // Handle timeout/abort errors gracefully
        if (
          error?.name === "AbortError" ||
          error?.message?.includes("aborted")
        ) {
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
    },
    [params.id, authenticated, user?.wallet?.address]
  );

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
                if (chatMessagesRef.current) {
                  chatMessagesRef.current.scrollTop =
                    chatMessagesRef.current.scrollHeight;
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

  // Determine the correct playbackId to use for effects
  const currentPlaybackId = useMemo(() => {
    // If stream has ended, prefer assetPlaybackId if available (for VOD).
    if (stream?.endedAt && (stream as any).assetPlaybackId) {
      return (stream as any).assetPlaybackId;
    }
    // Fallback to livepeerPlaybackId (some recordings work with the original stream playbackId)
    return stream?.livepeerPlaybackId || null;
  }, [
    stream?.livepeerPlaybackId,
    stream?.endedAt,
    (stream as any)?.assetPlaybackId,
  ]);

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
  }, [currentPlaybackId]);

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

  // Function to fetch views
  const fetchViews = useCallback(
    async (isInitialLoad: boolean = false) => {
      try {
        const response = await fetch(
          `/api/streams/${params.id}/views?_=${Date.now()}`,
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
            if (isInitialLoad) {
              setTotalViews(0);
            }
            return;
          }
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (typeof data.totalViews === "number") {
          setTotalViews(data.totalViews);
        } else if (isInitialLoad) {
          setTotalViews(0);
        }
      } catch (error: any) {
        console.error(`[Views] Error fetching views:`, error?.message || error);
        if (isInitialLoad) {
          setTotalViews(0);
        }
      }
    },
    [params.id]
  );

  useEffect(() => {
    let isMounted = true;
    let chatCleanup: (() => void) | null = null;
    let streamStatusCleanup: (() => void) | null = null;
    let interval: NodeJS.Timeout | null = null;
    let viewsInterval: NodeJS.Timeout | null = null;
    let viewerCountInterval: NodeJS.Timeout | null = null;

    const loadInitialData = async () => {
      try {
        setIsMetadataLoading(true);

        // Fetch stream and views in parallel for initial load
        await Promise.all([
          fetchStream(true),
          fetchViews(true),
          fetchChatMessages(),
        ]);

        if (!isMounted) return;

        // All metadata has loaded, hide loading state
        setIsMetadataLoading(false);

        // Set up real-time subscriptions
        chatCleanup = subscribeToChat();
        streamStatusCleanup = subscribeToStreamStatus();

        // Fetch viewer count for live streams (non-blocking)
        fetchViewerCount();

        // Poll for stream status updates every 30 seconds (reduced frequency since we have WebSocket)
        // This serves as a fallback and updates other stream metadata including views
        interval = setInterval(() => {
          fetchStream(false).catch((error) => {
            console.error("Error during poll:", error);
          });
        }, 30000);

        // Poll for views every 15 seconds to ensure we get latest data quickly
        // Livepeer updates views every 5 minutes, but we check frequently to catch updates quickly
        // Note: This uses the backend API which correctly identifies asset playbackId for ended streams
        viewsInterval = setInterval(() => {
          fetchViews(false);
        }, 15000); // Check every 15 seconds for faster updates
      } catch (error: any) {
        console.error("Error during initial fetch:", error);
        if (isMounted) {
          setPageError(error?.message || "Failed to load stream");
          setIsMetadataLoading(false);
        }
      }
    };

    loadInitialData();

    // Set up viewer count polling after stream is loaded (in a separate effect)
    // This will be handled by the existing effect that depends on stream

    return () => {
      isMounted = false;
      if (chatCleanup) chatCleanup();
      if (streamStatusCleanup) streamStatusCleanup();
      if (interval) clearInterval(interval);
      if (viewsInterval) clearInterval(viewsInterval);
      if (viewerCountInterval) clearInterval(viewerCountInterval);
    };
  }, [
    params.id,
    fetchStream,
    fetchChatMessages,
    fetchViews,
    subscribeToChat,
    subscribeToStreamStatus,
  ]);

  // Separate effect for viewer count polling that depends on stream state
  useEffect(() => {
    if (!stream?.livepeerPlaybackId || stream?.endedAt) return;

    const viewerCountInterval = setInterval(() => {
      fetchViewerCount();
    }, 10000);

    return () => {
      clearInterval(viewerCountInterval);
    };
  }, [stream?.livepeerPlaybackId, stream?.endedAt, fetchViewerCount]);

  // Scroll chat to bottom when messages load or change
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleFollow = async () => {
    if (!authenticated || !user?.wallet?.address || !stream?.creatorAddress)
      return;

    const walletAddress = user.wallet.address;
    try {
      const response = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followerAddress: walletAddress.toLowerCase(),
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

    const walletAddress = user.wallet.address;
    try {
      const response = await fetch(
        `/api/follows?follower=${encodeURIComponent(
          walletAddress.toLowerCase()
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

    const walletAddress = user.wallet.address;
    try {
      if (isLiked) {
        // Unlike
        const response = await fetch(
          `/api/streams/${params.id}/likes?userAddress=${encodeURIComponent(
            walletAddress
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
            userAddress: walletAddress,
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

    const walletAddress = user.wallet.address;
    if (walletAddress.toLowerCase() !== stream?.creatorAddress?.toLowerCase()) {
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

    const walletAddress = user.wallet.address;
    if (walletAddress.toLowerCase() !== stream?.creatorAddress?.toLowerCase()) {
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

  // Intersection Observer for viewport-based playback control
  useEffect(() => {
    if (!playerContainerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsInViewport(entry.isIntersecting);
        });
      },
      {
        threshold: 0.5, // Trigger when 50% of the video is visible
      }
    );

    observer.observe(playerContainerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Control playback based on viewport visibility
  useEffect(() => {
    if (!playerContainerRef.current || !currentPlaybackId) return;

    // Find the video element inside the Player component
    const findVideoElement = (): HTMLVideoElement | null => {
      return playerContainerRef.current?.querySelector("video") || null;
    };

    const handlePlayback = async () => {
      const videoElement = findVideoElement();
      if (!videoElement) return;

      try {
        if (isInViewport) {
          // Video is in viewport - play if paused
          if (videoElement.paused) {
            await videoElement.play().catch((error) => {
              // Handle autoplay restrictions
              console.warn("Autoplay prevented:", error);
            });
          }
        } else {
          // Video is out of viewport - pause if playing
          if (!videoElement.paused) {
            videoElement.pause();
          }
        }
      } catch (error) {
        // Handle other playback errors
        console.warn("Playback control error:", error);
      }
    };

    // Use MutationObserver to detect when video element is added to DOM
    const observer = new MutationObserver(() => {
      handlePlayback();
    });

    // Start observing when component mounts
    const checkInterval = setInterval(() => {
      const videoElement = findVideoElement();
      if (videoElement) {
        clearInterval(checkInterval);
        observer.disconnect();
        handlePlayback();
      }
    }, 200);

    // Also observe DOM changes
    if (playerContainerRef.current) {
      observer.observe(playerContainerRef.current, {
        childList: true,
        subtree: true,
      });
    }

    // Initial check
    handlePlayback();

    return () => {
      clearInterval(checkInterval);
      observer.disconnect();
    };
  }, [isInViewport, currentPlaybackId]);

  // Show live player if we have a playbackId and stream hasn't ended
  // Use useMemo to prevent unnecessary recalculations (must be before early returns)
  const showLivePlayer = useMemo(
    () => !!currentPlaybackId && !stream?.endedAt,
    [currentPlaybackId, stream?.endedAt]
  );
  const showOfflineOverlay = useMemo(
    () => showLivePlayer && !stream?.isLive && !playerIsStreaming,
    [showLivePlayer, stream?.isLive, playerIsStreaming]
  );

  // Check if asset is processing (ended stream without ready asset playbackId)
  const isAssetProcessing = useMemo(() => {
    return (
      !!stream?.endedAt && !currentPlaybackId && !!stream?.livepeerStreamId
    );
  }, [stream?.endedAt, currentPlaybackId, stream?.livepeerStreamId]);

  if (pageError) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-medium text-white mb-2">
            Oops!…I Did It Again
          </h2>
          <p className="text-muted-foreground mb-4">{pageError}</p>
          <Button onClick={() => window.location.reload()}>Reload Page</Button>
        </div>
      </div>
    );
  }

  if (!stream || isMetadataLoading) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen pt-16 pb-4 sm:pb-8 lg:h-[calc(100vh-4rem)] lg:overflow-hidden">
      <div className="w-full flex flex-col lg:grid lg:grid-cols-[350px_1fr_350px] gap-4 px-2 sm:px-4 lg:px-8 lg:h-full lg:items-center">
        {/* Left Column - Category, Title, Metadata, Like/Share */}
        <div className="w-full lg:h-full lg:overflow-hidden flex flex-col order-2 lg:order-1">
          <Card className="flex-1 flex flex-col min-h-0 lg:h-full lg:overflow-hidden bg-transparent border-transparent shadow-none">
            <CardContent className="p-3 sm:p-4 flex flex-col flex-1 min-h-0">
              {/* Title, Metadata, and Controls Section */}
              <div className="flex flex-col gap-3 mb-4 flex-shrink-0">
                {/* Category */}
                {stream.category && (
                  <Link
                    href={`/browse/${stream.category.slug}`}
                    className="text-xs sm:text-sm text-[#FAFF00] hover:opacity-80 transition-opacity"
                  >
                    {stream.category.name}
                  </Link>
                )}

                {/* Title */}
                <h1 className="text-lg sm:text-xl lg:text-2xl xl:text-3xl font-medium break-words">
                  {stream.title}
                </h1>

                {/* Streamed date and views */}
                <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                  {stream.endedAt ? (
                    <>
                      {totalViews !== null && (
                        <>
                          <span>
                            <NumberFlow value={totalViews ?? 0} />{" "}
                            {totalViews === 1 ? "view" : "views"}
                          </span>
                          <span>•</span>
                        </>
                      )}
                      <span>Streamed {formatRelativeTime(stream.endedAt)}</span>
                    </>
                  ) : null}
                </div>

                {/* Creator Info */}
                {creator && (
                  <div className="flex items-center gap-2 sm:gap-3 mt-1">
                    <Link
                      href={`/profile/${creator.walletAddress}`}
                      className="flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0 flex-1"
                    >
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
                          <span className="truncate flex items-center gap-1">
                            {creator.displayName ||
                              creator.username ||
                              `${creator.walletAddress.slice(
                                0,
                                6
                              )}...${creator.walletAddress.slice(-4)}`}
                            {creator.verified && (
                              <BadgeCheck className="h-3.5 w-3.5 text-black fill-[#FAFF00]" />
                            )}
                          </span>
                          {authenticated &&
                            user?.wallet?.address?.toLowerCase() !==
                              stream.creatorAddress?.toLowerCase() && (
                              <Button
                                variant={isFollowing ? "outline" : "default"}
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
                          <NumberFlow value={followerCount} />{" "}
                          {followerCount === 1 ? "follower" : "followers"}
                        </div>
                      </div>
                    </Link>
                  </div>
                )}

                {/* Description */}
                {stream.description && (
                  <p className="text-sm sm:text-base text-muted-foreground break-words mt-1">
                    {stream.description}
                  </p>
                )}

                {/* Controls */}
                <div className="flex flex-row flex-wrap gap-2 pt-3">
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
                    <span className="text-xs sm:text-sm">
                      <NumberFlow value={likeCount} />
                    </span>
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
                  {authenticated && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            className="flex items-center gap-2 h-8 sm:h-9 px-2 sm:px-3"
                          >
                            <MoreVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {user?.wallet?.address?.toLowerCase() ===
                          stream.creatorAddress?.toLowerCase() ? (
                            <>
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
                            </>
                          ) : (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                // TODO: Add report logic
                              }}
                              className="text-white"
                            >
                              Report
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                </div>
              </div>

              {/* Tabs Section */}
              <Tabs
                defaultValue="products"
                className="flex-1 flex flex-col min-h-0 overflow-hidden mt-6"
              >
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="products" className="w-full">
                    Products
                  </TabsTrigger>
                  <TabsTrigger value="activity" className="w-full">
                    Activity
                  </TabsTrigger>
                </TabsList>

                <TabsContent
                  value="products"
                  className="flex-1 hidden data-[state=active]:flex flex-col min-h-0 m-0 p-0 overflow-y-auto ring-offset-0"
                >
                  {stream?.products && Array.isArray(stream.products) && stream.products.length > 0 ? (
                    <div className="space-y-3 w-full pt-4">
                      {stream.products.map((product: string, index: number) => (
                        <div key={index}>
                          {product.includes('rarible.com') ? (
                            <RaribleProductCard url={product} />
                          ) : (
                            <a
                              href={product}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 p-4 border border-border rounded-lg hover:bg-accent transition-colors group"
                            >
                              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                              <span className="text-sm text-foreground break-all group-hover:underline">
                                {product}
                              </span>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center m-0">
                      No products available for this stream.
                    </p>
                  )}
                </TabsContent>
                <TabsContent
                  value="activity"
                  className="flex-1 hidden data-[state=active]:flex items-center justify-center min-h-0 m-0 p-0 overflow-y-auto ring-offset-0"
                >
                  <p className="text-sm text-muted-foreground text-center m-0">
                    Activity content coming soon...
                  </p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Middle Column - Video Player */}
        <div className="w-full flex flex-col lg:flex lg:items-center lg:justify-center order-1 lg:order-2 min-w-0">
          <div className="ambient-glow rounded-lg w-full min-w-0">
            <Card className="flex flex-col min-h-0 p-0 overflow-hidden w-full">
              <CardContent className="p-0 flex items-center justify-center bg-black relative aspect-video w-full min-h-[200px] sm:min-h-[300px] lg:min-h-0">
                <div
                  ref={playerContainerRef}
                  className="w-full h-full flex items-center justify-center relative"
                >
                  {isAssetProcessing ? (
                    // Asset is still processing - show processing message
                    <div className="absolute inset-0 flex items-center justify-center text-white bg-black">
                      <div className="text-center max-w-md px-4">
                        <div className="text-xl sm:text-2xl mb-3 sm:mb-4">
                          ⏳
                        </div>
                        <h3 className="text-lg sm:text-xl font-medium mb-2 px-2">
                          Recording Processing
                        </h3>
                        <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4 px-2">
                          Your recording is being processed. Please check back
                          in a few minutes.
                        </p>
                      </div>
                    </div>
                  ) : currentPlaybackId ? (
                    <>
                      <div className="w-full h-full max-w-full max-h-full">
                        <Player
                          playbackId={currentPlaybackId}
                          playRecording={!!stream.endedAt}
                          autoPlay
                          muted={!stream.endedAt}
                          showTitle={false}
                          showPipButton={stream.endedAt}
                          objectFit="contain"
                          priority={!stream.endedAt}
                          showUploadingIndicator={true}
                          onStreamStatusChange={
                            !stream.endedAt
                              ? handleStreamStatusChange
                              : undefined
                          }
                        />
                      </div>
                      {/* Live badge */}
                      {stream.isLive && !stream.endedAt && (
                        <div className="absolute top-2 left-2 sm:top-4 sm:left-4 bg-red-500 text-white px-2 py-1 sm:px-3 rounded-full text-xs sm:text-sm font-semibold flex items-center gap-1.5 sm:gap-2 z-10 pointer-events-none">
                          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full animate-pulse"></span>
                          LIVE
                        </div>
                      )}
                      {!stream.endedAt && showOfflineOverlay && (
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
                                    Key: {stream.livepeerStreamKey.slice(0, 20)}
                                    ...
                                  </div>
                                </div>
                              </div>
                              <div className="text-[10px] sm:text-xs mt-2 opacity-90 hidden sm:block">
                                <div>1. Go to OBS → Settings → Stream</div>
                                <div>2. Set Service to &quot;Custom&quot;</div>
                                <div>3. Paste Server and Stream Key above</div>
                                <div>4. Click &quot;Start Streaming&quot;</div>
                              </div>
                            </>
                          ) : (
                            <div className="text-[10px] sm:text-xs mt-1">
                              Stream ID: {stream.livepeerStreamId?.slice(0, 20)}
                              ...
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : stream.endedAt ? (
                    // Fallback: Stream ended but no playbackId (should be caught by isAssetProcessing, but keep as safety)
                    <div className="absolute inset-0 flex items-center justify-center text-white bg-black">
                      <div className="text-center max-w-md px-4">
                        <div className="text-xl sm:text-2xl mb-3 sm:mb-4">
                          ⏳
                        </div>
                        <h3 className="text-lg sm:text-xl font-medium mb-2 px-2">
                          Recording Processing
                        </h3>
                        <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4 px-2">
                          Your recording is being processed. Please check back
                          in a few minutes.
                        </p>
                      </div>
                    </div>
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
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Column - Chat */}
        <div className="w-full lg:h-full lg:overflow-hidden flex flex-col order-3 lg:order-3">
          {/* NFT Minting Section */}
          {stream.hasMinting && stream.mintContractAddress && (
            <Card className="flex-shrink-0 mb-4">
              <CardContent className="p-4">
                <h3 className="font-medium mb-4">Mint NFT</h3>
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

          {/* Chat Section */}
          <Card className="flex-1 flex flex-col min-h-0 lg:h-full lg:overflow-hidden bg-transparent border-transparent shadow-none">
            <CardContent className="p-3 sm:p-4 flex flex-col flex-1 min-h-0">
              <div className="flex-1 flex flex-col min-h-0">
                <h3 className="font-medium mb-3 sm:mb-4 flex-shrink-0 text-sm sm:text-base">
                  Chat
                </h3>
                <div
                  ref={chatMessagesRef}
                  id="chat-messages"
                  className={`mb-3 sm:mb-4 flex-1 overflow-y-auto min-h-0 max-h-[300px] sm:max-h-[400px] lg:max-h-none ${
                    chatMessages.length === 0
                      ? "flex items-center justify-center"
                      : "space-y-2"
                  }`}
                >
                  {chatMessages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No messages.
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
                      disabled={
                        !authenticated || !message.trim() || !!stream.endedAt
                      }
                      size="sm"
                      className="px-3 sm:px-4"
                    >
                      Send
                    </Button>
                  </div>
                </div>
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
