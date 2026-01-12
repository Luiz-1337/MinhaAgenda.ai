"use server"

// ============================================================================
// INFRASTRUCTURE LAYER - Framework/External Dependencies
// ============================================================================

import { revalidatePath } from "next/cache"
import type { AvailabilityItem, ScheduleItem } from "@/lib/types/availability"
import type { ActionResult } from "@/lib/types/common"

// ============================================================================
// APPLICATION LAYER - Use Cases and Services
// ============================================================================

import { BaseAuthenticatedAction } from "@/lib/services/actions/base-authenticated-action.service"
import { AvailabilityRepository } from "@/lib/services/availability/availability.repository"
import { ScheduleValidator } from "@/lib/services/availability/schedule-validator.service"
import { AvailabilityMapper } from "@/lib/services/availability/availability-mapper.service"

// ============================================================================
// Server Actions
// ============================================================================

/**
 * Obtém a disponibilidade de um profissional
 */
export async function getAvailability(
  professionalId: string,
  salonId: string
): Promise<AvailabilityItem[] | { error: string }> {
  try {
    BaseAuthenticatedAction.validateSalonId(salonId)

    const authResult = await BaseAuthenticatedAction.authenticateAndAuthorize(salonId)
    if ("error" in authResult) {
      return authResult
    }

    const belongsToSalon = await AvailabilityRepository.professionalBelongsToSalon(
      professionalId,
      salonId
    )

    if (!belongsToSalon) {
      return { error: "Profissional inválido" }
    }

    const rows = await AvailabilityRepository.findActiveByProfessionalId(professionalId)
    const items = AvailabilityMapper.toAvailabilityItems(rows)

    return items
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Falha ao buscar disponibilidade."
    return { error: errorMessage }
  }
}

/**
 * Atualiza a disponibilidade de um profissional
 */
export async function updateAvailability(
  professionalId: string,
  schedule: ScheduleItem[],
  salonId: string
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

    const belongsToSalon = await AvailabilityRepository.professionalBelongsToSalon(
      professionalId,
      salonId
    )

    if (!belongsToSalon) {
      return { error: "Profissional inválido" }
    }

    // Remove disponibilidade existente
    await AvailabilityRepository.deleteByProfessionalId(professionalId)

    // Filtra apenas horários ativos e insere novos
    const activeSchedules = ScheduleValidator.filterActive(schedule)
    if (activeSchedules.length > 0) {
      const toInsert = activeSchedules.map((item) =>
        AvailabilityMapper.toInsert(professionalId, item)
      )
      await AvailabilityRepository.insertMany(toInsert)
    }

    revalidatePath("/dashboard/team")
    return { success: true, data: undefined }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Falha ao atualizar disponibilidade."
    return { error: errorMessage }
  }
}

