require('dotenv').config({ path: '.env.local' });
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const { migrate } = require('drizzle-orm/postgres-js/migrator');

async function createSchema() {
  try {
    console.log('Creating database schema...');
    const client = postgres(process.env.DATABASE_URL);
    const db = drizzle(client);
    
    // Import schema
    const schema = require('./lib/db/schema.ts');
    
    // Use SQL to create tables directly
    await client`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address TEXT NOT NULL UNIQUE,
        username TEXT UNIQUE,
        display_name TEXT,
        bio TEXT,
        avatar_url TEXT,
        cover_image_url TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `;
    
    await client`
      CREATE TABLE IF NOT EXISTS follows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        follower_address TEXT NOT NULL,
        following_address TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `;
    
    await client`
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reviewer_address TEXT NOT NULL,
        reviewee_address TEXT NOT NULL,
        rating INTEGER NOT NULL,
        comment TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `;
    
    await client`
      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        slug TEXT NOT NULL UNIQUE,
        description TEXT,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `;
    
    await client`
      CREATE TABLE IF NOT EXISTS streams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        creator_address TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        category_id UUID REFERENCES categories(id),
        livepeer_stream_id TEXT,
        livepeer_playback_id TEXT,
        asset_id TEXT,
        asset_playback_id TEXT,
        livepeer_stream_key TEXT,
        is_live BOOLEAN DEFAULT FALSE NOT NULL,
        scheduled_at TIMESTAMP,
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        vod_url TEXT,
        has_minting BOOLEAN DEFAULT FALSE NOT NULL,
        mint_contract_address TEXT,
        mint_token_id TEXT,
        mint_metadata_uri TEXT,
        mint_max_supply INTEGER,
        mint_per_wallet_limit INTEGER,
        mint_current_supply INTEGER DEFAULT 0 NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `;
    
    await client`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stream_id UUID REFERENCES streams(id) NOT NULL,
        sender_address TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `;
    
    console.log('✅ Schema created successfully!');
    await client.end();
  } catch (error) {
    console.error('❌ Error creating schema:', error.message);
    process.exit(1);
  }
}

createSchema();
