import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../lib/db";
import { categories } from "../lib/db/schema";

const collectibleCategories = [
  {
    name: "Trading Card Games",
    slug: "trading-card-games",
    description: "Pokémon, Yu-Gi-Oh!, Magic: The Gathering, and more",
    imageUrl: "https://images.unsplash.com/photo-1608889476561-6242cfdbf622?w=800&q=80",
  },
  {
    name: "Digital Collectibles",
    slug: "digital-collectibles",
    description: "Digital collectibles, NFTs, and virtual items",
    imageUrl: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=800&q=80",
  },
  {
    name: "Sports Cards",
    slug: "sports-cards",
    description: "Baseball, basketball, football, and other sports cards",
    imageUrl: "https://images.unsplash.com/photo-1613771404721-c5b425876d90?w=800&q=80",
  },
  {
    name: "Comics",
    slug: "comics",
    description: "Vintage and modern comic books",
    imageUrl: "https://images.unsplash.com/photo-1601645191163-3fc0d5d64e35?w=800&q=80",
  },
  {
    name: "Toys & Hobbies",
    slug: "toys-hobbies",
    description: "Action figures, Funko Pops, and collectible toys",
    imageUrl: "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=800&q=80",
  },
  {
    name: "Video Games",
    slug: "video-games",
    description: "Retro and modern gaming collectibles",
    imageUrl: "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=800&q=80",
  },
  { 
    name: "NFTs", 
    slug: "nfts", 
    description: "Digital collectibles and art",
    imageUrl: "https://images.unsplash.com/photo-1643101809754-43a9178468ca?w=800&q=80",
  },
  {
    name: "Coins & Money",
    slug: "coins-money",
    description: "Rare coins and currency",
    imageUrl: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800&q=80",
  },
  {
    name: "Jewelry",
    slug: "jewelry",
    description: "Vintage and designer jewelry",
    imageUrl: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800&q=80",
  },
  {
    name: "Watches",
    slug: "watches",
    description: "Luxury and vintage timepieces",
    imageUrl: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=800&q=80",
  },
  {
    name: "Art",
    slug: "art",
    description: "Paintings, prints, and sculptures",
    imageUrl: "https://images.unsplash.com/photo-1547891654-e66ed7ebb968?w=800&q=80",
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
