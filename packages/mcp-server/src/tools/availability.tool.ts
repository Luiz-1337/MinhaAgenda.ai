/**
 * Tool para verificar disponibilidade de horários
 */

import { z } from "zod"
import { and, eq, gt, lt, or, inArray } from "drizzle-orm"
import { db, appointments, services, salons, availability, professionals } from "@repo/db"
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

  // Parse da data - normaliza para o início do dia para garantir consistência
  const targetDate = new Date(params.date)
  if (isNaN(targetDate.getTime())) {
    throw new Error(`Data inválida: ${params.date}`)
  }

  // Normaliza para o início do dia (00:00:00) para garantir que getDay() retorne o dia correto
  const normalizedDate = new Date(targetDate)
  normalizedDate.setHours(0, 0, 0, 0)
  
  const dayOfWeek = normalizedDate.getDay() // 0 = domingo, 6 = sábado
  const dayKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const dayKey = dayKeys[dayOfWeek]

  // Busca horários de trabalho - prioriza horários do profissional se fornecido
  let dayHours: { start: string; end: string } | null = null

  if (params.professionalId) {
    // Busca horários do profissional na tabela availability
    const professionalAvailability = await db
      .select({
        startTime: availability.startTime,
        endTime: availability.endTime,
      })
      .from(availability)
      .where(
        and(
          eq(availability.professionalId, params.professionalId),
          eq(availability.dayOfWeek, dayOfWeek),
          eq(availability.isBreak, false)
        )
      )
      .limit(1)

    if (professionalAvailability.length > 0) {
      const avail = professionalAvailability[0]
      dayHours = {
        start: avail.startTime,
        end: avail.endTime,
      }
    } else {
      // Profissional não tem horário cadastrado neste dia
      return {
        slots: [],
        message: `O profissional não possui horários cadastrados para ${dayKey}. Por favor, cadastre a disponibilidade do profissional primeiro.`,
      }
    }
  } else {
    // Se não há professionalId, busca qualquer profissional que trabalhe neste dia
    const anyProfessionalAvailability = await db
      .select({
        startTime: availability.startTime,
        endTime: availability.endTime,
      })
      .from(availability)
      .innerJoin(professionals, eq(availability.professionalId, professionals.id))
      .where(
        and(
          eq(professionals.salonId, params.salonId),
          eq(professionals.isActive, true),
          eq(availability.dayOfWeek, dayOfWeek),
          eq(availability.isBreak, false)
        )
      )
      .limit(1)

    if (anyProfessionalAvailability.length > 0) {
      const avail = anyProfessionalAvailability[0]
      dayHours = {
        start: avail.startTime,
        end: avail.endTime,
      }
    } else {
      // Se não encontrou nenhum profissional, usa horários do salão como fallback
      const workHours = salon.workHours as Record<string, { start: string; end: string }> | null
      dayHours = workHours?.[dayKey] || null
    }
  }

  if (!dayHours?.start || !dayHours?.end) {
    return {
      slots: [],
      message: `Nenhum profissional ou horário do salão disponível para ${dayKey}. Por favor, cadastre horários de trabalho.`,
    }
  }

  // Calcula início e fim do dia
  // Formata horário para garantir que está no formato correto (HH:MM ou HH:MM:SS)
  const startTimeStr = dayHours.start.includes(":") ? dayHours.start.split(":") : ["0", "0"]
  const endTimeStr = dayHours.end.includes(":") ? dayHours.end.split(":") : ["0", "0"]
  
  const startHour = parseInt(startTimeStr[0] || "0", 10)
  const startMinute = parseInt(startTimeStr[1] || "0", 10)
  const endHour = parseInt(endTimeStr[0] || "0", 10)
  const endMinute = parseInt(endTimeStr[1] || "0", 10)

  // Valida horários
  if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute)) {
    throw new Error(`Formato de horário inválido: ${dayHours.start} - ${dayHours.end}`)
  }

  // Normaliza a data para o início do dia (meia-noite) usando a data normalizada
  const dayStart = new Date(normalizedDate)
  dayStart.setHours(startHour, startMinute, 0, 0)

  const dayEnd = new Date(normalizedDate)
  dayEnd.setHours(endHour, endMinute, 0, 0)
  
  // Se o horário de fim for menor que o início, significa que termina no dia seguinte
  if (dayEnd <= dayStart) {
    dayEnd.setDate(dayEnd.getDate() + 1)
  }

  // Busca agendamentos existentes
  // Constrói condições de forma que undefined seja ignorado
  const appointmentConditions = [
    eq(appointments.salonId, params.salonId),
    lt(appointments.date, dayEnd),
    gt(appointments.endTime, dayStart),
    // Considera tanto 'confirmed' quanto 'pending' como ocupados
    or(
      eq(appointments.status, "confirmed"),
      eq(appointments.status, "pending")
    ),
  ]

  if (params.professionalId) {
    appointmentConditions.push(eq(appointments.professionalId, params.professionalId))
  }

  const existingAppointments = await db
    .select({
      start: appointments.date,
      end: appointments.endTime,
    })
    .from(appointments)
    .where(and(...appointmentConditions))

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

