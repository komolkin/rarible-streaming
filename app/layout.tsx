import type { Metadata } from "next";
import "@fontsource/stack-sans-text/400.css";
import "@fontsource/stack-sans-text/500.css";
import "@fontsource/stack-sans-text/600.css";
import "@fontsource/stack-sans-text/700.css";
import "./globals.css";
import { PrivyProvider } from "@/components/providers/privy-provider";
import { WagmiProvider } from "@/components/providers/wagmi-provider";
import { LivepeerProvider } from "@/components/providers/livepeer-provider";
import { Navbar } from "@/components/navbar";
import { SuppressExtensionErrors } from "@/components/suppress-extension-errors";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "Rarible Streaming",
  description: "Onchain livestreaming platform with NFT minting",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <SuppressExtensionErrors />
        <PrivyProvider>
          <WagmiProvider>
            <LivepeerProvider>
              <Navbar />
              {children}
              <Toaster />
            </LivepeerProvider>
          </WagmiProvider>
        </PrivyProvider>
      </body>
    </html>
  );
}
