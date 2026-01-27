/**
 * Sistema de erros customizados para o webhook do WhatsApp
 * 
 * Provê:
 * - Classes de erro tipadas com códigos
 * - Mensagens amigáveis para o usuário
 * - Flag de retry para controle de tentativas
 */

/**
 * Códigos de erro possíveis
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "RATE_LIMIT_EXCEEDED"
  | "AI_GENERATION_FAILED"
  | "WHATSAPP_API_ERROR"
  | "DATABASE_ERROR"
  | "LOCK_TIMEOUT"
  | "SALON_NOT_FOUND"
  | "CHAT_NOT_FOUND"
  | "CUSTOMER_NOT_FOUND"
  | "AGENT_NOT_FOUND"
  | "MESSAGE_ALREADY_PROCESSED"
  | "INVALID_SIGNATURE"
  | "REDIS_ERROR"
  | "QUEUE_ERROR"
  | "UNKNOWN_ERROR";

/**
 * Mensagens amigáveis para cada código de erro (em português)
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Dados inválidos recebidos",
  RATE_LIMIT_EXCEEDED: "Muitas mensagens em pouco tempo. Aguarde um momento.",
  AI_GENERATION_FAILED: "Desculpe, tive dificuldade em processar sua mensagem.",
  WHATSAPP_API_ERROR: "Erro ao enviar mensagem via WhatsApp",
  DATABASE_ERROR: "Erro ao acessar dados",
  LOCK_TIMEOUT: "Sistema temporariamente ocupado",
  SALON_NOT_FOUND: "Salão não encontrado",
  CHAT_NOT_FOUND: "Conversa não encontrada",
  CUSTOMER_NOT_FOUND: "Cliente não encontrado",
  AGENT_NOT_FOUND: "Agente não encontrado ou inativo",
  MESSAGE_ALREADY_PROCESSED: "Mensagem já foi processada",
  INVALID_SIGNATURE: "Assinatura inválida",
  REDIS_ERROR: "Erro no sistema de cache",
  QUEUE_ERROR: "Erro ao enfileirar mensagem",
  UNKNOWN_ERROR: "Ocorreu um erro inesperado",
};

/**
 * Erro customizado para o webhook do WhatsApp
 */
export class WhatsAppError extends Error {
  public readonly code: ErrorCode;
  public readonly retryable: boolean;
  public readonly statusCode: number;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode,
    options?: {
      retryable?: boolean;
      statusCode?: number;
      context?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = "WhatsAppError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.statusCode = options?.statusCode ?? 500;
    this.context = options?.context;

    // Mantém a stack trace correta
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WhatsAppError);
    }

    // Suporte a cause (Node 16.9+)
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  /**
   * Retorna a mensagem amigável para o usuário
   */
  getUserFriendlyMessage(): string {
    return ErrorMessages[this.code] || ErrorMessages.UNKNOWN_ERROR;
  }

  /**
   * Serializa o erro para logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      statusCode: this.statusCode,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Erro de validação (dados inválidos)
 */
export class ValidationError extends WhatsAppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", {
      retryable: false,
      statusCode: 400,
      context,
    });
    this.name = "ValidationError";
  }
}

/**
 * Erro de rate limit excedido
 */
export class RateLimitError extends WhatsAppError {
  public readonly resetIn: number;

  constructor(resetIn: number, context?: Record<string, unknown>) {
    super(
      `Rate limit exceeded. Reset in ${resetIn} seconds.`,
      "RATE_LIMIT_EXCEEDED",
      {
        retryable: true,
        statusCode: 429,
        context: { ...context, resetIn },
      }
    );
    this.name = "RateLimitError";
    this.resetIn = resetIn;
  }
}

/**
 * Erro na geração de resposta da AI
 */
export class AIGenerationError extends WhatsAppError {
  constructor(message: string, options?: { retryable?: boolean; cause?: Error }) {
    super(message, "AI_GENERATION_FAILED", {
      retryable: options?.retryable ?? true,
      statusCode: 500,
      cause: options?.cause,
    });
    this.name = "AIGenerationError";
  }
}

/**
 * Erro na API do WhatsApp/Twilio
 */
export class WhatsAppAPIError extends WhatsAppError {
  constructor(message: string, cause?: Error) {
    super(message, "WHATSAPP_API_ERROR", {
      retryable: true,
      statusCode: 502,
      cause,
    });
    this.name = "WhatsAppAPIError";
  }
}

/**
 * Erro de recurso não encontrado
 */
export class NotFoundError extends WhatsAppError {
  constructor(
    resource: "salon" | "chat" | "customer" | "agent",
    identifier?: string
  ) {
    const codeMap: Record<string, ErrorCode> = {
      salon: "SALON_NOT_FOUND",
      chat: "CHAT_NOT_FOUND",
      customer: "CUSTOMER_NOT_FOUND",
      agent: "AGENT_NOT_FOUND",
    };

    super(
      `${resource.charAt(0).toUpperCase() + resource.slice(1)} not found${identifier ? `: ${identifier}` : ""}`,
      codeMap[resource],
      {
        retryable: false,
        statusCode: 404,
        context: { resource, identifier },
      }
    );
    this.name = "NotFoundError";
  }
}

/**
 * Erro de timeout ao adquirir lock
 */
export class LockTimeoutError extends WhatsAppError {
  constructor(resource: string) {
    super(`Failed to acquire lock for: ${resource}`, "LOCK_TIMEOUT", {
      retryable: true,
      statusCode: 503,
      context: { resource },
    });
    this.name = "LockTimeoutError";
  }
}

/**
 * Retorna a mensagem amigável para qualquer erro
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (error instanceof WhatsAppError) {
    return error.getUserFriendlyMessage();
  }

  if (error instanceof Error) {
    // Tenta identificar o tipo de erro pela mensagem
    const msg = error.message.toLowerCase();

    if (msg.includes("rate limit")) {
      return ErrorMessages.RATE_LIMIT_EXCEEDED;
    }

    if (msg.includes("timeout")) {
      return ErrorMessages.LOCK_TIMEOUT;
    }

    if (msg.includes("not found")) {
      return "Recurso não encontrado. Tente novamente.";
    }
  }

  return "Desculpe, encontrei uma dificuldade técnica. Tente novamente em breve.";
}

/**
 * Determina se um erro é retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof WhatsAppError) {
    return error.retryable;
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    // Erros de rede/timeout geralmente são retryable
    if (
      msg.includes("timeout") ||
      msg.includes("econnrefused") ||
      msg.includes("econnreset") ||
      msg.includes("network")
    ) {
      return true;
    }

    // Erros de validação não são retryable
    if (msg.includes("validation") || msg.includes("invalid")) {
      return false;
    }
  }

  // Por padrão, assume que é retryable
  return true;
}

/**
 * Wrapa um erro genérico em WhatsAppError
 */
export function wrapError(error: unknown, defaultCode: ErrorCode = "UNKNOWN_ERROR"): WhatsAppError {
  if (error instanceof WhatsAppError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;

  return new WhatsAppError(message, defaultCode, {
    retryable: isRetryableError(error),
    cause,
  });
}
