import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"

const TeamClient = dynamic(() => import("./team-client"), {
  loading: () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-10 w-40" />
      </div>
      <Card className="p-0 overflow-hidden">
        <div className="divide-y divide-slate-200 dark:divide-white/10">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  ),
})

export default function TeamPage() {
  return <TeamClient />
}
