"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { X } from "lucide-react"
import Link from "next/link"
import { formatAddress } from "@/lib/utils"
import NumberFlow from "@number-flow/react"

interface Follower {
  followerAddress: string
  createdAt: string
  profile: {
    walletAddress: string
    username: string | null
    displayName: string | null
    avatarUrl: string | null
  } | null
}

interface Following {
  followingAddress: string
  createdAt: string
  profile: {
    walletAddress: string
    username: string | null
    displayName: string | null
    avatarUrl: string | null
  } | null
}

interface FollowersModalProps {
  address: string
  displayName: string | null
  isOpen: boolean
  initialTab?: "followers" | "following"
  followerCount?: number
  followingCount?: number
  onClose: () => void
}

export function FollowersModal({ 
  address, 
  displayName,
  isOpen, 
  initialTab = "followers",
  followerCount = 0,
  followingCount = 0,
  onClose 
}: FollowersModalProps) {
  const [followers, setFollowers] = useState<Follower[]>([])
  const [following, setFollowing] = useState<Following[]>([])
  const [activeTab, setActiveTab] = useState<"followers" | "following">(initialTab)
  const [followersLoading, setFollowersLoading] = useState(false)
  const [followingLoading, setFollowingLoading] = useState(false)
  const [followersError, setFollowersError] = useState<string | null>(null)
  const [followingError, setFollowingError] = useState<string | null>(null)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    if (isOpen && address) {
      if (activeTab === "followers") {
        fetchFollowers()
      } else {
        fetchFollowing()
      }
    } else {
      // Reset state when modal closes
      setFollowers([])
      setFollowing([])
      setFollowersError(null)
      setFollowingError(null)
      setActiveTab(initialTab) // Reset to initial tab
    }
  }, [isOpen, address, activeTab, initialTab])

  const fetchFollowers = async () => {
    if (followers.length > 0) return // Already loaded
    
    try {
      setFollowersLoading(true)
      setFollowersError(null)
      const response = await fetch(
        `/api/follows?address=${encodeURIComponent(address.toLowerCase())}&type=followers&list=true`
      )
      
      if (response.ok) {
        const data = await response.json()
        setFollowers(data.followers || [])
      } else {
        setFollowersError("Failed to load followers")
      }
    } catch (err) {
      console.error("Error fetching followers:", err)
      setFollowersError("Failed to load followers")
    } finally {
      setFollowersLoading(false)
    }
  }

  const fetchFollowing = async () => {
    if (following.length > 0) return // Already loaded
    
    try {
      setFollowingLoading(true)
      setFollowingError(null)
      const response = await fetch(
        `/api/follows?address=${encodeURIComponent(address.toLowerCase())}&type=following&list=true`
      )
      
      if (response.ok) {
        const data = await response.json()
        setFollowing(data.following || [])
      } else {
        setFollowingError("Failed to load following")
      }
    } catch (err) {
      console.error("Error fetching following:", err)
      setFollowingError("Failed to load following")
    } finally {
      setFollowingLoading(false)
    }
  }

  const handleTabChange = (value: string) => {
    if (value === "followers" || value === "following") {
      setActiveTab(value)
      if (value === "followers" && followers.length === 0) {
        fetchFollowers()
      } else if (value === "following" && following.length === 0) {
        fetchFollowing()
      }
    }
  }

  if (!isOpen) return null

  const modalTitle = displayName || formatAddress(address)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div 
        className="bg-background rounded-lg shadow-lg w-full max-w-md mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-medium">{modalTitle}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-4">
            <TabsList className="w-full">
              <TabsTrigger value="followers" className="flex-1">
                Followers {followerCount > 0 && (
                  <>(<NumberFlow value={followerCount} />)</>
                )}
              </TabsTrigger>
              <TabsTrigger value="following" className="flex-1">
                Following {followingCount > 0 && (
                  <>(<NumberFlow value={followingCount} />)</>
                )}
              </TabsTrigger>
            </TabsList>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="followers" className="mt-0">
              {followersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="inline-block w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin"></div>
                </div>
              ) : followersError ? (
                <div className="text-center py-12">
                  <p className="text-red-500">{followersError}</p>
                </div>
              ) : followers.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No followers yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {followers.map((follower) => {
                    const followerAddress = follower.followerAddress
                    const profile = follower.profile
                    const displayName = profile?.displayName || profile?.username || formatAddress(followerAddress)
                    const username = profile?.username
                    const avatarUrl = profile?.avatarUrl
                    
                    return (
                      <Link
                        key={followerAddress}
                        href={`/profile/${followerAddress}`}
                        onClick={onClose}
                        className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Avatar className="h-12 w-12">
                          {avatarUrl ? (
                            <AvatarImage src={avatarUrl} alt={displayName} />
                          ) : null}
                          <AvatarFallback seed={followerAddress.toLowerCase()} />
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">{displayName}</div>
                          {username && (
                            <div className="text-sm text-muted-foreground truncate">@{username}</div>
                          )}
                          {!username && (
                            <div className="text-sm text-muted-foreground truncate">
                              {formatAddress(followerAddress)}
                            </div>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="following" className="mt-0">
              {followingLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="inline-block w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin"></div>
                </div>
              ) : followingError ? (
                <div className="text-center py-12">
                  <p className="text-red-500">{followingError}</p>
                </div>
              ) : following.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Not following anyone yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {following.map((follow) => {
                    const followingAddress = follow.followingAddress
                    const profile = follow.profile
                    const displayName = profile?.displayName || profile?.username || formatAddress(followingAddress)
                    const username = profile?.username
                    const avatarUrl = profile?.avatarUrl
                    
                    return (
                      <Link
                        key={followingAddress}
                        href={`/profile/${followingAddress}`}
                        onClick={onClose}
                        className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Avatar className="h-12 w-12">
                          {avatarUrl ? (
                            <AvatarImage src={avatarUrl} alt={displayName} />
                          ) : null}
                          <AvatarFallback seed={followingAddress.toLowerCase()} />
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">{displayName}</div>
                          {username && (
                            <div className="text-sm text-muted-foreground truncate">@{username}</div>
                          )}
                          {!username && (
                            <div className="text-sm text-muted-foreground truncate">
                              {formatAddress(followingAddress)}
                            </div>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}

