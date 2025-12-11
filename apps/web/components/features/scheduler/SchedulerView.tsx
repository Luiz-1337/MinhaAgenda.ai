"use client"

import { useState } from "react"
import { Calendar, CalendarDays, CalendarRange } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DailyScheduler } from "./DailyScheduler"
import { WeeklyScheduler } from "./WeeklyScheduler"
import { MonthlyScheduler } from "./MonthlyScheduler"

interface SchedulerViewProps {
  salonId: string
  initialDate?: Date | string
}

type ViewType = "daily" | "weekly" | "monthly"

export function SchedulerView({ salonId, initialDate }: SchedulerViewProps) {
  const [viewType, setViewType] = useState<ViewType>("daily")

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      <div className="flex items-center justify-end gap-2">
        <Button
          variant={viewType === "daily" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewType("daily")}
          className="gap-2"
        >
          <Calendar className="h-4 w-4" />
          Diário
        </Button>
        <Button
          variant={viewType === "weekly" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewType("weekly")}
          className="gap-2"
        >
          <CalendarRange className="h-4 w-4" />
          Semanal
        </Button>
        <Button
          variant={viewType === "monthly" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewType("monthly")}
          className="gap-2"
        >
          <CalendarDays className="h-4 w-4" />
          Mensal
        </Button>
      </div>

      {viewType === "daily" && <DailyScheduler salonId={salonId} initialDate={initialDate} />}
      {viewType === "weekly" && <WeeklyScheduler salonId={salonId} initialDate={initialDate} />}
      {viewType === "monthly" && <MonthlyScheduler salonId={salonId} initialDate={initialDate} />}
    </div>
  )
}

