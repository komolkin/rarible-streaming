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

        // Debug: log streams with previewImageUrl
        console.log("[Home] Fetched streams:", streams.length);
        streams.forEach((stream: any) => {
          if (stream.endedAt) {
            console.log(`[Home] Stream ${stream.id}:`, {
              title: stream.title,
              endedAt: stream.endedAt,
              previewImageUrl: stream.previewImageUrl,
              hasPreviewImage: !!stream.previewImageUrl,
            });
          }
        });

        // Fetch creator profiles for each stream
        const streamsWithCreators = await Promise.all(
          streams.map(async (stream: any) => {
            try {
              const creatorResponse = await fetch(
                `/api/profiles?wallet=${stream.creatorAddress}`
              );
              if (creatorResponse.ok) {
                const creator = await creatorResponse.json();
                return { ...stream, creator };
              }
            } catch (error) {
              console.error(
                `Error fetching creator for stream ${stream.id}:`,
                error
              );
            }
            return stream;
          })
        );

        setRecentStreams(streamsWithCreators);
      }
    } catch (error) {
      console.error("Error fetching recent streams:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen pt-24 pb-8 px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Rarible Streaming</h1>
          <p className="text-muted-foreground mb-8">
            Onchain livestreaming platform with NFT minting
          </p>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-6">Recent Streams</h2>
          {loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading streams...</p>
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
