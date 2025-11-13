import postgres from "postgres"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error("DATABASE_URL not found in environment variables")
  process.exit(1)
}

async function createStreamLikesTable() {
  const client = postgres(connectionString)
  
  try {
    console.log("Checking if stream_likes table exists...")
    
    // Check if table exists
    const tableCheck = await client`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'stream_likes'
    `
    
    if (tableCheck.length > 0) {
      console.log("✅ stream_likes table already exists!")
      await client.end()
      return
    }
    
    console.log("Creating stream_likes table...")
    
    // Create the table
    await client`
      CREATE TABLE stream_likes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stream_id UUID REFERENCES streams(id) ON DELETE CASCADE NOT NULL,
        user_address TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(stream_id, user_address)
      )
    `
    
    console.log("✅ Created stream_likes table")
    
    // Create indexes
    console.log("Creating indexes...")
    await client`
      CREATE INDEX IF NOT EXISTS idx_stream_likes_stream_id ON stream_likes(stream_id)
    `
    
    await client`
      CREATE INDEX IF NOT EXISTS idx_stream_likes_user_address ON stream_likes(user_address)
    `
    
    console.log("✅ Created indexes")
    console.log("✅ Migration completed successfully!")
    
  } catch (error: any) {
    console.error("❌ Error running migration:", error.message)
    console.error(error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

createStreamLikesTable()
  .then(() => {
    console.log("Done!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("Fatal error:", error)
    process.exit(1)
  })

