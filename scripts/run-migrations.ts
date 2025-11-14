#!/usr/bin/env tsx
/**
 * Migration script for Vercel/production
 * Run this manually after deployment or via GitHub Actions
 */

import * as dotenv from "dotenv"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as fs from "fs"
import * as path from "path"

// Load environment variables from .env.local (or .env if .env.local doesn't exist)
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: ".env.local" })
}

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error("❌ DATABASE_URL environment variable is not set")
  process.exit(1)
}

async function runMigrations() {
  console.log("🔄 Starting database migrations...")
  
  const client = postgres(connectionString, { max: 1 })
  const db = drizzle(client)

  try {
    // Check if drizzle migrations folder exists
    const migrationsFolder = path.join(process.cwd(), "drizzle")
    if (!fs.existsSync(migrationsFolder)) {
      console.warn("⚠️  No migrations folder found. Using drizzle-kit push instead...")
      console.log("💡 Run 'npm run db:migrate' to push schema changes directly")
      await client.end()
      return
    }

    await migrate(db, { migrationsFolder: "./drizzle" })
    console.log("✅ Migrations completed successfully!")
  } catch (error: any) {
    console.error("❌ Migration failed:", error.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigrations()
  .then(() => {
    console.log("✨ Done!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Unexpected error:", error)
    process.exit(1)
  })

