import postgres from "postgres"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error("DATABASE_URL not found in environment variables")
  process.exit(1)
}

async function addProductsColumn() {
  const client = postgres(connectionString)
  
  try {
    console.log("Checking if products column exists...")
    
    // Check if column exists
    const columnCheck = await client`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'streams' AND column_name = 'products'
    `
    
    if (columnCheck.length > 0) {
      console.log("✅ products column already exists!")
      await client.end()
      return
    }
    
    console.log("Adding products column to streams table...")
    
    // Add the column
    await client`
      ALTER TABLE streams 
      ADD COLUMN products JSONB
    `
    
    console.log("✅ Added products column")
    console.log("✅ Migration completed successfully!")
    
  } catch (error: any) {
    console.error("❌ Error running migration:", error.message)
    console.error(error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

addProductsColumn()
  .then(() => {
    console.log("Done!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("Fatal error:", error)
    process.exit(1)
  })

