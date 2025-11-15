/**
 * Test script to verify Livepeer SDK getPublicViewership is working correctly
 * Run with: tsx scripts/test-views-api.ts <playbackId>
 */

import { Livepeer } from "livepeer"
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
  console.log("Testing Livepeer SDK getPublicViewership")
  console.log("=".repeat(60))
  console.log(`PlaybackId: ${playbackId}`)
  console.log(`API Key: ${LIVEPEER_API_KEY.substring(0, 10)}...`)
  console.log("")

  try {
    const livepeer = new Livepeer({
      apiKey: LIVEPEER_API_KEY,
    })

    console.log("Calling livepeer.metrics.getPublicViewership()...")
    const result = await livepeer.metrics.getPublicViewership(playbackId)

    console.log("")
    console.log("=".repeat(60))
    console.log("RAW SDK RESPONSE:")
    console.log("=".repeat(60))
    console.log(JSON.stringify(result, null, 2))
    console.log("")

    console.log("=".repeat(60))
    console.log("RESPONSE ANALYSIS:")
    console.log("=".repeat(60))
    console.log(`Type: ${typeof result}`)
    console.log(`Is object: ${typeof result === "object"}`)
    
    if (result && typeof result === "object") {
      console.log(`Keys: ${Object.keys(result).join(", ")}`)
      
      // Check various possible structures
      if ('viewCount' in result) {
        console.log(`✅ viewCount found directly: ${(result as any).viewCount}`)
      }
      if ('data' in result) {
        console.log(`✅ data property found:`, (result as any).data)
        if ((result as any).data && typeof (result as any).data === 'object' && 'viewCount' in (result as any).data) {
          console.log(`✅ viewCount in data: ${(result as any).data.viewCount}`)
        }
      }
      if ('result' in result) {
        console.log(`✅ result property found:`, (result as any).result)
        if ((result as any).result && typeof (result as any).result === 'object' && 'viewCount' in (result as any).result) {
          console.log(`✅ viewCount in result: ${(result as any).result.viewCount}`)
        }
      }
      if ('body' in result) {
        console.log(`✅ body property found:`, (result as any).body)
        if ((result as any).body && typeof (result as any).body === 'object' && 'viewCount' in (result as any).body) {
          console.log(`✅ viewCount in body: ${(result as any).body.viewCount}`)
        }
      }
    }

    console.log("")
    console.log("=".repeat(60))
    console.log("EXTRACTED VIEW COUNT:")
    console.log("=".repeat(60))
    
    // Try to extract viewCount using same logic as our function
    let data: any = null
    
    if (result && typeof result === "object") {
      if ('viewCount' in result && typeof (result as any).viewCount === 'number') {
        data = result
      } else if ('data' in result && result.data && typeof result.data === 'object') {
        data = result.data
      } else if ('result' in result && result.result && typeof result.result === 'object') {
        data = result.result
      } else if ('body' in result && result.body && typeof result.body === 'object') {
        data = result.body
      } else {
        data = result
      }
    }
    
    if (data && typeof data === "object" && typeof data.viewCount === "number") {
      console.log(`✅ SUCCESS: viewCount = ${data.viewCount}`)
    } else {
      console.log(`❌ FAILED: Could not extract viewCount`)
      console.log(`Data structure:`, data)
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

