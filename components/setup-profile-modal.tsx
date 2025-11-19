"use client"

import { useState, useEffect, useRef } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { X, Upload, Camera } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useRouter, usePathname } from "next/navigation"

export function SetupProfileModal() {
  const { ready, authenticated, user } = usePrivy()
  const { toast } = useToast()
  const router = useRouter()
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checkingProfile, setCheckingProfile] = useState(false)
  const [formData, setFormData] = useState({
    username: "",
    displayName: "",
    bio: "",
    email: "",
  })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const hasCheckedProfile = useRef(false)

  useEffect(() => {
    if (!authenticated) {
      setIsOpen(false)
      hasCheckedProfile.current = false
    }
  }, [authenticated])

  useEffect(() => {
    if (ready && authenticated && user?.wallet?.address && !hasCheckedProfile.current) {
      checkProfile()
    }
  }, [ready, authenticated, user])

  const checkProfile = async () => {
    if (!user?.wallet?.address) return
    
    try {
      setCheckingProfile(true)
      const response = await fetch(`/api/profiles?wallet=${user.wallet.address}`)
      
      if (response.status === 404) {
        // No profile exists, show setup modal
        setIsOpen(true)
        // Pre-fill email if available from Privy
        if (user.email?.address) {
          setFormData(prev => ({ ...prev, email: user.email!.address }))
        }
      } else if (response.ok) {
        const data = await response.json()
        // If profile exists but no username (shouldn't happen if enforced, but good check), show modal
        if (!data.username) {
            setIsOpen(true)
            setFormData({
                username: "",
                displayName: data.displayName || "",
                bio: data.bio || "",
                email: data.email || "",
            })
        }
      }
      hasCheckedProfile.current = true
    } catch (error) {
      console.error("Error checking profile:", error)
    } finally {
      setCheckingProfile(false)
    }
  }

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'
      document.body.style.overflow = 'hidden'

      return () => {
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.width = ''
        document.body.style.overflow = ''
        window.scrollTo(0, scrollY)
      }
    }
  }, [isOpen])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAvatarFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeAvatar = () => {
    setAvatarFile(null)
    setAvatarPreview(null)
    if (avatarInputRef.current) {
      avatarInputRef.current.value = ""
    }
  }

  const uploadFile = async (file: File, bucket: string) => {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("bucket", bucket)

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      throw new Error("Failed to upload file")
    }

    const data = await response.json()
    return data.url
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const walletAddress = user?.wallet?.address
      if (!walletAddress) {
        throw new Error("No wallet address found")
      }

      let avatarUrl = ""

      if (avatarFile) {
        avatarUrl = await uploadFile(avatarFile, "avatars")
      }

      const response = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          username: formData.username,
          displayName: formData.displayName || null,
          bio: formData.bio || null,
          email: formData.email || null,
          avatarUrl: avatarUrl || null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to create profile")
      }

      toast({
        title: "Success",
        description: "Profile created successfully",
      })

      // Dispatch custom event to notify navbar/other components
      window.dispatchEvent(new CustomEvent('profileUpdated', { 
        detail: { 
            avatarUrl: avatarUrl || null, 
            walletAddress: walletAddress.toLowerCase() 
        } 
      }))

      setIsOpen(false)
      router.refresh()
      
      // Redirect to profile page if we are on setup page
      if (pathname === '/setup') {
          router.push(`/profile/${walletAddress}`)
      }

    } catch (error: any) {
      console.error("Error setting up profile:", error)
      toast({
        title: "Error",
        description: error?.message || "Failed to set up profile",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in-0 duration-200 overflow-y-auto py-8"
    >
      <div 
        className="bg-background rounded-lg shadow-lg w-full max-w-lg mx-4 flex flex-col animate-in fade-in-0 zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">Setup Profile</h2>
            <p className="text-sm text-muted-foreground mt-1">
                Please set up your profile to continue.
            </p>
          </div>
          {/* Only allow closing if we are not strictly enforcing (optional, but good UX to allow closing if they want to disconnect or just look around, though the prompt implied it's for new users) 
              But since username is required and this is "Setup Profile" for "new users", maybe we shouldn't let them close it easily without filling it?
              Let's allow close for now to avoid being annoying, or maybe not? 
              "Username is not optional" refers to the field.
              I'll add a close button but maybe emphasize it's needed.
          */}
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(100vh-200px)]">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Avatar Upload */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Profile Picture</Label>
                <div className="flex items-start gap-6">
                  <div className="relative group">
                    <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-border bg-muted">
                      <Avatar className="h-full w-full">
                        <AvatarImage src={avatarPreview || ""} />
                        <AvatarFallback 
                          seed={user?.wallet?.address?.toLowerCase()} 
                          className={!avatarPreview ? "!bg-transparent" : ""}
                        />
                      </Avatar>
                      {/* Hover Overlay */}
                      <div
                        onClick={() => avatarInputRef.current?.click()}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                      >
                        <Camera className="h-5 w-5 text-white" />
                      </div>
                    </div>
                    {avatarPreview && (
                        <button
                            type="button"
                            onClick={removeAvatar}
                            className="absolute -top-1 -right-1 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 transition-colors shadow-sm"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col justify-center gap-2">
                    <p className="text-sm text-muted-foreground">
                        Recommended: Square, max 5MB
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => avatarInputRef.current?.click()}
                        className="w-fit"
                    >
                        <Upload className="h-3 w-3 mr-2" />
                        {avatarPreview ? "Change Photo" : "Upload Photo"}
                    </Button>
                    <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="hidden"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="setup-username">Username <span className="text-red-500">*</span></Label>
                <Input
                  id="setup-username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  placeholder="Enter username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="setup-displayName">Display Name</Label>
                <Input
                  id="setup-displayName"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="Enter display name"
                />
              </div>

              {/* Bio is not mentioned in requirement "Userpic, username, Display name, email" but it's in schema. 
                  The prompt said "Username is not optional, all the rest is optional." and "Like we have on the 'Edit Profile'".
                  I will skip Bio as it wasn't explicitly requested, but Edit Profile has it. 
                  "ask them to provide Userpic, username, Display name, email" -> Explicit list.
              */}
              {/* <div className="space-y-2">
                <Label htmlFor="setup-bio">Bio</Label>
                <Textarea
                  id="setup-bio"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  rows={3}
                />
              </div> */}

              <div className="space-y-2">
                <Label htmlFor="setup-email">Email (optional)</Label>
                <Input
                  id="setup-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="your.email@example.com"
                />
              </div>

              <div className="flex justify-end gap-4 pt-2">
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving..." : "Save Profile"}
                </Button>
              </div>
            </form>
        </div>
      </div>
    </div>
  )
}

