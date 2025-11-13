import { db } from "../lib/db"
import { streams } from "../lib/db/schema"

async function checkStreams() {
  try {
    console.log("Checking streams in database...")
    const allStreams = await db.select().from(streams).limit(10)
    
    console.log(`Found ${allStreams.length} streams:`)
    allStreams.forEach((stream, index) => {
      console.log(`${index + 1}. ${stream.title} (ID: ${stream.id}, likeCount: ${stream.likeCount || 0})`)
    })
    
    if (allStreams.length === 0) {
      console.log("⚠️ No streams found in database")
    }
  } catch (error: any) {
    console.error("❌ Error checking streams:", error.message)
    console.error(error)
  }
}

checkStreams()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error)
    process.exit(1)
  })

