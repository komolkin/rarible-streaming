"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"

export default function StreamSetupPage() {
  const params = useParams()
  const [stream, setStream] = useState<any>(null)
  const { toast } = useToast()

  const fetchStream = useCallback(async () => {
    const response = await fetch(`/api/streams/${params.id}`)
    const data = await response.json()
    setStream(data)
  }, [params.id])

  useEffect(() => {
    fetchStream()
  }, [fetchStream])

  if (!stream) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div>Loading...</div>
      </div>
    )
  }

  if (!stream.livepeerStreamKey) {
    return (
      <div className="min-h-screen pt-24 pb-8 px-8">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Stream is being set up. Please wait...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Livepeer RTMP server URL (without stream key)
  const rtmpServer = "rtmp://ingest.livepeer.studio/live"
  const streamKey = stream.livepeerStreamKey || stream.livepeerStreamId || "Not available"

  return (
    <main className="min-h-screen pt-24 pb-8 px-8">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>OBS Setup Instructions</CardTitle>
            <CardDescription>
              Configure OBS Studio to stream to your live stream
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Server (for OBS Server field)</Label>
                <div className="flex gap-2">
                  <Input value={rtmpServer} readOnly />
                  <Button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(rtmpServer)
                        toast({
                          title: "Copied!",
                          description: "Server URL copied to clipboard",
                        })
                      } catch (error) {
                        toast({
                          title: "Error",
                          description: "Failed to copy server URL",
                          variant: "destructive",
                        })
                      }
                    }}
                  >
                    Copy Server
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Stream Key (for OBS Stream Key field)</Label>
                <div className="flex gap-2">
                  <Input value={streamKey} readOnly />
                  <Button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(streamKey)
                        toast({
                          title: "Copied!",
                          description: "Stream key copied to clipboard",
                        })
                      } catch (error) {
                        toast({
                          title: "Error",
                          description: "Failed to copy stream key",
                          variant: "destructive",
                        })
                      }
                    }}
                  >
                    Copy Stream Key
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold">Steps to configure OBS:</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Open OBS Studio</li>
                <li>Go to Settings → Stream</li>
                <li>Set Service to &quot;Custom&quot;</li>
                <li>Copy the <strong>Server</strong> URL above and paste it into the &quot;Server&quot; field</li>
                <li>Copy the <strong>Stream Key</strong> above and paste it into the &quot;Stream Key&quot; field</li>
                <li>Click &quot;OK&quot; to save</li>
                <li>Click &quot;Start Streaming&quot; in OBS</li>
              </ol>
            </div>

            <div className="space-y-3 border-t pt-6">
              <h3 className="font-semibold">Low-latency encoder checklist</h3>
              <p className="text-sm text-muted-foreground">
                Livepeer&apos;s WebRTC playback needs consistent keyframes and no B-frames. Use these settings in OBS (Settings → Output → Recording/Streaming):
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>
                  <strong>Rate Control:</strong> CBR with 2.5‑3 Mbps (720p) or 3.5‑5 Mbps (1080p)
                </li>
                <li>
                  <strong>Keyframe Interval:</strong> 2 seconds (OBS: set &quot;Keyframe Interval&quot; to <code>2</code>)
                </li>
                <li>
                  <strong>B-frames:</strong> 0 (disable B-frames or use the Livepeer Studio preset)
                </li>
                <li>
                  <strong>Encoder Tune:</strong> <code>zerolatency</code> (x264) or the lowest-latency preset for your encoder
                </li>
              </ul>
              <p className="text-xs text-muted-foreground">
                These match the low-latency guidance from the Livepeer docs so that viewers can stay in WebRTC/LL-HLS mode without falling back to regular HLS.
              </p>
            </div>

            <div className="pt-4">
              <Button asChild>
                <a href={`/stream/${params.id}`}>Go to Stream Page</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

