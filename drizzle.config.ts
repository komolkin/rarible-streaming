import * as dotenv from "dotenv"

dotenv.config()

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
} as const

