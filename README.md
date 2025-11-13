# Rarible Streaming MVP

Onchain livestreaming platform with NFT minting on Base chain.

## Features

- **Wallet Authentication**: Connect with Privy (Base mainnet only)
- **Live Streaming**: OBS integration via Livepeer
- **NFT Minting**: ERC-721 minting during streams
- **Social Features**: Follows, reviews, and realtime chat
- **Profile Management**: Username, display name, bio, images

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Privy (Wallet auth)
- Wagmi + Viem (Base mainnet)
- Supabase (Postgres + Storage + Realtime)
- Drizzle ORM
- Livepeer (Streaming)
- Pinata (IPFS)
- shadcn/ui components

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables (see `.env.example`):
   - Create a `.env.local` file with all required variables
   - Get Privy App ID from [Privy Dashboard](https://dashboard.privy.io)
   - Set up Supabase project and get credentials
   - Get Livepeer API key from [Livepeer Studio](https://livepeer.studio)
   - Get Pinata API keys from [Pinata](https://pinata.cloud)

3. Set up Supabase:
   - Create a new Supabase project
   - Create storage buckets: `avatars` and `covers`
   - Enable Realtime for `chat_messages` table
   - Get your database connection string

4. Run database migrations:
```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

5. Deploy smart contracts (optional for MVP):
```bash
# Install Hardhat dependencies first
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npx hardhat compile
npx hardhat run scripts/deploy.ts --network base
```

6. Start development server:
```bash
npm run dev
```

## Features Implemented

- ✅ Wallet authentication with Privy (Base mainnet)
- ✅ User profiles with username, display name, bio, avatar, cover image
- ✅ Stream creation with Livepeer integration
- ✅ OBS setup instructions for streaming
- ✅ Live stream viewer page with chat
- ✅ NFT minting setup (contract + metadata pipeline)
- ✅ Follow/unfollow functionality
- ✅ Reviews system
- ✅ Browse page for discovering streams
- ✅ Profile pages with stream history

## Next Steps

1. Deploy smart contracts to Base mainnet
2. Set environment variables in Vercel
3. Deploy Next.js app to Vercel
4. Set up Supabase storage buckets and enable Realtime
5. Test streaming flow end-to-end

