"use client"

import { useEffect, useRef, useState } from "react"
import Hls from "hls.js"

// Helper function to check if URL is HLS/M3U8
export function isHlsUrl(url: string): boolean {
  if (!url) return false
  return (
    url.includes(".m3u8") ||
    url.includes("m3u8") ||
    url.includes("application/vnd.apple.mpegurl") ||
    url.includes("application/x-mpegURL")
  )
}

interface HlsVideoPlayerProps {
  src: string
  className?: string
  autoPlay?: boolean
  onError?: (error: Error) => void
}

export function HlsVideoPlayer({ 
  src, 
  className = "", 
  autoPlay = false,
  onError 
}: HlsVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Validate that src is an HLS URL
    if (!isHlsUrl(src)) {
      const errorMsg = `Invalid HLS URL provided: ${src}. HlsVideoPlayer only supports HLS/M3U8 streams.`
      console.error(errorMsg)
      setError(errorMsg)
      setIsLoading(false)
      onError?.(new Error(errorMsg))
      return
    }

    console.log("HLS Video Player: Loading source:", src)

    // Store event handlers for proper cleanup
    const handleLoadedMetadata = () => {
      console.log("HLS metadata loaded")
      setIsLoading(false)
    }

    const handleCanPlay = () => {
      console.log("HLS can play")
      setIsLoading(false)
    }

    const handleError = (e: Event) => {
      console.error("Native HLS error:", e, video.error)
      const errorMsg = `Failed to load video: ${video.error?.message || "Unknown error"}`
      setError(errorMsg)
      setIsLoading(false)
      onError?.(new Error(errorMsg))
    }

    // Check if browser supports HLS natively (Safari)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      console.log("Using native HLS support (Safari)")
      video.src = src
      video.addEventListener("loadedmetadata", handleLoadedMetadata)
      video.addEventListener("canplay", handleCanPlay)
      video.addEventListener("error", handleError)
      
      return () => {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata)
        video.removeEventListener("canplay", handleCanPlay)
        video.removeEventListener("error", handleError)
        video.src = "" // Clear source on cleanup
      }
    }

    // Use HLS.js for browsers that don't support HLS natively
    if (Hls.isSupported()) {
      console.log("Using HLS.js for playback")
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        debug: true, // Enable debug logging
      })

      hlsRef.current = hls

      hls.loadSource(src)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log("HLS manifest parsed successfully")
        setIsLoading(false)
        if (autoPlay) {
          video.play().catch((err) => {
            console.error("Autoplay failed:", err)
          })
        }
      })

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error("HLS error event:", data)
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error("HLS network error, trying to recover...", data)
              // Try to recover from network errors
              if (data.details === "manifestLoadError" || data.details === "manifestParsingError") {
                // If manifest can't be loaded, it's likely a URL issue
                const errorMsg = `Cannot load video manifest. Please check if the recording is available.`
                setError(errorMsg)
                setIsLoading(false)
                hls.destroy()
                onError?.(new Error(errorMsg))
              } else {
                hls.startLoad()
              }
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error("HLS media error, trying to recover...", data)
              hls.recoverMediaError()
              break
            default:
              console.error("HLS fatal error, destroying instance", data)
              const errorMsg = `HLS playback error: ${data.type}${data.details ? ` - ${data.details}` : ""}${data.url ? ` (URL: ${data.url})` : ""}`
              setError(errorMsg)
              setIsLoading(false)
              hls.destroy()
              onError?.(new Error(errorMsg))
              break
          }
        } else {
          // Non-fatal errors - just log them
          console.warn("HLS non-fatal error:", data)
        }
      })

      return () => {
        if (hlsRef.current) {
          hlsRef.current.destroy()
          hlsRef.current = null
        }
        // Clear video source on cleanup
        if (video) {
          video.src = ""
        }
      }
    } else {
      console.warn("HLS.js not supported, trying native video element")
      // Fallback: try to use native video element
      const handleFallbackLoadedMetadata = () => {
        setIsLoading(false)
      }
      
      const handleFallbackError = (e: Event) => {
        const errorMsg = `HLS is not supported in this browser: ${video.error?.message || ""}`
        setError(errorMsg)
        setIsLoading(false)
        onError?.(new Error(errorMsg))
      }
      
      video.src = src
      video.addEventListener("loadedmetadata", handleFallbackLoadedMetadata)
      video.addEventListener("error", handleFallbackError)
      
      return () => {
        video.removeEventListener("loadedmetadata", handleFallbackLoadedMetadata)
        video.removeEventListener("error", handleFallbackError)
        video.src = "" // Clear source on cleanup
      }
    }
  }, [src, autoPlay, onError])

  if (error) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-black ${className}`}>
        <div className="text-center text-white px-4">
          <p className="text-lg mb-2">Video playback error</p>
          <p className="text-sm text-gray-400 mb-4">{error}</p>
          <p className="text-xs text-gray-500">
            Source: {src}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            The recording may still be processing. Please try again in a few minutes.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`w-full h-full relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="text-white">Loading video...</div>
        </div>
      )}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls
        playsInline
        preload="metadata"
      />
    </div>
  )
}

