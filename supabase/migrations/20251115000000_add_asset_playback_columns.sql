-- Add asset metadata columns to streams
ALTER TABLE streams
ADD COLUMN IF NOT EXISTS asset_id TEXT;

ALTER TABLE streams
ADD COLUMN IF NOT EXISTS asset_playback_id TEXT;

