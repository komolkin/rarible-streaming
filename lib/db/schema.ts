import { pgTable, text, timestamp, integer, boolean, uuid, jsonb } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  walletAddress: text("wallet_address").notNull().unique(),
  username: text("username").unique(),
  displayName: text("display_name"),
  bio: text("bio"),
  email: text("email"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const follows = pgTable("follows", {
  id: uuid("id").defaultRandom().primaryKey(),
  followerAddress: text("follower_address").notNull(),
  followingAddress: text("following_address").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  reviewerAddress: text("reviewer_address").notNull(),
  revieweeAddress: text("reviewee_address").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const streams = pgTable("streams", {
  id: uuid("id").defaultRandom().primaryKey(),
  creatorAddress: text("creator_address").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  categoryId: uuid("category_id").references(() => categories.id),
  livepeerStreamId: text("livepeer_stream_id"),
  livepeerPlaybackId: text("livepeer_playback_id"),
  assetId: text("asset_id"),
  assetPlaybackId: text("asset_playback_id"),
  livepeerStreamKey: text("livepeer_stream_key"),
  isLive: boolean("is_live").default(false).notNull(),
  likeCount: integer("like_count").default(0).notNull(),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  vodUrl: text("vod_url"),
  previewImageUrl: text("preview_image_url"),
  hasMinting: boolean("has_minting").default(false).notNull(),
  mintContractAddress: text("mint_contract_address"),
  mintTokenId: text("mint_token_id"),
  mintMetadataUri: text("mint_metadata_uri"),
  mintMaxSupply: integer("mint_max_supply"),
  mintPerWalletLimit: integer("mint_per_wallet_limit"),
  mintCurrentSupply: integer("mint_current_supply").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  streamId: uuid("stream_id").references(() => streams.id).notNull(),
  senderAddress: text("sender_address").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const streamLikes = pgTable("stream_likes", {
  id: uuid("id").defaultRandom().primaryKey(),
  streamId: uuid("stream_id").references(() => streams.id).notNull(),
  userAddress: text("user_address").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const streamViews = pgTable("stream_views", {
  id: uuid("id").defaultRandom().primaryKey(),
  streamId: uuid("stream_id").references(() => streams.id).notNull(),
  userAddress: text("user_address").notNull(),
  viewedAt: timestamp("viewed_at").defaultNow().notNull(),
})

