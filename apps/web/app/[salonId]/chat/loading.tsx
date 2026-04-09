import { Skeleton } from "@/components/ui/skeleton"

export default function ChatLoading() {
  return (
    <div className="flex h-full gap-0">
      {/* Conversation list */}
      <div className="w-80 border-r border-border p-4 space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>

      {/* Message area */}
      <div className="flex-1 flex flex-col">
        <div className="border-b border-border p-4 flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
              <Skeleton className={`h-12 rounded-xl ${i % 2 === 0 ? "w-64" : "w-48"}`} />
            </div>
          ))}
        </div>
        <div className="border-t border-border p-4">
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
