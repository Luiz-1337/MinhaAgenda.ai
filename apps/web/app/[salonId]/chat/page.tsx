import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

const ChatClient = dynamic(() => import("./chat-client"), {
  loading: () => (
    <div className="flex h-full gap-0">
      <div className="w-80 border-r border-slate-200 dark:border-white/10 p-4 space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex-1 flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    </div>
  ),
})

export default async function ChatPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params
  return <ChatClient salonId={salonId} />
}
