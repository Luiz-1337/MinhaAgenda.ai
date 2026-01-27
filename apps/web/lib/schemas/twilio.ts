/**
 * Schemas de validação Zod para webhooks do Twilio/WhatsApp
 * 
 * Valida:
 * - Formato dos números de telefone
 * - Campos obrigatórios
 * - Tipos de mídia
 */

import { z } from "zod/v4";

/**
 * Regex para validar número WhatsApp no formato whatsapp:+E.164
 * Exemplos válidos:
 * - whatsapp:+5511999998888
 * - whatsapp:+14155551234
 */
const whatsappNumberRegex = /^whatsapp:\+\d{10,15}$/;

/**
 * Regex para validar MessageSid do Twilio
 * Formato: SM ou MM seguido de 32 caracteres hexadecimais
 */
const messageSidRegex = /^(SM|MM)[0-9a-fA-F]{32}$/;

/**
 * Schema principal para webhook do Twilio/WhatsApp
 */
export const TwilioWebhookSchema = z.object({
  // Campos obrigatórios
  From: z
    .string()
    .regex(whatsappNumberRegex, "Invalid WhatsApp number format (From)"),
  To: z
    .string()
    .regex(whatsappNumberRegex, "Invalid WhatsApp number format (To)"),
  MessageSid: z
    .string()
    .regex(messageSidRegex, "Invalid MessageSid format"),

  // Corpo da mensagem (opcional se houver mídia)
  Body: z
    .string()
    .max(4096, "Message body too long (max 4096 chars)")
    .optional()
    .default(""),

  // Informações de mídia
  NumMedia: z.coerce
    .number()
    .int()
    .min(0)
    .max(10, "Too many media items (max 10)")
    .default(0),

  // Tipo de mídia (para cada item de mídia, até 10)
  MediaContentType0: z.string().optional(),
  MediaContentType1: z.string().optional(),
  MediaContentType2: z.string().optional(),
  MediaContentType3: z.string().optional(),
  MediaContentType4: z.string().optional(),
  MediaContentType5: z.string().optional(),
  MediaContentType6: z.string().optional(),
  MediaContentType7: z.string().optional(),
  MediaContentType8: z.string().optional(),
  MediaContentType9: z.string().optional(),

  // URL de mídia (para cada item de mídia, até 10)
  MediaUrl0: z.string().url().optional(),
  MediaUrl1: z.string().url().optional(),
  MediaUrl2: z.string().url().optional(),
  MediaUrl3: z.string().url().optional(),
  MediaUrl4: z.string().url().optional(),
  MediaUrl5: z.string().url().optional(),
  MediaUrl6: z.string().url().optional(),
  MediaUrl7: z.string().url().optional(),
  MediaUrl8: z.string().url().optional(),
  MediaUrl9: z.string().url().optional(),

  // Campos adicionais do Twilio (opcionais)
  AccountSid: z.string().optional(),
  SmsMessageSid: z.string().optional(),
  SmsSid: z.string().optional(),
  SmsStatus: z.string().optional(),
  ApiVersion: z.string().optional(),
  ProfileName: z.string().optional(),
  WaId: z.string().optional(),
  Forwarded: z.string().optional(),
  FrequentlyForwarded: z.string().optional(),

  // Status de entrega
  MessageStatus: z
    .enum([
      "queued",
      "sending",
      "sent",
      "delivered",
      "read",
      "failed",
      "undelivered",
    ])
    .optional(),

  // Campos de erro
  ErrorCode: z.string().optional(),
  ErrorMessage: z.string().optional(),
});

/**
 * Tipo inferido do schema
 */
export type TwilioWebhookData = z.infer<typeof TwilioWebhookSchema>;

/**
 * Schema simplificado apenas para campos essenciais (validação rápida)
 */
export const TwilioEssentialSchema = z.object({
  From: z.string().min(1, "From is required"),
  To: z.string().min(1, "To is required"),
  MessageSid: z.string().min(1, "MessageSid is required"),
  Body: z.string().optional(),
  NumMedia: z.coerce.number().int().min(0).default(0),
});

export type TwilioEssentialData = z.infer<typeof TwilioEssentialSchema>;

/**
 * Tipos de mídia suportados
 */
export const SUPPORTED_MEDIA_TYPES = {
  IMAGE: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  AUDIO: ["audio/ogg", "audio/mpeg", "audio/mp4", "audio/amr"],
  VIDEO: ["video/mp4", "video/3gpp"],
  DOCUMENT: ["application/pdf"],
} as const;

/**
 * Detecta o tipo de mídia a partir do content-type
 */
export function detectMediaType(
  contentType: string | undefined
): "image" | "audio" | "video" | "document" | null {
  if (!contentType) return null;

  const normalized = contentType.toLowerCase().split(";")[0].trim();

  if (SUPPORTED_MEDIA_TYPES.IMAGE.some((t) => normalized.startsWith(t.split("/")[0]))) {
    return "image";
  }
  if (SUPPORTED_MEDIA_TYPES.AUDIO.some((t) => normalized.startsWith(t.split("/")[0]))) {
    return "audio";
  }
  if (SUPPORTED_MEDIA_TYPES.VIDEO.some((t) => normalized.startsWith(t.split("/")[0]))) {
    return "video";
  }
  if (SUPPORTED_MEDIA_TYPES.DOCUMENT.includes(normalized as typeof SUPPORTED_MEDIA_TYPES.DOCUMENT[number])) {
    return "document";
  }

  return null;
}

/**
 * Extrai informações de mídia do payload do Twilio
 */
export function extractMediaInfo(data: TwilioWebhookData): Array<{
  url: string;
  contentType: string;
  type: "image" | "audio" | "video" | "document" | null;
}> {
  const media: Array<{
    url: string;
    contentType: string;
    type: "image" | "audio" | "video" | "document" | null;
  }> = [];

  for (let i = 0; i < data.NumMedia; i++) {
    const urlKey = `MediaUrl${i}` as keyof TwilioWebhookData;
    const typeKey = `MediaContentType${i}` as keyof TwilioWebhookData;

    const url = data[urlKey];
    const contentType = data[typeKey];

    if (url && typeof url === "string") {
      media.push({
        url,
        contentType: (contentType as string) || "application/octet-stream",
        type: detectMediaType(contentType as string | undefined),
      });
    }
  }

  return media;
}

/**
 * Valida se o payload é um webhook de status (não uma mensagem)
 */
export function isStatusWebhook(data: TwilioWebhookData): boolean {
  return !!data.MessageStatus && !data.Body && data.NumMedia === 0;
}

/**
 * Schema para validação de configuração de ambiente
 */
export const TwilioConfigSchema = z.object({
  TWILIO_ACCOUNT_SID: z.string().min(1, "TWILIO_ACCOUNT_SID is required"),
  TWILIO_AUTH_TOKEN: z.string().min(1, "TWILIO_AUTH_TOKEN is required"),
  TWILIO_SKIP_VALIDATION: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export type TwilioConfig = z.infer<typeof TwilioConfigSchema>;
