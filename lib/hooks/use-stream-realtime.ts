import { useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase/client"

/**
 * Hook to subscribe to real-time updates for a specific stream
 * Updates viewer count, live status, and other stream fields in real-time
 */
export function useStreamRealtime(
  streamId: string | undefined,
  onUpdate: (updates: {
    viewerCount?: number
    isLive?: boolean
    endedAt?: string | Date | null
  }) => void
) {
  const subscribe = useCallback(() => {
    if (!streamId) return () => {}

    const channel = supabase
      .channel(`stream-realtime:${streamId}`, {
        config: {
          broadcast: { self: true },
        },
      })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "streams",
          filter: `id=eq.${streamId}`,
        },
        (payload) => {
          if (payload.new) {
            const updates: {
              viewerCount?: number
              isLive?: boolean
              endedAt?: string | Date | null
            } = {}

            if (typeof payload.new.viewer_count === "number") {
              updates.viewerCount = payload.new.viewer_count
            }
            if (payload.new.is_live !== undefined) {
              updates.isLive = payload.new.is_live
            }
            if (payload.new.ended_at !== undefined) {
              updates.endedAt = payload.new.ended_at
            }

            if (Object.keys(updates).length > 0) {
              onUpdate(updates)
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[useStreamRealtime] Subscribed to stream ${streamId}`)
        } else if (status === "CHANNEL_ERROR") {
          console.error(`[useStreamRealtime] Subscription error for stream ${streamId}`)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [streamId, onUpdate])

  useEffect(() => {
    const cleanup = subscribe()
    return cleanup
  }, [subscribe])
}
