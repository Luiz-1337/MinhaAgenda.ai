import { describe, it, expect, vi, beforeEach } from "vitest"
import { RecordCustomerOptOutUseCase } from "../../../../src/application/use-cases/retention/RecordCustomerOptOutUseCase"
import type { IRetentionRepository } from "../../../../src/domain/repositories/IRetentionRepository"
import { IDS } from "../../../helpers/fixtures"

function mockRepo(): IRetentionRepository {
  return {
    findInactive: vi.fn(),
    hasRecentAiMessage: vi.fn(),
    markOptOut: vi.fn(),
    clearOptOut: vi.fn(),
    flagSuspectedOptOut: vi.fn(),
    findUnreviewedAudits: vi.fn(),
    setAuditSentiment: vi.fn(),
    countAiMessagesSentToday: vi.fn(),
  } as unknown as IRetentionRepository
}

describe("RecordCustomerOptOutUseCase", () => {
  let repo: IRetentionRepository
  let useCase: RecordCustomerOptOutUseCase

  beforeEach(() => {
    repo = mockRepo()
    useCase = new RecordCustomerOptOutUseCase(repo)
  })

  it("opta o cliente fora e retorna timestamp", async () => {
    const now = new Date()
    ;(repo.markOptOut as any).mockResolvedValue({
      customerId: IDS.customerId,
      optedOutAt: now,
      alreadyOptedOut: false,
    })

    const result = await useCase.execute({
      salonId: IDS.salonId,
      phone: "+5511999999999",
      reason: "PARAR",
      source: "keyword",
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.alreadyOptedOut).toBe(false)
      expect(result.data.customerId).toBe(IDS.customerId)
    }
    expect(repo.markOptOut).toHaveBeenCalledWith(
      expect.objectContaining({
        salonId: IDS.salonId,
        source: "keyword",
      })
    )
  })

  it("e idempotente — retorna alreadyOptedOut=true se ja optado", async () => {
    const past = new Date("2026-01-15T12:00:00Z")
    ;(repo.markOptOut as any).mockResolvedValue({
      customerId: IDS.customerId,
      optedOutAt: past,
      alreadyOptedOut: true,
    })

    const result = await useCase.execute({
      salonId: IDS.salonId,
      phone: "+5511999999999",
      reason: "PARAR",
      source: "keyword",
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.alreadyOptedOut).toBe(true)
      expect(result.data.optedOutAt).toEqual(past)
    }
  })

  it("falha em telefone invalido", async () => {
    const result = await useCase.execute({
      salonId: IDS.salonId,
      phone: "abc",
      reason: "PARAR",
      source: "keyword",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("INVALID_PHONE")
    }
  })

  it("falha em campos obrigatorios vazios", async () => {
    const result = await useCase.execute({
      salonId: "",
      phone: "+5511999999999",
      reason: "x",
      source: "manual",
    })
    expect(result.success).toBe(false)
  })

  it("trunca o motivo em 500 caracteres", async () => {
    ;(repo.markOptOut as any).mockResolvedValue({
      customerId: IDS.customerId,
      optedOutAt: new Date(),
      alreadyOptedOut: false,
    })
    const longReason = "x".repeat(2000)
    await useCase.execute({
      salonId: IDS.salonId,
      phone: "+5511999999999",
      reason: longReason,
      source: "manual",
    })
    expect(repo.markOptOut).toHaveBeenCalledWith(
      expect.objectContaining({ reason: expect.stringMatching(/^x{500}$/) })
    )
  })
})
