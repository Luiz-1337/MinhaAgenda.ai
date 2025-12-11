/**
 * Tool para verificar disponibilidade de horários
 */

import { z } from "zod"
import { and, eq, gt, lt } from "drizzle-orm"
import { db, appointments, services, salons } from "@repo/db"
import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { checkAvailabilitySchema, type CheckAvailabilityInput } from "../schemas/tools.schema.js"

/**
 * Calcula horários disponíveis considerando:
 * - Horários de trabalho do salão
 * - Agendamentos existentes
 * - Duração do serviço
 */
export async function checkAvailabilityTool(
  server: Server,
  args: unknown
): Promise<{ slots: string[]; message: string }> {
  const params = checkAvailabilitySchema.parse(args)

  // Busca informações do salão
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, params.salonId),
    columns: {
      id: true,
      name: true,
      workHours: true,
    },
  })

  if (!salon) {
    throw new Error(`Salão com ID ${params.salonId} não encontrado`)
  }

  // Busca duração do serviço se serviceId fornecido
  let serviceDuration = params.serviceDuration || 60 // padrão 60 minutos

  if (params.serviceId) {
    const service = await db.query.services.findFirst({
      where: eq(services.id, params.serviceId),
      columns: { duration: true },
    })

    if (service) {
      serviceDuration = service.duration
    }
  }

  // Parse da data
  const targetDate = new Date(params.date)
  if (isNaN(targetDate.getTime())) {
    throw new Error("Data inválida")
  }

  // Busca horários de trabalho do salão
  const workHours = salon.workHours as Record<string, { start: string; end: string }> | null
  const dayOfWeek = targetDate.getDay() // 0 = domingo, 6 = sábado
  const dayKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const dayKey = dayKeys[dayOfWeek]

  const dayHours = workHours?.[dayKey]
  if (!dayHours?.start || !dayHours?.end) {
    return {
      slots: [],
      message: `O profissional ${params.professionalId} não funciona neste dia da semana (${dayKey})`,
    }
  }

  // Calcula início e fim do dia
  const [startHour, startMinute] = dayHours.start.split(":").map(Number)
  const [endHour, endMinute] = dayHours.end.split(":").map(Number)

  const dayStart = new Date(targetDate)
  dayStart.setHours(startHour, startMinute, 0, 0)

  const dayEnd = new Date(targetDate)
  dayEnd.setHours(endHour, endMinute, 0, 0)

  // Busca agendamentos existentes
  const existingAppointments = await db
    .select({
      start: appointments.date,
      end: appointments.endTime,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.salonId, params.salonId),
        params.professionalId ? eq(appointments.professionalId, params.professionalId) : undefined,
        lt(appointments.date, dayEnd),
        gt(appointments.endTime, dayStart),
        eq(appointments.status, "confirmed")
      )
    )

  // Gera slots disponíveis
  const slots: string[] = []
  const slotDurationMs = serviceDuration * 60 * 1000

  for (let current = dayStart.getTime(); current + slotDurationMs <= dayEnd.getTime(); current += 30 * 60 * 1000) {
    const slotStart = new Date(current)
    const slotEnd = new Date(current + slotDurationMs)

    // Verifica se há conflito com agendamentos existentes
    const hasConflict = existingAppointments.some((apt) => {
      const aptStart = new Date(apt.start)
      const aptEnd = new Date(apt.end)
      return slotStart < aptEnd && slotEnd > aptStart
    })

    if (!hasConflict) {
      slots.push(slotStart.toISOString())
    }
  }

  return {
    slots,
    message: slots.length > 0
      ? `Encontrados ${slots.length} horários disponíveis`
      : "Nenhum horário disponível para esta data",
  }
}

