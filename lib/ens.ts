import { createPublicClient, http, isAddress, getAddress } from "viem"
import { mainnet } from "viem/chains"
import { normalize as normalizeEns, getEnsAddress, getEnsName } from "viem/ens"

/**
 * Check if a string looks like an ENS name (ends with .eth)
 */
export function isEnsName(name: string): boolean {
  return name.endsWith(".eth") && name.length > 4
}

/**
 * Normalize an ENS name
 */
export function normalizeEnsName(name: string): string {
  try {
    return normalizeEns(name)
  } catch {
    return name
  }
}

// Create a public client for Ethereum mainnet (ENS is on mainnet)
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || "https://eth.llamarpc.com"),
})

/**
 * Resolve an ENS name to an Ethereum address
 * @param ensName - The ENS name (e.g., "vitalik.eth")
 * @returns The resolved address or null if not found
 */
export async function resolveEnsName(ensName: string): Promise<string | null> {
  try {
    const normalized = normalizeEnsName(ensName)
    const address = await getEnsAddress(publicClient, {
      name: normalized,
    })
    return address || null
  } catch (error) {
    console.error(`Error resolving ENS name ${ensName}:`, error)
    return null
  }
}

/**
 * Resolve an Ethereum address to an ENS name
 * @param address - The Ethereum address
 * @returns The ENS name or null if not found
 */
export async function resolveEnsAddress(address: string): Promise<string | null> {
  try {
    if (!isAddress(address)) {
      return null
    }
    const normalizedAddress = getAddress(address)
    const ensName = await getEnsName(publicClient, {
      address: normalizedAddress,
    })
    return ensName || null
  } catch (error) {
    console.error(`Error resolving ENS address ${address}:`, error)
    return null
  }
}

/**
 * Normalize an input (ENS name or address) to an address
 * If input is already an address, returns it normalized
 * If input is an ENS name, resolves it to an address
 * @param input - ENS name or address
 * @returns Normalized address or null
 */
export async function normalizeToAddress(input: string): Promise<string | null> {
  // Check if it's already an address
  if (isAddress(input)) {
    return getAddress(input)
  }

  // Check if it's an ENS name
  if (isEnsName(input)) {
    return resolveEnsName(input)
  }

  return null
}

