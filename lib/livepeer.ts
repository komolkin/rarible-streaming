const LIVEPEER_API_KEY = process.env.LIVEPEER_API_KEY!

export async function createStream(name: string) {
  if (!LIVEPEER_API_KEY) {
    throw new Error("LIVEPEER_API_KEY is not set")
  }

  const response = await fetch("https://livepeer.studio/api/stream", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LIVEPEER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      record: true,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error("Livepeer API error:", response.status, errorText)
    throw new Error(`Failed to create stream: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  return data
}

export async function getStream(streamId: string) {
  if (!LIVEPEER_API_KEY) {
    throw new Error("LIVEPEER_API_KEY is not set")
  }

  const response = await fetch(`https://livepeer.studio/api/stream/${streamId}`, {
    headers: {
      Authorization: `Bearer ${LIVEPEER_API_KEY}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error("Livepeer API error:", response.status, errorText)
    throw new Error(`Failed to get stream: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  
  // Extract playbackId from various possible locations
  // Livepeer API v2 structure: { id, playbackId, streamKey, ... }
  // Or nested: { id, playback: { id }, ... }
  const playbackId = data.playbackId || data.playback?.id || data.playbackId
  
  return {
    ...data,
    playbackId, // Ensure playbackId is at top level
  }
}

/**
 * Fetch recent sessions for a Livepeer stream.
 * Sessions include recording metadata that becomes available immediately after a stream ends.
 */
export async function getStreamSessions(
  streamId: string,
  options?: {
    limit?: number
    recordOnly?: boolean
  }
) {
  if (!LIVEPEER_API_KEY) {
    throw new Error("LIVEPEER_API_KEY is not set")
  }

  const limit = options?.limit ?? 20
  const recordOnly = options?.recordOnly ?? true

  try {
    const url = new URL(`https://livepeer.studio/api/stream/${streamId}/sessions`)
    url.searchParams.set("limit", limit.toString())

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${LIVEPEER_API_KEY}`,
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`[getStreamSessions] No sessions found for stream ${streamId} (404)`)
        return []
      }

      const errorText = await response.text().catch(() => "")
      console.error(`[getStreamSessions] API error ${response.status}:`, errorText)
      return []
    }

    const data = await response.json()
    let sessions: any[] = []

    if (Array.isArray(data)) {
      sessions = data
    } else if (Array.isArray(data?.data)) {
      sessions = data.data
    } else if (Array.isArray(data?.sessions)) {
      sessions = data.sessions
    } else {
      console.warn(`[getStreamSessions] Unexpected response format for stream ${streamId}`)
      sessions = []
    }

    const filteredSessions = sessions.filter((session: any) => {
      if (!recordOnly) {
        return true
      }
      return (
        session?.record === true ||
        !!session?.recordingUrl ||
        !!session?.playbackUrl ||
        !!session?.playback?.hls
      )
    })

    filteredSessions.sort((a: any, b: any) => {
      const aTime = a?.createdAt || a?.createdAtTimestamp || a?.created || 0
      const bTime = b?.createdAt || b?.createdAtTimestamp || b?.created || 0

      const aDate = typeof aTime === "string" ? Date.parse(aTime) : Number(aTime) || 0
      const bDate = typeof bTime === "string" ? Date.parse(bTime) : Number(bTime) || 0

      return bDate - aDate
    })

    return filteredSessions
  } catch (error) {
    console.error(`[getStreamSessions] Error fetching sessions for stream ${streamId}:`, error)
    return []
  }
}

export async function getStreamStatus(streamId: string) {
  try {
    const stream = await getStream(streamId)
    
    // Debug: log the full stream object structure (but limit size)
    const streamSummary = {
      id: stream?.id,
      playbackId: stream?.playbackId,
      isActive: stream?.isActive,
      isRecording: stream?.isRecording,
      sessionsCount: stream?.sessions?.length || 0,
      sessionStatuses: stream?.sessions?.map((s: any) => s.status) || [],
      sessionIds: stream?.sessions?.map((s: any) => s.id) || [],
    }
    console.log("Livepeer stream response summary:", JSON.stringify(streamSummary, null, 2))
    
    // Livepeer stream is active if it has active sessions
    // Check if there are any sessions with status "ready" or "active" or "streaming"
    const hasActiveSession = stream?.sessions?.some((session: any) => 
      session.status === "ready" || 
      session.status === "active" || 
      session.status === "streaming" ||
      session.record === true // Recording session means stream is active
    ) || false
    
    // Check the stream's isActive property
    const streamIsActive = stream?.isActive === true
    
    // Check if recording (which means stream is active)
    const isRecording = stream?.isRecording === true
    
    // If stream has sessions, it's likely active (even if status isn't set)
    const hasSessions = (stream?.sessions?.length || 0) > 0
    
    // Check if stream is receiving data (sourceSegmentsDuration > 0 means OBS is sending data)
    // Note: This can be 0 even when streaming if it just started
    const isReceivingData = (stream?.sourceSegmentsDuration || 0) > 0
    
    // Check if stream has been active recently (lastSeen > 0 means recent activity)
    // lastSeen is a timestamp in milliseconds (Unix timestamp), check if it's within last 5 minutes
    // Note: Livepeer's lastSeen might be 0 even when streaming just started
    const lastSeenMs = stream?.lastSeen || 0
    const nowMs = Date.now()
    // Convert lastSeen to milliseconds if it's in seconds (check both formats)
    const lastSeenTimestamp = lastSeenMs > 1000000000000 ? lastSeenMs : lastSeenMs * 1000
    const hasRecentActivity = lastSeenMs > 0 && (nowMs - lastSeenTimestamp) < 300000 // Active within last 5 minutes
    
    // Final determination: stream is active if any of these are true
    // IMPORTANT: If stream is receiving data or has recent activity, it's active
    // This catches the case where OBS is streaming but Livepeer hasn't marked it as active yet
    const finalIsActive = Boolean(
      streamIsActive || 
      hasActiveSession || 
      isRecording || 
      hasSessions || 
      isReceivingData || 
      hasRecentActivity
    )
    
    // Fetch viewer count if we have a playbackId
    let viewerCount = 0
    if (stream?.playbackId) {
      try {
        // Call getViewerCount directly (it's defined in the same file, so no circular dependency)
        viewerCount = await getViewerCount(stream.playbackId)
      } catch (error) {
        console.warn("Could not fetch viewer count:", error)
        // Continue without viewer count
      }
    }
    
    console.log("Stream status check:", {
      streamId,
      streamIsActive,
      hasActiveSession,
      isRecording,
      hasSessions,
      isReceivingData,
      hasRecentActivity,
      sessionsCount: stream?.sessions?.length || 0,
      sessionStatuses: stream?.sessions?.map((s: any) => s.status) || [],
      sessionDetails: stream?.sessions?.map((s: any) => ({
        id: s.id,
        status: s.status,
        record: s.record,
        sourceSegmentsDuration: s.sourceSegmentsDuration,
        transcodedSegmentsDuration: s.transcodedSegmentsDuration
      })) || [],
      sourceSegmentsDuration: stream?.sourceSegmentsDuration,
      lastSeen: stream?.lastSeen,
      finalIsActive,
      playbackId: stream?.playbackId,
      viewerCount
    })
    
    return { isActive: finalIsActive, stream, viewerCount }
  } catch (error: any) {
    console.error("Error checking stream status:", error?.message || error)
    return { isActive: false, stream: null }
  }
}

/**
 * Wait for Livepeer to process the recording/VOD after stream ends
 * Livepeer automatically creates VODs from recorded streams, accessible via playbackId
 */
export async function waitForVOD(playbackId: string, maxWaitTime = 30000, checkInterval = 2000): Promise<boolean> {
  if (!LIVEPEER_API_KEY) {
    throw new Error("LIVEPEER_API_KEY is not set")
  }

  const startTime = Date.now()
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      // Check if VOD is available by fetching playback info
      const response = await fetch(`https://livepeer.studio/api/playback/${playbackId}`, {
        headers: {
          Authorization: `Bearer ${LIVEPEER_API_KEY}`,
        },
      })

      if (response.ok) {
        const playbackInfo = await response.json()
        // If we get playback info, VOD is available
        if (playbackInfo && playbackInfo.type === "vod") {
          console.log(`VOD is available for playbackId: ${playbackId}`)
          return true
        }
        // If type is "live" but stream has ended, wait a bit more
        if (playbackInfo && playbackInfo.type === "live") {
          console.log(`Still processing VOD for playbackId: ${playbackId}, waiting...`)
        }
      }
    } catch (error) {
      console.error("Error checking VOD availability:", error)
    }

    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, checkInterval))
  }

  console.log(`VOD check timeout for playbackId: ${playbackId}`)
  // Even if we timeout, the VOD might still be available - Livepeer processes recordings asynchronously
  // The playbackId can still be used for VOD playback
  return false
}

