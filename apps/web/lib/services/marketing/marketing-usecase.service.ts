/**
 * Use Cases para Marketing (APPLICATION LAYER)
 */

import { MarketingRepository } from "./marketing.repository"
import { SegmentationService } from "./segmentation.service"
import { CampaignSenderService, type SendCampaignResult } from "./campaign-sender.service"

export interface RecoveryFlowData {
  id?: string
  name: string
  steps: Array<{
    id?: string
    days: number
    message: string
  }>
}

export interface CampaignData {
  name: string
  description?: string
  message: string
  segmentationCriteria: Record<string, unknown>
  includeAiCoupon: boolean
}

export interface RecoveryFlowWithSteps {
  id: string
  salonId: string
  name: string
  isActive: boolean
  steps: Array<{
    id: string
    stepOrder: number
    daysAfterInactivity: number
    messageTemplate: string
    isActive: boolean
  }>
}

export class MarketingUseCase {
  // ============================================================================
  // Recovery Flows
  // ============================================================================

  /**
   * Salva um fluxo de recuperação completo com seus steps
   */
  static async saveRecoveryFlow(salonId: string, flowData: RecoveryFlowData): Promise<{ success: boolean; flowId: string }> {
    let flowId: string

    if (flowData.id) {
      // Atualiza fluxo existente
      await MarketingRepository.updateRecoveryFlow(flowData.id, { name: flowData.name })
      flowId = flowData.id

      // Remove todos os steps existentes
      await MarketingRepository.deleteRecoveryStepsByFlowId(flowId)
    } else {
      // Cria novo fluxo
      const flow = await MarketingRepository.createRecoveryFlow(salonId, flowData.name)
      flowId = flow.id
    }

    // Cria/atualiza steps
    for (let i = 0; i < flowData.steps.length; i++) {
      const step = flowData.steps[i]
      await MarketingRepository.upsertRecoveryStep({
        recoveryFlowId: flowId,
        stepOrder: i + 1,
        daysAfterInactivity: step.days,
        messageTemplate: step.message,
      })
    }

    return { success: true, flowId }
  }

  /**
   * Retorna fluxo ativo do salão com seus steps
   */
  static async getRecoveryFlow(salonId: string): Promise<RecoveryFlowWithSteps | null> {
    const flow = await MarketingRepository.findRecoveryFlowBySalonId(salonId)
    if (!flow) {
      return null
    }

    const steps = await MarketingRepository.findRecoveryStepsByFlowId(flow.id)

    return {
      id: flow.id,
      salonId: flow.salonId,
      name: flow.name,
      isActive: flow.isActive,
      steps: steps.map((step) => ({
        id: step.id,
        stepOrder: step.stepOrder,
        daysAfterInactivity: step.daysAfterInactivity,
        messageTemplate: step.messageTemplate,
        isActive: step.isActive,
      })),
    }
  }

  /**
   * Deleta um step de recuperação
   */
  static async deleteRecoveryStep(stepId: string): Promise<void> {
    await MarketingRepository.deleteRecoveryStep(stepId)
  }

  // ============================================================================
  // Campaigns
  // ============================================================================

  /**
   * Cria uma nova campanha
   */
  static async createCampaign(salonId: string, campaignData: CampaignData): Promise<{ success: boolean; campaignId: string }> {
    const campaign = await MarketingRepository.createCampaign({
      salonId,
      name: campaignData.name,
      description: campaignData.description || null,
      messageTemplate: campaignData.message,
      segmentationCriteria: campaignData.segmentationCriteria,
      includeAiCoupon: campaignData.includeAiCoupon,
    })

    return { success: true, campaignId: campaign.id }
  }

  /**
   * Preview de segmentação sem criar campanha
   */
  static async previewSegmentation(
    criteria: Record<string, unknown>,
    salonId: string
  ): Promise<{ count: number }> {
    const count = await SegmentationService.getSegmentedLeadsCount(
      criteria as {
        distanceRadius?: string
        lastVisit?: string
        gender?: string
        serviceIds?: string[]
      },
      salonId
    )
    return { count }
  }

  /**
   * Executa envio de campanha
   */
  static async sendCampaign(campaignId: string, salonId: string): Promise<SendCampaignResult> {
    return await CampaignSenderService.sendBroadcastCampaign(campaignId, salonId)
  }
}
