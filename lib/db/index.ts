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

// Ensure the connection string is properly formatted
// Handle special characters in password by encoding them BEFORE parsing
// We need to encode the password first because URL parsing will fail with unencoded special chars
let encodedConnectionString = connectionString

// Match pattern: postgresql://username:password@host:port/database
const connectionStringMatch = connectionString.match(/^(postgresql?:\/\/)([^:]+):([^@]+)@(.+)$/)
if (connectionStringMatch) {
  const [, protocol, username, password, rest] = connectionStringMatch
  // Encode username and password to handle special characters like &, @, etc.
  encodedConnectionString = `${protocol}${encodeURIComponent(username)}:${encodeURIComponent(password)}@${rest}`
} else {
  // If regex doesn't match, try to parse as-is (might be a different format)
  // But wrap in try-catch to avoid build-time errors
  try {
    new URL(connectionString)
    // If parsing succeeds, use original string
  } catch (e) {
    // If parsing fails, log warning but use original - postgres library might handle it
    console.warn('Could not parse DATABASE_URL, using as-is. Special characters in password may cause issues.')
  }
}

// Use singleton pattern to prevent multiple connections in serverless environments
declare global {
  // eslint-disable-next-line no-var
  var postgresClient: ReturnType<typeof postgres> | undefined
}

// For serverless environments (Next.js API routes), reuse the connection
// For non-serverless (scripts), create a new connection each time
const client = globalThis.postgresClient ?? postgres(encodedConnectionString, {
  max: 1, // Limit connections for serverless environments
  idle_timeout: 20,
  connect_timeout: 10,
})

if (process.env.NODE_ENV !== "production") {
  globalThis.postgresClient = client
}

export const db = drizzle(client, { schema })

