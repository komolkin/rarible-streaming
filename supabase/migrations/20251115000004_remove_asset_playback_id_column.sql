-- Remove asset_playback_id column from streams table
-- Asset playback IDs are now fetched dynamically from Livepeer API when needed
-- This simplifies the codebase and removes unnecessary database storage

ALTER TABLE streams
DROP COLUMN IF EXISTS asset_playback_id;

