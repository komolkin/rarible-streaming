"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { usePrivy } from "@privy-io/react-auth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Settings } from "lucide-react"
import { StreamPreviewCard } from "@/components/stream-preview-card"
import { StreamsGridSkeleton } from "@/components/stream-card-skeleton"
import { formatRelativeTime } from "@/lib/utils"

export default function ProfilePage() {
  const params = useParams()
  const router = useRouter()
  const { authenticated, user } = usePrivy()
  // Normalize address parameter to string (Next.js params can be string | string[])
  const address = Array.isArray(params.address) ? params.address[0] : params.address || ''
  const [profile, setProfile] = useState<any>(null)
  const [streams, setStreams] = useState<any[]>([])
  const [likedStreams, setLikedStreams] = useState<any[]>([])
  const [reviews, setReviews] = useState<any[]>([])
  const [isFollowing, setIsFollowing] = useState(false)
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [streamsLoading, setStreamsLoading] = useState(false)
  const [likedStreamsLoading, setLikedStreamsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/profiles?wallet=${address}`)
      if (response.ok) {
        const data = await response.json()
        setProfile(data)
      } else if (response.status === 404) {
        // User doesn't have a profile yet - create a default one
        const defaultProfile = {
          walletAddress: address,
          displayName: `${address.slice(0, 6)}...${address.slice(-4)}`,
          username: null,
          bio: null,
          avatarUrl: null,
        }
        setProfile(defaultProfile)
      } else {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || "Failed to load profile"
        const errorDetails = errorData.details ? `\n\nDetails: ${errorData.details}` : ""
        setError(`${errorMessage}${errorDetails}`)
        console.error("Profile fetch error:", errorData)
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load profile")
    } finally {
      setLoading(false)
    }
  }, [address])

  const fetchStreams = useCallback(async () => {
    try {
      setStreamsLoading(true)
      const response = await fetch(`/api/streams?creator=${address}`)
      if (response.ok) {
        const streamsData = await response.json()
        
        // Add creator profile to each stream (use current profile state)
        const streamsWithCreator = streamsData.map((stream: any) => ({
          ...stream,
          creator: profile ? {
            displayName: profile.displayName,
            username: profile.username,
            avatarUrl: profile.avatarUrl,
          } : null
        }))
        
        setStreams(streamsWithCreator)
      }
    } catch (error) {
      console.error("Error fetching streams:", error)
    } finally {
      setStreamsLoading(false)
    }
  }, [address, profile])

  const fetchReviews = useCallback(async () => {
    try {
      const response = await fetch(`/api/reviews?reviewee=${address}`)
      if (response.ok) {
        const data = await response.json()
        setReviews(data)
      }
    } catch (error) {
      console.error("Error fetching reviews:", error)
    }
  }, [address])

  const fetchLikedStreams = useCallback(async () => {
    try {
      setLikedStreamsLoading(true)
      const response = await fetch(`/api/streams/liked?userAddress=${address}`)
      if (response.ok) {
        const streamsData = await response.json()
        
        // Fetch creator profiles for each stream
        const streamsWithCreators = await Promise.all(
          streamsData.map(async (stream: any) => {
            try {
              const creatorResponse = await fetch(
                `/api/profiles?wallet=${stream.creatorAddress}`
              )
              if (creatorResponse.ok) {
                const creator = await creatorResponse.json()
                return { ...stream, creator }
              }
            } catch (error) {
              console.error(
                `Error fetching creator for stream ${stream.id}:`,
                error
              )
            }
            return stream
          })
        )
        
        setLikedStreams(streamsWithCreators)
      }
    } catch (error) {
      console.error("Error fetching liked streams:", error)
    } finally {
      setLikedStreamsLoading(false)
    }
  }, [address])

  const checkFollowStatus = useCallback(async () => {
    if (!authenticated || !user?.wallet?.address) return
    try {
      const response = await fetch(
        `/api/follows?follower=${encodeURIComponent(user.wallet.address.toLowerCase())}&following=${encodeURIComponent(address.toLowerCase())}`
      )
      if (response.ok) {
        const data = await response.json()
        setIsFollowing(data.isFollowing || false)
      }
    } catch (error) {
      console.error("Error checking follow status:", error)
    }
  }, [authenticated, user?.wallet?.address, address])

  const fetchFollowCounts = useCallback(async () => {
    try {
      const normalizedAddress = address.toLowerCase()
      const [followersResponse, followingResponse] = await Promise.all([
        fetch(`/api/follows?address=${encodeURIComponent(normalizedAddress)}&type=followers`),
        fetch(`/api/follows?address=${encodeURIComponent(normalizedAddress)}&type=following`),
      ])

      if (followersResponse.ok) {
        const followersData = await followersResponse.json()
        setFollowerCount(followersData.count || 0)
      }

      if (followingResponse.ok) {
        const followingData = await followingResponse.json()
        setFollowingCount(followingData.count || 0)
      }
    } catch (error) {
      console.error("Error fetching follow counts:", error)
    }
  }, [address])

  // Initial load - fetch profile and other data
  useEffect(() => {
    if (address) {
      fetchProfile()
      fetchReviews()
      checkFollowStatus()
      fetchFollowCounts()
    }
  }, [address, fetchProfile, fetchReviews, checkFollowStatus, fetchFollowCounts])

  // Fetch streams after profile is loaded
  useEffect(() => {
    if (address && profile) {
      fetchStreams()
    }
  }, [address, profile, fetchStreams])

  // Refetch profile when page becomes visible (e.g., navigating back from edit)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && address) {
        fetchProfile()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [address, fetchProfile])

  const handleFollow = async () => {
    if (!authenticated || !user?.wallet?.address) return

    const response = await fetch("/api/follows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        followerAddress: user.wallet.address.toLowerCase(),
        followingAddress: address.toLowerCase(),
      }),
    })

    if (response.ok) {
      setIsFollowing(true)
      setFollowerCount((prev) => prev + 1)
    }
  }

  const handleUnfollow = async () => {
    if (!authenticated || !user?.wallet?.address) return

    const response = await fetch(
      `/api/follows?follower=${encodeURIComponent(user.wallet.address.toLowerCase())}&following=${encodeURIComponent(address.toLowerCase())}`,
      { method: "DELETE" }
    )

    if (response.ok) {
      setIsFollowing(false)
      setFollowerCount((prev) => prev - 1)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin"></div>
      </div>
    )
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
    )
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
    )
  }

  return (
    <main className="min-h-screen pt-24 pb-8 px-8">
      <div className="max-w-7xl mx-auto">
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-start gap-6">
              <Avatar className="h-24 w-24">
                {profile.avatarUrl ? (
                  <AvatarImage src={profile.avatarUrl} alt={profile.displayName || profile.username || "Profile"} />
                ) : null}
                <AvatarFallback seed={(profile.walletAddress || address || "").toLowerCase()} />
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-2">
                  <div className="flex-1">
                    {profile.displayName ? (
                      <>
                        <h1 className="text-3xl font-bold">{profile.displayName}</h1>
                        {profile.username && (
                          <p className="text-muted-foreground text-sm mt-1">@{profile.username}</p>
                        )}
                      </>
                    ) : profile.username ? (
                      <h1 className="text-3xl font-bold">@{profile.username}</h1>
                    ) : (
                      <h1 className="text-3xl font-bold">User</h1>
                    )}
                  </div>
                  {authenticated && user?.wallet?.address?.toLowerCase() === address.toLowerCase() ? (
                    <Button
                      onClick={() => router.push(`/profile/${address}/edit`)}
                      variant="outline"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Edit Profile
                    </Button>
                  ) : authenticated && user?.wallet?.address?.toLowerCase() !== address.toLowerCase() ? (
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
                  <div>
                    <span className="font-semibold">{followerCount}</span> followers
                  </div>
                  <div>
                    <span className="font-semibold">{followingCount}</span> following
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="streams" onValueChange={(value) => {
          if (value === "liked" && authenticated && user?.wallet?.address?.toLowerCase() === address.toLowerCase()) {
            fetchLikedStreams()
          }
        }}>
          <TabsList>
            <TabsTrigger value="streams">Streams</TabsTrigger>
            {authenticated && user?.wallet?.address?.toLowerCase() === address.toLowerCase() && (
              <TabsTrigger value="liked">Liked</TabsTrigger>
            )}
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
          </TabsList>
          <TabsContent value="streams" className="mt-6">
            {streamsLoading ? (
              <StreamsGridSkeleton count={6} />
            ) : streams.length === 0 ? (
              <p className="text-muted-foreground">No streams yet</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {streams.map((stream) => (
                  <StreamPreviewCard key={stream.id} stream={stream} />
                ))}
              </div>
            )}
          </TabsContent>
          {authenticated && user?.wallet?.address?.toLowerCase() === address.toLowerCase() && (
            <TabsContent value="liked" className="mt-6">
              {likedStreamsLoading ? (
                <StreamsGridSkeleton count={6} />
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
                          <AvatarFallback seed={(review.reviewerAddress || "").toLowerCase()} />
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
    </main>
  )
}

