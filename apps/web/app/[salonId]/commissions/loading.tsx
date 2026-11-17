import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="h-full flex flex-col gap-6">
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  )
}
