import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"

const MarketingClient = dynamic(() => import("./marketing-client"), {
  loading: () => (
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
          </Card>
        ))}
      </div>
    </div>
  ),
})

export default async function MarketingPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params
  return <MarketingClient salonId={salonId} />
}
