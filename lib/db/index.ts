import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"
import * as dotenv from "dotenv"

// Load env vars if not already loaded (for scripts)
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: ".env.local" })
}

// Function to encode connection string with special characters
function encodeConnectionString(connectionString: string): string {
  // Match pattern: postgresql://username:password@host:port/database
  const connectionStringMatch = connectionString.match(/^(postgresql?:\/\/)([^:]+):([^@]+)@(.+)$/)
  if (connectionStringMatch) {
    const [, protocol, username, password, rest] = connectionStringMatch
    // Encode username and password to handle special characters like &, @, etc.
    return `${protocol}${encodeURIComponent(username)}:${encodeURIComponent(password)}@${rest}`
  }
  // If regex doesn't match, return original (might be a different format)
  return connectionString
}

// Use singleton pattern to prevent multiple connections in serverless environments
declare global {
  // eslint-disable-next-line no-var
  var postgresClient: ReturnType<typeof postgres> | undefined
  // eslint-disable-next-line no-var
  var drizzleDb: ReturnType<typeof drizzle> | undefined
}

// Lazy initialization function - only called at runtime, not during build
function getClient() {
  const connectionString = process.env.DATABASE_URL
  
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set")
  }

  // Encode connection string to handle special characters
  const encodedConnectionString = encodeConnectionString(connectionString)

  // For serverless environments (Next.js API routes), reuse the connection
  // For non-serverless (scripts), create a new connection each time
  if (!globalThis.postgresClient) {
    globalThis.postgresClient = postgres(encodedConnectionString, {
      max: 1, // Limit connections for serverless environments
      idle_timeout: 20,
      connect_timeout: 10,
    })
  }

  return globalThis.postgresClient
}

// Lazy getter for db - only initializes when actually used (at runtime)
function getDb() {
  if (!globalThis.drizzleDb) {
    globalThis.drizzleDb = drizzle(getClient(), { schema })
  }
  return globalThis.drizzleDb
}

// Export db as a getter that lazily initializes
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return getDb()[prop as keyof ReturnType<typeof drizzle>]
  }
})

