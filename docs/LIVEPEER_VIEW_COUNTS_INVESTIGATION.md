# Livepeer API View Counts Investigation

## Current Implementation

The codebase currently uses Livepeer's **Realtime Viewership API** to fetch current viewer counts:

### Endpoint Used
- **URL**: `https://livepeer.studio/api/data/views/now`
- **Method**: GET
- **Parameters**: 
  - `playbackId` (required) - The playback ID of the stream/asset
  - `breakdownBy` (optional) - Set to `"playbackId"` to filter by specific playbackId

### Implementation Location
- **Function**: `getViewerCount(playbackId: string)` in `lib/livepeer.ts` (lines 715-767)
- **API Route**: `/api/streams/[id]/viewers` in `app/api/streams/[id]/viewers/route.ts`

### Current Behavior
- Returns **real-time concurrent viewer count** (how many people are watching right now)
- Returns `0` if no viewers or if stream hasn't started
- Returns `0` on 404 errors (stream might not have viewers yet)
- Only works for **active streams** - doesn't provide historical data

## Livepeer API Documentation Research

### Available Endpoints

Based on Livepeer's API structure, here are the potential endpoints for view counts:

#### 1. **Realtime Viewership API** (Currently Used)
```
GET /api/data/views/now
```
- **Purpose**: Get current concurrent viewers
- **Limitations**: 
  - Only provides real-time data
  - No historical data
  - Only works for active streams

#### 2. **Historical Views API** (Potential)
```
GET /api/data/views
```
- **Purpose**: Get historical view counts over time
- **Parameters**:
  - `playbackId` - Filter by playback ID
  - `from` - Start timestamp
  - `to` - End timestamp
  - `granularity` - Time granularity (hour, day, etc.)
- **Status**: **NEEDS VERIFICATION** - May or may not exist

#### 3. **Stream Metrics API** (Potential)
```
GET /api/stream/{streamId}/metrics
```
- **Purpose**: Get comprehensive metrics for a stream
- **May include**: View counts, watch time, peak viewers, etc.
- **Status**: **NEEDS VERIFICATION**

#### 4. **Asset Metrics API** (Potential)
```
GET /api/asset/{assetId}/metrics
```
- **Purpose**: Get metrics for VOD assets
- **May include**: Total views, watch time, etc.
- **Status**: **NEEDS VERIFICATION**

## What We Need to Verify

### 1. Historical View Counts
- [ ] Does Livepeer provide historical view count data?
- [ ] Can we get total lifetime views for a stream/asset?
- [ ] Can we get peak concurrent viewers?
- [ ] Can we get view counts for VOD replays?

### 2. Additional Metrics
- [ ] Watch time / duration metrics
- [ ] Geographic distribution of viewers
- [ ] Device/browser breakdown
- [ ] Engagement metrics (average watch time, completion rate)

### 3. API Endpoints
- [ ] Verify `/api/data/views` endpoint exists
- [ ] Verify `/api/stream/{id}/metrics` endpoint exists
- [ ] Verify `/api/asset/{id}/metrics` endpoint exists
- [ ] Check what parameters these endpoints accept

## Testing Plan

### Test 1: Check if Historical Views Endpoint Exists
```bash
curl -X GET "https://livepeer.studio/api/data/views?playbackId={playbackId}" \
  -H "Authorization: Bearer {API_KEY}"
```

### Test 2: Check Stream Metrics Endpoint
```bash
curl -X GET "https://livepeer.studio/api/stream/{streamId}/metrics" \
  -H "Authorization: Bearer {API_KEY}"
```

### Test 3: Check Asset Metrics Endpoint
```bash
curl -X GET "https://livepeer.studio/api/asset/{assetId}/metrics" \
  -H "Authorization: Bearer {API_KEY}"
```

### Test 4: Check Current Views Endpoint with Different Parameters
```bash
# Test with time range
curl -X GET "https://livepeer.studio/api/data/views/now?playbackId={playbackId}&from={timestamp}&to={timestamp}" \
  -H "Authorization: Bearer {API_KEY}"

# Test without breakdownBy
curl -X GET "https://livepeer.studio/api/data/views/now?playbackId={playbackId}" \
  -H "Authorization: Bearer {API_KEY}"
```

## Current Limitations

1. **No Historical Data**: Current implementation only provides real-time concurrent viewers
2. **No Total Views**: Cannot get lifetime total views from Livepeer API
3. **No VOD Metrics**: Cannot get view counts for VOD replays (only live streams)
4. **No Peak Viewers**: Cannot get peak concurrent viewers during stream

## Workarounds in Current Codebase

The codebase currently tracks **total views** using a custom database table (`stream_views`):
- Tracks unique user views (one view per user per hour)
- Stored in Supabase database
- Calculated as `COUNT(DISTINCT user_address)` per stream
- This is separate from Livepeer's API

## Recommendations

### If Historical Views API Exists:
1. Use it to get total lifetime views for streams
2. Use it to get peak concurrent viewers
3. Use it to get view counts for VOD replays
4. Sync this data with our database for faster queries

### If Historical Views API Doesn't Exist:
1. Continue using our custom `stream_views` table for total views
2. Use Livepeer's real-time API only for concurrent viewers
3. Consider implementing our own analytics tracking for more detailed metrics

## Next Steps

1. **Test the API endpoints** listed above to verify what's available
   - Use the test script: `npx tsx scripts/test-livepeer-view-endpoints.ts <playbackId> [streamId] [assetId]`
2. **Check Livepeer documentation** for official API reference
   - Main docs: https://docs.livepeer.org
   - API reference: https://docs.livepeer.org/api-reference
3. **Contact Livepeer support** if documentation is unclear
4. **Implement new endpoints** if they exist and provide useful data

## Test Script

A test script has been created at `scripts/test-livepeer-view-endpoints.ts` to systematically test all potential Livepeer API endpoints for view counts.

**Usage:**
```bash
npx tsx scripts/test-livepeer-view-endpoints.ts <playbackId> [streamId] [assetId]
```

**What it tests:**
1. `/api/data/views/now` - Current real-time views (known to work)
2. `/api/data/views` - Historical views (needs verification)
3. `/api/data/views` with time range - Historical views with filters (needs verification)
4. `/api/stream/{id}/metrics` - Stream metrics (needs verification)
5. `/api/asset/{id}/metrics` - Asset metrics (needs verification)
6. `/api/stream/{id}` - Check if stream response includes view metrics
7. `/api/asset/{id}` - Check if asset response includes view metrics

## Findings Summary

### ✅ Confirmed Available
- **Real-time concurrent viewers**: `/api/data/views/now` endpoint works
  - Returns current number of concurrent viewers
  - Requires `playbackId` parameter
  - Optional `breakdownBy` parameter for filtering

### ❓ Needs Verification
- **Historical view counts**: Unknown if `/api/data/views` exists
- **Total lifetime views**: Unknown if available via API
- **Peak concurrent viewers**: Unknown if available via API
- **VOD replay view counts**: Unknown if available via API
- **Stream/Asset metrics endpoints**: Unknown if `/metrics` endpoints exist

### ✅ Current Workaround
- **Total views tracking**: Implemented via custom `stream_views` database table
  - Tracks unique user views (one per user per hour)
  - Calculated as `COUNT(DISTINCT user_address)` per stream
  - Stored in Supabase database
  - Separate from Livepeer API
