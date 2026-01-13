/**
 * Serviço para envio de campanhas de broadcast
 */

import { sendWhatsAppMessage, normalizePhoneNumber, formatPhoneToE164 } from "@/lib/services/whatsapp.service"
import { MarketingRepository } from "./marketing.repository"
import { SegmentationService } from "./segmentation.service"
import { VariableReplacerService } from "./variable-replacer.service"
import { db, salons, profiles, appointments, services } from "@repo/db"
import { and, eq, desc } from "drizzle-orm"

export interface SendCampaignResult {
  success: boolean
  sent: number
  failed: number
  total: number
  errors?: string[]
}

export class CampaignSenderService {
  /**
   * Envia uma campanha de broadcast para todos os destinatários segmentados
   */
  static async sendBroadcastCampaign(
    campaignId: string,
    salonId: string
  ): Promise<SendCampaignResult> {
    // Busca a campanha
    const campaign = await MarketingRepository.findCampaignById(campaignId, salonId)
    if (!campaign) {
      throw new Error("Campanha não encontrada")
    }

    if (!campaign.messageTemplate) {
      throw new Error("Campanha não possui mensagem template")
    }

    if (!campaign.segmentationCriteria) {
      throw new Error("Campanha não possui critérios de segmentação")
    }

    // Busca nome do salão
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { name: true },
    })

    // Obtém lista de destinatários segmentados
    const leads = await SegmentationService.getSegmentedLeads(
      campaign.segmentationCriteria as {
        distanceRadius?: string
        lastVisit?: string
        gender?: string
        serviceIds?: string[]
      },
      salonId
    )

    const totalRecipients = leads.length
    let sentCount = 0
    let failedCount = 0
    const errors: string[] = []

    // Atualiza total de destinatários na campanha
    await MarketingRepository.updateCampaignCounters(campaignId, {
      totalRecipients,
      status: 'sending',
    })

    // Para cada destinatário, envia mensagem
    for (const lead of leads) {
      try {
        // Busca informações adicionais do lead para substituição de variáveis
        const variables: Record<string, string> = {
          nome_cliente: lead.name || "Cliente",
          ultimo_servico: lead.lastServiceName || "serviço",
        }

        // Formata última visita se existir
        if (lead.lastVisitDate) {
          const daysAgo = Math.floor(
            (Date.now() - lead.lastVisitDate.getTime()) / (1000 * 60 * 60 * 24)
          )
          variables.ultima_visita = `${daysAgo} dias atrás`
        } else {
          variables.ultima_visita = "nunca visitou"
        }

        // Substitui variáveis na mensagem
        let finalMessage = VariableReplacerService.replaceVariables(
          campaign.messageTemplate,
          variables
        )

        // Normaliza número de telefone
        const phoneNumber = formatPhoneToE164(lead.phone)
        if (!phoneNumber) {
          throw new Error(`Número de telefone inválido: ${lead.phone}`)
        }

        // Cria registro de mensagem (pending)
        const messageRecord = await MarketingRepository.createCampaignMessage({
          campaignId,
          customerId: lead.customerId || null,
          leadId: lead.leadId || null,
          profileId: lead.profileId || null,
          phoneNumber,
          messageSent: finalMessage,
          status: 'pending',
        })

        // Envia via WhatsApp
        try {
          await sendWhatsAppMessage(phoneNumber, finalMessage, salonId)

          // Atualiza status para sent
          await MarketingRepository.updateCampaignMessageStatus(messageRecord.id, 'sent')
          sentCount++
        } catch (error) {
          // Atualiza status para failed
          const errorMessage = error instanceof Error ? error.message : String(error)
          await MarketingRepository.updateCampaignMessageStatus(
            messageRecord.id,
            'failed',
            errorMessage
          )
          failedCount++
          errors.push(`${lead.name} (${lead.phone}): ${errorMessage}`)
        }

        // Pequeno delay para não sobrecarregar API do Twilio (rate limiting)
        await new Promise((resolve) => setTimeout(resolve, 100))
      } catch (error) {
        failedCount++
        const errorMessage = error instanceof Error ? error.message : String(error)
        errors.push(`${lead.name} (${lead.phone}): ${errorMessage}`)
      }
    }

    // Atualiza contadores finais da campanha
    await MarketingRepository.updateCampaignCounters(campaignId, {
      sentCount,
      status: failedCount === totalRecipients ? 'failed' : sentCount === totalRecipients ? 'completed' : 'partial',
    })

    return {
      success: failedCount === 0,
      sent: sentCount,
      failed: failedCount,
      total: totalRecipients,
      errors: errors.length > 0 ? errors : undefined,
    }
  }
}
