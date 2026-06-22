import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"

export default function IntegrationsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />

      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i} className="p-6 space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </Card>
      ))}
    </div>
  )
}
