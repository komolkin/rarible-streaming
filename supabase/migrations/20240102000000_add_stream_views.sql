-- Add stream_views table to track view events
-- This tracks when users view streams (both live and replay)
-- Multiple views from the same user are allowed (they can watch multiple times)
-- Total Views is calculated as COUNT(DISTINCT user_address) per stream

CREATE TABLE IF NOT EXISTS stream_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id UUID REFERENCES streams(id) ON DELETE CASCADE NOT NULL,
  user_address TEXT NOT NULL,
  viewed_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_stream_views_stream ON stream_views(stream_id);
CREATE INDEX IF NOT EXISTS idx_stream_views_user ON stream_views(user_address);
CREATE INDEX IF NOT EXISTS idx_stream_views_viewed_at ON stream_views(viewed_at);
