import { describe, it, expect } from "vitest"
import { TimeSlot } from "../../../src/domain/entities/TimeSlot"

function makeSlot(overrides: Partial<{ start: Date; end: Date; available: boolean; professionalId: string }> = {}) {
  return new TimeSlot({
    start: overrides.start ?? new Date("2026-04-01T09:00:00Z"),
    end: overrides.end ?? new Date("2026-04-01T10:00:00Z"),
    available: overrides.available ?? true,
    professionalId: overrides.professionalId,
  })
}

describe("TimeSlot", () => {
  describe("constructor", () => {
    it("cria slot com propriedades corretas", () => {
      const slot = makeSlot()
      expect(slot.start).toEqual(new Date("2026-04-01T09:00:00Z"))
      expect(slot.end).toEqual(new Date("2026-04-01T10:00:00Z"))
      expect(slot.available).toBe(true)
    })

    it("aceita professionalId opcional", () => {
      const slot = makeSlot({ professionalId: "prof-1" })
      expect(slot.professionalId).toBe("prof-1")
    })
  })

  describe("fromTimeStrings", () => {
    it("cria slot a partir de strings de hora e data base", () => {
      const base = new Date("2026-04-01T00:00:00Z")
      const slot = TimeSlot.fromTimeStrings(base, "09:00", "10:00")

      expect(slot.start.getHours()).toBe(9)
      expect(slot.start.getMinutes()).toBe(0)
      expect(slot.end.getHours()).toBe(10)
      expect(slot.end.getMinutes()).toBe(0)
      expect(slot.available).toBe(true)
    })

    it("cria slot indisponível quando available = false", () => {
      const base = new Date("2026-04-01T00:00:00Z")
      const slot = TimeSlot.fromTimeStrings(base, "09:00", "10:00", false)
      expect(slot.available).toBe(false)
    })

    it("aceita professionalId", () => {
      const base = new Date("2026-04-01T00:00:00Z")
      const slot = TimeSlot.fromTimeStrings(base, "09:00", "10:00", true, "prof-1")
      expect(slot.professionalId).toBe("prof-1")
    })
  })

  describe("duration", () => {
    it("calcula duração de 60 minutos", () => {
      const slot = makeSlot()
      expect(slot.duration()).toBe(60)
    })

    it("calcula duração de 30 minutos", () => {
      const slot = makeSlot({ end: new Date("2026-04-01T09:30:00Z") })
      expect(slot.duration()).toBe(30)
    })

    it("calcula duração de 15 minutos", () => {
      const slot = makeSlot({ end: new Date("2026-04-01T09:15:00Z") })
      expect(slot.duration()).toBe(15)
    })
  })

  describe("contains", () => {
    const slot = makeSlot()

    it("retorna true para data no meio do slot", () => {
      expect(slot.contains(new Date("2026-04-01T09:30:00Z"))).toBe(true)
    })

    it("retorna true para data igual ao start (inclusivo)", () => {
      expect(slot.contains(new Date("2026-04-01T09:00:00Z"))).toBe(true)
    })

    it("retorna false para data igual ao end (half-open)", () => {
      expect(slot.contains(new Date("2026-04-01T10:00:00Z"))).toBe(false)
    })

    it("retorna false para data fora do slot", () => {
      expect(slot.contains(new Date("2026-04-01T08:00:00Z"))).toBe(false)
    })
  })

  describe("overlaps", () => {
    const slot = makeSlot()

    it("detecta sobreposição parcial", () => {
      const other = makeSlot({
        start: new Date("2026-04-01T09:30:00Z"),
        end: new Date("2026-04-01T10:30:00Z"),
      })
      expect(slot.overlaps(other)).toBe(true)
    })

    it("retorna false para slots adjacentes", () => {
      const other = makeSlot({
        start: new Date("2026-04-01T10:00:00Z"),
        end: new Date("2026-04-01T11:00:00Z"),
      })
      expect(slot.overlaps(other)).toBe(false)
    })

    it("retorna false para slots separados", () => {
      const other = makeSlot({
        start: new Date("2026-04-01T11:00:00Z"),
        end: new Date("2026-04-01T12:00:00Z"),
      })
      expect(slot.overlaps(other)).toBe(false)
    })
  })

  describe("canFit", () => {
    it("retorna true quando duração é suficiente e disponível", () => {
      const slot = makeSlot() // 60 min, available
      expect(slot.canFit(60)).toBe(true)
      expect(slot.canFit(30)).toBe(true)
    })

    it("retorna false quando duração é insuficiente", () => {
      const slot = makeSlot({ end: new Date("2026-04-01T09:30:00Z") }) // 30 min
      expect(slot.canFit(60)).toBe(false)
    })

    it("retorna false quando indisponível mesmo com duração suficiente", () => {
      const slot = makeSlot({ available: false })
      expect(slot.canFit(30)).toBe(false)
    })
  })

  describe("markAvailable / markUnavailable", () => {
    it("marca como indisponível", () => {
      const slot = makeSlot({ available: true })
      slot.markUnavailable()
      expect(slot.available).toBe(false)
    })

    it("marca como disponível", () => {
      const slot = makeSlot({ available: false })
      slot.markAvailable()
      expect(slot.available).toBe(true)
    })
  })

  describe("equals", () => {
    it("retorna true para slots com mesmo start e end", () => {
      const a = makeSlot()
      const b = makeSlot()
      expect(a.equals(b)).toBe(true)
    })

    it("retorna false para slots diferentes", () => {
      const a = makeSlot()
      const b = makeSlot({ end: new Date("2026-04-01T11:00:00Z") })
      expect(a.equals(b)).toBe(false)
    })
  })

  describe("toString", () => {
    it("inclui status de disponibilidade", () => {
      const available = makeSlot({ available: true })
      expect(available.toString()).toContain("disponível")

      const unavailable = makeSlot({ available: false })
      expect(unavailable.toString()).toContain("ocupado")
    })
  })
})
