import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"

export default function ContactsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-10 w-36" />
      </div>

      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 w-28" />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-28 hidden md:block" />
              <Skeleton className="h-4 w-24 hidden md:block" />
              <div className="ml-auto">
                <Skeleton className="h-8 w-8" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
