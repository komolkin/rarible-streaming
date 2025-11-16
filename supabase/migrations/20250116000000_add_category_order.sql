-- Add order column to categories table for custom ordering
ALTER TABLE categories ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT 0 NOT NULL;

-- Create index for better query performance when sorting by order
CREATE INDEX IF NOT EXISTS idx_categories_order ON categories("order");

