import { describe, it, expect, vi, beforeEach } from "vitest"
import { GetAvailableSlotsUseCase } from "../../../../src/application/use-cases/availability/GetAvailableSlotsUseCase"
import { CheckAvailabilityUseCase } from "../../../../src/application/use-cases/availability/CheckAvailabilityUseCase"
import { ok, fail } from "../../../../src/shared/types"
import { DomainError } from "../../../../src/domain/errors"
import { IDS } from "../../../helpers/fixtures"

describe("GetAvailableSlotsUseCase", () => {
  let useCase: GetAvailableSlotsUseCase
  let mockCheckAvailability: { execute: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockCheckAvailability = { execute: vi.fn() }
    useCase = new GetAvailableSlotsUseCase(mockCheckAvailability as any)
  })

  it("filtra apenas slots disponíveis", async () => {
    mockCheckAvailability.execute.mockResolvedValue(
      ok({
        date: "15/06/2026",
        dateISO: "2026-06-15",
        professionalId: IDS.professionalId,
        slots: [
          { time: "09:00", available: true },
          { time: "09:30", available: false },
          { time: "10:00", available: true },
          { time: "10:30", available: false },
        ],
        totalAvailable: 2,
        message: "2 horário(s) disponível(is)",
      })
    )

    const result = await useCase.execute({
      salonId: IDS.salonId,
      date: "2026-06-15T12:00:00Z",
      professionalId: IDS.professionalId,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.slots.length).toBe(2)
      expect(result.data.slots.every((s) => s.available)).toBe(true)
      expect(result.data.message).toContain("09:00")
      expect(result.data.message).toContain("10:00")
    }
  })

  it("retorna mensagem 'sem horários' quando nenhum slot disponível", async () => {
    mockCheckAvailability.execute.mockResolvedValue(
      ok({
        date: "15/06/2026",
        dateISO: "2026-06-15",
        slots: [
          { time: "09:00", available: false },
          { time: "09:30", available: false },
        ],
        totalAvailable: 0,
        message: "Não há horários disponíveis nesta data",
      })
    )

    const result = await useCase.execute({
      salonId: IDS.salonId,
      date: "2026-06-15T12:00:00Z",
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.slots.length).toBe(0)
      expect(result.data.message).toContain("Não há horários disponíveis")
    }
  })

  it("propaga erro do CheckAvailabilityUseCase", async () => {
    mockCheckAvailability.execute.mockResolvedValue(
      fail(new DomainError("Erro interno"))
    )

    const result = await useCase.execute({
      salonId: IDS.salonId,
      date: "2026-06-15T12:00:00Z",
    })

    expect(result.success).toBe(false)
  })
})
