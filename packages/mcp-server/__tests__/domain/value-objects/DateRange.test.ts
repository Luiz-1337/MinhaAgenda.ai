import { describe, it, expect } from "vitest"
import { DateRange } from "../../../src/domain/value-objects"

describe("DateRange", () => {
  const d = (iso: string) => new Date(iso)

  describe("constructor", () => {
    it("cria um DateRange válido quando start < end", () => {
      const range = new DateRange(d("2026-04-01T09:00:00Z"), d("2026-04-01T10:00:00Z"))
      expect(range.start).toEqual(d("2026-04-01T09:00:00Z"))
      expect(range.end).toEqual(d("2026-04-01T10:00:00Z"))
    })

    it("aceita start === end (duração zero)", () => {
      const date = d("2026-04-01T09:00:00Z")
      const range = new DateRange(date, date)
      expect(range.duration()).toBe(0)
    })

    it("lança erro quando start > end", () => {
      expect(
        () => new DateRange(d("2026-04-01T10:00:00Z"), d("2026-04-01T09:00:00Z"))
      ).toThrow("Data de início deve ser anterior à data de fim")
    })
  })

  describe("fromTimestamps", () => {
    it("cria DateRange a partir de timestamps", () => {
      const start = new Date("2026-04-01T09:00:00Z").getTime()
      const end = new Date("2026-04-01T10:00:00Z").getTime()
      const range = DateRange.fromTimestamps(start, end)
      expect(range.start.getTime()).toBe(start)
      expect(range.end.getTime()).toBe(end)
    })
  })

  describe("fromIsoStrings", () => {
    it("cria DateRange a partir de strings ISO", () => {
      const range = DateRange.fromIsoStrings("2026-04-01T09:00:00Z", "2026-04-01T10:00:00Z")
      expect(range.start).toEqual(d("2026-04-01T09:00:00Z"))
      expect(range.end).toEqual(d("2026-04-01T10:00:00Z"))
    })
  })

  describe("contains", () => {
    const range = new DateRange(d("2026-04-01T09:00:00Z"), d("2026-04-01T10:00:00Z"))

    it("retorna true para data no meio do intervalo", () => {
      expect(range.contains(d("2026-04-01T09:30:00Z"))).toBe(true)
    })

    it("retorna true para data igual ao start (inclusivo)", () => {
      expect(range.contains(d("2026-04-01T09:00:00Z"))).toBe(true)
    })

    it("retorna true para data igual ao end (inclusivo)", () => {
      expect(range.contains(d("2026-04-01T10:00:00Z"))).toBe(true)
    })

    it("retorna false para data antes do start", () => {
      expect(range.contains(d("2026-04-01T08:59:59Z"))).toBe(false)
    })

    it("retorna false para data depois do end", () => {
      expect(range.contains(d("2026-04-01T10:00:01Z"))).toBe(false)
    })
  })

  describe("overlaps", () => {
    const range = new DateRange(d("2026-04-01T09:00:00Z"), d("2026-04-01T10:00:00Z"))

    it("detecta sobreposição parcial no início", () => {
      const other = new DateRange(d("2026-04-01T08:30:00Z"), d("2026-04-01T09:30:00Z"))
      expect(range.overlaps(other)).toBe(true)
    })

    it("detecta sobreposição parcial no fim", () => {
      const other = new DateRange(d("2026-04-01T09:30:00Z"), d("2026-04-01T10:30:00Z"))
      expect(range.overlaps(other)).toBe(true)
    })

    it("detecta sobreposição total (other dentro de range)", () => {
      const other = new DateRange(d("2026-04-01T09:15:00Z"), d("2026-04-01T09:45:00Z"))
      expect(range.overlaps(other)).toBe(true)
    })

    it("detecta sobreposição total (range dentro de other)", () => {
      const other = new DateRange(d("2026-04-01T08:00:00Z"), d("2026-04-01T11:00:00Z"))
      expect(range.overlaps(other)).toBe(true)
    })

    it("retorna false para intervalos adjacentes (end === start)", () => {
      const other = new DateRange(d("2026-04-01T10:00:00Z"), d("2026-04-01T11:00:00Z"))
      expect(range.overlaps(other)).toBe(false)
    })

    it("retorna false para intervalos separados", () => {
      const other = new DateRange(d("2026-04-01T11:00:00Z"), d("2026-04-01T12:00:00Z"))
      expect(range.overlaps(other)).toBe(false)
    })
  })

  describe("containsRange", () => {
    const range = new DateRange(d("2026-04-01T09:00:00Z"), d("2026-04-01T12:00:00Z"))

    it("retorna true quando other está completamente dentro", () => {
      const other = new DateRange(d("2026-04-01T10:00:00Z"), d("2026-04-01T11:00:00Z"))
      expect(range.containsRange(other)).toBe(true)
    })

    it("retorna true quando other é igual", () => {
      const other = new DateRange(d("2026-04-01T09:00:00Z"), d("2026-04-01T12:00:00Z"))
      expect(range.containsRange(other)).toBe(true)
    })

    it("retorna false quando other ultrapassa o fim", () => {
      const other = new DateRange(d("2026-04-01T10:00:00Z"), d("2026-04-01T13:00:00Z"))
      expect(range.containsRange(other)).toBe(false)
    })

    it("retorna false quando other começa antes", () => {
      const other = new DateRange(d("2026-04-01T08:00:00Z"), d("2026-04-01T11:00:00Z"))
      expect(range.containsRange(other)).toBe(false)
    })
  })

  describe("duration", () => {
    it("calcula duração em minutos corretamente", () => {
      const range = new DateRange(d("2026-04-01T09:00:00Z"), d("2026-04-01T10:30:00Z"))
      expect(range.duration()).toBe(90)
    })
  })

  describe("durationInHours", () => {
    it("calcula duração em horas corretamente", () => {
      const range = new DateRange(d("2026-04-01T09:00:00Z"), d("2026-04-01T10:30:00Z"))
      expect(range.durationInHours()).toBe(1.5)
    })
  })

  describe("equals", () => {
    it("retorna true para ranges iguais", () => {
      const a = new DateRange(d("2026-04-01T09:00:00Z"), d("2026-04-01T10:00:00Z"))
      const b = new DateRange(d("2026-04-01T09:00:00Z"), d("2026-04-01T10:00:00Z"))
      expect(a.equals(b)).toBe(true)
    })

    it("retorna false para ranges diferentes", () => {
      const a = new DateRange(d("2026-04-01T09:00:00Z"), d("2026-04-01T10:00:00Z"))
      const b = new DateRange(d("2026-04-01T09:00:00Z"), d("2026-04-01T11:00:00Z"))
      expect(a.equals(b)).toBe(false)
    })
  })

  describe("toString", () => {
    it("retorna representação ISO", () => {
      const range = new DateRange(d("2026-04-01T09:00:00Z"), d("2026-04-01T10:00:00Z"))
      expect(range.toString()).toContain("2026-04-01")
    })
  })
})
