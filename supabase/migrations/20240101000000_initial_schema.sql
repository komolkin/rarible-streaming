-- Initial schema migration
-- This file should be run in Supabase SQL Editor or via Supabase CLI

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL UNIQUE,
  username TEXT UNIQUE,
  display_name TEXT,
  bio TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Follows table
CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_address TEXT NOT NULL,
  following_address TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_address TEXT NOT NULL,
  reviewee_address TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Streams table
CREATE TABLE IF NOT EXISTS streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_address TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id),
  livepeer_stream_id TEXT,
  livepeer_playback_id TEXT,
  livepeer_stream_key TEXT,
  is_live BOOLEAN DEFAULT FALSE NOT NULL,
  viewer_count INTEGER DEFAULT 0 NOT NULL,
  like_count INTEGER DEFAULT 0 NOT NULL,
  scheduled_at TIMESTAMP,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  vod_url TEXT,
  preview_image_url TEXT,
  has_minting BOOLEAN DEFAULT FALSE NOT NULL,
  mint_contract_address TEXT,
  mint_token_id TEXT,
  mint_metadata_uri TEXT,
  mint_max_supply INTEGER,
  mint_per_wallet_limit INTEGER,
  mint_current_supply INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id UUID REFERENCES streams(id) ON DELETE CASCADE NOT NULL,
  sender_address TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Stream likes table
CREATE TABLE IF NOT EXISTS stream_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id UUID REFERENCES streams(id) ON DELETE CASCADE NOT NULL,
  user_address TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(stream_id, user_address)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_streams_creator ON streams(creator_address);
CREATE INDEX IF NOT EXISTS idx_streams_category ON streams(category_id);
CREATE INDEX IF NOT EXISTS idx_streams_is_live ON streams(is_live);
CREATE INDEX IF NOT EXISTS idx_streams_like_count ON streams(like_count);
CREATE INDEX IF NOT EXISTS idx_chat_messages_stream ON chat_messages(stream_id);
CREATE INDEX IF NOT EXISTS idx_stream_likes_stream ON stream_likes(stream_id);
CREATE INDEX IF NOT EXISTS idx_stream_likes_user ON stream_likes(user_address);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_address);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_address);

