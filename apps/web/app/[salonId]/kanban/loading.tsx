import { Skeleton } from "@/components/ui/skeleton"

export default function KanbanLoading() {
  return (
    <div className="h-full p-2 md:p-6">
      <div className="flex gap-4 h-full overflow-x-auto custom-scrollbar">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-72 bg-card rounded-lg border border-border p-3 space-y-3">
            <Skeleton className="h-6 w-24" />
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} className="h-20 w-full rounded-md" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
