# Livepeer View Counts - Quick Summary

## Current Status

### ✅ What We Have
1. **Real-time Concurrent Viewers** - Working
   - Endpoint: `GET /api/data/views/now?playbackId={id}&breakdownBy=playbackId`
   - Implementation: `getViewerCount()` in `lib/livepeer.ts`
   - Returns: Current number of people watching right now
   - Limitations: Only works for active streams, no historical data

2. **Total Views Tracking** - Custom Implementation
   - Database table: `stream_views` in Supabase
   - Tracks: Unique user views (one per user per hour)
   - Calculation: `COUNT(DISTINCT user_address)` per stream
   - API: `/api/streams/[id]/views` (GET for count, POST to track)

### ❓ What We Need to Verify

The following endpoints **may or may not exist** - need to test:

1. **Historical View Counts**
   - `GET /api/data/views?playbackId={id}`
   - `GET /api/data/views?playbackId={id}&from={timestamp}&to={timestamp}`
   - Would provide: Historical view counts over time, total lifetime views

2. **Stream Metrics**
   - `GET /api/stream/{streamId}/metrics`
   - Would provide: Comprehensive stream analytics including views

3. **Asset Metrics** (for VOD replays)
   - `GET /api/asset/{assetId}/metrics`
   - Would provide: VOD replay view counts and analytics

## How to Test

### Option 1: Use the Test Script
```bash
# Make sure you have a valid LIVEPEER_API_KEY in .env.local
npx tsx scripts/test-livepeer-view-endpoints.ts <playbackId> [streamId] [assetId]
```

### Option 2: Manual API Testing
```bash
# Test real-time views (we know this works)
curl -X GET "https://livepeer.studio/api/data/views/now?playbackId={playbackId}&breakdownBy=playbackId" \
  -H "Authorization: Bearer {YOUR_API_KEY}"

# Test historical views (unknown if exists)
curl -X GET "https://livepeer.studio/api/data/views?playbackId={playbackId}" \
  -H "Authorization: Bearer {YOUR_API_KEY}"

# Test stream metrics (unknown if exists)
curl -X GET "https://livepeer.studio/api/stream/{streamId}/metrics" \
  -H "Authorization: Bearer {YOUR_API_KEY}"
```

## Documentation References

- **Livepeer Docs**: https://docs.livepeer.org
- **API Reference**: https://docs.livepeer.org/api-reference
- **Data API**: https://docs.livepeer.org/api-reference/data (if exists)

## Recommendations

### If Historical Views API Exists:
1. ✅ Use it to get total lifetime views for streams
2. ✅ Use it to get peak concurrent viewers
3. ✅ Use it to get view counts for VOD replays
4. ✅ Sync this data with our database for faster queries

### If Historical Views API Doesn't Exist:
1. ✅ Continue using our custom `stream_views` table for total views
2. ✅ Use Livepeer's real-time API only for concurrent viewers
3. ✅ Consider implementing our own analytics tracking for more detailed metrics
4. ✅ Track peak concurrent viewers ourselves by polling and storing max values

## Current Implementation Details

### Real-time Viewer Count
- **Function**: `getViewerCount(playbackId)` in `lib/livepeer.ts:715`
- **API Route**: `/api/streams/[id]/viewers` in `app/api/streams/[id]/viewers/route.ts`
- **Frontend**: Polls every 5 seconds for live streams
- **Updates**: Stored in `streams.viewer_count` column in database

### Total Views
- **Database Table**: `stream_views` (created in migration `20240102000000_add_stream_views.sql`)
- **API Route**: `/api/streams/[id]/views` in `app/api/streams/[id]/views/route.ts`
- **Tracking**: Frontend calls POST when user views a stream
- **Calculation**: `COUNT(DISTINCT user_address)` per stream
- **Rate Limiting**: One view per user per hour (prevents spam)

## Next Actions

1. **Run the test script** with real playbackId/streamId/assetId values
2. **Check Livepeer documentation** for official API reference
3. **Update implementation** based on findings
4. **Document results** in this file
