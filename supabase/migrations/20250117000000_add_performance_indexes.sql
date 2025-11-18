-- Performance optimization indexes
-- These indexes significantly improve query performance for common patterns
-- Run this migration in Supabase SQL Editor or via Supabase CLI

-- For streams list queries (most common - ordered by created_at DESC)
CREATE INDEX IF NOT EXISTS idx_streams_created_at_desc ON streams(created_at DESC);

-- For ended streams list queries
CREATE INDEX IF NOT EXISTS idx_streams_ended_at_desc ON streams(ended_at DESC) WHERE ended_at IS NOT NULL;

-- Composite index for live streams ordered by creation time
CREATE INDEX IF NOT EXISTS idx_streams_is_live_created_at ON streams(is_live, created_at DESC);

-- Composite index for creator queries with ordering
CREATE INDEX IF NOT EXISTS idx_streams_creator_created_at ON streams(creator_address, created_at DESC);

-- Composite index for category queries with ordering
CREATE INDEX IF NOT EXISTS idx_streams_category_created_at ON streams(category_id, created_at DESC) WHERE category_id IS NOT NULL;

-- Index for Livepeer stream ID lookups (used frequently)
CREATE INDEX IF NOT EXISTS idx_streams_livepeer_stream_id ON streams(livepeer_stream_id) WHERE livepeer_stream_id IS NOT NULL;

-- Index for asset ID lookups (used for VOD playback)
CREATE INDEX IF NOT EXISTS idx_streams_asset_id ON streams(asset_id) WHERE asset_id IS NOT NULL;

-- Index for preview image URL (to quickly find streams without thumbnails)
CREATE INDEX IF NOT EXISTS idx_streams_preview_image_url ON streams(preview_image_url) WHERE preview_image_url IS NOT NULL;

-- Composite index for streams by creator and live status
CREATE INDEX IF NOT EXISTS idx_streams_creator_is_live ON streams(creator_address, is_live, created_at DESC);

