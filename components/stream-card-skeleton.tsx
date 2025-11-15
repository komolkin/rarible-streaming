import { Card, CardContent } from "@/components/ui/card"

export function StreamCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="aspect-video w-full bg-muted animate-pulse" />
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Title skeleton */}
          <div className="h-5 bg-muted rounded animate-pulse w-3/4" />
          
          {/* Creator info skeleton */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
            <div className="h-4 bg-muted rounded animate-pulse w-24" />
          </div>
          
          {/* Stats skeleton */}
          <div className="flex items-center gap-4">
            <div className="h-4 bg-muted rounded animate-pulse w-16" />
            <div className="h-4 bg-muted rounded animate-pulse w-16" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function StreamsGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <StreamCardSkeleton key={i} />
      ))}
    </div>
  )
}

