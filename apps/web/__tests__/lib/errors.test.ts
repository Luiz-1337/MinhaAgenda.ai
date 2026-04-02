import { describe, it, expect } from "vitest"
import {
  WhatsAppError,
  ValidationError,
  RateLimitError,
  AIGenerationError,
  WhatsAppAPIError,
  NotFoundError,
  LockTimeoutError,
  getUserFriendlyMessage,
  isRetryableError,
  wrapError,
  ErrorMessages,
} from "@/lib/errors"

describe("WhatsAppError", () => {
  it("cria erro com propriedades corretas", () => {
    const error = new WhatsAppError("test", "VALIDATION_ERROR", {
      retryable: false,
      statusCode: 400,
      context: { field: "email" },
    })

    expect(error.message).toBe("test")
    expect(error.code).toBe("VALIDATION_ERROR")
    expect(error.retryable).toBe(false)
    expect(error.statusCode).toBe(400)
    expect(error.context).toEqual({ field: "email" })
    expect(error.name).toBe("WhatsAppError")
  })

  it("usa defaults (retryable=false, statusCode=500)", () => {
    const error = new WhatsAppError("test", "UNKNOWN_ERROR")
    expect(error.retryable).toBe(false)
    expect(error.statusCode).toBe(500)
  })

  it("getUserFriendlyMessage retorna mensagem pelo código", () => {
    const error = new WhatsAppError("internal", "RATE_LIMIT_EXCEEDED")
    expect(error.getUserFriendlyMessage()).toBe(ErrorMessages.RATE_LIMIT_EXCEEDED)
  })

  it("toJSON serializa corretamente", () => {
    const error = new WhatsAppError("test", "DATABASE_ERROR")
    const json = error.toJSON()
    expect(json.code).toBe("DATABASE_ERROR")
    expect(json.message).toBe("test")
    expect(json.name).toBe("WhatsAppError")
  })
})

describe("ValidationError", () => {
  it("seta code VALIDATION_ERROR, retryable=false, statusCode=400", () => {
    const error = new ValidationError("campo inválido")
    expect(error.code).toBe("VALIDATION_ERROR")
    expect(error.retryable).toBe(false)
    expect(error.statusCode).toBe(400)
    expect(error.name).toBe("ValidationError")
  })
})

describe("RateLimitError", () => {
  it("armazena resetIn e seta statusCode=429", () => {
    const error = new RateLimitError(60)
    expect(error.resetIn).toBe(60)
    expect(error.code).toBe("RATE_LIMIT_EXCEEDED")
    expect(error.retryable).toBe(true)
    expect(error.statusCode).toBe(429)
    expect(error.context?.resetIn).toBe(60)
  })
})

describe("AIGenerationError", () => {
  it("é retryable por padrão", () => {
    const error = new AIGenerationError("falha na AI")
    expect(error.retryable).toBe(true)
    expect(error.code).toBe("AI_GENERATION_FAILED")
  })

  it("aceita retryable=false", () => {
    const error = new AIGenerationError("falha", { retryable: false })
    expect(error.retryable).toBe(false)
  })
})

describe("WhatsAppAPIError", () => {
  it("é retryable com statusCode 502", () => {
    const error = new WhatsAppAPIError("API down")
    expect(error.retryable).toBe(true)
    expect(error.statusCode).toBe(502)
  })
})

describe("NotFoundError", () => {
  it("mapeia resource para código correto", () => {
    expect(new NotFoundError("salon").code).toBe("SALON_NOT_FOUND")
    expect(new NotFoundError("chat").code).toBe("CHAT_NOT_FOUND")
    expect(new NotFoundError("customer").code).toBe("CUSTOMER_NOT_FOUND")
    expect(new NotFoundError("agent").code).toBe("AGENT_NOT_FOUND")
  })

  it("inclui identifier na mensagem", () => {
    const error = new NotFoundError("salon", "abc-123")
    expect(error.message).toContain("abc-123")
  })

  it("statusCode é 404 e não é retryable", () => {
    const error = new NotFoundError("salon")
    expect(error.statusCode).toBe(404)
    expect(error.retryable).toBe(false)
  })
})

describe("LockTimeoutError", () => {
  it("é retryable com statusCode 503", () => {
    const error = new LockTimeoutError("chat:123")
    expect(error.retryable).toBe(true)
    expect(error.statusCode).toBe(503)
    expect(error.context?.resource).toBe("chat:123")
  })
})

describe("getUserFriendlyMessage", () => {
  it("retorna mensagem do código para WhatsAppError", () => {
    const error = new ValidationError("teste")
    expect(getUserFriendlyMessage(error)).toBe(ErrorMessages.VALIDATION_ERROR)
  })

  it("detecta 'rate limit' em erro genérico", () => {
    const error = new Error("rate limit exceeded")
    expect(getUserFriendlyMessage(error)).toBe(ErrorMessages.RATE_LIMIT_EXCEEDED)
  })

  it("detecta 'timeout' em erro genérico", () => {
    const error = new Error("connection timeout")
    expect(getUserFriendlyMessage(error)).toBe(ErrorMessages.LOCK_TIMEOUT)
  })

  it("detecta 'not found' em erro genérico", () => {
    const error = new Error("resource not found")
    expect(getUserFriendlyMessage(error)).toContain("não encontrado")
  })

  it("retorna fallback genérico para erro desconhecido", () => {
    const msg = getUserFriendlyMessage("algo estranho")
    expect(msg).toContain("dificuldade técnica")
  })
})

describe("isRetryableError", () => {
  it("respeita flag retryable do WhatsAppError", () => {
    expect(isRetryableError(new RateLimitError(60))).toBe(true)
    expect(isRetryableError(new ValidationError("bad"))).toBe(false)
  })

  it("retorna true para erros de rede", () => {
    expect(isRetryableError(new Error("ECONNREFUSED"))).toBe(true)
    expect(isRetryableError(new Error("timeout"))).toBe(true)
    expect(isRetryableError(new Error("network error"))).toBe(true)
    expect(isRetryableError(new Error("ECONNRESET"))).toBe(true)
  })

  it("retorna false para erros de validação", () => {
    expect(isRetryableError(new Error("validation failed"))).toBe(false)
    expect(isRetryableError(new Error("invalid input"))).toBe(false)
  })

  it("retorna true por padrão para erros desconhecidos", () => {
    expect(isRetryableError(new Error("algo inesperado"))).toBe(true)
  })
})

describe("wrapError", () => {
  it("retorna WhatsAppError inalterado", () => {
    const original = new ValidationError("teste")
    expect(wrapError(original)).toBe(original)
  })

  it("wrapa Error genérico em WhatsAppError", () => {
    const original = new Error("algo deu errado")
    const wrapped = wrapError(original)
    expect(wrapped).toBeInstanceOf(WhatsAppError)
    expect(wrapped.code).toBe("UNKNOWN_ERROR")
    expect(wrapped.message).toBe("algo deu errado")
    expect(wrapped.cause).toBe(original)
  })

  it("wrapa string em WhatsAppError", () => {
    const wrapped = wrapError("texto puro")
    expect(wrapped).toBeInstanceOf(WhatsAppError)
    expect(wrapped.message).toBe("texto puro")
  })

  it("usa defaultCode fornecido", () => {
    const wrapped = wrapError(new Error("db"), "DATABASE_ERROR")
    expect(wrapped.code).toBe("DATABASE_ERROR")
  })
})
