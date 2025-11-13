"use client"

import { PrivyProvider as Privy } from "@privy-io/react-auth"
import { ReactNode } from "react"

export function PrivyProvider({ children }: { children: ReactNode }) {
  return (
    <Privy
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ""}
      config={{
        loginMethods: ["wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#ffffff",
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      {children}
    </Privy>
  )
}

