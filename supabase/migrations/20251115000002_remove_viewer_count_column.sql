-- Remove viewer_count column from streams table
-- Viewer count is now fetched directly from Livepeer API instead of being stored in database
ALTER TABLE streams
DROP COLUMN IF EXISTS viewer_count;

