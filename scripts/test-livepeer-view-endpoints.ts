/**
 * Test script to investigate Livepeer API endpoints for view counts
 * 
 * This script tests various Livepeer API endpoints to determine:
 * 1. What view count endpoints are available
 * 2. What data they return
 * 3. Whether historical data is available
 * 
 * Usage:
 *   npx tsx scripts/test-livepeer-view-endpoints.ts <playbackId> [streamId] [assetId]
 */

import * as dotenv from "dotenv"

// Load environment variables
dotenv.config({ path: ".env.local" })
dotenv.config()

const LIVEPEER_API_KEY = process.env.LIVEPEER_API_KEY
const LIVEPEER_API_BASE = "https://livepeer.studio/api"

if (!LIVEPEER_API_KEY) {
  console.error("❌ LIVEPEER_API_KEY is not set in environment variables")
  process.exit(1)
}

interface TestResult {
  endpoint: string
  method: string
  status: number
  success: boolean
  data?: any
  error?: string
}

async function testEndpoint(
  endpoint: string,
  method: string = "GET",
  body?: any
): Promise<TestResult> {
  const url = `${LIVEPEER_API_BASE}${endpoint}`
  
  try {
    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${LIVEPEER_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
    
    if (body) {
      options.body = JSON.stringify(body)
    }
    
    const response = await fetch(url, options)
    const status = response.status
    let data: any = null
    
    try {
      const text = await response.text()
      if (text) {
        data = JSON.parse(text)
      }
    } catch (e) {
      data = { raw: "Could not parse JSON" }
    }
    
    return {
      endpoint,
      method,
      status,
      success: status >= 200 && status < 300,
      data: status >= 200 && status < 300 ? data : undefined,
      error: status >= 300 ? `HTTP ${status}: ${JSON.stringify(data)}` : undefined,
    }
  } catch (error: any) {
    return {
      endpoint,
      method,
      status: 0,
      success: false,
      error: error?.message || String(error),
    }
  }
}

async function investigateViewEndpoints(playbackId?: string, streamId?: string, assetId?: string) {
  console.log("🔍 Investigating Livepeer API endpoints for view counts...\n")
  console.log(`API Base: ${LIVEPEER_API_BASE}`)
  console.log(`PlaybackId: ${playbackId || "Not provided"}`)
  console.log(`StreamId: ${streamId || "Not provided"}`)
  console.log(`AssetId: ${assetId || "Not provided"}\n`)
  
  const results: TestResult[] = []
  
  // Test 1: Current real-time views endpoint (we know this works)
  console.log("📊 Test 1: Current real-time views endpoint")
  if (playbackId) {
    const result1 = await testEndpoint(`/data/views/now?playbackId=${playbackId}&breakdownBy=playbackId`)
    results.push(result1)
    console.log(`  ${result1.success ? "✅" : "❌"} GET /data/views/now`)
    console.log(`  Status: ${result1.status}`)
    if (result1.success && result1.data) {
      console.log(`  Response: ${JSON.stringify(result1.data, null, 2)}`)
    } else if (result1.error) {
      console.log(`  Error: ${result1.error}`)
    }
    console.log()
  }
  
  // Test 2: Historical views endpoint (without time range)
  console.log("📊 Test 2: Historical views endpoint (no params)")
  if (playbackId) {
    const result2 = await testEndpoint(`/data/views?playbackId=${playbackId}`)
    results.push(result2)
    console.log(`  ${result2.success ? "✅" : "❌"} GET /data/views`)
    console.log(`  Status: ${result2.status}`)
    if (result2.success && result2.data) {
      console.log(`  Response: ${JSON.stringify(result2.data, null, 2)}`)
    } else if (result2.error) {
      console.log(`  Error: ${result2.error}`)
    }
    console.log()
  }
  
  // Test 3: Historical views endpoint (with time range)
  console.log("📊 Test 3: Historical views endpoint (with time range)")
  if (playbackId) {
    const from = Math.floor(Date.now() / 1000) - 86400 // Last 24 hours
    const to = Math.floor(Date.now() / 1000)
    const result3 = await testEndpoint(`/data/views?playbackId=${playbackId}&from=${from}&to=${to}`)
    results.push(result3)
    console.log(`  ${result3.success ? "✅" : "❌"} GET /data/views (with time range)`)
    console.log(`  Status: ${result3.status}`)
    if (result3.success && result3.data) {
      console.log(`  Response: ${JSON.stringify(result3.data, null, 2)}`)
    } else if (result3.error) {
      console.log(`  Error: ${result3.error}`)
    }
    console.log()
  }
  
  // Test 4: Stream metrics endpoint
  console.log("📊 Test 4: Stream metrics endpoint")
  if (streamId) {
    const result4 = await testEndpoint(`/stream/${streamId}/metrics`)
    results.push(result4)
    console.log(`  ${result4.success ? "✅" : "❌"} GET /stream/{id}/metrics`)
    console.log(`  Status: ${result4.status}`)
    if (result4.success && result4.data) {
      console.log(`  Response: ${JSON.stringify(result4.data, null, 2)}`)
    } else if (result4.error) {
      console.log(`  Error: ${result4.error}`)
    }
    console.log()
  }
  
  // Test 5: Asset metrics endpoint
  console.log("📊 Test 5: Asset metrics endpoint")
  if (assetId) {
    const result5 = await testEndpoint(`/asset/${assetId}/metrics`)
    results.push(result5)
    console.log(`  ${result5.success ? "✅" : "❌"} GET /asset/{id}/metrics`)
    console.log(`  Status: ${result5.status}`)
    if (result5.success && result5.data) {
      console.log(`  Response: ${JSON.stringify(result5.data, null, 2)}`)
    } else if (result5.error) {
      console.log(`  Error: ${result5.error}`)
    }
    console.log()
  }
  
  // Test 6: Stream endpoint (check if it includes view metrics)
  console.log("📊 Test 6: Stream endpoint (check for view metrics)")
  if (streamId) {
    const result6 = await testEndpoint(`/stream/${streamId}`)
    results.push(result6)
    console.log(`  ${result6.success ? "✅" : "❌"} GET /stream/{id}`)
    console.log(`  Status: ${result6.status}`)
    if (result6.success && result6.data) {
      // Check if response includes view-related fields
      const viewFields = Object.keys(result6.data).filter(key => 
        key.toLowerCase().includes('view') || 
        key.toLowerCase().includes('metric') ||
        key.toLowerCase().includes('analytics')
      )
      console.log(`  View-related fields found: ${viewFields.length > 0 ? viewFields.join(", ") : "None"}`)
      if (viewFields.length > 0) {
        viewFields.forEach(field => {
          console.log(`    - ${field}: ${JSON.stringify(result6.data[field])}`)
        })
      }
    } else if (result6.error) {
      console.log(`  Error: ${result6.error}`)
    }
    console.log()
  }
  
  // Test 7: Asset endpoint (check if it includes view metrics)
  console.log("📊 Test 7: Asset endpoint (check for view metrics)")
  if (assetId) {
    const result7 = await testEndpoint(`/asset/${assetId}`)
    results.push(result7)
    console.log(`  ${result7.success ? "✅" : "❌"} GET /asset/{id}`)
    console.log(`  Status: ${result7.status}`)
    if (result7.success && result7.data) {
      // Check if response includes view-related fields
      const viewFields = Object.keys(result7.data).filter(key => 
        key.toLowerCase().includes('view') || 
        key.toLowerCase().includes('metric') ||
        key.toLowerCase().includes('analytics')
      )
      console.log(`  View-related fields found: ${viewFields.length > 0 ? viewFields.join(", ") : "None"}`)
      if (viewFields.length > 0) {
        viewFields.forEach(field => {
          console.log(`    - ${field}: ${JSON.stringify(result7.data[field])}`)
        })
      }
    } else if (result7.error) {
      console.log(`  Error: ${result7.error}`)
    }
    console.log()
  }
  
  // Summary
  console.log("\n" + "=".repeat(60))
  console.log("📋 SUMMARY")
  console.log("=".repeat(60))
  
  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)
  
  console.log(`\n✅ Successful endpoints: ${successful.length}`)
  successful.forEach(r => {
    console.log(`   - ${r.method} ${r.endpoint}`)
  })
  
  console.log(`\n❌ Failed endpoints: ${failed.length}`)
  failed.forEach(r => {
    console.log(`   - ${r.method} ${r.endpoint} (${r.status}${r.error ? `: ${r.error}` : ""})`)
  })
  
  console.log("\n💡 Recommendations:")
  if (successful.length === 0) {
    console.log("   - No endpoints returned data. Check API key and IDs.")
  } else {
    console.log("   - Use successful endpoints for view count data")
    if (failed.some(r => r.endpoint.includes("/data/views") && !r.endpoint.includes("/now"))) {
      console.log("   - Historical views endpoint may not exist or require different parameters")
    }
    if (failed.some(r => r.endpoint.includes("/metrics"))) {
      console.log("   - Metrics endpoints may not exist or require different paths")
    }
  }
}

// Main execution
const args = process.argv.slice(2)
const playbackId = args[0]
const streamId = args[1]
const assetId = args[2]

if (!playbackId && !streamId && !assetId) {
  console.error("Usage: npx tsx scripts/test-livepeer-view-endpoints.ts <playbackId> [streamId] [assetId]")
  console.error("\nAt least one ID is required to test endpoints.")
  process.exit(1)
}

investigateViewEndpoints(playbackId, streamId, assetId)
  .then(() => {
    console.log("\n✅ Investigation complete!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Investigation failed:", error)
    process.exit(1)
  })
