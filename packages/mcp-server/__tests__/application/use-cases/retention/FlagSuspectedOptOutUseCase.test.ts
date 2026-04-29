import { describe, it, expect, vi, beforeEach } from "vitest"
import { FlagSuspectedOptOutUseCase } from "../../../../src/application/use-cases/retention/FlagSuspectedOptOutUseCase"
import type { IRetentionRepository } from "../../../../src/domain/repositories/IRetentionRepository"
import { IDS } from "../../../helpers/fixtures"

function mockRepo(): IRetentionRepository {
  return {
    findInactive: vi.fn(),
    hasRecentAiMessage: vi.fn(),
    markOptOut: vi.fn(),
    clearOptOut: vi.fn(),
    flagSuspectedOptOut: vi.fn().mockResolvedValue("audit-uuid"),
    findUnreviewedAudits: vi.fn(),
    setAuditSentiment: vi.fn(),
    countAiMessagesSentToday: vi.fn(),
  } as unknown as IRetentionRepository
}

describe("FlagSuspectedOptOutUseCase", () => {
  let repo: IRetentionRepository
  let useCase: FlagSuspectedOptOutUseCase

  beforeEach(() => {
    repo = mockRepo()
    useCase = new FlagSuspectedOptOutUseCase(repo)
  })

  it("registra um flag de suspeita de opt-out", async () => {
    const result = await useCase.execute({
      salonId: IDS.salonId,
      customerId: IDS.customerId,
      phone: "+5511999999999",
      responseBody: "me erra",
      retentionCampaignMessageId: "msg-id",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.auditId).toBe("audit-uuid")
    }
    expect(repo.flagSuspectedOptOut).toHaveBeenCalledWith(
      expect.objectContaining({
        salonId: IDS.salonId,
        customerId: IDS.customerId,
        responseBody: "me erra",
        retentionCampaignMessageId: "msg-id",
      })
    )
  })

  it("trunca responseBody em 2000 chars", async () => {
    const long = "y".repeat(5000)
    await useCase.execute({
      salonId: IDS.salonId,
      customerId: null,
      phone: "+5511999999999",
      responseBody: long,
      retentionCampaignMessageId: null,
    })
    expect(repo.flagSuspectedOptOut).toHaveBeenCalledWith(
      expect.objectContaining({ responseBody: expect.stringMatching(/^y{2000}$/) })
    )
  })

  it("falha em telefone invalido", async () => {
    const result = await useCase.execute({
      salonId: IDS.salonId,
      customerId: null,
      phone: "abc",
      responseBody: "x",
      retentionCampaignMessageId: null,
    })
    expect(result.success).toBe(false)
  })
})
