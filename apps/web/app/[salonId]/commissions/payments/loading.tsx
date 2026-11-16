import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="h-full flex flex-col gap-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  )
}
