"use client"

import { useEffect, useState } from "react"
import { resolveEnsAddress } from "@/lib/ens"

/**
 * Hook to fetch ENS name for an address
 * @param address - The Ethereum address
 * @returns The ENS name or null
 */
export function useEnsName(address: string | null | undefined): string | null {
  const [ensName, setEnsName] = useState<string | null>(null)

  useEffect(() => {
    if (!address) {
      setEnsName(null)
      return
    }

    // Fetch ENS name
    resolveEnsAddress(address)
      .then((name) => {
        setEnsName(name)
      })
      .catch((error) => {
        console.error("Error fetching ENS name:", error)
        setEnsName(null)
      })
  }, [address])

  return ensName
}

