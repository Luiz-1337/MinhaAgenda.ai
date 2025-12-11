import { SchedulerView } from "@/components/features/scheduler/SchedulerView"

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params
  return (
    <div className="h-full flex flex-col">
      <SchedulerView salonId={salonId} />
    </div>
  )
}

