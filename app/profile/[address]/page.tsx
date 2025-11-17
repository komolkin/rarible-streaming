"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StreamPreviewCard } from "@/components/stream-preview-card";
import { FollowersModal } from "@/components/followers-modal";
import { formatRelativeTime, formatAddress } from "@/lib/utils";
import { normalizeToAddress, isEnsName } from "@/lib/ens";
import { useEnsName } from "@/lib/hooks/use-ens";
import { Copy, Check } from "lucide-react";

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { authenticated, user } = usePrivy();
  // Normalize address parameter to string (Next.js params can be string | string[])
  const addressInput = Array.isArray(params.address)
    ? params.address[0]
    : params.address || "";
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [streams, setStreams] = useState<any[]>([]);
  const [likedStreams, setLikedStreams] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [likedStreamsLoading, setLikedStreamsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);

  // Resolve ENS name to address if needed
  useEffect(() => {
    const resolveAddress = async () => {
      if (!addressInput) {
        setResolvedAddress(null);
        return;
      }

      if (isEnsName(addressInput)) {
        const address = await normalizeToAddress(addressInput);
        setResolvedAddress(address);
      } else {
        setResolvedAddress(addressInput);
      }
    };

    resolveAddress();
  }, [addressInput]);

  const address = resolvedAddress || addressInput;
  const ensName = useEnsName(address);

  // Load all initial data together to prevent UI jumps
  const loadInitialData = useCallback(async () => {
    // Wait for address resolution if it's an ENS name
    if (!address || (isEnsName(addressInput) && !resolvedAddress)) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch all initial data in parallel
      const [
        profileResponse,
        streamsResponse,
        reviewsResponse,
        followersResponse,
        followingResponse,
        followStatusResponse,
      ] = await Promise.all([
        fetch(`/api/profiles?wallet=${address}`),
        fetch(`/api/streams?creator=${address}`),
        fetch(`/api/reviews?reviewee=${address}`),
        fetch(
          `/api/follows?address=${encodeURIComponent(
            address.toLowerCase()
          )}&type=followers`
        ),
        fetch(
          `/api/follows?address=${encodeURIComponent(
            address.toLowerCase()
          )}&type=following`
        ),
        authenticated && user?.wallet?.address
          ? fetch(
              `/api/follows?follower=${encodeURIComponent(
                user.wallet.address.toLowerCase()
              )}&following=${encodeURIComponent(address.toLowerCase())}`
            )
          : Promise.resolve(null),
      ]);

      // Process profile
      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        setProfile(profileData);

        // Process streams with creator info
        if (streamsResponse.ok) {
          const streamsData = await streamsResponse.json();
          const streamsWithCreator = streamsData.map((stream: any) => ({
            ...stream,
            creator: {
              displayName: profileData.displayName,
              username: profileData.username,
              avatarUrl: profileData.avatarUrl,
            },
          }));
          setStreams(streamsWithCreator);
        }
      } else if (profileResponse.status === 404) {
        // User doesn't have a profile yet - create a default one
        const defaultProfile = {
          walletAddress: address,
          displayName: ensName || formatAddress(address),
          username: null,
          bio: null,
          avatarUrl: null,
        };
        setProfile(defaultProfile);

        // Still try to load streams even without profile
        if (streamsResponse.ok) {
          const streamsData = await streamsResponse.json();
          setStreams(streamsData);
        }
      } else {
        const errorData = await profileResponse.json().catch(() => ({}));
        const errorMessage = errorData.error || "Failed to load profile";
        const errorDetails = errorData.details
          ? `\n\nDetails: ${errorData.details}`
          : "";
        setError(`${errorMessage}${errorDetails}`);
        console.error("Profile fetch error:", errorData);
      }

      // Process reviews
      if (reviewsResponse.ok) {
        const reviewsData = await reviewsResponse.json();
        setReviews(reviewsData);
      }

      // Process follow counts
      if (followersResponse.ok) {
        const followersData = await followersResponse.json();
        setFollowerCount(followersData.count || 0);
      }

      if (followingResponse.ok) {
        const followingData = await followingResponse.json();
        setFollowingCount(followingData.count || 0);
      }

      // Process follow status
      if (followStatusResponse && followStatusResponse.ok) {
        const followStatusData = await followStatusResponse.json();
        setIsFollowing(followStatusData.isFollowing || false);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load profile");
      console.error("Error loading initial data:", err);
    } finally {
      setLoading(false);
    }
  }, [address, authenticated, user?.wallet?.address]);

  const fetchLikedStreams = useCallback(async () => {
    try {
      setLikedStreamsLoading(true);
      const response = await fetch(`/api/streams/liked?userAddress=${address}`);
      if (response.ok) {
        const streamsData = await response.json();

        // Fetch creator profiles for each stream
        const streamsWithCreators = await Promise.all(
          streamsData.map(async (stream: any) => {
            try {
              const creatorResponse = await fetch(
                `/api/profiles?wallet=${stream.creatorAddress}`
              );
              if (creatorResponse.ok) {
                const creator = await creatorResponse.json();
                return { ...stream, creator };
              }
            } catch (error) {
              console.error(
                `Error fetching creator for stream ${stream.id}:`,
                error
              );
            }
            return stream;
          })
        );

        setLikedStreams(streamsWithCreators);
      }
    } catch (error) {
      console.error("Error fetching liked streams:", error);
    } finally {
      setLikedStreamsLoading(false);
    }
  }, [address]);

  // Initial load - fetch all data together
  useEffect(() => {
    if (address && (!isEnsName(addressInput) || resolvedAddress)) {
      loadInitialData();
    }
  }, [address, addressInput, resolvedAddress, loadInitialData]);

  // Refetch profile when page becomes visible (e.g., navigating back from edit)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && address) {
        loadInitialData();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [address, loadInitialData]);

  const handleFollow = async () => {
    if (!authenticated || !user?.wallet?.address) return;

    const response = await fetch("/api/follows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        followerAddress: user.wallet.address.toLowerCase(),
        followingAddress: address.toLowerCase(),
      }),
    });

    if (response.ok) {
      setIsFollowing(true);
      setFollowerCount((prev) => prev + 1);
    }
  };

  const handleUnfollow = async () => {
    if (!authenticated || !user?.wallet?.address) return;

    const response = await fetch(
      `/api/follows?follower=${encodeURIComponent(
        user.wallet.address.toLowerCase()
      )}&following=${encodeURIComponent(address.toLowerCase())}`,
      { method: "DELETE" }
    );

    if (response.ok) {
      setIsFollowing(false);
      setFollowerCount((prev) => prev - 1);
    }
  };

  const handleCopyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy address:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center px-8">
        <Card>
          <CardContent className="p-6">
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center px-8">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Profile not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <main className="min-h-screen pt-24 pb-8 px-2 md:px-8">
      <div className="max-w-7xl mx-auto">
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-start gap-6">
              <Avatar className="h-24 w-24">
                {profile.avatarUrl ? (
                  <AvatarImage
                    src={profile.avatarUrl}
                    alt={profile.displayName || profile.username || "Profile"}
                  />
                ) : null}
                <AvatarFallback
                  seed={(profile.walletAddress || address || "").toLowerCase()}
                />
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-2">
                  <div className="flex-1">
                    {profile.displayName ? (
                      <>
                        <h1 className="text-3xl font-bold">
                          {profile.displayName}
                        </h1>
                        {profile.username && (
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-muted-foreground text-sm">
                              @{profile.username}
                            </p>
                            <button
                              onClick={handleCopyAddress}
                              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm"
                              title="Copy wallet address"
                            >
                              {copied ? (
                                <>
                                  <Check className="h-3.5 w-3.5" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" />
                                  <span>
                                    {ensName || formatAddress(address)}
                                  </span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                        {!profile.username && (
                          <div className="flex items-center gap-2 mt-1">
                            <button
                              onClick={handleCopyAddress}
                              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm"
                              title="Copy wallet address"
                            >
                              {copied ? (
                                <>
                                  <Check className="h-3.5 w-3.5" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" />
                                  <span>
                                    {ensName || formatAddress(address)}
                                  </span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </>
                    ) : profile.username ? (
                      <>
                        <h1 className="text-3xl font-bold">
                          @{profile.username}
                        </h1>
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            onClick={handleCopyAddress}
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm"
                            title="Copy wallet address"
                          >
                            {copied ? (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                <span>{ensName || formatAddress(address)}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </>
                    ) : (
                      <h1 className="text-3xl font-bold">
                        {ensName || formatAddress(address)}
                      </h1>
                    )}
                  </div>
                  {authenticated &&
                  user?.wallet?.address?.toLowerCase() ===
                    address.toLowerCase() ? (
                    <Button
                      onClick={() => router.push(`/profile/${address}/edit`)}
                      variant="outline"
                    >
                      Edit Profile
                    </Button>
                  ) : authenticated &&
                    user?.wallet?.address?.toLowerCase() !==
                      address.toLowerCase() ? (
                    <Button
                      onClick={isFollowing ? handleUnfollow : handleFollow}
                      variant={isFollowing ? "outline" : "default"}
                    >
                      {isFollowing ? "Unfollow" : "Follow"}
                    </Button>
                  ) : null}
                </div>
                {profile.bio && (
                  <p className="text-muted-foreground mb-4">{profile.bio}</p>
                )}
                {profile.email && (
                  <p className="text-muted-foreground mb-4 text-sm">
                    <span className="font-medium">Email:</span> {profile.email}
                  </p>
                )}
                <div className="flex gap-6 text-sm">
                  <button
                    onClick={() => setShowFollowersModal(true)}
                    className="hover:underline cursor-pointer"
                  >
                    <span className="font-semibold">{followerCount}</span>{" "}
                    {followerCount === 1 ? "follower" : "followers"}
                  </button>
                  <div>
                    <span className="font-semibold">{followingCount}</span>{" "}
                    following
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs
          defaultValue="streams"
          onValueChange={(value) => {
            if (
              value === "liked" &&
              authenticated &&
              user?.wallet?.address?.toLowerCase() === address.toLowerCase()
            ) {
              fetchLikedStreams();
            }
          }}
        >
          <TabsList>
            <TabsTrigger value="streams">Streams</TabsTrigger>
            {authenticated &&
              user?.wallet?.address?.toLowerCase() ===
                address.toLowerCase() && (
                <TabsTrigger value="liked">Liked</TabsTrigger>
              )}
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
          </TabsList>
          <TabsContent value="streams" className="mt-6">
            {streams.length === 0 ? (
              <p className="text-muted-foreground">No streams yet</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {streams.map((stream) => (
                  <StreamPreviewCard key={stream.id} stream={stream} />
                ))}
              </div>
            )}
          </TabsContent>
          {authenticated &&
            user?.wallet?.address?.toLowerCase() === address.toLowerCase() && (
              <TabsContent value="liked" className="mt-6">
                {likedStreamsLoading ? (
                  <div className="text-center py-12">
                    <div className="inline-block w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin"></div>
                  </div>
                ) : likedStreams.length === 0 ? (
                  <p className="text-muted-foreground">No liked streams yet</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {likedStreams.map((stream) => (
                      <StreamPreviewCard key={stream.id} stream={stream} />
                    ))}
                  </div>
                )}
              </TabsContent>
            )}
          <TabsContent value="reviews" className="mt-6">
            <div className="space-y-4">
              {reviews.length === 0 ? (
                <p className="text-muted-foreground">No reviews yet</p>
              ) : (
                reviews.map((review: any) => (
                  <Card key={review.id}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback
                            seed={(review.reviewerAddress || "").toLowerCase()}
                          />
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Link
                              href={`/profile/${review.reviewerAddress}`}
                              className="font-semibold hover:underline"
                            >
                              {review.reviewerAddress?.slice(0, 6)}...
                              {review.reviewerAddress?.slice(-4)}
                            </Link>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <span
                                  key={i}
                                  className={
                                    i < review.rating
                                      ? "text-yellow-400"
                                      : "text-gray-300"
                                  }
                                >
                                  ★
                                </span>
                              ))}
                            </div>
                            {review.createdAt && (
                              <span className="text-xs text-muted-foreground ml-auto">
                                {formatRelativeTime(review.createdAt)}
                              </span>
                            )}
                          </div>
                          {review.comment && (
                            <p className="text-sm text-muted-foreground">
                              {review.comment}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <FollowersModal
        address={address}
        isOpen={showFollowersModal}
        onClose={() => setShowFollowersModal(false)}
      />
    </main>
  );
}
