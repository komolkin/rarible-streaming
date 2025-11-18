"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Copy, Check, X } from "lucide-react"

interface ShareModalProps {
  streamId: string
  streamTitle: string
  isOpen: boolean
  onClose: () => void
}

export function ShareModal({ streamId, streamTitle, isOpen, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false)
  const streamUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/stream/${streamId}`
    : ""

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(streamUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy:", error)
    }
  }

  const handleShare = async (platform: string) => {
    const url = encodeURIComponent(streamUrl)
    const title = encodeURIComponent(streamTitle)
    
    let shareUrl = ""
    switch (platform) {
      case "twitter":
        shareUrl = `https://twitter.com/intent/tweet?url=${url}&text=${title}`
        break
      default:
        return
    }
    
    window.open(shareUrl, "_blank", "width=600,height=400")
  }

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in-0 duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-background rounded-lg shadow-lg p-6 w-full max-w-md mx-4 animate-in fade-in-0 zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium">Share Stream</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Stream URL</label>
            <div className="flex gap-2">
              <Input
                value={streamUrl}
                readOnly
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Share on</label>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => handleShare("twitter")}
                className="flex-1"
              >
                Twitter
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

