-- Add like_count column to streams table
ALTER TABLE streams ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0 NOT NULL;

-- Initialize like_count for existing streams based on stream_likes table
UPDATE streams
SET like_count = (
  SELECT COUNT(*)
  FROM stream_likes
  WHERE stream_likes.stream_id = streams.id
);

-- Create index for faster queries on like_count (optional, but useful for sorting)
CREATE INDEX IF NOT EXISTS idx_streams_like_count ON streams(like_count);

