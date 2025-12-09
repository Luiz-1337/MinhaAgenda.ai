import { and, eq, gt, lt } from "drizzle-orm"

import { appointments, db, salons } from "@repo/db"

type WorkHoursDay = {
  start: string
  end: string
}

type WorkHours = Record<string, WorkHoursDay>

type GetAvailableSlotsInput = {
  date: Date | string
  salonId: string
  serviceDuration: number
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
const MINUTE_IN_MS = 60 * 1000

function parseTimeInDay(base: Date, time: string): Date | null {
  const [hourStr, minuteStr] = time.split(":")
  const hours = Number(hourStr)
  const minutes = Number(minuteStr)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null

  const result = new Date(base)
  result.setHours(hours, minutes, 0, 0)
  return result
}

export async function getAvailableSlots({ date, salonId, serviceDuration }: GetAvailableSlotsInput): Promise<string[]> {
  if (!salonId) throw new Error("salonId é obrigatório")
  if (serviceDuration <= 0) throw new Error("serviceDuration deve ser maior que zero")

  const targetDate = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(targetDate.getTime())) throw new Error("Data inválida")

  const dayKey = DAY_KEYS[targetDate.getDay()]

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { workHours: true },
  })

  const workHours = (salon?.workHours ?? null) as WorkHours | null
  const dayHours = workHours?.[dayKey]
  if (!dayHours?.start || !dayHours?.end) return []

  const dayStart = parseTimeInDay(targetDate, dayHours.start)
  const dayEnd = parseTimeInDay(targetDate, dayHours.end)
  if (!dayStart || !dayEnd || dayEnd <= dayStart) return []

  const durationMs = serviceDuration * MINUTE_IN_MS
  const dayStartMs = dayStart.getTime()
  const dayEndMs = dayEnd.getTime()

  const existingAppointments = await db
    .select({
      start: appointments.date,
      end: appointments.endTime,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.salonId, salonId),
        lt(appointments.date, dayEnd),
        gt(appointments.endTime, dayStart)
      )
    )

  const busy = existingAppointments
    .map(({ start, end }) => ({
      start: new Date(start),
      end: new Date(end),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const slots: string[] = []
  for (let current = dayStartMs; current + durationMs <= dayEndMs; current += durationMs) {
    const slotStart = current
    const slotEnd = current + durationMs

    const overlaps = busy.some(({ start, end }) => slotStart < end.getTime() && slotEnd > start.getTime())
    if (!overlaps) {
      slots.push(new Date(slotStart).toISOString())
    }
  }

  return slots
}

