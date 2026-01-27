/**
 * Webhook do WhatsApp via Twilio 
 * 
 */

import { NextRequest } from "next/server";
import { validateRequest } from "twilio";
import { TwilioWebhookSchema, detectMediaType } from "@/lib/schemas/twilio";
import { logger, createContextLogger, hashPhone, createRequestContext, getDuration } from "@/lib/logger";
import { isMessageProcessed, markMessageProcessed } from "@/lib/redis";
import { enqueueMessage } from "@/lib/queues/message-queue";
import { getSalonIdByWhatsapp } from "@/lib/services/salon.service";
import { findOrCreateChat, findOrCreateCustomer, saveMessage } from "@/lib/services/chat.service";
import { normalizePhoneNumber } from "@/lib/services/whatsapp.service";
import { checkIfNewCustomer } from "@/lib/services/ai/generate-response.service";
import { checkPhoneRateLimit } from "@/lib/rate-limit";
import { withTimeout, TimeoutError } from "@/lib/utils/async.utils";
import { WebhookMetrics } from "@/lib/metrics";
import {
  WhatsAppError,
  RateLimitError,
  wrapError,
} from "@/lib/errors";

// Timeout reduzido - webhook deve apenas validar e enfileirar
export const maxDuration = 10;

// Timeouts para operações do banco de dados (em ms)
const DB_TIMEOUT = 5000; // 5 segundos
const REDIS_TIMEOUT = 2000; // 2 segundos

/**
 * Handler principal do webhook
 */
export async function POST(req: NextRequest) {
  const ctx = createRequestContext();
  let reqLogger = createContextLogger({ requestId: ctx.requestId });

  // Registra métrica de recebimento
  WebhookMetrics.received();

  try {
    reqLogger.info("Webhook received");

    // 1. VALIDAR CONTENT-TYPE
    const contentType = req.headers.get("content-type") || "";
    const isValidContentType =
      contentType.includes("multipart/form-data") ||
      contentType.includes("application/x-www-form-urlencoded");

    if (!isValidContentType) {
      reqLogger.warn({ contentType }, "Invalid content-type");
      WebhookMetrics.error("invalid_content_type");
      return new Response("Invalid Content-Type", { status: 400 });
    }

    // 2. PARSEAR FORM DATA
    const formData = await req.formData();
    const formDataObject: Record<string, string> = {};
    formData.forEach((value, key) => {
      formDataObject[key] = value.toString();
    });

    // 3. VALIDAR ASSINATURA TWILIO
    const isSignatureValid = await validateTwilioSignature(req, formDataObject, reqLogger);
    if (!isSignatureValid) {
      reqLogger.error("Invalid Twilio signature");
      WebhookMetrics.error("invalid_signature");
      return new Response("Unauthorized", { status: 401 });
    }

    // 4. VALIDAR SCHEMA
    const validationResult = TwilioWebhookSchema.safeParse(formDataObject);
    if (!validationResult.success) {
      reqLogger.error(
        { errors: validationResult.error.issues },
        "Schema validation failed"
      );
      WebhookMetrics.error("schema_validation");
      return new Response("Invalid payload", { status: 400 });
    }

    const data = validationResult.data;
    const messageId = data.MessageSid;

    reqLogger = reqLogger.child({
      messageId,
      from: hashPhone(data.From),
      to: hashPhone(data.To),
      hasMedia: data.NumMedia > 0,
    });

    reqLogger.info("Payload validated");

    // 5. VERIFICAR IDEMPOTÊNCIA (com timeout)
    const isProcessed = await withTimeout(
      isMessageProcessed(messageId),
      REDIS_TIMEOUT,
      "isMessageProcessed"
    );
    
    if (isProcessed) {
      reqLogger.info("Duplicate message, skipping");
      WebhookMetrics.duplicate();
      return new Response("", { status: 200 });
    }

    // 6. NORMALIZAR DADOS
    const clientPhone = normalizePhoneNumber(data.From);
    const salonPhone = data.To;

    // 7. RATE LIMITING (ANTES de qualquer operação pesada)
    try {
      await withTimeout(
        checkPhoneRateLimit(clientPhone),
        REDIS_TIMEOUT,
        "checkPhoneRateLimit"
      );
    } catch (error) {
      if (error instanceof RateLimitError) {
        reqLogger.warn(
          { resetIn: error.resetIn },
          "Rate limit exceeded at webhook level"
        );
        WebhookMetrics.rateLimited({ phone: hashPhone(clientPhone) });
        // Retorna 200 para não causar retry do Twilio
        // A mensagem será simplesmente ignorada
        return new Response("", { status: 200 });
      }
      throw error;
    }

    // 8. BUSCAR SALÃO (com timeout)
    const salonId = await withTimeout(
      getSalonIdByWhatsapp(salonPhone),
      DB_TIMEOUT,
      "getSalonIdByWhatsapp"
    );
    
    if (!salonId) {
      reqLogger.error({ salonPhone: hashPhone(salonPhone) }, "Salon not found");
      WebhookMetrics.error("salon_not_found");
      // Retorna 200 para evitar retries do Twilio (não é erro temporário)
      return new Response("", { status: 200 });
    }

    reqLogger = reqLogger.child({ salonId });

    // 9. CRIAR/BUSCAR CUSTOMER E CHAT (com timeouts)
    const customer = await withTimeout(
      findOrCreateCustomer(clientPhone, salonId),
      DB_TIMEOUT,
      "findOrCreateCustomer"
    );
    
    const chat = await withTimeout(
      findOrCreateChat(clientPhone, salonId),
      DB_TIMEOUT,
      "findOrCreateChat"
    );

    reqLogger = reqLogger.child({
      chatId: chat.id,
      customerId: customer.id,
    });

    // 10. VERIFICAR SE É CLIENTE NOVO (com timeout)
    const isNewCustomer = await withTimeout(
      checkIfNewCustomer(salonId, clientPhone),
      DB_TIMEOUT,
      "checkIfNewCustomer"
    );

    // 11. SALVAR MENSAGEM RAW NO BANCO (com timeout)
    const messageContent = data.NumMedia > 0
      ? `[MÍDIA] ${getMediaLabel(formDataObject)}`
      : data.Body || "";

    await withTimeout(
      saveMessage(chat.id, "user", messageContent),
      DB_TIMEOUT,
      "saveMessage"
    );
    reqLogger.debug("Message saved to database");

    // 12. ENFILEIRAR PROCESSAMENTO (com timeout)
    await withTimeout(
      enqueueMessage({
        messageId,
        chatId: chat.id,
        salonId,
        customerId: customer.id,
        clientPhone,
        body: data.Body || "",
        hasMedia: data.NumMedia > 0,
        mediaType: data.NumMedia > 0 ? getMediaType(formDataObject) : undefined,
        mediaUrl: data.MediaUrl0,
        receivedAt: new Date().toISOString(),
        profileName: data.ProfileName,
        isNewCustomer,
        customerName: customer.name,
      }),
      REDIS_TIMEOUT,
      "enqueueMessage"
    );

    // 13. MARCAR COMO PROCESSADO (idempotência, com timeout)
    await withTimeout(
      markMessageProcessed(messageId),
      REDIS_TIMEOUT,
      "markMessageProcessed"
    );

    const duration = getDuration(ctx);
    reqLogger.info({ duration }, "Message enqueued successfully");
    
    // Registra métricas de sucesso
    WebhookMetrics.enqueued({ salonId });
    WebhookMetrics.latency(duration);

    return new Response("", { status: 200 });
  } catch (error) {
    const duration = getDuration(ctx);

    // Tratamento especial para timeout
    if (error instanceof TimeoutError) {
      reqLogger.error(
        { err: error, duration },
        "Operation timed out"
      );
      WebhookMetrics.error("timeout");
      // Timeout é retryable
      return new Response("Internal Server Error", { status: 500 });
    }

    // Wrap em WhatsAppError se necessário
    const wrappedError = wrapError(error);

    reqLogger.error(
      {
        err: wrappedError,
        code: wrappedError.code,
        duration,
      },
      "Error processing webhook"
    );

    WebhookMetrics.error(wrappedError.code);
    WebhookMetrics.latency(duration);

    // Retorna 200 para erros não-retryable (evita loops de retry do Twilio)
    if (!wrappedError.retryable) {
      return new Response("", { status: 200 });
    }

    // Retorna 500 para erros retryable (Twilio vai retentar)
    return new Response("Internal Server Error", { status: 500 });
  }
}

