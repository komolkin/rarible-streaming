import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { StreamCoverPlaceholder } from "@/components/stream-cover-placeholder"

interface StreamPreviewCardProps {
  stream: {
    id: string
    title: string
    description?: string | null
    previewImageUrl?: string | null
    creatorAddress: string
    creator?: {
      displayName?: string | null
      username?: string | null
      avatarUrl?: string | null
    } | null
    isLive?: boolean
    endedAt?: string | Date | null
    createdAt?: string | Date | null
    viewerCount?: number
    category?: {
      name: string
    } | null
  }
  showCreator?: boolean
  showDate?: boolean
}

export function StreamPreviewCard({ 
  stream, 
  showCreator = true,
  showDate = true 
}: StreamPreviewCardProps) {
  // Debug logging
  if (stream.endedAt) {
    if (stream.previewImageUrl) {
      console.log(`[StreamPreviewCard] Stream ${stream.id} "${stream.title}" has previewImageUrl:`, stream.previewImageUrl)
    } else {
      console.warn(`[StreamPreviewCard] Stream ${stream.id} "${stream.title}" is ended but has NO previewImageUrl`)
    }
  }

  return (
    <Link href={`/stream/${stream.id}`}>
      <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
        <div className="aspect-video w-full overflow-hidden rounded-t-lg bg-black relative">
          {stream.previewImageUrl ? (
            <>
              <img
                src={stream.previewImageUrl}
                alt={stream.title}
                className="w-full h-full object-cover"
                loading="lazy"
                onLoad={() => {
                  console.log(`[StreamPreviewCard] Image loaded successfully for stream ${stream.id}`)
                }}
                onError={(e) => {
                  // If image fails to load, hide it and show placeholder instead
                  console.error(`[StreamPreviewCard] Image failed to load for stream ${stream.id}:`, stream.previewImageUrl)
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                  const placeholder = target.parentElement?.querySelector('.placeholder-fallback') as HTMLElement
                  if (placeholder) {
                    placeholder.style.display = 'block'
                  }
                }}
              />
              <div className="placeholder-fallback hidden absolute inset-0">
                <StreamCoverPlaceholder
                  title={stream.title}
                  isLive={stream.isLive}
                  endedAt={stream.endedAt}
                  creatorAddress={stream.creatorAddress}
                />
              </div>
            </>
          ) : (
            <StreamCoverPlaceholder
              title={stream.title}
              isLive={stream.isLive}
              endedAt={stream.endedAt}
              creatorAddress={stream.creatorAddress}
            />
          )}
          {stream.endedAt && (
            <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-semibold">
              Ended
            </div>
          )}
        </div>
        <CardHeader className="p-3 pb-2">
          {stream.category && (
            <div className="text-xs text-blue-400 mb-1">
              {stream.category.name}
            </div>
          )}
          <CardTitle className="line-clamp-2 text-sm font-semibold">
            {stream.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {showCreator && (
            <div className="flex items-center justify-between">
              <Link
                href={`/profile/${stream.creatorAddress}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-2 hover:opacity-80"
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src={stream.creator?.avatarUrl || ""} />
                  <AvatarFallback
                    seed={(stream.creatorAddress || "").toLowerCase()}
                  />
                </Avatar>
                <span className="text-xs text-muted-foreground">
                  {stream.creator?.displayName || stream.creator?.username || `${stream.creatorAddress?.slice(0, 6)}...${stream.creatorAddress?.slice(-4)}`}
                </span>
              </Link>
              {showDate && (stream.createdAt || stream.endedAt) && (
                <span className="text-xs text-muted-foreground">
                  {stream.endedAt
                    ? new Date(stream.endedAt).toLocaleDateString()
                    : stream.createdAt
                    ? new Date(stream.createdAt).toLocaleDateString()
                    : null}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

