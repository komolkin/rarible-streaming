"use client"

import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { base, mainnet } from "wagmi/chains"
import { createConfig as createWagmiConfig, http } from "wagmi"
import { WagmiProvider as PrivyWagmiProvider } from "@privy-io/wagmi"

const config = createWagmiConfig({
  chains: [mainnet, base],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
  },
  ssr: true,
})

export function WagmiProvider({ children }: { children: React.ReactNode }) {
  // Create QueryClient inside component to avoid issues with SSR
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <PrivyWagmiProvider config={config}>
        {children}
      </PrivyWagmiProvider>
    </QueryClientProvider>
  )
}

