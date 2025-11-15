/**
 * Test script to verify Livepeer SDK getPublicViewership is working correctly
 * Run with: tsx scripts/test-views-api.ts <playbackId>
 */

import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const LIVEPEER_API_KEY = process.env.LIVEPEER_API_KEY

if (!LIVEPEER_API_KEY) {
  console.error("❌ LIVEPEER_API_KEY is not set in .env.local")
  process.exit(1)
}

const playbackId = process.argv[2]

if (!playbackId) {
  console.error("❌ Please provide a playbackId as argument")
  console.log("Usage: tsx scripts/test-views-api.ts <playbackId>")
  process.exit(1)
}

async function testViews() {
  console.log("=".repeat(60))
  console.log("Testing Livepeer total views REST API")
  console.log("=".repeat(60))
  console.log(`PlaybackId: ${playbackId}`)
  console.log(`API Key: ${LIVEPEER_API_KEY.substring(0, 10)}...`)
  console.log("")

  try {
    const endpoint = `https://livepeer.studio/api/data/views/query/total/${encodeURIComponent(playbackId)}`
    console.log(`Calling GET ${endpoint} ...`)
    
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${LIVEPEER_API_KEY}`,
      },
    })

    console.log(`Status: ${response.status}`)
    const result = await response.json().catch(() => null)

    console.log("")
    console.log("=".repeat(60))
    console.log("RAW API RESPONSE:")
    console.log("=".repeat(60))
    console.log(JSON.stringify(result, null, 2))
    console.log("")

    console.log("=".repeat(60))
    console.log("RESPONSE ANALYSIS:")
    console.log("=".repeat(60))
    if (result && typeof result === "object") {
      console.log(`Top-level keys: ${Object.keys(result).join(", ")}`)
    } else if (Array.isArray(result)) {
      console.log(`Response is array with length ${result.length}`)
    }

    console.log("")
    console.log("=".repeat(60))
    console.log("EXTRACTED VIEW COUNT:")
    console.log("=".repeat(60))
    
    const extractViewCount = (payload: any): number | null => {
      if (!payload || typeof payload !== "object") {
        return null
      }
      if (typeof payload.viewCount === "number") {
        return payload.viewCount
      }
      const nested = [payload.data, payload.result, payload.body]
      for (const candidate of nested) {
        if (candidate && typeof candidate === "object" && typeof candidate.viewCount === "number") {
          return candidate.viewCount
        }
      }
      return null
    }

    let viewCount: number | null = null

    if (Array.isArray(result)) {
      for (const entry of result) {
        viewCount = extractViewCount(entry)
        if (viewCount !== null) break
      }
    } else {
      viewCount = extractViewCount(result)
    }

    if (viewCount !== null) {
      console.log(`✅ SUCCESS: viewCount = ${viewCount}`)
    } else {
      console.log(`❌ FAILED: Could not extract viewCount`)
    }
    
  } catch (error: any) {
    console.error("")
    console.error("=".repeat(60))
    console.error("ERROR:")
    console.error("=".repeat(60))
    console.error(error)
    console.error(`Message: ${error?.message}`)
    console.error(`Status: ${error?.status}`)
    console.error(`Status Code: ${error?.statusCode}`)
  }
}

testViews()

