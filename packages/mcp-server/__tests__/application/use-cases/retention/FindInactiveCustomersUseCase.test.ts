import { describe, it, expect, vi, beforeEach } from "vitest"
import { FindInactiveCustomersUseCase } from "../../../../src/application/use-cases/retention/FindInactiveCustomersUseCase"
import type { IRetentionRepository } from "../../../../src/domain/repositories/IRetentionRepository"
import { IDS } from "../../../helpers/fixtures"

function mockRetentionRepo(): IRetentionRepository {
  return {
    findInactive: vi.fn().mockResolvedValue([]),
    hasRecentAiMessage: vi.fn().mockResolvedValue(null),
    markOptOut: vi.fn(),
    clearOptOut: vi.fn().mockResolvedValue(true),
    flagSuspectedOptOut: vi.fn().mockResolvedValue("audit-id"),
    findUnreviewedAudits: vi.fn().mockResolvedValue([]),
    setAuditSentiment: vi.fn().mockResolvedValue(undefined),
    countAiMessagesSentToday: vi.fn().mockResolvedValue(0),
  } as unknown as IRetentionRepository
}

describe("FindInactiveCustomersUseCase", () => {
  let repo: IRetentionRepository
  let useCase: FindInactiveCustomersUseCase

  beforeEach(() => {
    repo = mockRetentionRepo()
    useCase = new FindInactiveCustomersUseCase(repo)
  })

  it("falha quando salonId vazio", async () => {
    const result = await useCase.execute({
      salonId: "",
      daysAfterInactivity: 30,
      defaultCycleDays: 30,
      cooldownDays: 14,
    })
    expect(result.success).toBe(false)
  })

  it("falha quando daysAfterInactivity nao positivo", async () => {
    const result = await useCase.execute({
      salonId: IDS.salonId,
      daysAfterInactivity: 0,
      defaultCycleDays: 30,
      cooldownDays: 14,
    })
    expect(result.success).toBe(false)
  })

  it("retorna lista de clientes inativos com nextCursor quando atinge limit", async () => {
    const rows = Array.from({ length: 3 }).map((_, i) => ({
      customerId: `cust-${i}`,
      salonId: IDS.salonId,
      name: `Cliente ${i}`,
      phone: `+55119000000${i}`,
      lastVisitAt: new Date(`2026-02-0${i + 1}T10:00:00Z`),
      lastServiceId: "svc-1",
      lastServiceName: "Corte",
      lastProfessionalId: "prof-1",
      lastProfessionalName: "Joao",
      cycleDaysUsed: 30,
      daysSinceVisit: 50 + i,
    }))
    ;(repo.findInactive as any).mockResolvedValue(rows)

    const result = await useCase.execute({
      salonId: IDS.salonId,
      daysAfterInactivity: 30,
      defaultCycleDays: 30,
      cooldownDays: 14,
      limit: 3,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items.length).toBe(3)
      expect(result.data.items[0].customerId).toBe("cust-0")
      expect(result.data.nextCursor).toBeDefined()
      expect(result.data.nextCursor?.customerId).toBe("cust-2")
    }
  })

  it("nao retorna nextCursor quando resultados < limit", async () => {
    ;(repo.findInactive as any).mockResolvedValue([
      {
        customerId: "cust-0",
        salonId: IDS.salonId,
        name: "Cliente 0",
        phone: "+5511900000000",
        lastVisitAt: null,
        lastServiceId: null,
        lastServiceName: null,
        lastProfessionalId: null,
        lastProfessionalName: null,
        cycleDaysUsed: 30,
        daysSinceVisit: null,
      },
    ])

    const result = await useCase.execute({
      salonId: IDS.salonId,
      daysAfterInactivity: 30,
      defaultCycleDays: 30,
      cooldownDays: 14,
      limit: 50,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items.length).toBe(1)
      expect(result.data.nextCursor).toBeUndefined()
    }
  })

  it("repassa o cursor recebido para o repository", async () => {
    const cursor = { lastVisitAt: new Date("2026-01-01T00:00:00Z"), customerId: "cust-X" }
    await useCase.execute({
      salonId: IDS.salonId,
      daysAfterInactivity: 30,
      defaultCycleDays: 30,
      cooldownDays: 14,
      cursor,
    })
    expect(repo.findInactive).toHaveBeenCalledWith(
      expect.objectContaining({ cursor })
    )
  })
})
