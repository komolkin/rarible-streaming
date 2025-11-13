import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"
import * as dotenv from "dotenv"

// Load env vars if not already loaded (for scripts)
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: ".env.local" })
}

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set")
}

// Use singleton pattern to prevent multiple connections in serverless environments
declare global {
  // eslint-disable-next-line no-var
  var postgresClient: ReturnType<typeof postgres> | undefined
}

// For serverless environments (Next.js API routes), reuse the connection
// For non-serverless (scripts), create a new connection each time
const client = globalThis.postgresClient ?? postgres(connectionString, {
  max: 1, // Limit connections for serverless environments
  idle_timeout: 20,
  connect_timeout: 10,
})

if (process.env.NODE_ENV !== "production") {
  globalThis.postgresClient = client
}

export const db = drizzle(client, { schema })

