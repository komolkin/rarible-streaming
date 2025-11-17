"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { X } from "lucide-react"
import Link from "next/link"
import { formatAddress } from "@/lib/utils"

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

interface FollowersModalProps {
  address: string
  isOpen: boolean
  onClose: () => void
}

export function FollowersModal({ address, isOpen, onClose }: FollowersModalProps) {
  const [followers, setFollowers] = useState<Follower[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && address) {
      fetchFollowers()
    } else {
      // Reset state when modal closes
      setFollowers([])
      setError(null)
    }
  }, [isOpen, address])

  const fetchFollowers = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(
        `/api/follows?address=${encodeURIComponent(address.toLowerCase())}&type=followers&list=true`
      )
      
      if (response.ok) {
        const data = await response.json()
        setFollowers(data.followers || [])
      } else {
        setError("Failed to load followers")
      }
    } catch (err) {
      console.error("Error fetching followers:", err)
      setError("Failed to load followers")
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div 
        className="bg-background rounded-lg shadow-lg w-full max-w-md mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">Followers</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="inline-block w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-500">{error}</p>
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
        </div>
      </div>
    </div>
  )
}

