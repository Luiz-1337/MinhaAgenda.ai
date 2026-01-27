/**
 * Serviço para operações relacionadas ao WhatsApp via Twilio
 * 
 * Features:
 * - Circuit Breaker para proteção contra falhas
 * - Retry automático
 * - Logging estruturado
 */

import twilio from "twilio"
import type { TwilioConfig } from "@/lib/types/chat"
import { db, agents } from "@repo/db"
import { and, eq } from "drizzle-orm"
import { twilioCircuitBreaker, CircuitOpenError } from "@/lib/circuit-breaker"
import { logger, hashPhone } from "@/lib/logger"

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
 * Erro específico de WhatsApp
 */
export class WhatsAppSendError extends Error {
  readonly name = "WhatsAppSendError";
  readonly retryable: boolean;
  readonly twilioErrorCode?: number;

  constructor(message: string, retryable = true, twilioErrorCode?: number) {
    super(message);
    this.retryable = retryable;
    this.twilioErrorCode = twilioErrorCode;
  }
}

/**
 * Envia uma mensagem via WhatsApp usando Twilio
 * 
 * PROTEGIDO POR CIRCUIT BREAKER:
 * - Se Twilio estiver fora do ar, rejeita rapidamente
 * - Timeout de 10s por chamada
 * - Abre circuito após 50% de falhas em 5+ requests
 * 
 * @param to Número de telefone no formato whatsapp:+E.164 (ex: whatsapp:+5511999999999)
 * @param body Conteúdo da mensagem
 * @param salonId ID do salão (opcional) - se fornecido, usa o número do agente ativo
 * @param config Configuração opcional do Twilio
 */
export async function sendWhatsAppMessage(
  to: string,
  body: string,
  salonId?: string,
  config?: TwilioConfig
): Promise<{ sid: string }> {
  const client = getTwilioClient()

  // Prioridade: número do agente ativo > config?.phoneNumber > process.env.TWILIO_PHONE_NUMBER
  let phoneNumber: string | null = null

  if (salonId) {
    phoneNumber = await getActiveAgentWhatsAppNumber(salonId)
  }

  if (!phoneNumber) {
    phoneNumber = config?.phoneNumber || null
  }

  if (!phoneNumber) {
    throw new WhatsAppSendError("TWILIO_PHONE_NUMBER não configurado", false)
  }

  // Garante que os números estão no formato correto (whatsapp:+E.164)
  const fromNumber = phoneNumber.startsWith("whatsapp:") ? phoneNumber : `whatsapp:${phoneNumber}`
  const toNumber = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`

  const startTime = Date.now()

  try {
    // Executa com circuit breaker
    const message = await twilioCircuitBreaker.fire(async () => {
      return client.messages.create({
        body,
        from: fromNumber,
        to: toNumber,
      })
    })

    const duration = Date.now() - startTime

    logger.info(
      {
        sid: message.sid,
        to: hashPhone(toNumber),
        salonId,
        bodyLength: body.length,
        duration,
      },
      "WhatsApp message sent successfully"
    )

    return { sid: message.sid }
  } catch (error) {
    const duration = Date.now() - startTime

    // Se circuit breaker está aberto
    if (error instanceof CircuitOpenError) {
      logger.error(
        {
          to: hashPhone(toNumber),
          salonId,
          circuitState: "OPEN",
          resetIn: error.resetIn,
          duration,
        },
        "WhatsApp send blocked by circuit breaker"
      )
      throw new WhatsAppSendError(
        "Serviço WhatsApp temporariamente indisponível",
        true
      )
    }

    // Erros do Twilio
    const twilioError = error as { code?: number; message?: string }
    const isRetryable = !isNonRetryableTwilioError(twilioError.code)

    logger.error(
      {
        err: error,
        to: hashPhone(toNumber),
        salonId,
        twilioCode: twilioError.code,
        retryable: isRetryable,
        duration,
      },
      "Failed to send WhatsApp message"
    )

    throw new WhatsAppSendError(
      twilioError.message || "Erro ao enviar mensagem WhatsApp",
      isRetryable,
      twilioError.code
    )
  }
}

/**
 * Verifica se é um erro do Twilio que não deve ser retentado
 */
function isNonRetryableTwilioError(code?: number): boolean {
  if (!code) return false

  // Códigos de erro que não devem ser retentados
  const nonRetryableCodes = [
    21211, // Invalid 'To' Phone Number
    21214, // 'To' phone number not verified
    21408, // Permission denied
    21610, // Message blocked
    21614, // Invalid 'To' phone number format
    63016, // User has not opted-in to receive messages
  ]

  return nonRetryableCodes.includes(code)
}

/**
 * Normaliza número de telefone removendo prefixo whatsapp:
 */
export function normalizePhoneNumber(phone: string): string {
  return phone.replace("whatsapp:", "").trim()
}

/**
 * Formata número de telefone brasileiro para padrão E.164 (+55 DDD número)
 * @param phone Número de telefone a ser formatado
 * @returns Número formatado no padrão E.164 (ex: +5511986049295) ou null se inválido
 */
export function formatPhoneToE164(phone: string | null | undefined): string | null {
  if (!phone) return null

  // Remove espaços, traços, parênteses e prefixo whatsapp:
  let cleaned = phone
    .trim()
    .replace(/^whatsapp:/i, "")
    .replace(/\s/g, "")
    .replace(/-/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "")

  // Remove todos os caracteres não numéricos exceto + no início
  const hasPlus = cleaned.startsWith("+")
  const digits = cleaned.replace(/\D/g, "")

  if (!digits) return null

  // Se já tem código do país (+55), retorna como está (assumindo que está correto)
  if (hasPlus) {
    // Valida se tem pelo menos +55 + DDD (2) + número (8-9 dígitos)
    if (digits.length >= 12 && digits.startsWith("55")) {
      return `+${digits}`
    }
    // Se começa com + mas não é +55, pode ser outro país, retorna como está
    return cleaned.startsWith("+") ? cleaned : `+${digits}`
  }

  // Se não tem +, adiciona +55 (código do Brasil)
  // Remove zeros iniciais se houver (ex: 011 -> 11)
  let normalizedDigits = digits.replace(/^0+/, "")

  // Valida formato brasileiro: deve ter 10 ou 11 dígitos (DDD + número)
  // DDD tem 2 dígitos, número tem 8 ou 9 dígitos
  if (normalizedDigits.length >= 10 && normalizedDigits.length <= 11) {
    return `+55${normalizedDigits}`
  }

  // Se não corresponde ao padrão brasileiro, retorna null
  return null
}

/**
 * Busca o número do WhatsApp do agente ativo do salão
 * @param salonId ID do salão
 * @returns Número formatado no padrão E.164 ou null se não encontrar agente ativo ou número não configurado
 */
export async function getActiveAgentWhatsAppNumber(salonId: string): Promise<string | null> {
  try {
    const activeAgent = await db.query.agents.findFirst({
      where: and(eq(agents.salonId, salonId), eq(agents.isActive, true)),
      columns: { whatsappNumber: true },
    })

    if (!activeAgent || !activeAgent.whatsappNumber) {
      return null
    }

    return formatPhoneToE164(activeAgent.whatsappNumber)
  } catch (error) {
    console.error("❌ Erro ao buscar número do WhatsApp do agente ativo:", error)
    return null
  }
}

