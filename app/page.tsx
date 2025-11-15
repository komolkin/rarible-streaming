"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StreamPreviewCard } from "@/components/stream-preview-card";

export default function Home() {
  const [recentStreams, setRecentStreams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentStreams();
  }, []);

  const fetchRecentStreams = async () => {
    try {
      const response = await fetch("/api/streams?limit=12");
      if (response.ok) {
        const streams = await response.json();
        // Creator profiles are now included in the API response
        setRecentStreams(streams);
        setLoading(false);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error("Error fetching recent streams:", error);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen pt-24 pb-8 px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">The best way to have fun onchain</h1>
          <Button className="bg-white text-black hover:bg-gray-100 mt-6">
            Join waitlist
          </Button>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-6">Recent Streams</h2>
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin"></div>
            </div>
          ) : recentStreams.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No streams yet. Be the first to stream!
              </p>
              <Link href="/create" className="mt-4 inline-block">
                <Button>Launch Your First Stream</Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {recentStreams.map((stream) => (
                <StreamPreviewCard key={stream.id} stream={stream} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
