import { describe, it, expect, vi, beforeEach } from "vitest"
import { IDS, makeFakeJob } from "../helpers/fixtures"

// Mock de módulos específicos do worker (além dos já mockados no setup)
vi.mock("@/lib/services/ai/generate-response.service", () => ({
  generateAIResponse: vi.fn(),
}))

vi.mock("@/lib/services/chat.service", () => ({
  saveMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/services/evolution/evolution-message.service", () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  isSessionError: vi.fn().mockReturnValue(false),
  getSessionErrorReason: vi.fn().mockReturnValue(null),
  WhatsAppMessageError: class WhatsAppMessageError extends Error {
    retryable: boolean
    constructor(message: string, retryable = true) {
      super(message)
      this.retryable = retryable
    }
  },
}))

vi.mock("@/lib/services/evolution/evolution-instance.service", () => ({
  restartInstance: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/utils/async.utils", () => ({
  withTimeout: vi.fn(async (promise: Promise<unknown>) => promise),
}))

vi.mock("@/lib/infra/metrics", () => ({
  WhatsAppMetrics: {
    decryptFail: vi.fn(),
  },
}))

vi.mock("@/lib/services/credits.service", () => ({
  getSalonRemainingCredits: vi.fn().mockResolvedValue({ remaining: 1000, total: 1000000, used: 0 }),
  debitSalonCredits: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("bullmq", () => ({
  Worker: vi.fn(),
  Job: vi.fn(),
  DelayedError: class DelayedError extends Error {
    constructor() { super("DelayedError") }
  },
}))

import { processMessage } from "@/workers/message-processor"
import { generateAIResponse } from "@/lib/services/ai/generate-response.service"
import { sendWhatsAppMessage } from "@/lib/services/evolution/evolution-message.service"
import { saveMessage } from "@/lib/services/chat.service"
import { acquireLock, releaseLock, getRedisClient } from "@/lib/infra/redis"
import { db, domainServices } from "@repo/db"
import { getSalonRemainingCredits, debitSalonCredits } from "@/lib/services/credits.service"

describe("processMessage", () => {
  beforeEach(() => {
    // Reset redis mock para cenário padrão
    const mockRedis = { get: vi.fn().mockResolvedValue(null), set: vi.fn() }
    vi.mocked(getRedisClient).mockReturnValue(mockRedis as any)

    // Lock adquirido com sucesso
    vi.mocked(acquireLock).mockResolvedValue("lock-id-123")

    // Chat não está em modo manual
    vi.mocked(db.query.chats.findFirst).mockResolvedValue({ isManual: false } as any)

    // Salon ativo
    vi.mocked(db.query.salons.findFirst).mockResolvedValue({
      subscriptionStatus: "ACTIVE",
      subscriptionStatusChangedAt: null,
    } as any)

    // Credits disponíveis
    vi.mocked(getSalonRemainingCredits).mockResolvedValue({
      remaining: 1000000,
      total: 1000000,
      used: 0,
    })

    // AI response padrão
    vi.mocked(generateAIResponse).mockResolvedValue({
      text: "Claro! Posso ajudar com seu agendamento.",
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      model: "gpt-4o-mini",
    } as any)

    // domainServices
    vi.mocked(domainServices.analyzeMessageRequiresResponse).mockReturnValue(false)
  })

  it("happy path: processa mensagem com sucesso", async () => {
    const job = makeFakeJob()

    const result = await processMessage(job as any)

    expect(result.status).toBe("success")
    expect(result.chatId).toBe(IDS.chatId)
    expect(result.messageId).toBe(IDS.messageId)
    expect(result.tokensUsed).toBe(150)
    expect(sendWhatsAppMessage).toHaveBeenCalled()
    expect(saveMessage).toHaveBeenCalled()
    expect(debitSalonCredits).toHaveBeenCalledWith(IDS.salonId, 150, "gpt-4o-mini")
  })

  it("lock contention: reagenda job quando lock não disponível", async () => {
    vi.mocked(acquireLock).mockResolvedValue(null)
    const job = makeFakeJob()

    await expect(processMessage(job as any)).rejects.toThrow("DelayedError")
    expect(job.moveToDelayed).toHaveBeenCalled()
  })

  it("message coalescing: pula quando mensagem mais nova existe", async () => {
    const mockRedis = { get: vi.fn().mockResolvedValue("newer-msg-id"), set: vi.fn() }
    vi.mocked(getRedisClient).mockReturnValue(mockRedis as any)

    const job = makeFakeJob()

    const result = await processMessage(job as any)

    expect(result.status).toBe("coalesced")
    expect(generateAIResponse).not.toHaveBeenCalled()
  })

  it("manual mode: não processa AI quando chat está em modo manual", async () => {
    vi.mocked(db.query.chats.findFirst).mockResolvedValue({ isManual: true } as any)

    const job = makeFakeJob()

    const result = await processMessage(job as any)

    expect(result.status).toBe("manual_mode")
    expect(generateAIResponse).not.toHaveBeenCalled()
  })

  it("subscription cancelada: bloqueia processamento", async () => {
    vi.mocked(db.query.salons.findFirst).mockResolvedValue({
      subscriptionStatus: "CANCELED",
      subscriptionStatusChangedAt: null,
    } as any)

    const job = makeFakeJob()

    const result = await processMessage(job as any)

    expect(result.status).toBe("manual_mode")
    expect(generateAIResponse).not.toHaveBeenCalled()
    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("temporariamente indisponível"),
      IDS.salonId
    )
  })

  it("PAST_DUE com grace period expirado: bloqueia", async () => {
    const oldDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) // 4 dias atrás
    vi.mocked(db.query.salons.findFirst).mockResolvedValue({
      subscriptionStatus: "PAST_DUE",
      subscriptionStatusChangedAt: oldDate.toISOString(),
    } as any)

    const job = makeFakeJob()

    const result = await processMessage(job as any)

    expect(result.status).toBe("manual_mode")
    expect(generateAIResponse).not.toHaveBeenCalled()
  })

  it("PAST_DUE dentro do grace period: processa normalmente", async () => {
    const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 dia atrás
    vi.mocked(db.query.salons.findFirst).mockResolvedValue({
      subscriptionStatus: "PAST_DUE",
      subscriptionStatusChangedAt: recentDate.toISOString(),
    } as any)

    const job = makeFakeJob()

    const result = await processMessage(job as any)

    expect(result.status).toBe("success")
  })

  it("sem créditos: retorna out_of_credits", async () => {
    vi.mocked(getSalonRemainingCredits).mockResolvedValue({
      remaining: 0,
      total: 1000000,
      used: 1000000,
    })

    const job = makeFakeJob()

    const result = await processMessage(job as any)

    expect(result.status).toBe("out_of_credits")
    expect(generateAIResponse).not.toHaveBeenCalled()
  })

  it("mensagem de mídia: responde com template sem chamar AI", async () => {
    const job = makeFakeJob({
      hasMedia: true,
      mediaType: "image",
    })

    const result = await processMessage(job as any)

    expect(result.status).toBe("media_handled")
    expect(generateAIResponse).not.toHaveBeenCalled()
    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("imagem"),
      IDS.salonId
    )
  })

  it("always releases lock in finally block", async () => {
    const job = makeFakeJob()
    await processMessage(job as any)

    expect(releaseLock).toHaveBeenCalledWith(`chat:${IDS.chatId}`, "lock-id-123")
  })

  it("releases lock even on error", async () => {
    vi.mocked(generateAIResponse).mockRejectedValue(new Error("AI explodiu"))

    const job = makeFakeJob()

    await expect(processMessage(job as any)).rejects.toThrow("AI explodiu")
    expect(releaseLock).toHaveBeenCalledWith(`chat:${IDS.chatId}`, "lock-id-123")
  })

  it("não debita créditos quando totalTokens é 0", async () => {
    vi.mocked(generateAIResponse).mockResolvedValue({
      text: "Resposta",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      model: "gpt-4o-mini",
    } as any)

    const job = makeFakeJob()
    await processMessage(job as any)

    expect(debitSalonCredits).not.toHaveBeenCalled()
  })
})
