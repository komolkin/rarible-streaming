-- Add preview_image_url column to streams table
ALTER TABLE streams ADD COLUMN IF NOT EXISTS preview_image_url TEXT;

