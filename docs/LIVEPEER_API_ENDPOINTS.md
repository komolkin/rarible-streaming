# Livepeer API Endpoints Reference

This document lists all Livepeer API endpoints used in the codebase and potential endpoints for view counts.

## Currently Used Endpoints

### 1. Create Stream
- **Endpoint**: `POST /api/stream`
- **Location**: `lib/livepeer.ts:createStream()`
- **Purpose**: Create a new Livepeer stream
- **Status**: ✅ Working

### 2. Get Stream
- **Endpoint**: `GET /api/stream/{streamId}`
- **Location**: `lib/livepeer.ts:getStream()`
- **Purpose**: Get stream details including playbackId
- **Status**: ✅ Working

### 3. Get Stream Sessions
- **Endpoint**: `GET /api/stream/{streamId}/sessions`
- **Location**: `lib/livepeer.ts:getStreamSessions()`
- **Purpose**: Get recording sessions for a stream
- **Status**: ✅ Working

### 4. Get Playback Info
- **Endpoint**: `GET /api/playback/{playbackId}`
- **Location**: `lib/livepeer.ts:getPlaybackInfo()`
- **Purpose**: Get playback information (live/VOD, sources, thumbnails)
- **Status**: ✅ Working

### 5. Get Real-time Viewer Count
- **Endpoint**: `GET /api/data/views/now?playbackId={id}&breakdownBy=playbackId`
- **Location**: `lib/livepeer.ts:getViewerCount()`
- **Purpose**: Get current concurrent viewer count
- **Status**: ✅ Working
- **Returns**: Array with `viewCount` field
- **Limitations**: Only real-time, no historical data

### 6. List Assets
- **Endpoint**: `GET /api/asset?sourceStreamId={streamId}`
- **Location**: `lib/livepeer.ts:listAssets()`
- **Purpose**: List VOD assets created from streams
- **Status**: ✅ Working

### 7. Get Asset
- **Endpoint**: `GET /api/asset/{assetId}`
- **Location**: `lib/livepeer.ts:getAsset()`
- **Purpose**: Get asset details
- **Status**: ✅ Working

## Potential Endpoints (Need Verification)

### 1. Historical Views
- **Endpoint**: `GET /api/data/views?playbackId={id}`
- **Purpose**: Get historical view counts
- **Status**: ❓ Unknown - needs testing
- **Expected Parameters**:
  - `playbackId` (required)
  - `from` (optional) - Start timestamp
  - `to` (optional) - End timestamp
  - `granularity` (optional) - hour, day, etc.

### 2. Stream Metrics
- **Endpoint**: `GET /api/stream/{streamId}/metrics`
- **Purpose**: Get comprehensive stream metrics
- **Status**: ❓ Unknown - needs testing
- **Expected**: May include view counts, watch time, peak viewers, etc.

### 3. Asset Metrics
- **Endpoint**: `GET /api/asset/{assetId}/metrics`
- **Purpose**: Get VOD asset metrics
- **Status**: ❓ Unknown - needs testing
- **Expected**: May include total views, watch time, etc.

## Testing

Use the test script to verify which endpoints exist:
```bash
npx tsx scripts/test-livepeer-view-endpoints.ts <playbackId> [streamId] [assetId]
```

## Documentation

- **Livepeer Docs**: https://docs.livepeer.org
- **API Reference**: https://docs.livepeer.org/api-reference
- **Data API**: Check if `/api-reference/data` exists in docs

## Response Formats

### Real-time Views Response (`/api/data/views/now`)
```json
[
  {
    "playbackId": "abc123",
    "viewCount": 42
  }
]
```

### Historical Views Response (if exists)
```json
{
  "playbackId": "abc123",
  "data": [
    {
      "timestamp": 1234567890,
      "viewCount": 50
    }
  ],
  "totalViews": 1000,
  "peakViewers": 75
}
```

### Stream Metrics Response (if exists)
```json
{
  "streamId": "stream123",
  "totalViews": 1000,
  "peakConcurrentViewers": 75,
  "averageWatchTime": 3600,
  "totalWatchTime": 3600000
}
```

## Implementation Notes

1. **Real-time views** are polled every 5 seconds for live streams
2. **Total views** are tracked in our own database (`stream_views` table)
3. If historical/metrics endpoints exist, we should integrate them to:
   - Get accurate total views from Livepeer
   - Get peak concurrent viewers
   - Get VOD replay view counts
   - Reduce reliance on our custom tracking
