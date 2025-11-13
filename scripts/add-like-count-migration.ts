import { db } from "../lib/db"
import postgres from "postgres"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error("DATABASE_URL not found in environment variables")
  process.exit(1)
}

async function addLikeCountColumn() {
  const client = postgres(connectionString)
  
  try {
    console.log("Checking if like_count column exists...")
    
    // Check if column exists
    const columnCheck = await client`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'streams' AND column_name = 'like_count'
    `
    
    if (columnCheck.length > 0) {
      console.log("✅ like_count column already exists!")
      await client.end()
      return
    }
    
    console.log("Adding like_count column to streams table...")
    
    // Add the column
    await client`
      ALTER TABLE streams 
      ADD COLUMN like_count INTEGER DEFAULT 0 NOT NULL
    `
    
    console.log("✅ Added like_count column")
    
    // Initialize like_count for existing streams (only if stream_likes table exists)
    console.log("Checking if stream_likes table exists...")
    const tableCheck = await client`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'stream_likes'
    `
    
    if (tableCheck.length > 0) {
      console.log("Initializing like_count for existing streams...")
      await client`
        UPDATE streams
        SET like_count = (
          SELECT COUNT(*)
          FROM stream_likes
          WHERE stream_likes.stream_id = streams.id
        )
      `
      console.log("✅ Initialized like_count for existing streams")
    } else {
      console.log("⚠️ stream_likes table doesn't exist, skipping initialization (all streams will have like_count = 0)")
    }
    
    // Create index
    console.log("Creating index on like_count...")
    await client`
      CREATE INDEX IF NOT EXISTS idx_streams_like_count ON streams(like_count)
    `
    
    console.log("✅ Created index on like_count")
    console.log("✅ Migration completed successfully!")
    
  } catch (error: any) {
    console.error("❌ Error running migration:", error.message)
    console.error(error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

addLikeCountColumn()
  .then(() => {
    console.log("Done!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("Fatal error:", error)
    process.exit(1)
  })

