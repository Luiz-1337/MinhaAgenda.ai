"use server"

// ============================================================================
// INFRASTRUCTURE LAYER - Framework/External Dependencies
// ============================================================================

import { revalidatePath } from "next/cache"
import type { ActionResult } from "@/lib/types/common"

// ============================================================================
// APPLICATION LAYER - Use Cases and Services
// ============================================================================

import { BaseAuthenticatedAction } from "@/lib/services/actions/base-authenticated-action.service"
import { MarketingUseCase, type RecoveryFlowData, type CampaignData } from "@/lib/services/marketing/marketing-usecase.service"
import { MarketingRepository } from "@/lib/services/marketing/marketing.repository"

// ============================================================================
// Server Actions
// ============================================================================

/**
 * Obtém o fluxo de recuperação ativo de um salão
 */
export async function getRecoveryFlow(salonId: string): Promise<ActionResult<any>> {
  try {
    BaseAuthenticatedAction.validateSalonId(salonId)

    const authResult = await BaseAuthenticatedAction.authenticateAndAuthorize(salonId)
    if ("error" in authResult) {
      return authResult
    }

    const flow = await MarketingUseCase.getRecoveryFlow(salonId)

    return { success: true, data: flow }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha ao buscar fluxo de recuperação."
    return { error: errorMessage }
  }
}

/**
 * Salva um fluxo de recuperação completo
 */
export async function saveRecoveryFlow(
  input: { salonId: string } & RecoveryFlowData
): Promise<ActionResult<{ flowId: string }>> {
  try {
    const authResult = await BaseAuthenticatedAction.authenticateAndAuthorize(input.salonId)
    if ("error" in authResult) {
      return authResult
    }

    const result = await MarketingUseCase.saveRecoveryFlow(input.salonId, {
      id: input.id,
      name: input.name,
      steps: input.steps,
    })

    if (!("error" in result)) {
      revalidatePath(`/${input.salonId}/marketing`)
    }

    return { success: true, data: { flowId: result.flowId } }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha ao salvar fluxo de recuperação."
    return { error: errorMessage }
  }
}

/**
 * Remove um step de recuperação
 */
export async function deleteRecoveryStep(stepId: string, salonId: string): Promise<ActionResult> {
  try {
    const authResult = await BaseAuthenticatedAction.authenticateAndAuthorize(salonId)
    if ("error" in authResult) {
      return authResult
    }

    await MarketingUseCase.deleteRecoveryStep(stepId)

    revalidatePath(`/${salonId}/marketing`)

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha ao excluir etapa."
    return { error: errorMessage }
  }
}

/**
 * Preview de leads segmentados (sem criar campanha)
 */
export async function previewSegmentedLeads(
  criteria: Record<string, unknown>,
  salonId: string
): Promise<ActionResult<{ count: number }>> {
  try {
    const authResult = await BaseAuthenticatedAction.authenticateAndAuthorize(salonId)
    if ("error" in authResult) {
      return authResult
    }

    const result = await MarketingUseCase.previewSegmentation(criteria, salonId)

    return { success: true, data: result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha ao buscar leads."
    return { error: errorMessage }
  }
}

/**
 * Lista todas as campanhas de um salão
 */
export async function getCampaigns(salonId: string): Promise<ActionResult<any[]>> {
  try {
    BaseAuthenticatedAction.validateSalonId(salonId)

    const authResult = await BaseAuthenticatedAction.authenticateAndAuthorize(salonId)
    if ("error" in authResult) {
      return authResult
    }

    const campaigns = await MarketingRepository.findCampaignsBySalonId(salonId)

    return { success: true, data: campaigns }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha ao buscar campanhas."
    return { error: errorMessage }
  }
}

/**
 * Obtém detalhes de uma campanha
 */
export async function getCampaignById(campaignId: string, salonId: string): Promise<ActionResult<any>> {
  try {
    const authResult = await BaseAuthenticatedAction.authenticateAndAuthorize(salonId)
    if ("error" in authResult) {
      return authResult
    }

    const campaign = await MarketingRepository.findCampaignById(campaignId, salonId)

    if (!campaign) {
      return { error: "Campanha não encontrada" }
    }

    return { success: true, data: campaign }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha ao buscar campanha."
    return { error: errorMessage }
  }
}

/**
 * Cria uma nova campanha de broadcast
 */
export async function createBroadcastCampaign(
  input: { salonId: string } & CampaignData
): Promise<ActionResult<{ campaignId: string }>> {
  try {
    const authResult = await BaseAuthenticatedAction.authenticateAndAuthorize(input.salonId)
    if ("error" in authResult) {
      return authResult
    }

    const result = await MarketingUseCase.createCampaign(input.salonId, {
      name: input.name,
      description: input.description,
      message: input.message,
      segmentationCriteria: input.segmentationCriteria,
      includeAiCoupon: input.includeAiCoupon,
    })

    if (!("error" in result)) {
      revalidatePath(`/${input.salonId}/marketing`)
    }

    return { success: true, data: { campaignId: result.campaignId } }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha ao criar campanha."
    return { error: errorMessage }
  }
}

/**
 * Dispara uma campanha de broadcast
 */
export async function sendBroadcastCampaign(
  campaignId: string,
  salonId: string
): Promise<ActionResult<any>> {
  try {
    const authResult = await BaseAuthenticatedAction.authenticateAndAuthorize(salonId)
    if ("error" in authResult) {
      return authResult
    }

    const result = await MarketingUseCase.sendCampaign(campaignId, salonId)

    revalidatePath(`/${salonId}/marketing`)

    return { success: true, data: result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha ao disparar campanha."
    return { error: errorMessage }
  }
}

/**
 * Obtém estatísticas de uma campanha
 */
export async function getCampaignStats(campaignId: string, salonId: string): Promise<ActionResult<any>> {
  try {
    const authResult = await BaseAuthenticatedAction.authenticateAndAuthorize(salonId)
    if ("error" in authResult) {
      return authResult
    }

    const campaign = await MarketingRepository.findCampaignById(campaignId, salonId)

    if (!campaign) {
      return { error: "Campanha não encontrada" }
    }

    return {
      success: true,
      data: {
        sentCount: campaign.sentCount,
        totalRecipients: campaign.totalRecipients,
        status: campaign.status,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha ao buscar estatísticas."
    return { error: errorMessage }
  }
}
