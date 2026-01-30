/**
 * Serviço para gerenciar Twilio Messaging Services
 * Messaging Services organizam senders em pools configuráveis
 * @see https://www.twilio.com/docs/messaging/services
 */

import twilio from "twilio"
import { db, salons } from "@repo/db"
import { eq } from "drizzle-orm"
import { logger } from "../logger"
import { getSubaccountClient, getSubaccountCredentials } from "./twilio-subaccount.service"

/** Mensagens de erro por código Twilio */
const TWILIO_ERROR_MESSAGES: Record<number, string> = {
  20003: "Autenticação falhou. Verifique as credenciais.",
  20404: "Messaging Service não encontrado.",
  20429: "Muitas requisições. Aguarde alguns minutos.",
  21710: "Sender já está associado a outro Messaging Service.",
}

const FALLBACK_MESSAGE = "Erro ao gerenciar Messaging Service. Tente novamente."

function mapTwilioError(err: { code?: number; message?: string }): string {
  if (err?.code && TWILIO_ERROR_MESSAGES[err.code]) {
    return TWILIO_ERROR_MESSAGES[err.code]
  }
  if (typeof err?.message === "string" && err.message.length > 0) {
    return err.message
  }
  return FALLBACK_MESSAGE
}

export interface CreateMessagingServiceOptions {
  friendlyName: string
  inboundRequestUrl?: string
  statusCallbackUrl?: string
  usecase?: "notifications" | "marketing" | "verification" | "discussion" | "poll" | "undeclared"
}

/**
 * Cria um Messaging Service usando um cliente Twilio específico
 */
export async function createMessagingServiceWithClient(
  client: twilio.Twilio,
  options: CreateMessagingServiceOptions
): Promise<string> {
  const { friendlyName, inboundRequestUrl, statusCallbackUrl, usecase = "notifications" } = options

  try {
    const service = await client.messaging.v1.services.create({
      friendlyName: friendlyName.substring(0, 64),
      inboundRequestUrl,
      statusCallback: statusCallbackUrl,
      usecase,
      validityPeriod: 3600, // 1 hora de validade para mensagens pendentes
    })

    logger.info(
      { serviceSid: service.sid, friendlyName: friendlyName.substring(0, 20) },
      "Twilio Messaging Service created"
    )

    return service.sid
  } catch (err) {
    const twilioErr = err as { code?: number; message?: string }
    logger.error(
      { err, code: twilioErr?.code, friendlyName: friendlyName.substring(0, 20) },
      "Failed to create Twilio Messaging Service"
    )
    throw new Error(mapTwilioError(twilioErr))
  }
}

/**
 * Adiciona um WhatsApp Sender a um Messaging Service
 */
export async function addSenderToServiceWithClient(
  client: twilio.Twilio,
  serviceSid: string,
  senderSid: string
): Promise<void> {
  try {
    await client.messaging.v1.services(serviceSid).channelSenders.create({
      sid: senderSid,
    })

    logger.info(
      { serviceSid, senderSid: senderSid.slice(0, 10) + "..." },
      "Sender added to Messaging Service"
    )
  } catch (err) {
    const twilioErr = err as { code?: number; message?: string }
    // 21710 = Sender já associado - ignorar
    if (twilioErr?.code === 21710) {
      logger.warn(
        { serviceSid, senderSid: senderSid.slice(0, 10) + "..." },
        "Sender already associated to Messaging Service"
      )
      return
    }
    logger.error(
      { err, code: twilioErr?.code, serviceSid },
      "Failed to add sender to Messaging Service"
    )
    throw new Error(mapTwilioError(twilioErr))
  }
}

/**
 * Remove um Sender de um Messaging Service
 */
export async function removeSenderFromServiceWithClient(
  client: twilio.Twilio,
  serviceSid: string,
  senderSid: string
): Promise<void> {
  try {
    await client.messaging.v1.services(serviceSid).channelSenders(senderSid).remove()

    logger.info(
      { serviceSid, senderSid: senderSid.slice(0, 10) + "..." },
      "Sender removed from Messaging Service"
    )
  } catch (err) {
    const twilioErr = err as { code?: number; status?: number }
    // 20404 = Não encontrado - ignorar
    if (twilioErr?.code === 20404 || twilioErr?.status === 404) {
      logger.warn(
        { serviceSid, senderSid: senderSid.slice(0, 10) + "..." },
        "Sender not found in Messaging Service"
      )
      return
    }
    logger.error(
      { err, code: twilioErr?.code, serviceSid },
      "Failed to remove sender from Messaging Service"
    )
    throw new Error(mapTwilioError(twilioErr))
  }
}

/**
 * Obtém ou cria um Messaging Service para um salão
 * Se o salão já tem um Messaging Service, retorna o SID existente
 * Caso contrário, cria um novo e salva no banco
 */
