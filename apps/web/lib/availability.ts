import { and, eq, gt, lt } from "drizzle-orm"
import { appointments, db, salons } from "@repo/db"
import type { GetAvailableSlotsInput, WorkHours, WorkHoursDay } from "@/lib/types/availability"
import { parseTimeInDay, getDayKey, MINUTE_IN_MS } from "@/lib/utils/time.utils"

/**
 * Obtém os horários disponíveis para agendamento em uma data específica
 */
export async function getAvailableSlots({
  date,
  salonId,
  serviceDuration,
  professionalId,
}: GetAvailableSlotsInput): Promise<string[]> {
  validateInputs(salonId, serviceDuration)

  const targetDate = normalizeDate(date)
  const dayKey = getDayKey(targetDate)

  // Busca horários de trabalho do salão
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { workHours: true },
  })

  const workHours = (salon?.workHours ?? null) as WorkHours | null
  const dayHours = workHours?.[dayKey]

  if (!dayHours?.start || !dayHours?.end) {
    return []
  }

  // Calcula início e fim do dia
  const dayStart = parseTimeInDay(targetDate, dayHours.start)
  const dayEnd = parseTimeInDay(targetDate, dayHours.end)

  if (!dayStart || !dayEnd || dayEnd <= dayStart) {
    return []
  }

  // Busca agendamentos existentes
  const busySlots = await getBusyTimeSlots(salonId, dayStart, dayEnd, professionalId)

  // Gera slots disponíveis
  return generateAvailableSlots(dayStart, dayEnd, serviceDuration, busySlots)
}

/**
 * Valida os parâmetros de entrada
 */
function validateInputs(salonId: string, serviceDuration: number): void {
  if (!salonId) {
    throw new Error("salonId é obrigatório")
  }
  if (serviceDuration <= 0) {
    throw new Error("serviceDuration deve ser maior que zero")
  }
}

/**
 * Normaliza a data para objeto Date
 */
function normalizeDate(date: Date | string): Date {
  const targetDate = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(targetDate.getTime())) {
    throw new Error("Data inválida")
  }
  return targetDate
}

/**
 * Obtém os períodos ocupados (agendamentos existentes)
 */
async function getBusyTimeSlots(
  salonId: string,
  dayStart: Date,
  dayEnd: Date,
  professionalId?: string
): Promise<Array<{ start: Date; end: Date }>> {
  const whereConditions = [
    eq(appointments.salonId, salonId),
    lt(appointments.date, dayEnd),
    gt(appointments.endTime, dayStart),
  ]

  if (professionalId) {
    whereConditions.push(eq(appointments.professionalId, professionalId))
  }

  const existingAppointments = await db
    .select({
      start: appointments.date,
      end: appointments.endTime,
    })
    .from(appointments)
    .where(and(...whereConditions))

  return existingAppointments
    .map(({ start, end }) => ({
      start: new Date(start),
      end: new Date(end),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

/**
 * Gera os slots disponíveis baseado nos períodos ocupados
 */
function generateAvailableSlots(
  dayStart: Date,
  dayEnd: Date,
  serviceDuration: number,
  busySlots: Array<{ start: Date; end: Date }>
): string[] {
  const durationMs = serviceDuration * MINUTE_IN_MS
  const dayStartMs = dayStart.getTime()
  const dayEndMs = dayEnd.getTime()
  const availableSlots: string[] = []

  for (let current = dayStartMs; current + durationMs <= dayEndMs; current += durationMs) {
    const slotStart = current
    const slotEnd = current + durationMs

    const hasOverlap = busySlots.some(
      ({ start, end }) => slotStart < end.getTime() && slotEnd > start.getTime()
    )

    if (!hasOverlap) {
      availableSlots.push(new Date(slotStart).toISOString())
    }
  }

  return availableSlots
}
