/**
 * Serviço para operações relacionadas ao WhatsApp via Twilio
 */

import twilio from "twilio"
import type { TwilioConfig } from "@/lib/types/chat"

let twilioClient: twilio.Twilio | null = null

/**
 * Inicializa o cliente Twilio
 */
function getTwilioClient(): twilio.Twilio {
  if (twilioClient) {
    return twilioClient
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN são obrigatórios")
  }

  twilioClient = twilio(accountSid, authToken)
  return twilioClient
}

/**
 * Envia uma mensagem via WhatsApp usando Twilio
 */
export async function sendWhatsAppMessage(
  to: string,
  body: string,
  config?: TwilioConfig
): Promise<void> {
  const client = getTwilioClient()
  const phoneNumber = config?.phoneNumber || process.env.TWILIO_PHONE_NUMBER

  if (!phoneNumber) {
    throw new Error("TWILIO_PHONE_NUMBER não configurado")
  }

  await client.messages.create({
    body,
    from: phoneNumber,
    to,
  })
}

/**
 * Normaliza número de telefone removendo prefixo whatsapp:
 */
export function normalizePhoneNumber(phone: string): string {
  return phone.replace("whatsapp:", "").trim()
}

