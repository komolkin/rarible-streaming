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
        <div className="inline-block w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin"></div>
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

