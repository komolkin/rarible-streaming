"use client"

import { LivepeerConfig, createReactClient, studioProvider } from "@livepeer/react"
import { ReactNode } from "react"

// Note: For public streams, the API key is optional
// But it's recommended to use it for better performance and features
// Use the same API key as server-side (without the NEXT_PUBLIC_ prefix, it's server-only)
const apiKey = process.env.NEXT_PUBLIC_LIVEPEER_API_KEY || ""

const livepeerClient = createReactClient({
  provider: studioProvider({
    apiKey: apiKey,
  }),
})

export function LivepeerProvider({ children }: { children: ReactNode }) {
  // Log API key status (but not the actual key)
  if (!apiKey) {
    console.warn("⚠️ NEXT_PUBLIC_LIVEPEER_API_KEY is not set. Player may have limited functionality.")
    console.warn("💡 Add NEXT_PUBLIC_LIVEPEER_API_KEY to .env.local with the same value as LIVEPEER_API_KEY")
  } else {
    console.log("✅ Livepeer API key configured for Player component")
  }
  
  return (
    <LivepeerConfig client={livepeerClient}>
      {children}
    </LivepeerConfig>
  )
}

