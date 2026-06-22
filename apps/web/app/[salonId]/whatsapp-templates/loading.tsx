import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"

export default function WhatsappTemplatesLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-5 space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </Card>
        ))}
      </div>
    </div>
  )
}
