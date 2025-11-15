-- Rollback: Remove asset metadata columns from streams
-- This rolls back the changes from 20251115000000_add_asset_playback_columns.sql
ALTER TABLE streams
DROP COLUMN IF EXISTS asset_id;

ALTER TABLE streams
DROP COLUMN IF EXISTS asset_playback_id;

