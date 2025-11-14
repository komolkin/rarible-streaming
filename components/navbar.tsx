"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { usePrivy } from "@privy-io/react-auth"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Bell, Plus, User, Settings, LogOut } from "lucide-react"

export function Navbar() {
  const { authenticated, ready, user, login, logout } = usePrivy()
  const router = useRouter()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  const handleMouseEnter = useCallback(() => {
    // Clear any pending close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    setDropdownOpen(true)
  }, [])
  
  const handleMouseLeave = useCallback(() => {
    // Add a small delay before closing to prevent blinking when moving between trigger and content
    closeTimeoutRef.current = setTimeout(() => {
      setDropdownOpen(false)
      closeTimeoutRef.current = null
    }, 150) // 150ms delay
  }, [])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-4">
          <div className="flex items-center">
            <Link href="/" className="text-xl font-bold">
              Rarible Streaming
            </Link>
            <div className="ml-10 flex items-baseline space-x-4">
              <Link href="/" className="text-sm font-medium hover:opacity-80 transition-opacity">
                Home
              </Link>
              <Link href="/browse" className="text-sm font-medium hover:opacity-80 transition-opacity">
                Browse
              </Link>
            </div>
          </div>
          <div className="flex items-center">
            {ready && (
              <>
                {authenticated ? (
                  <div className="flex items-center gap-3">
                    <Link href="/create">
                      <Button className="rounded-lg">
                        <Plus className="h-4 w-4 mr-2" />
                        Launch Stream
                      </Button>
                    </Link>
                    <button
                      disabled
                      className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Notifications"
                    >
                      <Bell className="h-5 w-5" />
                    </button>
                    <div
                      onMouseEnter={handleMouseEnter}
                      onMouseLeave={handleMouseLeave}
                      className="relative"
                    >
                      <DropdownMenu 
                        open={dropdownOpen} 
                        onOpenChange={(open) => {
                          // Clear timeout if manually closing
                          if (closeTimeoutRef.current) {
                            clearTimeout(closeTimeoutRef.current)
                            closeTimeoutRef.current = null
                          }
                          setDropdownOpen(open)
                        }}
                        modal={false}
                      >
                        <DropdownMenuTrigger asChild>
                          <button 
                            className="outline-none" 
                            onMouseEnter={handleMouseEnter}
                            onClick={(e) => {
                              // Navigate to profile on click
                              if (user?.wallet?.address) {
                                router.push(`/profile/${user.wallet.address}`)
                              }
                            }}
                          >
                            <Avatar className="cursor-pointer hover:opacity-80 transition-opacity">
                              {user?.wallet?.address && (
                                <>
                                  {/* Avatar image would come from user profile if available */}
                                  <AvatarFallback seed={(user.wallet.address || "").toLowerCase()} />
                                </>
                              )}
                            </Avatar>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent 
                          align="end" 
                          className="w-56" 
                          onMouseEnter={handleMouseEnter}
                          onMouseLeave={handleMouseLeave}
                          sideOffset={4}
                        >
                          <DropdownMenuItem asChild>
                            <Link href={`/profile/${user?.wallet?.address}`} className="cursor-pointer">
                              <User className="mr-2 h-4 w-4" />
                              Profile
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/profile/${user?.wallet?.address}/edit`} className="cursor-pointer">
                              <Settings className="mr-2 h-4 w-4" />
                              Edit Profile
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={logout} className="cursor-pointer">
                            <LogOut className="mr-2 h-4 w-4" />
                            Sign Out
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ) : (
                  <Button onClick={login}>Sign In</Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}

