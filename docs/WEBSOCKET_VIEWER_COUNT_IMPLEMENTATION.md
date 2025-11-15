# WebSocket Real-time Viewer Count Implementation

## Overview

The viewer count now updates in **real-time via WebSocket** without requiring page refresh. This provides instant updates when viewer counts change, significantly improving the user experience.

## How It Works

### Architecture

1. **Backend Polling**: The backend API (`/api/streams/[id]`) polls Livepeer's API every time it's called to get the latest viewer count
2. **Database Update**: When the viewer count changes, it's updated in the `streams` table
3. **WebSocket Broadcast**: Supabase Realtime automatically broadcasts the database UPDATE event to all subscribed clients
4. **Frontend Update**: The frontend receives the update instantly and updates the UI

### Components

#### 1. Database Migration
- **File**: `supabase/migrations/20240103000000_enable_streams_realtime.sql`
- **Purpose**: Enables Supabase Realtime for the `streams` table
- **SQL**: `ALTER PUBLICATION supabase_realtime ADD TABLE streams;`

#### 2. Frontend Subscription
- **File**: `app/stream/[id]/page.tsx`
- **Function**: `subscribeToViewerCount()`
- **How it works**:
  - Subscribes to `UPDATE` events on the `streams` table filtered by stream ID
  - Updates the local state when viewer count changes
  - Also updates `isLive` and `endedAt` fields in real-time

#### 3. Reusable Hook (Optional)
- **File**: `lib/hooks/use-stream-realtime.ts`
- **Purpose**: Reusable hook for subscribing to stream updates
- **Usage**: Can be used in other components that need real-time stream updates

## Update Flow

```
Livepeer API (real-time viewer count)
    ↓
Backend API (/api/streams/[id]) - polls every 30 seconds
    ↓
Database (streams.viewer_count updated)
    ↓
Supabase Realtime (broadcasts UPDATE event)
    ↓
WebSocket Connection (all subscribed clients)
    ↓
Frontend (UI updates instantly)
```

## Benefits

1. **Instant Updates**: Viewer count changes appear immediately (no 10-second delay)
2. **Efficient**: Only updates when data actually changes
3. **Scalable**: Works for multiple viewers watching the same stream
4. **Fallback**: Still has polling (every 30 seconds) as backup for other metadata

## Configuration

### Polling Interval
- **Before**: 10 seconds
- **After**: 30 seconds (reduced since WebSocket handles viewer count)
- **Reason**: Polling now mainly serves as fallback and updates other metadata

### WebSocket Connection
- **Provider**: Supabase Realtime (WebSocket-based)
- **Channel**: `stream-viewers:{streamId}`
- **Event**: `postgres_changes` with `UPDATE` event
- **Filter**: `id=eq.{streamId}`

## Testing

To verify the WebSocket implementation works:

1. **Open browser console** on a stream page
2. **Look for logs**:
   - `"Successfully subscribed to viewer count updates"`
   - `"[Real-time] Viewer count updated: X -> Y"`
3. **Test with multiple tabs**: Open the same stream in multiple tabs and verify all update simultaneously
4. **Monitor network tab**: Check for WebSocket connection (ws:// or wss://)

## Troubleshooting

### WebSocket not connecting
- Check if Supabase Realtime is enabled for `streams` table
- Run migration: `supabase/migrations/20240103000000_enable_streams_realtime.sql`
- Verify Supabase URL and keys are correct

### Updates not appearing
- Check browser console for subscription errors
- Verify the backend is updating the database (check logs)
- Ensure WebSocket connection is established (check Network tab)

### Fallback to polling
- If WebSocket fails, polling will continue to work (every 30 seconds)
- Check console for `CHANNEL_ERROR` messages

## Migration Steps

1. **Run the migration**:
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE streams;
   ```

2. **Deploy the updated code** (already done)

3. **Verify**:
   - Open a stream page
   - Check browser console for subscription confirmation
   - Watch viewer count update in real-time

## Future Enhancements

- Add real-time updates for stream cards on home/browse pages
- Implement optimistic updates for better UX
- Add connection status indicator
- Implement reconnection logic for dropped connections
