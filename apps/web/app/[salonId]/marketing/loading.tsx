import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"

export default function MarketingLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-36" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-6 space-y-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-full" />
          </Card>
        ))}
      </div>

      <Card className="p-6 space-y-4">
        <Skeleton className="h-6 w-36" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </Card>
    </div>
  )
}
