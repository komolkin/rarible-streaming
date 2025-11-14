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
// Handle special characters in password by encoding them
let encodedConnectionString = connectionString
try {
  // Try to parse as URL - if it fails, manually encode the password
  const url = new URL(connectionString)
  // If parsing succeeded, reconstruct with properly encoded components
  if (url.password) {
    encodedConnectionString = `${url.protocol}//${url.username ? `${encodeURIComponent(url.username)}:${encodeURIComponent(url.password)}@` : ''}${url.host}${url.pathname}${url.search}${url.hash}`
  }
} catch (e) {
  // If URL parsing fails due to special characters, manually encode the password
  // Match pattern: postgresql://username:password@host:port/database
  const match = connectionString.match(/^(postgresql?:\/\/)([^:]+):([^@]+)@(.+)$/)
  if (match) {
    const [, protocol, username, password, rest] = match
    encodedConnectionString = `${protocol}${encodeURIComponent(username)}:${encodeURIComponent(password)}@${rest}`
  }
  // If regex doesn't match, use original string - postgres library might handle it
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

