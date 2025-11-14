import { NextRequest, NextResponse } from "next/server"
import { getPlaybackInfo, getStreamAsset } from "@/lib/livepeer"
import { db } from "@/lib/db"
import { streams } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// Mark this route as dynamic since it uses request.url
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const playbackId = searchParams.get("playbackId")

    if (!playbackId) {
      return NextResponse.json({ error: "playbackId is required" }, { status: 400 })
    }

    // Try to fetch playback info from Livepeer
    let playbackInfo
    let actualPlaybackId = playbackId
    
    try {
      playbackInfo = await getPlaybackInfo(playbackId)
    } catch (error: any) {
      console.warn(`Failed to get playback info for playbackId ${playbackId}:`, error?.message)
      
      // If playbackId doesn't work, it might be a stream playbackId, not an asset playbackId
      // Try to find the asset playbackId from the stream
      try {
        // Get the stream to find its livepeerStreamId
        const [stream] = await db.select().from(streams).where(eq(streams.id, params.id))
        if (stream?.livepeerStreamId) {
          const asset = await getStreamAsset(stream.livepeerStreamId)
          if (asset?.playbackId) {
            console.log(`Found asset playbackId ${asset.playbackId} for stream ${stream.livepeerStreamId}`)
            actualPlaybackId = asset.playbackId
            playbackInfo = await getPlaybackInfo(asset.playbackId)
          }
        }
      } catch (assetError) {
        console.warn("Could not fetch asset:", assetError)
      }
      
      // If still no playbackInfo, return error
      if (!playbackInfo) {
        return NextResponse.json(
          { error: `Failed to get playback info for playbackId: ${playbackId}. This might be a stream playbackId, not an asset playbackId.` },
          { status: 404 }
        )
      }
    }
    
    console.log("Playback info for", playbackId, ":", JSON.stringify(playbackInfo, null, 2))

    // Extract HLS URL and MP4 URL from playback info
    // Livepeer playback API returns sources array with different formats
    let hlsUrl = null
    let mp4Url = null
    
    // Check different possible response structures
    if (playbackInfo?.source && Array.isArray(playbackInfo.source)) {
      console.log(`Found ${playbackInfo.source.length} sources in playback info`)
      
      // Check for HLS source (m3u8)
      const hlsSource = playbackInfo.source.find((s: any) => 
        s.type === "application/x-mpegURL" || 
        s.type === "application/vnd.apple.mpegurl" ||
        s.mime === "application/x-mpegURL" ||
        s.mime === "application/vnd.apple.mpegurl" ||
        s.url?.includes(".m3u8") ||
        s.url?.endsWith(".m3u8")
      )
      
      if (hlsSource?.url) {
        hlsUrl = hlsSource.url
        console.log(`Found HLS URL in sources: ${hlsUrl}`)
      }
      
      // Check for MP4 source
      const mp4Source = playbackInfo.source.find((s: any) => 
        s.type === "video/mp4" ||
        s.mime === "video/mp4" ||
        s.url?.includes(".mp4") ||
        s.url?.endsWith(".mp4")
      )
      
      if (mp4Source?.url) {
        mp4Url = mp4Source.url
        console.log(`Found MP4 URL in sources: ${mp4Url}`)
      }
      
      // Fallback: check first source URL if no specific format found
      if (!hlsUrl && !mp4Url && playbackInfo.source[0]?.url) {
        const firstUrl = playbackInfo.source[0].url
        console.log(`Checking first source URL: ${firstUrl}`)
        if (firstUrl.includes(".m3u8") || firstUrl.includes("m3u8")) {
          hlsUrl = firstUrl
          console.log(`Using first source as HLS URL: ${hlsUrl}`)
        } else if (firstUrl.includes(".mp4")) {
          mp4Url = firstUrl
          console.log(`Using first source as MP4 URL: ${mp4Url}`)
        }
      }
      
      // Log all sources for debugging
      playbackInfo.source.forEach((s: any, index: number) => {
        console.log(`Source ${index + 1}:`, {
          type: s.type,
          mime: s.mime,
          url: s.url,
          isHLS: s.url?.includes(".m3u8") || s.type?.includes("mpegurl"),
          isMP4: s.url?.includes(".mp4") || s.type === "video/mp4"
        })
      })
    }
    
    // Also check for direct HLS URL in response
    if (!hlsUrl && playbackInfo?.hlsUrl) {
      hlsUrl = playbackInfo.hlsUrl
      console.log(`Found HLS URL in response: ${hlsUrl}`)
    }
    
    // Check for MP4 URL in response
    if (!mp4Url && playbackInfo?.mp4Url) {
      mp4Url = playbackInfo.mp4Url
      console.log(`Found MP4 URL in response: ${mp4Url}`)
    }
    
    // Check playbackUrl - could be HLS or MP4
    if (!hlsUrl && !mp4Url && playbackInfo?.playbackUrl) {
      const playbackUrl = playbackInfo.playbackUrl
      if (playbackUrl.includes(".m3u8") || playbackUrl.includes("m3u8")) {
        hlsUrl = playbackUrl
        console.log(`Using playbackUrl as HLS URL: ${hlsUrl}`)
      } else if (playbackUrl.includes(".mp4")) {
        mp4Url = playbackUrl
        console.log(`Using playbackUrl as MP4 URL: ${mp4Url}`)
      } else {
        // Default to HLS if format unclear
        hlsUrl = playbackUrl
        console.log(`Using playbackUrl (format unclear): ${hlsUrl}`)
      }
    }

    // If no HLS URL found in sources, construct it from playbackId
    // Livepeer HLS URLs for VOD typically follow these patterns:
    // Official format: https://playback.livepeer.com/hls/{playbackId}/index.m3u8
    // Alternative formats for different CDNs
    if (!hlsUrl && actualPlaybackId) {
      // Use the official Livepeer playback URL format
      hlsUrl = `https://playback.livepeer.com/hls/${actualPlaybackId}/index.m3u8`
      console.log(`Constructed HLS URL from playbackId: ${hlsUrl}`)
    }

    return NextResponse.json({
      playbackId: actualPlaybackId, // Return the actual playbackId used (might be asset playbackId)
      originalPlaybackId: playbackId, // Original playbackId that was passed in
      hlsUrl,
      mp4Url, // Also return MP4 URL if available
      playbackInfo,
    })
  } catch (error: any) {
    console.error("Error fetching playback info:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to fetch playback info" },
      { status: 500 }
    )
  }
}

