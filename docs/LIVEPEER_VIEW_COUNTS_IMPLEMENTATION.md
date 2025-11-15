# Livepeer View Counts Implementation

## Overview

This document describes the implementation of Livepeer API view counts in the application. The implementation gracefully handles cases where Livepeer endpoints may or may not exist, falling back to database-based tracking when needed.

## What Was Implemented

### 1. New Functions in `lib/livepeer.ts`

#### `getHistoricalViews(playbackId, options?)`
- Fetches historical view data from Livepeer's `/api/data/views` endpoint
- Returns total views, peak viewers, and historical data points
- Returns `null` if endpoint doesn't exist (graceful fallback)
- Supports optional time range and granularity parameters

#### `getTotalViews(playbackId)`
- Convenience function to get total lifetime views
- Uses `getHistoricalViews()` internally
- Returns `null` if not available

#### `getPeakViewers(playbackId)`
- Convenience function to get peak concurrent viewers
- Uses `getHistoricalViews()` internally
- Returns `null` if not available

#### `getStreamMetrics(streamId)`
- Fetches comprehensive stream metrics from `/api/stream/{id}/metrics`
- Returns `null` if endpoint doesn't exist

#### `getAssetMetrics(assetId)`
- Fetches asset metrics from `/api/asset/{id}/metrics`
- Useful for VOD replay analytics
- Returns `null` if endpoint doesn't exist

### 2. Enhanced API Routes

#### `/api/streams/[id]/viewers` (GET)
**Enhanced to return:**
- `viewerCount` - Real-time concurrent viewers (always available)
- `totalViews` - Total lifetime views from Livepeer (if available)
- `peakViewers` - Peak concurrent viewers (if available)
- `historicalData` - Full historical view data (if available)

**Example Response:**
```json
{
  "playbackId": "abc123",
  "viewerCount": 42,
  "totalViews": 1000,
  "peakViewers": 75,
  "historicalData": {
    "playbackId": "abc123",
    "totalViews": 1000,
    "peakViewers": 75,
    "data": [...]
  },
  "fetchedAt": "2024-01-01T00:00:00Z"
}
```

#### `/api/streams/[id]` (GET)
**Enhanced `getTotalViews()` helper:**
- First tries Livepeer API for total views (if playbackId available)
- Falls back to database count if Livepeer API not available
- All calls updated to pass `playbackId` parameter

#### `/api/streams` (GET)
**Enhanced total views calculation:**
- For each stream with `livepeerPlaybackId`:
  1. Try Livepeer API first
  2. Fall back to database count if not available
- For streams without `livepeerPlaybackId`:
  - Use database count only

## How It Works

### Graceful Fallback Strategy

1. **Try Livepeer API First**
   - If endpoint exists and returns data → Use it
   - If endpoint returns 404/501 → Endpoint doesn't exist, fall back
   - If endpoint errors → Log warning, fall back

2. **Fall Back to Database**
   - Use existing `stream_views` table
   - Calculate `COUNT(DISTINCT user_address)` per stream
   - This ensures the app always has view counts

### Error Handling

All new functions:
- Return `null` (not errors) when endpoints don't exist
- Log informative messages (not errors) for missing endpoints
- Never throw errors that would break the app
- Gracefully degrade to database tracking

## Benefits

1. **Automatic Enhancement**: If Livepeer adds historical views API, the app automatically uses it
2. **No Breaking Changes**: App continues working even if endpoints don't exist
3. **Better Data**: When available, uses Livepeer's accurate view counts
4. **Backward Compatible**: Existing database tracking still works as fallback

## Testing

To test if endpoints work:

```bash
# Test with a real playbackId
npx tsx scripts/test-livepeer-view-endpoints.ts <playbackId> [streamId] [assetId]
```

The app will automatically:
- Use Livepeer data if endpoints exist
- Use database data if endpoints don't exist
- Log which source is being used

## Usage Examples

### Frontend: Fetching Viewer Data

```typescript
// Get comprehensive viewer data
const response = await fetch(`/api/streams/${streamId}/viewers`)
const data = await response.json()

// data.viewerCount - always available (real-time)
// data.totalViews - from Livepeer if available, null otherwise
// data.peakViewers - from Livepeer if available, null otherwise
```

### Backend: Using Total Views

```typescript
import { getTotalViews } from "@/lib/livepeer"

// Try Livepeer first, returns null if not available
const livepeerTotalViews = await getTotalViews(playbackId)

if (livepeerTotalViews !== null) {
  // Use Livepeer data
  console.log(`Total views from Livepeer: ${livepeerTotalViews}`)
} else {
  // Fall back to database
  const dbTotalViews = await getTotalViewsFromDatabase(streamId)
  console.log(`Total views from database: ${dbTotalViews}`)
}
```

## Current Status

### ✅ Working
- Real-time concurrent viewers (`/api/data/views/now`)
- Database fallback for total views
- Graceful error handling

### ❓ Needs Testing
- Historical views endpoint (`/api/data/views`)
- Stream metrics endpoint (`/api/stream/{id}/metrics`)
- Asset metrics endpoint (`/api/asset/{id}/metrics`)

## Next Steps

1. **Test with Real Data**: Run the test script with actual playbackIds to verify endpoints
2. **Monitor Logs**: Check application logs to see which endpoints are being used
3. **Update Frontend**: If endpoints work, update UI to show peak viewers and historical data
4. **Documentation**: Update API documentation based on test results

## Files Modified

- `lib/livepeer.ts` - Added new functions for historical views and metrics
- `app/api/streams/[id]/viewers/route.ts` - Enhanced to return historical data
- `app/api/streams/[id]/route.ts` - Updated to use Livepeer total views when available
- `app/api/streams/route.ts` - Updated to use Livepeer total views when available

## Notes

- All implementations are backward compatible
- No database migrations required
- Existing functionality continues to work
- New features activate automatically if Livepeer endpoints exist
