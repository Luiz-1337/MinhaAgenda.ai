/**
 * Logger estruturado usando Pino
 * 
 * Features:
 * - Redação automática de PII (telefones, bodies, etc.)
 * - Formatação estruturada (JSON em prod, pretty em dev)
 * - Child loggers com contexto
 * - Serialização de erros
 */

import pino, { Logger, LoggerOptions } from "pino";

// Configuração base do logger
const baseConfig: LoggerOptions = {
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  // Redação de campos sensíveis (PII)
  redact: {
    paths: [
      // Telefones e números
      "*.phone",
      "*.phoneNumber",
      "*.clientPhone",
      "*.From",
      "*.To",
      "from",
      "to",
      "clientPhone",
      // Conteúdo de mensagens
      "*.Body",
      "*.body",
      "*.content",
      "*.message",
      "body",
      "content",
      // Prompts de sistema (podem conter dados sensíveis)
      "*.systemPrompt",
      "systemPrompt",
      // Headers de autenticação
      "req.headers.authorization",
      "req.headers.cookie",
      "headers.authorization",
      "headers.cookie",
    ],
    censor: "[REDACTED]",
  },
  base: {
    service: "whatsapp-webhook",
    env: process.env.NODE_ENV || "development",
  },
};

// Em desenvolvimento, usa pretty printing
const devConfig: LoggerOptions =
  process.env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }
    : {};

// Logger principal
export const logger: Logger = pino({
  ...baseConfig,
  ...devConfig,
});

/**
 * Cria um child logger com contexto adicional
 * Útil para adicionar requestId, chatId, salonId, etc. a todas as mensagens
 * 
 * @example
 * const reqLogger = createContextLogger({ requestId: "abc123", chatId: "def456" });
 * reqLogger.info("Processing message"); // Inclui requestId e chatId automaticamente
 */
export function createContextLogger(context: Record<string, unknown>): Logger {
  return logger.child(context);
}

/**
 * Sanitiza telefone para logging seguro
 * Mostra apenas os primeiros 4 e últimos 4 dígitos
 * 
 * @example
 * hashPhone("+5511999998888") // "5511***8888"
 * hashPhone("whatsapp:+5511999998888") // "5511***8888"
 */
export function hashPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return "***";
  return `${digits.slice(0, 4)}***${digits.slice(-4)}`;
}

/**
 * Sanitiza URL para logging seguro
 * Mostra apenas o domínio e parte do path
 * 
 * @example
 * hashUrl("https://api.twilio.com/Media/123456789") // "api.twilio.com/Media/***"
 */
export function hashUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const safePath = pathParts.length > 2 
      ? `/${pathParts.slice(0, 2).join("/")}/***/` 
      : parsed.pathname;
    return `${parsed.host}${safePath}`;
  } catch {
    // Se não for URL válida, mostra apenas os primeiros caracteres
    return url.length > 30 ? `${url.substring(0, 30)}...` : url;
  }
}

/**
 * Sanitiza objeto para logging seguro
 * Remove ou mascara campos sensíveis
 */
export function sanitizeForLogging(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = ["From", "To", "Body", "phone", "phoneNumber", "clientPhone"];
  const result: Record<string, unknown> = { ...data };

  for (const field of sensitiveFields) {
    if (field in result) {
      const value = result[field];
      if (typeof value === "string") {
        if (field === "Body" || field === "content") {
          result[field] = `[${value.length} chars]`;
        } else {
          result[field] = hashPhone(value);
        }
      }
    }
  }

  return result;
}

/**
 * Formata duração em milissegundos para string legível
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

// Tipos para contexto de requisição
export interface RequestContext {
  requestId: string;
  messageId?: string;
  chatId?: string;
  salonId?: string;
  clientPhone?: string;
  startTime: number;
}

/**
 * Cria contexto de requisição para logging
 */
export function createRequestContext(messageId?: string): RequestContext {
  return {
    requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    messageId,
    startTime: Date.now(),
  };
}

/**
 * Calcula duração desde o início do contexto
 */
export function getDuration(ctx: RequestContext): number {
  return Date.now() - ctx.startTime;
}

// Re-exporta tipos do Pino para conveniência
export type { Logger } from "pino";
