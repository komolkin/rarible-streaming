-- Add asset metadata columns back to streams table
-- asset_playback_id is different from livepeer_playback_id and is needed for VOD views
-- For ended streams, we MUST use asset_playback_id to get total views (matches Livepeer dashboard)
ALTER TABLE streams
ADD COLUMN IF NOT EXISTS asset_id TEXT;

ALTER TABLE streams
ADD COLUMN IF NOT EXISTS asset_playback_id TEXT;

