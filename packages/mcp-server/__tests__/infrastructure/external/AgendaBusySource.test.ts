import { describe, it, expect, vi } from "vitest"
import { domainServices } from "@repo/db"

import { AgendaBusySource } from "../../../src/infrastructure/external/agenda"

const SALON_A = "salon-a"
const SALON_B = "salon-b"
const PRO = "pro-1"
const dayStart = new Date("2026-11-10T03:00:00.000Z")
const dayEnd = new Date("2026-11-11T02:59:59.999Z")

describe("AgendaBusySource — ocupado da agenda oficial para a disponibilidade da IA", () => {
  it("converte os períodos ocupados em TimeSlots indisponíveis do profissional", async () => {
    vi.mocked(domainServices.getAgendaBusyIntervals).mockResolvedValue([
      { start: new Date("2026-11-10T13:00:00.000Z"), end: new Date("2026-11-10T14:00:00.000Z") },
    ])

    const slots = await new AgendaBusySource().getBusySlots(SALON_A, PRO, dayStart, dayEnd)

    expect(domainServices.getAgendaBusyIntervals).toHaveBeenCalledWith(SALON_A, PRO, dayStart, dayEnd)
    expect(slots).toHaveLength(1)
    expect(slots[0].available).toBe(false)
    expect(slots[0].professionalId).toBe(PRO)
    expect(slots[0].start.toISOString()).toBe("2026-11-10T13:00:00.000Z")
  })

  it("é sem estado: chamadas intercaladas de dois salões consultam cada uma o seu", async () => {
    vi.mocked(domainServices.hasActiveAgendaProvider).mockResolvedValue(true)
    vi.mocked(domainServices.getAgendaBusyIntervals).mockResolvedValue([])
    const source = new AgendaBusySource()

    // O padrão que o GoogleCalendarService (mcp) quebra: isConfigured de um
    // salão seguido do getFreeBusy de outro na MESMA instância singleton.
    await source.isConfigured(SALON_A)
    await source.isConfigured(SALON_B)
    await source.getBusySlots(SALON_A, PRO, dayStart, dayEnd)

    expect(domainServices.getAgendaBusyIntervals).toHaveBeenCalledWith(SALON_A, PRO, dayStart, dayEnd)
  })

  it("isConfigured delega ao @repo/db", async () => {
    vi.mocked(domainServices.hasActiveAgendaProvider).mockResolvedValue(false)

    await expect(new AgendaBusySource().isConfigured(SALON_A)).resolves.toBe(false)
    expect(domainServices.hasActiveAgendaProvider).toHaveBeenCalledWith(SALON_A)
  })
})