/**
 * Valida a assinatura do Twilio
 * - Em produção: sempre valida
 * - Em desenvolvimento: pode pular se TWILIO_SKIP_VALIDATION=true
 */
async function validateTwilioSignature(
  req: NextRequest,
  formData: Record<string, string>,
  reqLogger: ReturnType<typeof createContextLogger>
): Promise<boolean> {
  const isDevelopment = process.env.NODE_ENV === "development";
  const skipValidation =
    isDevelopment && process.env.TWILIO_SKIP_VALIDATION === "true";

  if (skipValidation) {
    reqLogger.warn("Twilio signature validation skipped (development)");
    return true;
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioSignature = req.headers.get("x-twilio-signature");

  if (!authToken) {
    reqLogger.error("TWILIO_AUTH_TOKEN not configured");
    return false;
  }

  if (!twilioSignature) {
    reqLogger.error("Missing X-Twilio-Signature header");
    return false;
  }

  // Reconstrói a URL pública (considerando proxies)
  const url = new URL(req.url);
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host") ?? url.host;
  const proto = forwardedProto ?? url.protocol.replace(":", "");
  const publicUrl = `${proto}://${host}${url.pathname}${url.search}`;

  const isValid = validateRequest(authToken, twilioSignature, publicUrl, formData);

  if (isValid) {
    reqLogger.debug("Twilio signature validated");
  }

  return isValid;
}

/**
 * Obtém o label do tipo de mídia para o log
 */
function getMediaLabel(formData: Record<string, string>): string {
  const contentType = formData.MediaContentType0?.toLowerCase();
  if (!contentType) return "unknown";

  if (contentType.startsWith("image/")) return "imagem";
  if (contentType.startsWith("audio/")) return "áudio";
  if (contentType.startsWith("video/")) return "vídeo";
  if (contentType.includes("pdf")) return "documento PDF";

  return "mídia";
}

/**
 * Obtém o tipo de mídia
 */
function getMediaType(
  formData: Record<string, string>
): "image" | "audio" | "video" | "document" | undefined {
  return detectMediaType(formData.MediaContentType0) ?? undefined;
}
