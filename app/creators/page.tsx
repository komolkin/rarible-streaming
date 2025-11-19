"use client"

import { useEffect, useState } from "react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { formatRelativeTime, formatAddress } from "@/lib/utils"
import { BadgeCheck } from "lucide-react"
import Link from "next/link"
import NumberFlow from "@number-flow/react"

interface Creator {
  wallet_address: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  created_at: string
  verified: boolean
  total_streams: number
  total_followers: number
  total_views: number
}

export default function CreatorsPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCreators()
  }, [])

  const fetchCreators = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/creators")
      if (response.ok) {
        const data = await response.json()
        setCreators(data)
      }
    } catch (error) {
      console.error("Error fetching creators:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatTimeShort = (dateStr: string) => {
    if (!dateStr) return ""
    const rel = formatRelativeTime(dateStr)
    return rel.replace(" ago", "")
  }

  return (
    <main className="min-h-screen pt-24 pb-8 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-medium mb-8">Creators</h1>
        
        <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="h-12 px-4 font-medium align-middle w-[40%]">User</th>
                  <th className="h-12 px-4 font-medium align-middle text-right">Streams</th>
                  <th className="h-12 px-4 font-medium align-middle text-right">Views</th>
                  <th className="h-12 px-4 font-medium align-middle text-right">Followers</th>
                  <th className="h-12 px-4 font-medium align-middle text-right">Joined</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  // Skeleton loading state
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-4"><div className="h-10 w-48 bg-muted animate-pulse rounded" /></td>
                      <td className="p-4"><div className="h-6 w-12 bg-muted animate-pulse rounded ml-auto" /></td>
                      <td className="p-4"><div className="h-6 w-12 bg-muted animate-pulse rounded ml-auto" /></td>
                      <td className="p-4"><div className="h-6 w-12 bg-muted animate-pulse rounded ml-auto" /></td>
                      <td className="p-4"><div className="h-6 w-16 bg-muted animate-pulse rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : creators.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      No creators found
                    </td>
                  </tr>
                ) : (
                  creators.map((creator) => (
                    <tr key={creator.wallet_address} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="p-4 align-middle">
                        <Link href={`/profile/${creator.wallet_address}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity w-fit">
                          <Avatar>
                            <AvatarImage src={creator.avatar_url || undefined} />
                            <AvatarFallback seed={creator.wallet_address} />
                          </Avatar>
                          <div>
                            <div className="font-medium flex items-center gap-1">
                              {creator.display_name || creator.username || formatAddress(creator.wallet_address)}
                              {creator.verified && <BadgeCheck className="h-4 w-4 text-black fill-[#FAFF00]" />}
                            </div>
                            {(creator.username || creator.display_name) && (
                              <div className="text-xs text-muted-foreground">
                                {creator.username ? `@${creator.username}` : formatAddress(creator.wallet_address)}
                              </div>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="p-4 align-middle text-right font-medium">
                        <NumberFlow value={creator.total_streams} />
                      </td>
                      <td className="p-4 align-middle text-right font-medium">
                        <NumberFlow value={creator.total_views} />
                      </td>
                      <td className="p-4 align-middle text-right font-medium">
                        <NumberFlow value={creator.total_followers} />
                      </td>
                      <td className="p-4 align-middle text-right text-muted-foreground">
                        {formatTimeShort(creator.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  )
}

