"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { usePrivy } from "@privy-io/react-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { X, Upload, Camera } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

export default function EditProfilePage() {
  const params = useParams()
  const router = useRouter()
  const { ready, authenticated, user } = usePrivy()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [formData, setFormData] = useState({
    username: "",
    displayName: "",
    bio: "",
    email: "",
  })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(null)
  const [avatarRemoved, setAvatarRemoved] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ready && authenticated && params.address) {
      fetchProfile()
    }
  }, [ready, authenticated, params.address])

  const fetchProfile = async () => {
    try {
      const response = await fetch(`/api/profiles?wallet=${params.address}`)
      if (response.ok) {
        const data = await response.json()
        setFormData({
          username: data.username || "",
          displayName: data.displayName || "",
          bio: data.bio || "",
          email: data.email || "",
        })
        setCurrentAvatarUrl(data.avatarUrl)
        setAvatarRemoved(false) // Reset removal flag when loading profile
      } else if (response.status === 404) {
        // No profile exists yet, redirect to setup
        router.push("/setup")
      }
    } catch (error) {
      console.error("Error fetching profile:", error)
      toast({
        title: "Error",
        description: "Failed to load profile",
        variant: "destructive",
      })
    } finally {
      setProfileLoading(false)
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center px-8">
        <Card>
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>
              Please connect your wallet to edit your profile
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (user?.wallet?.address?.toLowerCase() !== params.address?.toString().toLowerCase()) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center px-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You can only edit your own profile
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (profileLoading) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin"></div>
      </div>
    )
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAvatarFile(file)
      setAvatarRemoved(false) // Reset removal flag when new file is selected
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
    setCurrentAvatarUrl(null)
    setAvatarRemoved(true)
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

      let avatarUrl: string | null = null

      // If avatar was removed, set to null
      if (avatarRemoved && !avatarFile) {
        avatarUrl = null
      } else if (avatarFile) {
        // Upload new avatar if provided
        avatarUrl = await uploadFile(avatarFile, "avatars")
      } else {
        // Keep existing avatar if not removed and no new file
        avatarUrl = currentAvatarUrl || null
      }

      // Normalize wallet address to lowercase for consistency
      const normalizedWalletAddress = walletAddress?.toLowerCase()

      const response = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: normalizedWalletAddress,
          username: formData.username || null,
          displayName: formData.displayName || null,
          bio: formData.bio || null,
          email: formData.email || null,
          avatarUrl: avatarUrl || null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to update profile")
      }

      toast({
        title: "Success",
        description: "Profile updated successfully",
      })

      // Refresh the router cache and navigate to profile
      router.refresh()
      router.push(`/profile/${walletAddress}`)
    } catch (error: any) {
      console.error("Error updating profile:", error)
      toast({
        title: "Error",
        description: error?.message || "Failed to update profile",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen pt-24 pb-8 px-8">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Edit Profile</CardTitle>
            <CardDescription>
              Update your profile information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Avatar Upload */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Profile Picture</Label>
                <div className="flex items-start gap-6">
                  <div className="relative group">
                    <div className="relative w-32 h-32 rounded-full overflow-hidden border-2 border-border bg-muted">
                      <Avatar className="h-full w-full">
                        <AvatarImage src={avatarPreview || currentAvatarUrl || ""} />
                        {!(avatarPreview || currentAvatarUrl) && (
                          <AvatarFallback />
                        )}
                      </Avatar>
                      {/* Hover Overlay */}
                      <div
                        onClick={() => avatarInputRef.current?.click()}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                      >
                        <Camera className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    {(avatarPreview || currentAvatarUrl) && (
                      <button
                        type="button"
                        onClick={removeAvatar}
                        className="absolute -top-2 -right-2 p-1.5 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 transition-colors shadow-lg"
                        aria-label="Remove avatar"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col justify-center gap-3">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        Recommended: Square image, at least 400x400 pixels
                      </p>
                      <p className="text-xs text-muted-foreground">
                        JPG, PNG or GIF. Max size 5MB
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => avatarInputRef.current?.click()}
                        className="w-fit"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {avatarPreview || currentAvatarUrl ? "Change Photo" : "Upload Photo"}
                      </Button>
                      {(avatarPreview || currentAvatarUrl) && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={removeAvatar}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="your.email@example.com"
                />
              </div>

              <div className="flex gap-4">
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving..." : "Save Changes"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

