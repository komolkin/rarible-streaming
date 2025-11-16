"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StreamPreviewLarge } from "@/components/stream-preview-large";

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function Home() {
  const [recentStreams, setRecentStreams] = useState<any[]>([]);
  const [allStreams, setAllStreams] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedCategory === "all") {
      setRecentStreams(allStreams);
    } else {
      const filtered = allStreams.filter(
        (stream) => stream.categoryId === selectedCategory
      );
      setRecentStreams(filtered);
    }
  }, [selectedCategory, allStreams]);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch streams and categories in parallel
      const [streamsResponse, categoriesResponse] = await Promise.all([
        fetch("/api/streams?limit=12"),
        fetch("/api/categories"),
      ]);

      if (streamsResponse.ok) {
        const streams = await streamsResponse.json();
        // Creator profiles are now included in the API response
        setAllStreams(streams);
        setRecentStreams(streams);
      }

      if (categoriesResponse.ok) {
        const categoriesData = await categoriesResponse.json();
        setCategories(categoriesData);
      }

      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen pt-24 pb-8 px-2 md:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 [text-wrap:pretty]">The best way to have fun onchain</h1>
          <p className="text-muted-foreground mb-12 [text-wrap:pretty]">
            We&apos;re currently in Private Access.{" "}
            <a 
              href="https://x.com/Rarible" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-white hover:text-gray-200"
            >
              Join waitlist
            </a>
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            {/* Category Filter */}
            <div className="mb-8 overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-2 pb-2">
                <button
                  onClick={() => setSelectedCategory("all")}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === "all"
                      ? "bg-gray-200 text-black"
                      : "bg-gray-800 text-white hover:bg-gray-700"
                  }`}
                >
                  All
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      selectedCategory === category.id
                        ? "bg-gray-200 text-black"
                        : "bg-gray-800 text-white hover:bg-gray-700"
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-8">
              {recentStreams.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">
                    No streams yet. Be the first to stream!
                  </p>
                  <Link href="/create" className="mt-4 inline-block">
                    <Button>Launch Your First Stream</Button>
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {recentStreams.map((stream) => (
                    <StreamPreviewLarge key={stream.id} stream={stream} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
