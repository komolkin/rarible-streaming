import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../lib/db";
import { categories } from "../lib/db/schema";

const collectibleCategories = [
  {
    name: "Trading Card Games",
    slug: "trading-card-games",
    description: "Pokémon, Yu-Gi-Oh!, Magic: The Gathering, and more",
  },
  {
    name: "Digital Collectibles",
    slug: "digital-collectibles",
    description: "Digital collectibles, NFTs, and virtual items",
  },
  {
    name: "Sports Cards",
    slug: "sports-cards",
    description: "Baseball, basketball, football, and other sports cards",
  },
  {
    name: "Comics",
    slug: "comics",
    description: "Vintage and modern comic books",
  },
  {
    name: "Toys & Hobbies",
    slug: "toys-hobbies",
    description: "Action figures, Funko Pops, and collectible toys",
  },
  {
    name: "Video Games",
    slug: "video-games",
    description: "Retro and modern gaming collectibles",
  },
  { name: "NFTs", slug: "nfts", description: "Digital collectibles and art" },
  {
    name: "Coins & Money",
    slug: "coins-money",
    description: "Rare coins and currency",
  },
  {
    name: "Jewelry",
    slug: "jewelry",
    description: "Vintage and designer jewelry",
  },
  {
    name: "Watches",
    slug: "watches",
    description: "Luxury and vintage timepieces",
  },
  {
    name: "Art",
    slug: "art",
    description: "Paintings, prints, and sculptures",
  },
];

async function seed() {
  try {
    for (const category of collectibleCategories) {
      await db.insert(categories).values(category).onConflictDoNothing();
    }
    console.log("Categories seeded successfully");
  } catch (error) {
    console.error("Error seeding categories:", error);
    process.exit(1);
  }
}

seed();
