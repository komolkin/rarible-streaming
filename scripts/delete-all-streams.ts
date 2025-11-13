import { db } from "../lib/db"
import { streams, chatMessages } from "../lib/db/schema"

async function deleteAllStreams() {
  try {
    console.log("Starting deletion of all streams...")
    
    // First, delete all chat messages (they reference streams)
    console.log("Deleting chat messages...")
    await db.delete(chatMessages)
    console.log("✅ Deleted all chat messages")
    
    // Then delete all streams
    console.log("Deleting streams...")
    await db.delete(streams)
    console.log("✅ Deleted all streams")
    
    console.log("✅ Successfully deleted all streams and related chat messages!")
  } catch (error) {
    console.error("❌ Error deleting streams:", error)
    process.exit(1)
  }
}

deleteAllStreams()
  .then(() => {
    console.log("Done!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("Fatal error:", error)
    process.exit(1)
  })

