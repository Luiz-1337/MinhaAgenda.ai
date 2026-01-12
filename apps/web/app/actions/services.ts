"use server"

// ============================================================================
// INFRASTRUCTURE LAYER - Framework/External Dependencies
// ============================================================================

import { revalidatePath } from "next/cache"
import type { ServiceRow, UpsertServiceInput } from "@/lib/types/service"
import type { ActionResult } from "@/lib/types/common"

// ============================================================================
// APPLICATION LAYER - Use Cases and Services
// ============================================================================

import { BaseAuthenticatedAction } from "@/lib/services/actions/base-authenticated-action.service"
import { ServiceRepository } from "@/lib/services/services/service.repository"
import { ServiceUseCase } from "@/lib/services/services/service-usecase.service"

// ============================================================================
// Server Actions
// ============================================================================

/**
 * Obtém todos os serviços de um salão
 */
export async function getServices(salonId: string): Promise<ActionResult<ServiceRow[]>> {
  try {
    BaseAuthenticatedAction.validateSalonId(salonId)

    const authResult = await BaseAuthenticatedAction.authenticateAndAuthorize(salonId)
    if ("error" in authResult) {
      return authResult
    }

    const rows = await ServiceRepository.findBySalonId(salonId)

    return { success: true, data: rows }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Falha ao buscar serviços."
    return { error: errorMessage }
  }
}

/**
 * Cria ou atualiza um serviço
 */
export async function upsertService(
  input: UpsertServiceInput & { salonId: string }
): Promise<ActionResult> {
  try {
    const authResult = await BaseAuthenticatedAction.authenticateAndAuthorize(
      input.salonId
    )
    if ("error" in authResult) {
      return { error: authResult.error }
    }

    const result = await ServiceUseCase.upsert(input)

    if (!("error" in result)) {
      revalidatePath("/dashboard/services")
    }

    return result
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Falha ao salvar serviço."
    return { error: errorMessage }
  }
}

/**
 * Remove um serviço definitivamente (hard delete)
 */
export async function deleteService(id: string, salonId: string): Promise<ActionResult> {
  try {
    const authResult = await BaseAuthenticatedAction.authenticateAndAuthorize(salonId)
    if ("error" in authResult) {
      return authResult
    }

    const result = await ServiceUseCase.delete(id, salonId)

    if (!("error" in result)) {
      revalidatePath("/dashboard/services")
    }

    return result
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Falha ao excluir serviço."
    return { error: errorMessage }
  }
}

/**
 * Obtém os IDs dos profissionais associados a um serviço
 */
export async function getServiceLinkedProfessionals(
  serviceId: string,
  salonId: string
): Promise<ActionResult<string[]>> {
  try {
    const authResult = await BaseAuthenticatedAction.authenticateAndAuthorize(salonId)
    if ("error" in authResult) {
      return authResult
    }

    const professionalIds = await ServiceRepository.findLinkedProfessionalIds(serviceId)

    return { success: true, data: professionalIds }
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Falha ao buscar profissionais vinculados."
    return { error: errorMessage }
  }
}

// Re-export types
export type { UpsertServiceInput }
