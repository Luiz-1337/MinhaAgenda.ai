/**
 * Repository para Marketing (INFRASTRUCTURE LAYER)
 */

import { db, recoveryFlows, recoverySteps, campaigns, campaignMessages, and, asc, eq, desc } from "@repo/db"

export interface RecoveryFlowRow {
  id: string
  salonId: string
  name: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface RecoveryStepRow {
  id: string
  recoveryFlowId: string
  stepOrder: number
  daysAfterInactivity: number
  messageTemplate: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CampaignRow {
  id: string
  salonId: string
  name: string
  description: string | null
  status: string | null
  messageTemplate: string | null
  segmentationCriteria: Record<string, unknown> | null
  includeAiCoupon: boolean
  sentCount: number
  totalRecipients: number
  startsAt: Date | null
  endsAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface CampaignMessageRow {
  id: string
  campaignId: string
  customerId: string | null
  profileId: string | null
  phoneNumber: string
  messageSent: string
  status: string
  sentAt: Date | null
  errorMessage: string | null
  createdAt: Date
}

export class MarketingRepository {
  // ============================================================================
  // Recovery Flows
  // ============================================================================

  /**
   * Busca fluxo de recuperação ativo de um salão
   */
  static async findRecoveryFlowBySalonId(salonId: string): Promise<RecoveryFlowRow | null> {
    const flow = await db.query.recoveryFlows.findFirst({
      where: and(eq(recoveryFlows.salonId, salonId), eq(recoveryFlows.isActive, true)),
      columns: {
        id: true,
        salonId: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return flow || null
  }

  /**
   * Cria um novo fluxo de recuperação
   */
  static async createRecoveryFlow(salonId: string, name: string): Promise<RecoveryFlowRow> {
    const [flow] = await db
      .insert(recoveryFlows)
      .values({
        salonId,
        name,
        isActive: true,
      })
      .returning()

    return flow
  }

  /**
   * Atualiza um fluxo de recuperação
   */
  static async updateRecoveryFlow(flowId: string, updates: { name?: string; isActive?: boolean }): Promise<RecoveryFlowRow> {
    const [flow] = await db
      .update(recoveryFlows)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(recoveryFlows.id, flowId))
      .returning()

    return flow
  }

  /**
   * Deleta um fluxo de recuperação (cascade delete dos steps)
   */
  static async deleteRecoveryFlow(flowId: string): Promise<void> {
    await db.delete(recoveryFlows).where(eq(recoveryFlows.id, flowId))
  }

  // ============================================================================
  // Recovery Steps
  // ============================================================================

  /**
   * Busca todos os steps de um fluxo
   */
  static async findRecoveryStepsByFlowId(flowId: string): Promise<RecoveryStepRow[]> {
    const steps = await db.query.recoverySteps.findMany({
      where: eq(recoverySteps.recoveryFlowId, flowId),
      columns: {
        id: true,
        recoveryFlowId: true,
        stepOrder: true,
        daysAfterInactivity: true,
        messageTemplate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: asc(recoverySteps.stepOrder),
    })

    return steps
  }

  /**
   * Cria ou atualiza um step de recuperação
   */
  static async upsertRecoveryStep(stepData: {
    id?: string
    recoveryFlowId: string
    stepOrder: number
    daysAfterInactivity: number
    messageTemplate: string
  }): Promise<RecoveryStepRow> {
    if (stepData.id) {
      // Update existing
      const [step] = await db
        .update(recoverySteps)
        .set({
          stepOrder: stepData.stepOrder,
          daysAfterInactivity: stepData.daysAfterInactivity,
          messageTemplate: stepData.messageTemplate,
          updatedAt: new Date(),
        })
        .where(eq(recoverySteps.id, stepData.id))
        .returning()

      return step
    } else {
      // Create new
      const [step] = await db
        .insert(recoverySteps)
        .values({
          recoveryFlowId: stepData.recoveryFlowId,
          stepOrder: stepData.stepOrder,
          daysAfterInactivity: stepData.daysAfterInactivity,
          messageTemplate: stepData.messageTemplate,
          isActive: true,
        })
        .returning()

      return step
    }
  }

  /**
   * Deleta um step de recuperação
   */
  static async deleteRecoveryStep(stepId: string): Promise<void> {
    await db.delete(recoverySteps).where(eq(recoverySteps.id, stepId))
  }

  /**
   * Deleta todos os steps de um fluxo (antes de recriar)
   */
  static async deleteRecoveryStepsByFlowId(flowId: string): Promise<void> {
    await db.delete(recoverySteps).where(eq(recoverySteps.recoveryFlowId, flowId))
  }

  // ============================================================================
  // Campaigns
  // ============================================================================

  /**
   * Cria uma nova campanha
   */
  static async createCampaign(campaignData: {
    salonId: string
    name: string
    description?: string | null
    messageTemplate: string
    segmentationCriteria: Record<string, unknown>
    includeAiCoupon: boolean
  }): Promise<CampaignRow> {
    const [campaign] = await db
      .insert(campaigns)
      .values({
        salonId: campaignData.salonId,
        name: campaignData.name,
        description: campaignData.description || null,
        messageTemplate: campaignData.messageTemplate,
        segmentationCriteria: campaignData.segmentationCriteria,
        includeAiCoupon: campaignData.includeAiCoupon,
        status: 'draft',
        sentCount: 0,
        totalRecipients: 0,
      })
      .returning()

    return {
      ...campaign,
      segmentationCriteria: (campaign.segmentationCriteria as Record<string, unknown>) || null,
    }
  }

  /**
   * Busca todas as campanhas de um salão
   */
  static async findCampaignsBySalonId(salonId: string): Promise<CampaignRow[]> {
    const campaignList = await db.query.campaigns.findMany({
      where: eq(campaigns.salonId, salonId),
      orderBy: desc(campaigns.createdAt),
    })

    return campaignList.map((campaign) => ({
      ...campaign,
      segmentationCriteria: (campaign.segmentationCriteria as Record<string, unknown>) || null,
    }))
  }

  /**
   * Busca uma campanha por ID
   */
  static async findCampaignById(campaignId: string, salonId: string): Promise<CampaignRow | null> {
    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, campaignId), eq(campaigns.salonId, salonId)),
    })

    if (!campaign) {
      return null
    }

    return {
      ...campaign,
      segmentationCriteria: (campaign.segmentationCriteria as Record<string, unknown>) || null,
    }
  }

  /**
   * Atualiza contadores de uma campanha
   */
  static async updateCampaignCounters(campaignId: string, updates: { sentCount?: number; totalRecipients?: number; status?: string }): Promise<void> {
    await db
      .update(campaigns)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId))
  }

  // ============================================================================
  // Campaign Messages
  // ============================================================================

  /**
   * Cria um registro de mensagem de campanha
   */
  static async createCampaignMessage(messageData: {
    campaignId: string
    customerId?: string | null
    profileId?: string | null
    phoneNumber: string
    messageSent: string
    status: string
  }): Promise<CampaignMessageRow> {
    const [message] = await db
      .insert(campaignMessages)
      .values({
        campaignId: messageData.campaignId,
        customerId: messageData.customerId || null,
        profileId: messageData.profileId || null,
        phoneNumber: messageData.phoneNumber,
        messageSent: messageData.messageSent,
        status: messageData.status,
      })
      .returning()

    return message
  }

  /**
   * Atualiza status de uma mensagem de campanha
   */
  static async updateCampaignMessageStatus(
    messageId: string,
    status: string,
    errorMessage?: string | null
  ): Promise<void> {
    await db
      .update(campaignMessages)
      .set({
        status,
        sentAt: status === 'sent' || status === 'delivered' ? new Date() : null,
        errorMessage: errorMessage || null,
      })
      .where(eq(campaignMessages.id, messageId))
  }
}
