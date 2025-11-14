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
 */
export async function getThumbnailUrlFromPlaybackInfo(playbackId: string): Promise<string | null> {
  if (!playbackId) {
    return null
  }

  try {
    const playbackInfo = await getPlaybackInfo(playbackId)
    
    // Livepeer playback info includes thumbnail information in the source array
    // Look for thumbnail URLs in the playback info
    if (playbackInfo?.meta?.thumbnail) {
      return playbackInfo.meta.thumbnail
    }
    
    // Alternative: check for thumbnail in source array (VTT file for VOD)
    if (playbackInfo?.source) {
      const thumbnailSource = playbackInfo.source.find((s: any) => 
        s.type === "text/vtt" && s.url?.includes("thumbnails")
      )
      if (thumbnailSource?.url) {
        // For VOD, the VTT file contains thumbnail URLs, but we can construct from it
        // For now, fall back to thumbnailer service
        console.log(`[Thumbnail] Found VTT thumbnail source in playback info: ${thumbnailSource.url}`)
      }
    }
    
    return null
  } catch (error) {
    console.warn(`[Thumbnail] Could not get thumbnail from playback info for ${playbackId}:`, error)
    return null
  }
}

/**
 * Generate thumbnail/preview image URL for a Livepeer playbackId
 * Livepeer provides thumbnail URLs via thumbnailer service
 * 
 * @param playbackId - The playbackId (stream or asset) to generate thumbnail for
 * @param options - Optional parameters for thumbnail customization
 * @param options.time - Time position in seconds (default: 10 seconds for better frame, or middle of video for VOD)
 * @param options.width - Thumbnail width in pixels (default: 1280 for high quality)
 * @param options.height - Thumbnail height in pixels (default: 720 for 16:9 aspect ratio)
 * @returns Thumbnail URL string
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
 * Uses a time position that's likely to have good content (not black screen)
 * 
 * @param playbackId - The asset playbackId
 * @param duration - Optional duration in seconds to calculate middle point
 * @returns Thumbnail URL string
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
  
  // First, try to get thumbnail URL from playback info API (preferred method)
  let thumbnailUrl: string | null = null
  try {
    thumbnailUrl = await getThumbnailUrlFromPlaybackInfo(playbackId)
    if (thumbnailUrl) {
      console.log(`[Thumbnail] Got thumbnail URL from playback info API: ${thumbnailUrl}`)
    }
  } catch (error) {
    console.warn(`[Thumbnail] Could not get thumbnail from playback info, will use thumbnailer service:`, error)
  }
  
  // Fallback: Generate thumbnail URL using thumbnailer service
  if (!thumbnailUrl) {
    thumbnailUrl = options?.isVod
      ? getVodThumbnailUrl(playbackId, options.duration)
      : getThumbnailUrl(playbackId)
    
    if (!thumbnailUrl) {
      console.warn(`[Thumbnail] Failed to generate thumbnail URL for playbackId ${playbackId}`)
      return null
    }
    
    console.log(`[Thumbnail] Generated thumbnail URL using thumbnailer service: ${thumbnailUrl}`)
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
    const response = await fetch(
      `https://livepeer.studio/api/data/views/now?playbackId=${playbackId}`,
      {
        headers: {
          Authorization: `Bearer ${LIVEPEER_API_KEY}`,
        },
      }
    )

    if (!response.ok) {
      // If API returns 404 or error, return 0 (stream might not have viewers yet)
      if (response.status === 404) {
        return 0
      }
      throw new Error(`Failed to get viewer count: ${response.status}`)
    }

    const data = await response.json()
    
    // API returns an array of metrics, find the one matching our playbackId
    if (Array.isArray(data) && data.length > 0) {
      const metrics = data.find((item: any) => item.playbackId === playbackId)
      if (metrics && typeof metrics.viewCount === 'number') {
        return metrics.viewCount
      }
    }
    
    // If no matching playbackId found, return 0
    return 0
  } catch (error) {
    console.error("Error fetching viewer count:", error)
    // Return 0 on error instead of throwing, so the app doesn't break
    return 0
  }
}

/**
 * List assets from Livepeer API
 * Can filter by source stream ID to find assets created from a specific stream
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

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${LIVEPEER_API_KEY}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to list assets: ${response.status}`)
    }

    const data = await response.json()
    // Livepeer API returns assets in different formats, normalize it
    return Array.isArray(data) ? data : (data.assets || [])
  } catch (error) {
    console.error("Error listing assets:", error)
    throw error
  }
}

/**
 * Get asset by ID from Livepeer API
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

    return await response.json()
  } catch (error) {
    console.error("Error fetching asset:", error)
    throw error
  }
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
    // First, try to get assets filtered by source stream ID
    const allAssets = await listAssets(streamId)
    
    // CRITICAL: Filter assets to ensure they actually belong to this stream
    // The API might return assets from other streams, so we need to verify sourceStreamId matches
    const assets = allAssets?.filter((asset: any) => {
      const assetSourceStreamId = asset.sourceStreamId || asset.source?.streamId
      const matches = assetSourceStreamId === streamId
      if (!matches) {
        console.warn(`Skipping asset ${asset.id} - sourceStreamId mismatch: expected ${streamId}, got ${assetSourceStreamId}`)
      }
      return matches
    }) || []
    
    console.log(`Found ${assets.length} assets for stream ${streamId} (filtered from ${allAssets?.length || 0} total assets)`)
    
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
      
      // Prioritize assets that are ready and have playbackId (from most recent)
      // For VOD, the asset's playbackId is what we need
      const readyAsset = sortedAssets.find((asset: any) => 
        asset.status === "ready" && asset.playbackId
      )
      
      if (readyAsset) {
        console.log(`Found ready asset with playbackId (most recent) for stream ${streamId}: ${readyAsset.playbackId}`)
        return readyAsset
      }
      
      // Fallback: find asset with playbackId even if status is not "ready" (from most recent)
      const assetWithPlaybackId = sortedAssets.find((asset: any) => asset.playbackId)
      if (assetWithPlaybackId) {
        console.log(`Found asset with playbackId (status: ${assetWithPlaybackId.status}, most recent) for stream ${streamId}: ${assetWithPlaybackId.playbackId}`)
        return assetWithPlaybackId
      }
      
      // Fallback: find asset with playbackUrl (from most recent)
      const assetWithPlaybackUrl = sortedAssets.find((asset: any) => 
        asset.playbackUrl || asset.status === "ready"
      )
      
      if (assetWithPlaybackUrl) {
        console.log(`Found asset with playbackUrl (most recent) for stream ${streamId}: ${assetWithPlaybackUrl.playbackUrl}`)
        return assetWithPlaybackUrl
      }
      
      // If no ready asset, return the most recent one (might still be processing)
      console.log(`Using most recent asset (may still be processing) for stream ${streamId}: ${sortedAssets[0].id}`)
      return sortedAssets[0]
    }

    // If no assets found by source stream ID, try checking the stream's sessions
    // Sometimes assets are linked through sessions
    const stream = await getStream(streamId)
    
    if (stream?.sessions) {
      for (const session of stream.sessions) {
        if (session.record && session.recordingUrl) {
          // Try to find asset by checking if recordingUrl contains asset ID
          // Or use the session's recording info
          return {
            id: session.id,
            playbackUrl: session.recordingUrl,
            playbackId: stream.playbackId,
            status: "ready",
          }
        }
      }
    }

    console.log(`No assets found for stream ${streamId}`)
    return null
  } catch (error) {
    console.error("Error fetching stream asset:", error)
    return null
  }
}

