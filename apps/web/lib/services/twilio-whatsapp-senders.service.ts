/**
 * Serviço para registrar, remover e verificar WhatsApp Senders via Twilio Senders API
 * @see https://www.twilio.com/docs/whatsapp/api/senders
 */

import twilio from "twilio"
import { logger, hashPhone } from "../logger"

let twilioClient: twilio.Twilio | null = null

function getTwilioClient(): twilio.Twilio {
  if (twilioClient) return twilioClient
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN são obrigatórios")
  }
  twilioClient = twilio(accountSid, authToken)
  return twilioClient
}

/** Mensagens de erro por código Twilio (Senders/WhatsApp) */
const TWILIO_ERROR_MESSAGES: Record<number, string> = {
  63110: "Este número já está registrado no WhatsApp.",
  63111: "Número ou conta WhatsApp Business não encontrado. Verifique o número e a configuração da conta Twilio.",
  63113: "Não foi possível verificar o número. Verifique se o número está correto e pode receber SMS.",
  63114: "Muitas tentativas de verificação. Aguarde alguns minutos antes de tentar novamente.",
  63116: "Código de verificação não recebido. Verifique a cobertura e se o número recebe SMS.",
  63100: "Dados inválidos. Verifique o formato do número (ex: +5511999999999).",
  63104: "Limite de números atingido na sua conta WhatsApp Business.",
}

const FALLBACK_MESSAGE =
  "Este número não é elegível para WhatsApp Business. Verifique se é um número válido e se a conta Twilio está configurada."

function mapTwilioError(err: { code?: number; message?: string }): string {
  if (err?.code && TWILIO_ERROR_MESSAGES[err.code]) {
    return TWILIO_ERROR_MESSAGES[err.code]
  }
  if (typeof err?.message === "string" && err.message.length > 0) {
    return err.message
  }
  return FALLBACK_MESSAGE
}

/**
 * Registra um número como WhatsApp Sender na Twilio (inicia verificação por SMS)
 * @param phoneNumber E.164 (ex: +5511999999999)
 * @param profileName Nome do perfil (ex: nome do agente/salão) – obrigatório para WhatsApp
 * @param statusCallbackUrl URL para callbacks de status (opcional)
 */
export async function registerSender(
  phoneNumber: string,
  profileName: string,
  statusCallbackUrl?: string
): Promise<{ sid: string; status: string }> {
  const client = getTwilioClient()
  // API exige <channel>:<id> (ex: whatsapp:+5511999999999) e parâmetro sender_id (snake_case)
  const raw = phoneNumber.replace(/^whatsapp:/i, "").trim()
  const senderId = raw.startsWith("+") ? `whatsapp:${raw}` : `whatsapp:+${raw.replace(/\D/g, "")}`

  const opts: Record<string, unknown> = {
    sender_id: senderId,
    configuration: { verification_method: "sms" },
    profile: { name: profileName },
  }
  if (statusCallbackUrl) {
    opts.webhook = { status_callback_url: statusCallbackUrl, status_callback_method: "POST" }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Twilio REST espera snake_case (sender_id, verification_method, etc.)
    const sender = await client.messaging.v2.channelsSenders.create(opts as any)
    logger.info(
      { sid: sender.sid, phone: hashPhone(senderId), status: sender.status },
      "Twilio Sender created"
    )
    return { sid: sender.sid, status: sender.status || "CREATING" }
  } catch (err) {
    const twilioErr = err as { code?: number; message?: string }
    logger.error({ err, phone: hashPhone(senderId), code: twilioErr?.code }, "Twilio registerSender failed")
    throw new Error(mapTwilioError(twilioErr))
  }
}

/**
 * Remove um Sender da Twilio
 */
export async function removeSender(twilioSenderId: string): Promise<void> {
  const client = getTwilioClient()
  try {
    await client.messaging.v2.channelsSenders(twilioSenderId).remove()
    logger.info({ twilioSenderId: twilioSenderId.slice(0, 10) + "..." }, "Twilio Sender removed")
  } catch (err) {
    const twilioErr = err as { code?: number; status?: number }
    // 20404 = Resource not found → já foi removido, ignorar
    if (twilioErr?.code === 20404 || twilioErr?.status === 404) {
      logger.warn({ twilioSenderId: twilioSenderId.slice(0, 10) + "..." }, "Twilio Sender already removed")
      return
    }
    logger.error({ err, twilioSenderId: twilioSenderId.slice(0, 10) + "..." }, "Twilio removeSender failed")
    throw new Error(mapTwilioError(twilioErr))
  }
}

/**
 * Obtém o status de um Sender na Twilio
 */
export async function getSenderStatus(twilioSenderId: string): Promise<string> {
  const client = getTwilioClient()
  try {
    const sender = await client.messaging.v2.channelsSenders(twilioSenderId).fetch()
    return sender.status || "UNKNOWN"
  } catch (err) {
    const twilioErr = err as { code?: number; status?: number }
    if (twilioErr?.code === 20404 || twilioErr?.status === 404) {
      return "NOT_FOUND"
    }
    logger.error({ err, twilioSenderId: twilioSenderId.slice(0, 10) + "..." }, "Twilio getSenderStatus failed")
    throw new Error(mapTwilioError(twilioErr))
  }
}

/**
 * Envia o código de verificação recebido por SMS para completar a verificação do Sender
 */
export async function verifySender(twilioSenderId: string, verificationCode: string): Promise<string> {
  const client = getTwilioClient()
  try {
    const sender = await client.messaging.v2
      .channelsSenders(twilioSenderId)
      .update({ configuration: { verificationCode } })
    logger.info(
      { twilioSenderId: twilioSenderId.slice(0, 10) + "...", status: sender.status },
      "Twilio Sender verification code submitted"
    )
    return sender.status || "VERIFYING"
  } catch (err) {
    const twilioErr = err as { code?: number; message?: string }
    logger.error(
      { err, twilioSenderId: twilioSenderId.slice(0, 10) + "...", code: twilioErr?.code },
      "Twilio verifySender failed"
    )
    throw new Error(mapTwilioError(twilioErr))
  }
}
