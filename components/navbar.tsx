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
import { Bell, Plus, User, Settings, LogOut, Menu, X } from "lucide-react"

export function Navbar() {
  const { authenticated, ready, user, login, logout } = usePrivy()
  const router = useRouter()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
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

  // Fetch user profile to get avatar URL
  useEffect(() => {
    if (authenticated && user?.wallet?.address) {
      const fetchUserProfile = async () => {
        try {
          const walletAddress = user?.wallet?.address
          if (!walletAddress) return
          
          const response = await fetch(`/api/profiles?wallet=${walletAddress}`)
          if (response.ok) {
            const profile = await response.json()
            setUserAvatarUrl(profile.avatarUrl || null)
          }
        } catch (error) {
          console.error("Error fetching user profile for navbar:", error)
        }
      }
      fetchUserProfile()
    } else {
      setUserAvatarUrl(null)
    }
  }, [authenticated, user?.wallet?.address])

  // Refresh avatar when page becomes visible or window regains focus (e.g., after editing profile)
  useEffect(() => {
    const refreshAvatar = () => {
      if (authenticated && user?.wallet?.address) {
        const walletAddress = user?.wallet?.address
        if (!walletAddress) return
        
        fetch(`/api/profiles?wallet=${walletAddress}`)
          .then(res => res.ok ? res.json() : null)
          .then(profile => {
            if (profile) {
              setUserAvatarUrl(profile.avatarUrl || null)
            }
          })
          .catch(err => console.error("Error refreshing avatar:", err))
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshAvatar()
      }
    }

    const handleFocus = () => {
      refreshAvatar()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [authenticated, user?.wallet?.address])

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
      <div className="w-full px-3 sm:px-4 lg:px-8">
        <div className="flex justify-between items-center h-14 sm:h-16 gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/" className="text-lg sm:text-xl font-bold whitespace-nowrap">
              Rarible
            </Link>
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-baseline space-x-4 ml-[32px]">
              <Link href="/" className="text-sm font-medium hover:opacity-80 transition-opacity">
                Home
              </Link>
              <Link href="/browse" className="text-sm font-medium hover:opacity-80 transition-opacity">
                Browse
              </Link>
            </div>
          </div>
          
          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center gap-2">
            {ready && authenticated && (
              <Link href="/create">
                <Button size="sm" className="rounded-lg h-8 px-2">
                  <Plus className="h-4 w-4" />
                </Button>
              </Link>
            )}
            {ready && !authenticated && (
              <Button onClick={login} size="sm" className="text-sm h-8 px-3">
                Sign In
              </Button>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center">
            {ready && (
              <>
                {authenticated ? (
                  <div className="flex items-center gap-2 lg:gap-3">
                    <Link href="/create">
                      <Button className="bg-white text-black hover:bg-gray-100 rounded-lg h-10">
                        <span className="hidden lg:inline">Launch Stream</span>
                        <span className="lg:hidden">Launch</span>
                      </Button>
                    </Link>
                    <div
                      onMouseEnter={handleMouseEnter}
                      onMouseLeave={handleMouseLeave}
                      className="relative flex items-center"
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
                            className="outline-none flex items-center" 
                            onMouseEnter={handleMouseEnter}
                            onClick={(e) => {
                              // Navigate to profile on click
                              if (user?.wallet?.address) {
                                router.push(`/profile/${user.wallet.address}`)
                              }
                            }}
                          >
                            <Avatar className="cursor-pointer hover:opacity-80 transition-opacity h-10 w-10">
                              {user?.wallet?.address && (
                                <>
                                  {userAvatarUrl && (
                                    <AvatarImage 
                                      src={userAvatarUrl}
                                      alt="Profile"
                                      key={userAvatarUrl}
                                    />
                                  )}
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
                              Profile
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/profile/${user?.wallet?.address}/edit`} className="cursor-pointer">
                              Edit Profile
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={logout} className="cursor-pointer">
                            Sign Out
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ) : (
                  <Button onClick={login} size="sm" className="text-sm">Sign In</Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t py-4 space-y-3">
            <Link 
              href="/" 
              className="block px-3 py-2 text-sm font-medium hover:bg-muted rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Home
            </Link>
            <Link 
              href="/browse" 
              className="block px-3 py-2 text-sm font-medium hover:bg-muted rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Browse
            </Link>
            {ready && authenticated && (
              <>
                <Link 
                  href="/create" 
                  className="block px-3 py-2 text-sm font-medium hover:bg-muted rounded-lg transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Launch Stream
                </Link>
                <Link 
                  href={`/profile/${user?.wallet?.address}`}
                  className="block px-3 py-2 text-sm font-medium hover:bg-muted rounded-lg transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Profile
                </Link>
                <Link 
                  href={`/profile/${user?.wallet?.address}/edit`}
                  className="block px-3 py-2 text-sm font-medium hover:bg-muted rounded-lg transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Edit Profile
                </Link>
                <button
                  onClick={() => {
                    logout()
                    setMobileMenuOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 text-sm font-medium hover:bg-muted rounded-lg transition-colors"
                >
                  Sign Out
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}