/**
 * Get recording/asset information from Livepeer for a stream
 */
export async function getStreamRecording(streamId: string) {
  if (!LIVEPEER_API_KEY) {
    throw new Error("LIVEPEER_API_KEY is not set")
  }

  try {
    // Sessions endpoint surfaces recordings almost immediately after the stream ends
    const sessions = await getStreamSessions(streamId, { limit: 10, recordOnly: true })

    if (sessions && sessions.length > 0) {
      for (const session of sessions) {
        const recordingUrl =
          session.recordingUrl ||
          session.playbackUrl ||
          session?.playback?.hls ||
          session?.playback?.url ||
          session?.mp4Url

        if (recordingUrl) {
          return {
            id: session.id,
            recordingUrl,
            playbackUrl: recordingUrl,
            playbackId: session.playbackId || session?.playback?.id,
            duration: session.duration || session?.recordingDuration,
            createdAt: session.createdAt,
          }
        }
      }
    }

    const stream = await getStream(streamId)
    
    // Check for recordings in the stream response
    if (stream?.recordings && stream.recordings.length > 0) {
      return stream.recordings[0] // Return the latest recording
    }
    
    // Check sessions for recordings
    if (stream?.sessions) {
      for (const session of stream.sessions) {
        if (session.record && session.recordingUrl) {
          return {
            id: session.id,
            recordingUrl: session.recordingUrl,
            playbackUrl: session.playbackUrl,
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error("Error fetching stream recording:", error)
    return null
  }
}

/**
 * Get thumbnail URL from Livepeer playback info API
 * This is the preferred method as it gets the actual thumbnail URL from Livepeer
 * Works for both live streams and VOD assets
 */
export async function getThumbnailUrlFromPlaybackInfo(playbackId: string): Promise<string | null> {
  if (!playbackId) {
    return null
  }

  try {
    const playbackInfo = await getPlaybackInfo(playbackId)
    
    // Check multiple possible locations for thumbnail URL in playback info
    
    // 1. Check meta.thumbnail (direct thumbnail URL)
    if (playbackInfo?.meta?.thumbnail) {
      console.log(`[Thumbnail] Found thumbnail in meta.thumbnail: ${playbackInfo.meta.thumbnail}`)
      return playbackInfo.meta.thumbnail
    }
    
    // 2. Check meta.source array for PNG thumbnail (live streams)
    if (playbackInfo?.meta?.source && Array.isArray(playbackInfo.meta.source)) {
      const pngSource = playbackInfo.meta.source.find(
        (s: any) => s?.type === "image/png" || s?.hrn === "Thumbnail (PNG)"
      )
      if (pngSource?.url) {
        console.log(`[Thumbnail] Found PNG thumbnail in meta.source: ${pngSource.url}`)
        return pngSource.url
      }
    }
    
    // 3. Check top-level source array for PNG thumbnail
    if (playbackInfo?.source && Array.isArray(playbackInfo.source)) {
      const pngSource = playbackInfo.source.find(
        (s: any) => s?.type === "image/png" || s?.hrn === "Thumbnail (PNG)"
      )
      if (pngSource?.url) {
        console.log(`[Thumbnail] Found PNG thumbnail in source: ${pngSource.url}`)
        return pngSource.url
      }
    }
    
    // 4. For VOD assets, check for thumbnail in VTT file or other sources
    // VOD thumbnails might be in different formats
    if (playbackInfo?.source && Array.isArray(playbackInfo.source)) {
      // Look for any image source
      const imageSource = playbackInfo.source.find(
        (s: any) => s?.type?.startsWith("image/") || s?.url?.includes("thumbnail")
      )
      if (imageSource?.url) {
        console.log(`[Thumbnail] Found image source in playback info: ${imageSource.url}`)
        return imageSource.url
      }
    }
    
    // 5. Check for thumbnail in recordings array (for VOD)
    if (playbackInfo?.recordings && Array.isArray(playbackInfo.recordings)) {
      for (const recording of playbackInfo.recordings) {
        if (recording?.thumbnail) {
          console.log(`[Thumbnail] Found thumbnail in recording: ${recording.thumbnail}`)
          return recording.thumbnail
        }
      }
    }
    
    // Log the structure for debugging if no thumbnail found
    console.log(`[Thumbnail] No thumbnail found in playback info. Structure:`, {
      hasMeta: !!playbackInfo?.meta,
      hasSource: !!playbackInfo?.source,
      sourceLength: Array.isArray(playbackInfo?.source) ? playbackInfo.source.length : 0,
      metaSourceLength: Array.isArray(playbackInfo?.meta?.source) ? playbackInfo.meta.source.length : 0,
      type: playbackInfo?.type,
    })
    
    return null
  } catch (error) {
    console.warn(`[Thumbnail] Could not get thumbnail from playback info for ${playbackId}:`, error)
    return null
  }
}

/**
 * Fetch the auto-updating thumbnail URL for a live stream from playback info.
 * Livepeer exposes a PNG source in the playback info response for live streams.
 */
export async function getLiveThumbnailUrl(playbackId: string): Promise<string | null> {
  if (!playbackId) return null

  try {
    const playbackInfo = await getPlaybackInfo(playbackId)
    const sources =
      playbackInfo?.meta?.source ||
      playbackInfo?.source ||
      []

    if (Array.isArray(sources)) {
      const pngSource = sources.find(
        (source: any) =>
          source?.type === "image/png" ||
          source?.hrn === "Thumbnail (PNG)"
      )

      if (pngSource?.url) {
        return pngSource.url as string
      }
    }
  } catch (error) {
    console.warn(`[Thumbnail] Could not get live thumbnail from playback info for ${playbackId}:`, error)
  }

  return null
}

/**
 * Generate thumbnail/preview image URL for a Livepeer playbackId
 * 
 * @deprecated This function uses the thumbnailer.livepeer.studio endpoint which doesn't work reliably.
 * Use getThumbnailUrlFromPlaybackInfo() or getLiveThumbnailUrl() instead, which use the playback info API.
 * 
 * @param playbackId - The playbackId (stream or asset) to generate thumbnail for
 * @param options - Optional parameters for thumbnail customization
 * @param options.time - Time position in seconds (default: 10 seconds for better frame, or middle of video for VOD)
 * @param options.width - Thumbnail width in pixels (default: 1280 for high quality)
 * @param options.height - Thumbnail height in pixels (default: 720 for 16:9 aspect ratio)
 * @returns Thumbnail URL string (may not work - endpoint is unreliable)
 */
export function getThumbnailUrl(
  playbackId: string,
  options?: {
    time?: number
    width?: number
    height?: number
  }
): string {
  if (!playbackId) {
    return ""
  }
  
  // Livepeer thumbnail URL format
  // Base URL: https://thumbnailer.livepeer.studio/thumbnail/{playbackId}
  // Optional query parameters: ?time={seconds}&width={px}&height={px}
  let url = `https://thumbnailer.livepeer.studio/thumbnail/${playbackId}`
  
  const params: string[] = []
  
  // Default to 10 seconds for better frame (skips black screen at start)
  // For VOD, this will be overridden if time is provided
  const time = options?.time !== undefined ? options.time : 10
  params.push(`time=${time}`)
  
  // Use high quality dimensions by default (1280x720 for 16:9 aspect ratio)
  // This ensures good quality for preview images
  const width = options?.width || 1280
  const height = options?.height || 720
  params.push(`width=${width}`)
  params.push(`height=${height}`)
  
  if (params.length > 0) {
    url += `?${params.join("&")}`
  }
  
  return url
}

/**
 * Verify if a thumbnail URL is accessible/available
 * Useful for checking if Livepeer has generated the thumbnail yet
 * 
 * @param thumbnailUrl - The thumbnail URL to check
 * @returns Promise<boolean> - true if thumbnail is accessible, false otherwise
 */
export async function verifyThumbnailAvailability(thumbnailUrl: string): Promise<boolean> {
  if (!thumbnailUrl) {
    return false
  }
  
  try {
    // Try with GET first (some servers don't support HEAD properly)
    const response = await fetch(thumbnailUrl, {
      method: "GET",
      signal: AbortSignal.timeout(10000), // 10 second timeout (thumbnails might take time to generate)
      headers: {
        // Some CDNs require proper headers
        'Accept': 'image/*',
      },
    })
    
    const isImage = response.ok && (
      response.headers.get("content-type")?.startsWith("image/") ||
      response.headers.get("content-type")?.includes("jpeg") ||
      response.headers.get("content-type")?.includes("png") ||
      response.headers.get("content-type")?.includes("webp")
    )
    
    if (isImage) {
      console.log(`[Thumbnail] ✅ Verified thumbnail is accessible: ${thumbnailUrl}`)
      return true
    } else {
      console.warn(`[Thumbnail] ⚠️ Thumbnail URL returned non-image content type: ${response.headers.get("content-type")}, status: ${response.status}`)
      return false
    }
  } catch (error: any) {
    // Don't log timeout errors as warnings - they're expected if thumbnail isn't ready yet
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      console.log(`[Thumbnail] ⏳ Thumbnail not ready yet (timeout): ${thumbnailUrl}`)
    } else {
      console.warn(`[Thumbnail] ❌ Error checking thumbnail availability at ${thumbnailUrl}:`, error?.message || error)
    }
    return false
  }
}

/**
 * Generate thumbnail URL for VOD assets with optimized settings
 * 
 * @deprecated This function uses the thumbnailer.livepeer.studio endpoint which doesn't work reliably.
 * Use getThumbnailUrlFromPlaybackInfo() instead, which uses the playback info API.
 * 
 * @param playbackId - The asset playbackId
 * @param duration - Optional duration in seconds to calculate middle point
 * @returns Thumbnail URL string (may not work - endpoint is unreliable)
 */
export function getVodThumbnailUrl(playbackId: string, duration?: number): string {
  if (!playbackId) {
    return ""
  }
  
  // For VOD, try to get a frame from the middle of the video if duration is known
  // Otherwise use 10 seconds (skips potential black screen at start)
  let time = 10
  if (duration && duration > 20) {
    // Use middle of video, but ensure it's at least 10 seconds in
    time = Math.max(10, Math.floor(duration / 2))
  }
  
  return getThumbnailUrl(playbackId, {
    time,
    width: 1280,
    height: 720,
  })
}

/**
 * Generate and verify thumbnail URL with retry logic
 * This ensures the thumbnail is actually available before returning it
 * 
 * @param playbackId - The playbackId to generate thumbnail for
 * @param options - Options for thumbnail generation and retry logic
 * @param options.isVod - Whether this is a VOD asset (uses optimized settings)
 * @param options.duration - Optional duration for VOD (for better frame selection)
 * @param options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param options.retryDelay - Delay between retries in ms (default: 2000)
 * @returns Promise<string | null> - Thumbnail URL if available, null otherwise
 */
export async function generateAndVerifyThumbnail(
  playbackId: string,
  options?: {
    isVod?: boolean
    duration?: number
    maxRetries?: number
    retryDelay?: number
  }
): Promise<string | null> {
  if (!playbackId) {
    console.warn(`[Thumbnail] No playbackId provided`)
    return null
  }

  const maxRetries = options?.maxRetries ?? 3
  const retryDelay = options?.retryDelay ?? 2000
  
  // Always use playback info API - this is the only reliable method
  // The thumbnailer.livepeer.studio endpoint doesn't work reliably
  let thumbnailUrl: string | null = null
  try {
    thumbnailUrl = await getThumbnailUrlFromPlaybackInfo(playbackId)
    if (thumbnailUrl) {
      console.log(`[Thumbnail] ✅ Got thumbnail URL from playback info API: ${thumbnailUrl}`)
    } else {
      console.log(`[Thumbnail] ⏳ No thumbnail available in playback info for playbackId ${playbackId} (stream may not have started or asset not ready)`)
      // Return null - placeholder will be shown instead of broken image
      return null
    }
  } catch (error: any) {
    console.warn(`[Thumbnail] Could not get thumbnail from playback info for ${playbackId}:`, error?.message || error)
    // Return null instead of using broken thumbnailer service
    return null
  }
  
  // If we don't have a thumbnail URL, return null
  // The frontend will show placeholder instead of broken image
  if (!thumbnailUrl) {
    console.log(`[Thumbnail] No thumbnail URL available for playbackId ${playbackId}`)
    return null
  }

  // Try to verify thumbnail availability with retries
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const isAvailable = await verifyThumbnailAvailability(thumbnailUrl)
      
      if (isAvailable) {
        console.log(`[Thumbnail] ✅ Verified successfully for playbackId ${playbackId} (attempt ${attempt + 1})`)
        return thumbnailUrl
      }
      
      // If not available and not last attempt, wait before retrying
      if (attempt < maxRetries - 1) {
        const delay = retryDelay * (attempt + 1) // Exponential backoff
        console.log(`[Thumbnail] ⏳ Not yet available for playbackId ${playbackId}, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    } catch (error) {
      console.warn(`[Thumbnail] ❌ Error verifying thumbnail for playbackId ${playbackId} (attempt ${attempt + 1}):`, error)
      
      // If not last attempt, wait before retrying
      if (attempt < maxRetries - 1) {
        const delay = retryDelay * (attempt + 1)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  // If we get here, thumbnail wasn't available after all retries
  // Still return the URL as it might become available later (Livepeer processes asynchronously)
  // This is important - Livepeer generates thumbnails asynchronously, so the URL might work later
  console.warn(`[Thumbnail] ⚠️ Not available after ${maxRetries} attempts for playbackId ${playbackId}, but returning URL anyway (may become available later): ${thumbnailUrl}`)
  
  // Always return the URL - even if verification failed, it might become available
  // The frontend will handle displaying placeholder if image fails to load
  return thumbnailUrl
}

/**
 * Get asset information from Livepeer playback API
 */
export async function getPlaybackInfo(playbackId: string) {
  if (!LIVEPEER_API_KEY) {
    throw new Error("LIVEPEER_API_KEY is not set")
  }

  try {
    const response = await fetch(`https://livepeer.studio/api/playback/${playbackId}`, {
      headers: {
        Authorization: `Bearer ${LIVEPEER_API_KEY}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get playback info: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error("Error fetching playback info:", error)
    throw error
  }
}

/**
 * Get realtime viewer count for a playbackId from Livepeer
 * Uses Livepeer's Realtime Viewership API
 */
export async function getViewerCount(playbackId: string): Promise<number> {
  if (!LIVEPEER_API_KEY) {
    throw new Error("LIVEPEER_API_KEY is not set")
  }

  if (!playbackId) {
    return 0
  }

  try {
    const url = new URL("https://livepeer.studio/api/data/views/now")
    url.searchParams.set("playbackId", playbackId)
    // Request breakdown by playbackId so response items include playbackId field
    url.searchParams.append("breakdownBy", "playbackId")

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${LIVEPEER_API_KEY}`,
      },
    })

    if (!response.ok) {
      // If API returns 404 or error, return 0 (stream might not have viewers yet)
      if (response.status === 404) {
        return 0
      }
      throw new Error(`Failed to get viewer count: ${response.status}`)
    }

    const data = await response.json()
    
    if (Array.isArray(data) && data.length > 0) {
      // Try to locate entry with matching playbackId
      const exactMatch = data.find((item: any) => item.playbackId === playbackId)
      if (exactMatch && typeof exactMatch.viewCount === "number") {
        return exactMatch.viewCount
      }

      // Fallback: if API omits playbackId, use first entry
      const fallback = data[0]
      if (fallback && typeof fallback.viewCount === "number") {
        return fallback.viewCount
      }
    }
    
    // If no metrics returned, treat as zero viewers
    return 0
  } catch (error) {
    console.error("Error fetching viewer count:", error)
    // Return 0 on error instead of throwing, so the app doesn't break
    return 0
  }
}

/**
 * Get historical view counts for a playbackId from Livepeer
 * Uses Livepeer's Historical Views API (if available)
 * 
 * @param playbackId - The playback ID of the stream/asset
 * @param options - Optional parameters for time range and granularity
 * @returns Historical view data or null if endpoint doesn't exist
 */
export async function getHistoricalViews(
  playbackId: string,
  options?: {
    from?: number // Unix timestamp in seconds
    to?: number // Unix timestamp in seconds
    granularity?: "hour" | "day" | "week" | "month"
  }
): Promise<{
  playbackId: string
  totalViews?: number
  peakViewers?: number
  data?: Array<{ timestamp: number; viewCount: number }>
} | null> {
  if (!LIVEPEER_API_KEY) {
    throw new Error("LIVEPEER_API_KEY is not set")
  }

  if (!playbackId) {
    return null
  }

  try {
    const url = new URL("https://livepeer.studio/api/data/views")
    url.searchParams.set("playbackId", playbackId)
    
    if (options?.from) {
      url.searchParams.set("from", options.from.toString())
    }
    if (options?.to) {
      url.searchParams.set("to", options.to.toString())
    }
    if (options?.granularity) {
      url.searchParams.set("granularity", options.granularity)
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${LIVEPEER_API_KEY}`,
      },
    })

    if (!response.ok) {
      // If endpoint doesn't exist (404) or not available, return null
      if (response.status === 404 || response.status === 501) {
        console.log(`[Historical Views] Endpoint not available for playbackId: ${playbackId}`)
        return null
      }
      // For other errors, log and return null
      console.warn(`[Historical Views] API error ${response.status} for playbackId: ${playbackId}`)
      return null
    }

    const data = await response.json()
    
    // Handle different response formats
    if (data && typeof data === "object") {
      return {
        playbackId,
        totalViews: data.totalViews || data.total_views || data.total,
        peakViewers: data.peakViewers || data.peak_viewers || data.peak,
        data: data.data || data.views || data.history,
      }
    }
    
    return null
  } catch (error) {
    // Endpoint might not exist, return null gracefully
    console.log(`[Historical Views] Endpoint may not be available: ${error}`)
    return null
  }
}

/**
 * Get total lifetime views for a playbackId from Livepeer
 * Uses the Livepeer SDK: livepeer.metrics.getPublicViewership()
 * 
 * Response format: { playbackId: string, dStorageUrl?: string, viewCount: number, playtimeMins: number }
 * 
 * @param playbackId - The playback ID of the stream/asset
 * @returns Total lifetime views (0 if no views yet) or null if endpoint unavailable/error
 */
export async function getTotalViews(playbackId: string): Promise<number | null> {
  if (!LIVEPEER_API_KEY) {
    throw new Error("LIVEPEER_API_KEY is not set")
  }

  if (!playbackId) {
    return null
  }

  const endpoint = `https://livepeer.studio/api/data/views/query/total/${encodeURIComponent(playbackId)}`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${LIVEPEER_API_KEY}`,
      },
      cache: "no-store",
      signal: controller.signal,
    })

    if (response.status === 404) {
      console.log(`[Total Views] 404 for playbackId: ${playbackId} - views may not be available yet`)
      return null
    }

    if (response.status === 401 || response.status === 403) {
      console.error(`[Total Views] Authentication error ${response.status} for playbackId: ${playbackId}`)
      return null
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "")
      console.warn(`[Total Views] Unexpected response ${response.status} for playbackId ${playbackId}: ${errorBody}`)
      return null
    }

    const result = await response.json().catch(() => null)

    if (!result) {
      console.warn(`[Total Views] No response body for playbackId ${playbackId}`)
      return null
    }

    // According to Livepeer docs: https://docs.livepeer.org/api-reference/viewership/get-public-total-views
    // Response format: { playbackId: string, dStorageUrl?: string, viewCount: number, playtimeMins: number }
    // The response is a single object with viewCount at the top level
    
    // Handle array response (unexpected but possible)
    if (Array.isArray(result)) {
      console.log(`[Total Views] Response is array (unexpected), checking first entry`)
      if (result.length > 0 && result[0] && typeof result[0].viewCount === "number") {
        return result[0].viewCount
      }
      return null
    }

    // Handle single object response (expected format per docs)
    if (result && typeof result === "object") {
      // Direct viewCount access (per docs format)
      if (typeof result.viewCount === "number") {
        console.log(`[Total Views] ✅ Found viewCount: ${result.viewCount} for playbackId ${playbackId}`)
        return result.viewCount
      }

      // Check nested structures (fallback for different response formats)
      const nestedCandidates = [result.data, result.result, result.body]
      for (const candidate of nestedCandidates) {
        if (candidate && typeof candidate === "object" && typeof candidate.viewCount === "number") {
          console.log(`[Total Views] ✅ Found viewCount in nested structure: ${candidate.viewCount}`)
          return candidate.viewCount
        }
      }
    }

    console.warn(`[Total Views] viewCount not found in response for playbackId ${playbackId}`, {
      responseType: typeof result,
      isArray: Array.isArray(result),
      keys: result && typeof result === "object" ? Object.keys(result) : null,
      fullResponse: result
    })
    return null
  } catch (error: any) {
    if (error?.name === "AbortError") {
      console.warn(`[Total Views] Request timed out for playbackId ${playbackId}`)
      return null
    }

    console.error(`[Total Views] Error fetching views for playbackId ${playbackId}:`, error?.message || error)
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Get peak concurrent viewers for a playbackId from Livepeer
 * Uses historical views API if available, otherwise returns null
 * 
 * @param playbackId - The playback ID of the stream/asset
 * @returns Peak concurrent viewers or null if not available
 */
export async function getPeakViewers(playbackId: string): Promise<number | null> {
  if (!playbackId) {
    return null
  }

  try {
    const historicalData = await getHistoricalViews(playbackId)
    if (historicalData?.peakViewers !== undefined) {
      return historicalData.peakViewers
    }
    return null
  } catch (error) {
    console.log(`[Peak Viewers] Could not fetch from Livepeer: ${error}`)
    return null
  }
}

/**
 * Get stream metrics from Livepeer (if available)
 * 
 * @param streamId - The Livepeer stream ID
 * @returns Stream metrics or null if endpoint doesn't exist
 */
export async function getStreamMetrics(streamId: string): Promise<{
  totalViews?: number
  peakConcurrentViewers?: number
  averageWatchTime?: number
  totalWatchTime?: number
  [key: string]: any
} | null> {
  if (!LIVEPEER_API_KEY) {
    throw new Error("LIVEPEER_API_KEY is not set")
  }

  if (!streamId) {
    return null
  }

  try {
    const response = await fetch(`https://livepeer.studio/api/stream/${streamId}/metrics`, {
      headers: {
        Authorization: `Bearer ${LIVEPEER_API_KEY}`,
      },
    })

    if (!response.ok) {
      // If endpoint doesn't exist (404) or not available, return null
      if (response.status === 404 || response.status === 501) {
        console.log(`[Stream Metrics] Endpoint not available for streamId: ${streamId}`)
        return null
      }
      console.warn(`[Stream Metrics] API error ${response.status} for streamId: ${streamId}`)
      return null
    }

    const data = await response.json()
    return data || null
  } catch (error) {
    // Endpoint might not exist, return null gracefully
    console.log(`[Stream Metrics] Endpoint may not be available: ${error}`)
    return null
  }
}

/**
 * Get asset metrics from Livepeer (if available)
 * Useful for VOD replay analytics
 * 
 * @param assetId - The Livepeer asset ID
 * @returns Asset metrics or null if endpoint doesn't exist
 */
export async function getAssetMetrics(assetId: string): Promise<{
  totalViews?: number
  peakConcurrentViewers?: number
  averageWatchTime?: number
  totalWatchTime?: number
  [key: string]: any
} | null> {
  if (!LIVEPEER_API_KEY) {
    throw new Error("LIVEPEER_API_KEY is not set")
  }

  if (!assetId) {
    return null
  }

  try {
    const response = await fetch(`https://livepeer.studio/api/asset/${assetId}/metrics`, {
      headers: {
        Authorization: `Bearer ${LIVEPEER_API_KEY}`,
      },
    })

    if (!response.ok) {
      // If endpoint doesn't exist (404) or not available, return null
      if (response.status === 404 || response.status === 501) {
        console.log(`[Asset Metrics] Endpoint not available for assetId: ${assetId}`)
        return null
      }
      console.warn(`[Asset Metrics] API error ${response.status} for assetId: ${assetId}`)
      return null
    }

    const data = await response.json()
    return data || null
  } catch (error) {
    // Endpoint might not exist, return null gracefully
    console.log(`[Asset Metrics] Endpoint may not be available: ${error}`)
    return null
  }
}

/**
 * List assets from Livepeer API
 * Can filter by source stream ID to find assets created from a specific stream
 * Handles pagination and different response formats
 */
export async function listAssets(sourceStreamId?: string) {
  if (!LIVEPEER_API_KEY) {
    throw new Error("LIVEPEER_API_KEY is not set")
  }

  try {
    let url = "https://livepeer.studio/api/asset"
    if (sourceStreamId) {
      url += `?sourceStreamId=${sourceStreamId}`
    }

    // Add timeout to prevent hanging requests (5 seconds max)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${LIVEPEER_API_KEY}`,
      },
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[listAssets] API error ${response.status}:`, errorText)
      throw new Error(`Failed to list assets: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    
    // Livepeer API can return assets in different formats:
    // 1. Direct array: [...]
    // 2. Object with data array: { data: [...] }
    // 3. Object with assets array: { assets: [...] }
    // 4. Paginated: { data: [...], nextCursor: "...", total: N }
    let assets: any[] = []
    
    if (Array.isArray(data)) {
      assets = data
    } else if (data.data && Array.isArray(data.data)) {
      assets = data.data
      // Handle pagination if needed
      if (data.nextCursor && assets.length > 0) {
        console.log(`[listAssets] Found ${assets.length} assets, more available (nextCursor: ${data.nextCursor})`)
        // For now, we'll just use the first page. Can implement pagination later if needed.
      }
    } else if (data.assets && Array.isArray(data.assets)) {
      assets = data.assets
    } else if (data.items && Array.isArray(data.items)) {
      assets = data.items
    } else {
      console.warn(`[listAssets] Unexpected response format:`, Object.keys(data))
      // Try to find any array in the response
      for (const key in data) {
        if (Array.isArray(data[key])) {
          console.log(`[listAssets] Found array in key '${key}', using it`)
          assets = data[key]
          break
        }
      }
    }
    
    console.log(`[listAssets] Found ${assets.length} assets${sourceStreamId ? ` for sourceStreamId ${sourceStreamId}` : ''}`)
    return assets
  } catch (error) {
    console.error("[listAssets] Error listing assets:", error)
    throw error
  }
}

