"use client"

import { useState, useRef } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { X, Upload, Camera } from "lucide-react"

export default function SetupProfilePage() {
  const { ready, authenticated, user } = usePrivy()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    username: "",
    displayName: "",
    bio: "",
    email: "",
  })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Show the form structure immediately, handle auth state within
  if (!authenticated || !ready) {
    return (
      <main className="min-h-screen pt-24 pb-8 px-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Set Up Your Profile</CardTitle>
              <CardDescription>
                {!ready ? "Loading..." : "Please connect your wallet to set up your profile"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-8">
                {/* Avatar Upload */}
                <div className="space-y-3">
                  <Label className="text-base font-medium">Profile Picture</Label>
                  <div className="flex items-start gap-6">
                    <div className="relative group">
                      <div className="relative w-32 h-32 rounded-full overflow-hidden border-2 border-border opacity-50">
                        <Avatar className="h-full w-full">
                          <AvatarFallback seed={(user?.wallet?.address || "").toLowerCase()} />
                        </Avatar>
                      </div>
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
                      <Button type="button" variant="outline" disabled className="w-fit">
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Photo
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" disabled placeholder="Connect wallet to continue" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input id="displayName" disabled placeholder="Connect wallet to continue" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea id="bio" disabled placeholder="Connect wallet to continue" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email (optional)</Label>
                  <Input id="email" type="email" disabled placeholder="Connect wallet to continue" />
                </div>
                <Button type="button" disabled>
                  Connect Wallet to Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

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
          username: formData.username || null,
          displayName: formData.displayName || null,
          bio: formData.bio || null,
          email: formData.email || null,
          avatarUrl: avatarUrl || null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || `Failed to create profile (${response.status})`
        console.error("Profile API error:", errorData)
        throw new Error(errorMessage)
      }

      // Dispatch custom event to notify navbar of avatar update
      window.dispatchEvent(new CustomEvent('profileUpdated', { 
        detail: { avatarUrl: avatarUrl || null, walletAddress: walletAddress.toLowerCase() } 
      }))

      router.push(`/profile/${walletAddress}`)
    } catch (error: any) {
      console.error("Error setting up profile:", error)
      const errorMessage = error?.message || "Failed to set up profile"
      alert(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen pt-24 pb-8 px-8">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Set Up Your Profile</CardTitle>
            <CardDescription>
              Complete your profile to start streaming
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Avatar Upload */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Profile Picture</Label>
                <div className="flex items-start gap-6">
                  <div className="relative group">
                    <div className="relative w-32 h-32 rounded-full overflow-hidden border-2 border-border">
                      <Avatar className="h-full w-full">
                        <AvatarImage src={avatarPreview || ""} />
                        <AvatarFallback 
                          seed={avatarPreview ? user?.wallet?.address : undefined}
                          className={!avatarPreview ? "!bg-transparent" : ""}
                        />
                      </Avatar>
                      {/* Hover Overlay */}
                      <div
                        onClick={() => avatarInputRef.current?.click()}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                      >
                        <Camera className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    {avatarPreview && (
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
                        {avatarPreview ? "Change Photo" : "Upload Photo"}
                      </Button>
                      {avatarPreview && (
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
                  required
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

              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Profile"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

