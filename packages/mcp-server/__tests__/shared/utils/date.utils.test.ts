import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  ensureIsoWithTimezone,
  addMinutes,
  addDays,
  diffInMinutes,
  isValidIsoDateTime,
  isValidIsoDateOrDateTime,
  hasTimezone,
  extractDateOnly,
  timeToMinutes,
  minutesToTime,
  isPast,
  isFuture,
  getDayOfWeekName,
  formatDate,
  formatTime,
  formatDateTime,
} from "../../../src/shared/utils/date.utils"

describe("date.utils", () => {
  describe("ensureIsoWithTimezone", () => {
    it("retorna string com timezone inalterada (Z)", () => {
      expect(ensureIsoWithTimezone("2026-04-01T09:00:00Z")).toBe("2026-04-01T09:00:00Z")
    })

    it("retorna string com timezone inalterada (-03:00)", () => {
      const input = "2026-04-01T09:00:00-03:00"
      expect(ensureIsoWithTimezone(input)).toBe(input)
    })

    it("adiciona -03:00 para datetime sem timezone (com segundos)", () => {
      expect(ensureIsoWithTimezone("2026-04-01T09:00:00")).toBe("2026-04-01T09:00:00-03:00")
    })

    it("adiciona :00-03:00 para datetime sem segundos", () => {
      expect(ensureIsoWithTimezone("2026-04-01T09:00")).toBe("2026-04-01T09:00:00-03:00")
    })

    it("adiciona T09:00:00-03:00 para data apenas", () => {
      expect(ensureIsoWithTimezone("2026-04-01")).toBe("2026-04-01T09:00:00-03:00")
    })

    it("lança erro para tipo não-string", () => {
      expect(() => ensureIsoWithTimezone(123)).toThrow("esperava string")
      expect(() => ensureIsoWithTimezone(null)).toThrow("esperava string")
      expect(() => ensureIsoWithTimezone(undefined)).toThrow("esperava string")
    })

    it("lança erro para formato não reconhecido", () => {
      expect(() => ensureIsoWithTimezone("01/04/2026")).toThrow("Formato de data não reconhecido")
      expect(() => ensureIsoWithTimezone("abc")).toThrow("Formato de data não reconhecido")
    })

    it("remove espaços em branco antes de processar", () => {
      expect(ensureIsoWithTimezone("  2026-04-01T09:00:00Z  ")).toBe("2026-04-01T09:00:00Z")
    })
  })

  describe("addMinutes", () => {
    it("adiciona minutos a uma data", () => {
      const date = new Date("2026-04-01T09:00:00Z")
      const result = addMinutes(date, 30)
      expect(result).toEqual(new Date("2026-04-01T09:30:00Z"))
    })

    it("pode adicionar minutos negativos", () => {
      const date = new Date("2026-04-01T09:30:00Z")
      const result = addMinutes(date, -30)
      expect(result).toEqual(new Date("2026-04-01T09:00:00Z"))
    })
  })

  describe("addDays", () => {
    it("adiciona dias a uma data", () => {
      const date = new Date("2026-04-01T09:00:00Z")
      const result = addDays(date, 5)
      expect(result.getDate()).toBe(6)
    })
  })

  describe("diffInMinutes", () => {
    it("calcula diferença em minutos", () => {
      const start = new Date("2026-04-01T09:00:00Z")
      const end = new Date("2026-04-01T10:30:00Z")
      expect(diffInMinutes(start, end)).toBe(90)
    })
  })

  describe("isValidIsoDateTime", () => {
    it("aceita datetime com timezone Z", () => {
      expect(isValidIsoDateTime("2026-04-01T09:00:00Z")).toBe(true)
    })

    it("aceita datetime com offset", () => {
      expect(isValidIsoDateTime("2026-04-01T09:00:00-03:00")).toBe(true)
    })

    it("aceita datetime sem timezone", () => {
      expect(isValidIsoDateTime("2026-04-01T09:00:00")).toBe(true)
    })

    it("rejeita data apenas", () => {
      expect(isValidIsoDateTime("2026-04-01")).toBe(false)
    })
  })

  describe("isValidIsoDateOrDateTime", () => {
    it("aceita data apenas", () => {
      expect(isValidIsoDateOrDateTime("2026-04-01")).toBe(true)
    })

    it("aceita datetime", () => {
      expect(isValidIsoDateOrDateTime("2026-04-01T09:00:00Z")).toBe(true)
    })

    it("rejeita formato inválido", () => {
      expect(isValidIsoDateOrDateTime("01/04/2026")).toBe(false)
    })
  })

  describe("hasTimezone", () => {
    it("retorna true para Z", () => {
      expect(hasTimezone("2026-04-01T09:00:00Z")).toBe(true)
    })

    it("retorna true para offset", () => {
      expect(hasTimezone("2026-04-01T09:00:00-03:00")).toBe(true)
    })

    it("retorna false sem timezone", () => {
      expect(hasTimezone("2026-04-01T09:00:00")).toBe(false)
    })
  })

  describe("extractDateOnly", () => {
    it("extrai YYYY-MM-DD de um datetime", () => {
      expect(extractDateOnly("2026-04-01T09:00:00Z")).toBe("2026-04-01")
    })
  })

  describe("timeToMinutes", () => {
    it("converte 09:00 para 540", () => {
      expect(timeToMinutes("09:00")).toBe(540)
    })

    it("converte 00:00 para 0", () => {
      expect(timeToMinutes("00:00")).toBe(0)
    })

    it("converte 23:59 para 1439", () => {
      expect(timeToMinutes("23:59")).toBe(1439)
    })
  })

  describe("minutesToTime", () => {
    it("converte 540 para 09:00", () => {
      expect(minutesToTime(540)).toBe("09:00")
    })

    it("converte 0 para 00:00", () => {
      expect(minutesToTime(0)).toBe("00:00")
    })

    it("converte 1439 para 23:59", () => {
      expect(minutesToTime(1439)).toBe("23:59")
    })
  })

  describe("isPast / isFuture", () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-06-01T12:00:00Z"))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("isPast retorna true para data passada", () => {
      expect(isPast(new Date("2026-05-01T12:00:00Z"))).toBe(true)
    })

    it("isPast retorna false para data futura", () => {
      expect(isPast(new Date("2026-07-01T12:00:00Z"))).toBe(false)
    })

    it("isFuture retorna true para data futura", () => {
      expect(isFuture(new Date("2026-07-01T12:00:00Z"))).toBe(true)
    })

    it("isFuture retorna false para data passada", () => {
      expect(isFuture(new Date("2026-05-01T12:00:00Z"))).toBe(false)
    })
  })

  describe("getDayOfWeekName", () => {
    it("retorna nomes corretos", () => {
      expect(getDayOfWeekName(0)).toBe("Domingo")
      expect(getDayOfWeekName(1)).toBe("Segunda-feira")
      expect(getDayOfWeekName(6)).toBe("Sábado")
    })

    it("retorna string vazia para índice inválido", () => {
      expect(getDayOfWeekName(7)).toBe("")
    })
  })

  describe("formatDate", () => {
    it("formata data no padrão DD/MM/YYYY", () => {
      // toBrazilTime é mockado como identity no setup
      const result = formatDate(new Date("2026-04-01T12:00:00Z"))
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    })
  })

  describe("formatTime", () => {
    it("formata hora no padrão HH:mm", () => {
      const result = formatTime(new Date("2026-04-01T14:30:00Z"))
      expect(result).toMatch(/^\d{2}:\d{2}$/)
    })
  })

  describe("formatDateTime", () => {
    it("combina data e hora com 'às'", () => {
      const result = formatDateTime(new Date("2026-04-01T14:30:00Z"))
      expect(result).toContain("às")
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}$/)
    })
  })
})
