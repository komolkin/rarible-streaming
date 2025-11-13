import { Video, Radio } from "lucide-react"

interface StreamCoverPlaceholderProps {
  title?: string
  className?: string
  isLive?: boolean
  endedAt?: string | Date | null
  creatorAddress?: string
}

export function StreamCoverPlaceholder({ 
  title, 
  className = "",
  isLive = false,
  endedAt = null,
  creatorAddress
}: StreamCoverPlaceholderProps) {
  // Use dark grey gradient instead of generated gradient
  const darkGreyGradient = "linear-gradient(135deg, #1f2937 0%, #111827 50%, #0f172a 100%)"

  // Determine status
  const hasEnded = !!endedAt
  const status = isLive ? "live" : hasEnded ? "ended" : "scheduled"

  return (
    <div
      className={`w-full h-full relative flex items-center justify-center ${className}`}
      style={{ background: darkGreyGradient }}
    >
      {/* Status badge in top-left corner - only show for live streams, not scheduled or ended */}
      {isLive && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-md">
          <Radio className="w-3 h-3 text-red-400 fill-red-400" />
          <span className="text-xs font-medium text-white">Live</span>
        </div>
      )}

      {/* Center content - just the video icon, no text */}
      <div className="flex flex-col items-center justify-center text-white/90 px-4">
        <div className="relative">
          <Video className="w-16 h-16 opacity-80" />
          {isLive && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 bg-red-500/20 rounded-full animate-pulse" />
            </div>
          )}
        </div>
      </div>

      {/* Subtle pattern overlay for texture */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }}
      />
    </div>
  )
}

