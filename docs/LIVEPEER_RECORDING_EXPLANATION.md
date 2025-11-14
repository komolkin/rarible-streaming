# How Livepeer Recording Works

## Overview

When a stream ends with recording enabled, Livepeer automatically creates a **Video Asset** (VOD) that can be accessed via multiple methods. This document explains how we fetch and use recordings in our application.

## Livepeer Recording Architecture

### 1. **Stream Recording Process**

When a stream is created with `record: true`:
- Livepeer records the stream in real-time
- When the stream ends, Livepeer processes the recording
- An **Asset** is created from the recorded stream
- The Asset has its own `playbackId` (different from the stream's `playbackId`)

### 2. **Three Methods to Access Recordings**

Livepeer provides three ways to access recordings:

#### **Method 1: Assets API** (Most Reliable for VOD)
```
GET /api/asset?sourceStreamId={streamId}
```
- Returns assets created from the stream
- Assets have their own `playbackId` optimized for VOD playback
- Asset status: `"ready"`, `"processing"`, `"failed"`, etc.
- **Best for VOD playback** - uses asset's playbackId

#### **Method 2: Sessions API** (Fastest)
```
GET /api/stream/{streamId}/sessions
```
- Surfaces recordings almost immediately after stream ends
- Returns session metadata with `recordingUrl` or `playbackUrl`
- May include `playbackId` in session data
- **Fastest method** - available right after stream ends

#### **Method 3: Stream PlaybackId** (Fallback)
- The stream's original `playbackId` can work for VOD playback
- Livepeer Player automatically handles VOD with stream playbackId
- **Works but asset playbackId is preferred**

## Our Implementation

### API Endpoint: `/api/streams/[id]/recording`

This endpoint fetches the recording for an ended stream using all three methods in priority order:

1. **Assets API** - Tries to get the asset by `sourceStreamId`
   - Returns asset with `playbackId` if status is `"ready"`
   - Returns `202 Accepted` if asset is still `"processing"`

2. **Sessions API** - Falls back to sessions if no ready asset found
   - Returns session recording with `playbackUrl` or `playbackId`

3. **Stream Metadata** - Checks stream's `recordings` array as fallback

4. **Stream PlaybackId** - Last resort, uses stream's playbackId

### Frontend Flow

When a stream ends (`stream.endedAt` is set):

1. **Immediate Check**: `checkVodAvailability()` is called
   - If stream has `playbackId`, marks VOD as ready immediately
   - Also calls `fetchStreamRecording()` to get asset playbackId

2. **Fetch Recording**: `fetchStreamRecording()` calls `/api/streams/[id]/recording`
   - Parses the recording response
   - Sets `assetPlaybackId` if asset playbackId is available
   - Falls back to stream playbackId if no asset found

3. **Polling**: Polls every 10 seconds until recording is found
   - Continues until `vodReady` is true
   - Handles `202 Accepted` (processing) responses gracefully

4. **Playback**: Uses Livepeer Player with playbackId
   - **Priority**: Asset playbackId > Stream playbackId
   - Player automatically handles VOD playback

## Response Format

### Success Response (200 OK)
```json
{
  "success": true,
  "source": "asset" | "session" | "stream_metadata" | "stream_playbackId",
  "recording": {
    "id": "asset-id-or-session-id",
    "playbackId": "playback-id-for-vod",
    "playbackUrl": "https://playback.livepeer.com/hls/{playbackId}/index.m3u8",
    "status": "ready",
    "duration": 3600,
    "createdAt": "2024-01-01T00:00:00Z",
    "sourceStreamId": "original-stream-id"
  }
}
```

### Processing Response (202 Accepted)
```json
{
  "success": false,
  "source": "asset",
  "status": "processing",
  "message": "Asset is processing. Please try again in a few moments."
}
```

### Not Found Response (404)
```json
{
  "success": false,
  "message": "Recording not available yet. Livepeer is still processing the recording."
}
```

## Key Points

1. **Asset PlaybackId is Preferred**: The asset's playbackId is optimized for VOD playback and is more reliable than using the stream's playbackId.

2. **Processing Time**: Livepeer needs time to process recordings. Assets may be in `"processing"` status for a few minutes after stream ends.

3. **Multiple Fallbacks**: We try multiple methods to ensure recordings are available as soon as possible.

4. **Player Compatibility**: The Livepeer Player component can handle VOD playback with either playbackId, but asset playbackId is preferred.

5. **Polling Strategy**: We poll every 10 seconds until recording is found, handling processing states gracefully.

## References

- [Livepeer Playback API](https://docs.livepeer.org/api-reference/playback/get)
- [Livepeer Assets API](https://docs.livepeer.org/api-reference/asset/get)
- [Livepeer Sessions API](https://docs.livepeer.org/api-reference/stream/get-sessions)
- [Livepeer Playback Guide](https://docs.livepeer.org/developers/guides/playback-a-livestream)