/**
 * Get asset by ID from Livepeer API
 * Following Livepeer docs: https://docs.livepeer.org/api-reference/asset/get
 * 
 * @param assetId - The asset ID to fetch
 * @returns Asset object with status.phase property (e.g., "ready", "uploading", "processing")
 */
export async function getAsset(assetId: string) {
  if (!LIVEPEER_API_KEY) {
    throw new Error("LIVEPEER_API_KEY is not set")
  }

  try {
    const response = await fetch(`https://livepeer.studio/api/asset/${assetId}`, {
      headers: {
        Authorization: `Bearer ${LIVEPEER_API_KEY}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get asset: ${response.status}`)
    }

    const asset = await response.json()
    
    // Log full asset response structure for debugging
    const statusPhase = typeof asset.status === 'object' ? asset.status?.phase : asset.status
    console.log(`[getAsset] Fetched asset ${assetId}:`, {
      id: asset.id,
      playbackId: asset.playbackId,
      playbackUrl: asset.playbackUrl,
      status: asset.status,
      statusPhase: statusPhase,
      hasPlaybackId: !!asset.playbackId,
      allKeys: Object.keys(asset),
      // Log first few characters of response to see structure
      responseSample: JSON.stringify(asset).substring(0, 500)
    })
    
    // According to Livepeer docs, playbackId should be at top level
    // But let's check multiple possible locations just in case
    const playbackId = asset.playbackId || asset.playback?.id || asset.data?.playbackId
    if (!asset.playbackId && playbackId) {
      console.warn(`[getAsset] ⚠️ playbackId found in unexpected location: ${playbackId}`)
      // Normalize to top level
      asset.playbackId = playbackId
    }
    
    if (!asset.playbackId) {
      console.error(`[getAsset] ❌ No playbackId found in asset response! Asset keys:`, Object.keys(asset))
    }
    
    return asset
  } catch (error) {
    console.error("Error fetching asset:", error)
    throw error
  }
}

/**
 * Check if an asset is ready for playback
 * According to Livepeer docs, status is an object with phase property
 * https://docs.livepeer.org/api-reference/asset/get
 * 
 * @param asset - Asset object from Livepeer API
 * @returns true if asset status phase is "ready"
 */
export function isAssetReady(asset: any): boolean {
  if (!asset) return false
  
  // According to Livepeer docs: status is an object with phase property
  // Example: { phase: "ready", updatedAt: 1234567890, progress: 100 }
  const statusPhase = typeof asset.status === 'object' ? asset.status?.phase : asset.status
  return statusPhase === "ready"
}

/**
 * Get asset for a stream by finding assets created from the stream
 * Returns the first available asset with playback URL or playbackId
 * For VOD playback, we need the asset's playbackId (not the stream's playbackId)
 */
export async function getStreamAsset(streamId: string) {
  if (!LIVEPEER_API_KEY) {
    throw new Error("LIVEPEER_API_KEY is not set")
  }

  try {
    console.log(`[getStreamAsset] Fetching asset for stream ${streamId}`)
    
    // Priority 1: Try direct endpoint /api/stream/{streamId}/asset (preferred method)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)
      
      const response = await fetch(`https://livepeer.studio/api/stream/${streamId}/asset`, {
        headers: {
          Authorization: `Bearer ${LIVEPEER_API_KEY}`,
        },
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      
      if (response.ok) {
        const asset = await response.json()
        
        // Log full asset structure for debugging
        console.log(`[getStreamAsset] Asset response from /stream/${streamId}/asset:`, {
          id: asset.id,
          playbackId: asset.playbackId,
          status: asset.status,
          sourceStreamId: asset.sourceStreamId || asset.source?.streamId || asset.source?.id,
          keys: Object.keys(asset)
        })
        
        // Verify asset belongs to this stream
        const assetSourceStreamId = asset.sourceStreamId || asset.source?.streamId || asset.source?.id
        if (assetSourceStreamId && assetSourceStreamId !== streamId) {
          console.warn(`[getStreamAsset] Asset ${asset.id} from /stream/${streamId}/asset has mismatched sourceStreamId: ${assetSourceStreamId} (expected ${streamId})`)
        }
        
        // CRITICAL: Verify asset playbackId is different from stream playbackId
        // If they're the same, this is incorrect - asset should have its own unique playbackId
        // We need to fetch the stream playbackId to compare
        try {
          const streamData = await getStream(streamId)
          const streamPlaybackId = streamData?.playbackId
          if (streamPlaybackId && asset.playbackId === streamPlaybackId) {
            console.warn(`[getStreamAsset] ⚠️ Warning: Asset playbackId matches stream playbackId. This is usually incorrect but we will use it as fallback.`)
            console.warn(`[getStreamAsset] Asset ID: ${asset.id}, PlaybackId: ${asset.playbackId}`)
            // We used to return null here, but we'll allow it now as a fallback
            // return null
          }
        } catch (streamError) {
          console.warn(`[getStreamAsset] Could not verify playbackId difference:`, streamError)
        }
        
        // Only return ready assets to prevent format errors
        // Use helper function to check asset status (status is an object with phase property)
        if (isAssetReady(asset) && asset.playbackId) {
          console.log(`[getStreamAsset] ✅ Found ready asset via /stream/${streamId}/asset: ${asset.playbackId}`)
          return asset
        } else if (asset.playbackId) {
          const statusPhase = typeof asset.status === 'object' ? asset.status?.phase : asset.status
          console.log(`[getStreamAsset] Asset found via /stream/${streamId}/asset but not ready (status phase: ${statusPhase}). Will not use for playback yet.`)
          // Return null for unready assets to prevent format errors
          return null
        } else {
          console.log(`[getStreamAsset] Asset found via /stream/${streamId}/asset but no playbackId yet`)
        }
      } else if (response.status === 404) {
        console.log(`[getStreamAsset] No asset found via /stream/${streamId}/asset (404) - asset may not exist yet`)
      } else {
        console.warn(`[getStreamAsset] Error fetching /stream/${streamId}/asset: ${response.status}`)
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        console.warn(`[getStreamAsset] Timeout fetching /stream/${streamId}/asset, falling back to listAssets`)
      } else {
        console.warn(`[getStreamAsset] Error fetching /stream/${streamId}/asset:`, error?.message || error)
      }
      // Continue to fallback method
    }
    
    // Priority 2: Fallback to listing assets filtered by source stream ID
    let allAssets: any[] = []
    try {
      allAssets = await listAssets(streamId)
    } catch (error: any) {
      console.warn(`[getStreamAsset] Failed to list assets with sourceStreamId filter:`, error?.message)
      // Fallback: try listing all assets and filtering client-side
      console.log(`[getStreamAsset] Falling back to listing all assets and filtering...`)
      try {
        allAssets = await listAssets()
        console.log(`[getStreamAsset] Listed ${allAssets.length} total assets, filtering for stream ${streamId}`)
      } catch (fallbackError: any) {
        console.error(`[getStreamAsset] Failed to list all assets:`, fallbackError?.message)
        throw fallbackError
      }
    }
    
    // CRITICAL: Filter assets to ensure they actually belong to this stream
    // The API might return assets from other streams, so we need to verify sourceStreamId matches
    // Also check for different field names: sourceStreamId, source.streamId, sourceId, etc.
    const assets = allAssets?.filter((asset: any) => {
      const assetSourceStreamId = asset.sourceStreamId || 
                                  asset.source?.streamId || 
                                  asset.source?.id ||
                                  asset.sourceId ||
                                  asset.sourceStream?.id
      const matches = assetSourceStreamId === streamId
      if (!matches && assetSourceStreamId) {
        console.log(`[getStreamAsset] Skipping asset ${asset.id} - sourceStreamId mismatch: expected ${streamId}, got ${assetSourceStreamId}`)
      }
      return matches
    }) || []
    
    console.log(`[getStreamAsset] Found ${assets.length} assets for stream ${streamId} (filtered from ${allAssets?.length || 0} total assets)`)
    
    // Log all found assets for debugging
    if (allAssets.length > 0) {
      console.log(`[getStreamAsset] Sample asset structure:`, {
        id: allAssets[0].id,
        status: allAssets[0].status,
        sourceStreamId: allAssets[0].sourceStreamId,
        source: allAssets[0].source,
        playbackId: allAssets[0].playbackId,
        keys: Object.keys(allAssets[0])
      })
    }
    
    if (assets && assets.length > 0) {
      // Sort assets by creation date (newest first) to get the most recent recording
      // Assets typically have createdAt or createdTimestamp field
      const sortedAssets = [...assets].sort((a: any, b: any) => {
        const aTime = a.createdAt || a.createdTimestamp || a.created || 0
        const bTime = b.createdAt || b.createdTimestamp || b.created || 0
        // Convert to timestamp if it's a string
        const aTimestamp = typeof aTime === 'string' ? new Date(aTime).getTime() : aTime
        const bTimestamp = typeof bTime === 'string' ? new Date(bTime).getTime() : bTime
        return bTimestamp - aTimestamp // Newest first
      })
      
      // Log all assets for debugging
      sortedAssets.forEach((asset: any, index: number) => {
        console.log(`Asset ${index + 1} (for stream ${streamId}):`, {
          id: asset.id,
          status: asset.status,
          playbackId: asset.playbackId,
          playbackUrl: asset.playbackUrl,
          sourceStreamId: asset.sourceStreamId || asset.source?.streamId,
          createdAt: asset.createdAt || asset.createdTimestamp || asset.created,
        })
      })
      
      // Helper function to verify asset belongs to stream
      const verifyAsset = (asset: any): boolean => {
        const assetSourceStreamId = asset.sourceStreamId || asset.source?.streamId
        const matches = assetSourceStreamId === streamId
        if (!matches) {
          console.error(`[getStreamAsset] Asset ${asset.id} does not belong to stream ${streamId}! sourceStreamId: ${assetSourceStreamId}`)
        }
        return matches
      }
      
      // CRITICAL: Get stream playbackId to verify asset playbackId is different
      // Asset playbackId MUST be different from stream playbackId
      let streamPlaybackId: string | null = null
      try {
        const streamData = await getStream(streamId)
        streamPlaybackId = streamData?.playbackId || null
        console.log(`[getStreamAsset] Stream playbackId for comparison: ${streamPlaybackId}`)
      } catch (streamError) {
        console.warn(`[getStreamAsset] Could not fetch stream playbackId for comparison:`, streamError)
      }
      
      // CRITICAL: According to Livepeer docs (https://docs.livepeer.org/api-reference/asset/get)
      // We should fetch the full asset details using /api/asset/{assetId} to get the correct playbackId
      // The asset list might not have complete information, so we need to fetch each asset individually
      
      // Helper function to fetch full asset details by ID
      const fetchFullAssetDetails = async (assetId: string): Promise<any | null> => {
        try {
          console.log(`[getStreamAsset] Fetching full asset details for asset ID: ${assetId}`)
          const fullAsset = await getAsset(assetId)
          console.log(`[getStreamAsset] Full asset details:`, {
            id: fullAsset.id,
            playbackId: fullAsset.playbackId,
            status: fullAsset.status,
            sourceStreamId: fullAsset.source?.sessionId ? null : (fullAsset.source?.sourceId || fullAsset.sourceStreamId),
            sourceType: fullAsset.source?.type,
            keys: Object.keys(fullAsset)
          })
          return fullAsset
        } catch (error: any) {
          console.warn(`[getStreamAsset] Failed to fetch full asset details for ${assetId}:`, error?.message)
          return null
        }
      }
      
      // Helper function to verify asset playbackId is different from stream playbackId
      const verifyAssetPlaybackId = (asset: any): boolean => {
        if (!asset.playbackId) return false
        if (streamPlaybackId && asset.playbackId === streamPlaybackId) {
          console.warn(`[getStreamAsset] ⚠️ Warning: Asset ${asset.id} playbackId matches stream playbackId! Asset: ${asset.playbackId}, Stream: ${streamPlaybackId}`)
          console.warn(`[getStreamAsset] We will allow this as a fallback.`)
          return true
        }
        return true
      }
      
      // CRITICAL: For VOD playback, we MUST only use assets with status "ready"
      // Unready assets will cause format errors in the player (MEDIA_ELEMENT_ERROR: Format error)
      // Prioritize assets that are ready and have playbackUrl (direct HLS URL) - this is what we need for VOD
      // CRITICAL: Asset playbackId MUST be different from stream playbackId
      // CRITICAL: Fetch full asset details using /api/asset/{assetId} to ensure we have the correct playbackId
      for (const asset of sortedAssets) {
        if (!verifyAsset(asset)) continue
        
        // Fetch full asset details using the asset ID
        const fullAsset = await fetchFullAssetDetails(asset.id)
        if (!fullAsset) continue
        
        // Verify the full asset has a different playbackId from stream
        if (!verifyAssetPlaybackId(fullAsset)) continue
        
        // Check if asset is ready using helper function
        // According to Livepeer docs: status is an object with phase property
        if (isAssetReady(fullAsset)) {
          // Prioritize assets with playbackUrl
          if (fullAsset.playbackUrl) {
            console.log(`✅ Found ready asset with playbackUrl (most recent) for stream ${streamId}: ${fullAsset.playbackUrl}`)
            console.log(`[getStreamAsset] Asset playbackId: ${fullAsset.playbackId}, Stream playbackId: ${streamPlaybackId}`)
            return fullAsset
          }
          
          // Fallback: Asset with playbackId
          if (fullAsset.playbackId) {
            console.log(`✅ Found ready asset with playbackId (most recent) for stream ${streamId}: ${fullAsset.playbackId}`)
            console.log(`[getStreamAsset] Asset playbackId: ${fullAsset.playbackId}, Stream playbackId: ${streamPlaybackId}`)
            return fullAsset
          }
        }
      }
      
      // If no ready asset found after fetching full details, log warning
      console.warn(`[getStreamAsset] No ready asset found with different playbackId after fetching full details`)
      
      // If no ready asset found, log warning but don't return unready asset
      // This prevents format errors - the asset will be checked again later
      const unreadyAsset = sortedAssets.find((asset: any) => asset.playbackId && verifyAsset(asset))
      if (unreadyAsset) {
        console.warn(`⚠️ [getStreamAsset] Asset ${unreadyAsset.id} has playbackId but is not ready (status: ${unreadyAsset.status}). Will not use for playback yet.`)
        console.warn(`⚠️ [getStreamAsset] The asset will be checked again when it's ready. Returning null to prevent format errors.`)
        // Return null instead of unready asset to prevent format errors
        return null
      }
      
      // Fallback: find asset with playbackUrl (from most recent)
      const assetWithPlaybackUrl = sortedAssets.find((asset: any) => 
        (asset.playbackUrl || asset.status === "ready") && verifyAsset(asset)
      )
      
      if (assetWithPlaybackUrl) {
        console.log(`Found asset with playbackUrl (most recent) for stream ${streamId}: ${assetWithPlaybackUrl.playbackUrl}`)
        return assetWithPlaybackUrl
      }
      
      // If no verified asset found, log warning and return null instead of wrong asset
      console.warn(`[getStreamAsset] No verified assets found for stream ${streamId} after filtering. Found ${sortedAssets.length} assets but none match sourceStreamId.`)
      if (sortedAssets.length > 0) {
        console.warn(`[getStreamAsset] First asset details:`, {
          id: sortedAssets[0].id,
          sourceStreamId: sortedAssets[0].sourceStreamId || sortedAssets[0].source?.streamId,
          expectedStreamId: streamId
        })
      }
      return null
    }

    // CRITICAL: Only use Assets API - do NOT fall back to sessions or stream recordings
    // Views must come from Assets, not sessions
    // If no assets found, return null (don't use sessions as fallback)
    console.warn(`[getStreamAsset] No assets found for stream ${streamId} via Assets API`)
    console.warn(`[getStreamAsset] CRITICAL: Not using sessions as fallback - views must come from Assets API`)
    return null
  } catch (error) {
    console.error("Error fetching stream asset:", error)
    return null
  }
}