export async function getOrCreateMessagingService(salonId: string): Promise<string> {
  // Busca o salão
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: {
      id: true,
      name: true,
      twilioMessagingServiceSid: true,
    },
  })

  if (!salon) {
    throw new Error("Salão não encontrado")
  }

  // Se já tem Messaging Service, retorna
  if (salon.twilioMessagingServiceSid) {
    return salon.twilioMessagingServiceSid
  }

  // Obtém o cliente da subaccount
  const subClient = await getSubaccountClient(salonId)
  if (!subClient) {
    throw new Error("Subaccount Twilio não encontrada. Configure o WhatsApp primeiro.")
  }

  // Monta URLs de webhook
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  const webhookBase = baseUrl ? String(baseUrl).replace(/\/$/, "") : undefined

  // Cria o Messaging Service
  const serviceSid = await createMessagingServiceWithClient(subClient, {
    friendlyName: `${salon.name} - WhatsApp`,
    inboundRequestUrl: webhookBase ? `${webhookBase}/api/webhook/whatsapp` : undefined,
    statusCallbackUrl: webhookBase ? `${webhookBase}/api/webhooks/twilio/whatsapp-status` : undefined,
  })

  // Salva no banco
  await db
    .update(salons)
    .set({
      twilioMessagingServiceSid: serviceSid,
      updatedAt: new Date(),
    })
    .where(eq(salons.id, salonId))

  logger.info({ salonId, serviceSid }, "Messaging Service created and saved for salon")

  return serviceSid
}

/**
 * Obtém informações do Messaging Service de um salão
 */
export async function getMessagingServiceInfo(salonId: string): Promise<{
  sid: string
  friendlyName: string
  usecase: string
  dateCreated: Date
} | null> {
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: {
      twilioMessagingServiceSid: true,
    },
  })

  if (!salon?.twilioMessagingServiceSid) {
    return null
  }

  const subClient = await getSubaccountClient(salonId)
  if (!subClient) {
    return null
  }

  try {
    const service = await subClient.messaging.v1.services(salon.twilioMessagingServiceSid).fetch()
    
    return {
      sid: service.sid,
      friendlyName: service.friendlyName,
      usecase: service.usecase,
      dateCreated: service.dateCreated,
    }
  } catch (err) {
    const twilioErr = err as { code?: number; status?: number }
    if (twilioErr?.code === 20404 || twilioErr?.status === 404) {
      return null
    }
    throw err
  }
}

/**
 * Lista todos os senders associados a um Messaging Service
 */
export async function listServiceSenders(salonId: string): Promise<
  Array<{
    sid: string
    sender: string
  }>
> {
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: {
      twilioMessagingServiceSid: true,
    },
  })

  if (!salon?.twilioMessagingServiceSid) {
    return []
  }

  const subClient = await getSubaccountClient(salonId)
  if (!subClient) {
    return []
  }

  try {
    const senders = await subClient.messaging.v1
      .services(salon.twilioMessagingServiceSid)
      .channelSenders.list()

    return senders.map((s) => ({
      sid: s.sid,
      sender: s.sender ?? "",
    }))
  } catch (err) {
    logger.error({ err, salonId }, "Failed to list service senders")
    return []
  }
}

/**
 * Atualiza as configurações de um Messaging Service
 */
export async function updateMessagingServiceWithClient(
  client: twilio.Twilio,
  serviceSid: string,
  options: Partial<CreateMessagingServiceOptions>
): Promise<void> {
  try {
    await client.messaging.v1.services(serviceSid).update({
      friendlyName: options.friendlyName?.substring(0, 64),
      inboundRequestUrl: options.inboundRequestUrl,
      statusCallback: options.statusCallbackUrl,
      usecase: options.usecase,
    })

    logger.info({ serviceSid }, "Twilio Messaging Service updated")
  } catch (err) {
    const twilioErr = err as { code?: number; message?: string }
    logger.error({ err, code: twilioErr?.code, serviceSid }, "Failed to update Messaging Service")
    throw new Error(mapTwilioError(twilioErr))
  }
}

/**
 * Remove um Messaging Service
 */
export async function deleteMessagingServiceWithClient(
  client: twilio.Twilio,
  serviceSid: string
): Promise<void> {
  try {
    await client.messaging.v1.services(serviceSid).remove()
    logger.info({ serviceSid }, "Twilio Messaging Service deleted")
  } catch (err) {
    const twilioErr = err as { code?: number; status?: number }
    if (twilioErr?.code === 20404 || twilioErr?.status === 404) {
      logger.warn({ serviceSid }, "Messaging Service already deleted")
      return
    }
    logger.error({ err, code: twilioErr?.code, serviceSid }, "Failed to delete Messaging Service")
    throw new Error(mapTwilioError(twilioErr))
  }
}
