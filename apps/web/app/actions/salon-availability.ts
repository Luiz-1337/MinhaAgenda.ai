"use server"

// ============================================================================
// INFRASTRUCTURE LAYER - Framework/External Dependencies
// ============================================================================

import { revalidatePath } from "next/cache"
import type { ScheduleItem } from "@/lib/types/availability"
import type { ActionResult } from "@/lib/types/common"

// ============================================================================
// APPLICATION LAYER - Use Cases and Services
// ============================================================================

import { BaseAuthenticatedAction } from "@/lib/services/actions/base-authenticated-action.service"
import { AvailabilityMapper } from "@/lib/services/availability/availability-mapper.service"
import { AvailabilityRepository } from "@/lib/services/availability/availability.repository"
import { ScheduleValidator } from "@/lib/services/availability/schedule-validator.service"
import { SalonPlanService } from "@/lib/services/services/salon-plan.service"
import { db, salons, eq } from "@repo/db"

// ============================================================================
// Server Actions
// ============================================================================

/**
 * Converte workHours (formato do banco) para ScheduleItem[]
 */
function workHoursToSchedule(workHours: Record<string, { start: string; end: string }> | null | undefined): ScheduleItem[] {
  if (!workHours || typeof workHours !== 'object') {
    return Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i,
      isActive: false,
      startTime: "09:00",
      endTime: "18:00",
    }))
  }

  const schedule: ScheduleItem[] = []
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    const dayKey = String(dayOfWeek)
    const dayHours = workHours[dayKey]

    if (dayHours && dayHours.start && dayHours.end) {
      schedule.push({
        dayOfWeek,
        startTime: dayHours.start,
        endTime: dayHours.end,
        isActive: true,
      })
    } else {
      schedule.push({
        dayOfWeek,
        startTime: "09:00",
        endTime: "18:00",
        isActive: false,
      })
    }
  }

  return schedule
}

/**
 * Converte ScheduleItem[] para workHours (formato do banco)
 */
function scheduleToWorkHours(schedule: ScheduleItem[]): Record<string, { start: string; end: string }> | null {
  const workHours: Record<string, { start: string; end: string }> = {}
  let hasActiveDays = false

  for (const item of schedule) {
    if (item.isActive) {
      workHours[String(item.dayOfWeek)] = {
        start: item.startTime,
        end: item.endTime,
      }
      hasActiveDays = true
    }
  }

  return hasActiveDays ? workHours : null
}

/**
 * Obtém a disponibilidade do salão (plano SOLO)
 */
export async function getSalonAvailability(
  salonId: string
): Promise<ScheduleItem[] | { error: string }> {
  try {
    BaseAuthenticatedAction.validateSalonId(salonId)

    const authResult = await BaseAuthenticatedAction.authenticateAndAuthorize(salonId)
    if ("error" in authResult) {
      return authResult
    }

    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { workHours: true },
    })

    if (!salon) {
      return { error: "Salão não encontrado" }
    }

    const workHours = salon.workHours as Record<string, { start: string; end: string }> | null | undefined
    const schedule = workHoursToSchedule(workHours)

    // Garante que sempre retorna 7 itens
    if (schedule.length !== 7) {
      return Array.from({ length: 7 }, (_, i) => ({
        dayOfWeek: i,
        isActive: false,
        startTime: "09:00",
        endTime: "18:00",
      }))
    }

    return schedule
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Falha ao buscar disponibilidade."
    return { error: errorMessage }
  }
}

/**
 * Atualiza a disponibilidade do salão (plano SOLO)
 */
export async function updateSalonAvailability(
  salonId: string,
  schedule: ScheduleItem[]
): Promise<ActionResult> {
  try {
    BaseAuthenticatedAction.validateSalonId(salonId)

    const authResult = await BaseAuthenticatedAction.authenticateAndAuthorize(salonId)
    if ("error" in authResult) {
      return authResult
    }

    // Validação dos dados de entrada
    try {
      ScheduleValidator.validateSchedule(schedule)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao validar horários"
      return { error: errorMessage }
    }

    // Verifica se o salão existe
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { id: true },
    })

    if (!salon) {
      return { error: "Salão não encontrado" }
    }

    // Converte schedule para workHours e atualiza
    const workHours = scheduleToWorkHours(schedule)

    await db
      .update(salons)
      .set({
        workHours: workHours as any,
        updatedAt: new Date(),
      })
      .where(eq(salons.id, salonId))

    // Replica para a tabela availability quando o salão é SOLO (MCP, agendamentos leem de lá)
    const isSolo = await SalonPlanService.isSoloPlan(salonId)
    if (isSolo) {
      const professionalId = await SalonPlanService.findOwnerProfessional(salonId)
      if (professionalId) {
        await AvailabilityRepository.deleteByProfessionalId(professionalId)
        const activeSchedules = ScheduleValidator.filterActive(schedule)
        if (activeSchedules.length > 0) {
          const toInsert = activeSchedules.map((item) =>
            AvailabilityMapper.toInsert(professionalId, item)
          )
          await AvailabilityRepository.insertMany(toInsert)
        }
      }
    }

    revalidatePath(`/${salonId}/dashboard`)
    return { success: true, data: undefined }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Falha ao atualizar disponibilidade."
    return { error: errorMessage }
  }
}
