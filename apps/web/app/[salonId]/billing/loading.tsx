import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"

export default function BillingLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-36" />

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="h-10 w-36" />
        </div>
        <Skeleton className="h-3 w-64" />
      </Card>

      <Card className="p-6 space-y-4">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </Card>
    </div>
  )
}
