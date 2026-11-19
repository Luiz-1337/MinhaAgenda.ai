import { describe, it, expect } from "vitest"
import {
  addBookingDays,
  bookingDayOf,
  bookingDayOfWeek,
  bookingDayStart,
  clockToMinutes,
  computeDaySlots,
  isBookingDay,
  minutesToClock,
  onlineBookingNotBefore,
  onlineBookingWindow,
  planOnlineBookingCustomer,
  toDayMinutes,
} from "@repo/db/src/domain/booking-slots"

/**
 * O cálculo de horários livres da página pública, testado sem banco
 * (docs/ROADMAP.md, fase 7, fatia 7f).
 *
 * O que estes testes seguram: o atendimento inteiro tem que caber no expediente,
 * não encostar no intervalo nem em nada ocupado; o corte de "não antes de"; os
 * horários próprios do serviço; e a régua de dia em Brasília.
 */

const h = (clock: string) => clockToMinutes(clock) as number
const clocks = (minutes: number[]) => minutes.map(minutesToClock)

const day9to18 = { workSpans: [{ start: h("09:00"), end: h("18:00") }], breaks: [], busy: [] }

describe("computeDaySlots", () => {
  it("grade de 15 em 15 minutos, e o atendimento inteiro cabe no expediente", () => {
    const slots = clocks(computeDaySlots({ ...day9to18, workSpans: [{ start: h("09:00"), end: h("10:30") }], duration: 60 }))
    expect(slots).toEqual(["09:00", "09:15", "09:30"])
  })

  it("não oferece horário que ENCOSTA no intervalo — nem começando antes dele", () => {
    const slots = clocks(
      computeDaySlots({
        workSpans: [{ start: h("11:00"), end: h("14:00") }],
        breaks: [{ start: h("12:00"), end: h("13:00") }],
        busy: [],
        duration: 50,
      })
    )
    // 11:15 terminaria 12:05, dentro do almoço: fora. Volta às 13:00.
    expect(slots).toEqual(["11:00", "13:00"])
  })

  it("tira o que está ocupado, inclusive ocupação que vem do dia anterior ou passa da meia-noite", () => {
    const slots = clocks(
      computeDaySlots({
        workSpans: [{ start: h("09:00"), end: h("12:00") }],
        breaks: [],
        busy: [
          { start: -120, end: h("09:30") },
          { start: h("10:30"), end: h("11:00") },
          { start: h("23:00"), end: 1500 },
        ],
        duration: 30,
      })
    )
    expect(slots).toEqual(["09:30", "09:45", "10:00", "11:00", "11:15", "11:30"])
  })

  it("ocupação que só encosta na ponta não tira o horário", () => {
    const slots = clocks(
      computeDaySlots({
        workSpans: [{ start: h("09:00"), end: h("11:00") }],
        breaks: [],
        busy: [{ start: h("10:00"), end: h("11:00") }],
        duration: 60,
      })
    )
    expect(slots).toEqual(["09:00"])
  })

  it("dois períodos de trabalho no dia: nenhum atendimento atravessa o buraco", () => {
    const slots = clocks(
      computeDaySlots({
        workSpans: [
          { start: h("09:00"), end: h("10:00") },
          { start: h("14:00"), end: h("15:00") },
        ],
        breaks: [],
        busy: [],
        duration: 45,
      })
    )
    expect(slots).toEqual(["09:00", "09:15", "14:00", "14:15"])
  })

  it("'não antes de' corta o começo do dia", () => {
    const slots = clocks(
      computeDaySlots({ ...day9to18, workSpans: [{ start: h("09:00"), end: h("11:00") }], duration: 60, notBefore: h("09:20") })
    )
    expect(slots).toEqual(["09:30", "09:45", "10:00"])
  })

  it("serviço com horários próprios: só eles, e só os que cabem e estão livres", () => {
    const slots = clocks(
      computeDaySlots({
        workSpans: [{ start: h("09:00"), end: h("18:00") }],
        breaks: [{ start: h("12:00"), end: h("13:00") }],
        busy: [{ start: h("14:00"), end: h("15:00") }],
        duration: 60,
        discreteStarts: [h("14:00"), h("09:10"), h("12:30"), h("17:30"), h("16:00"), h("09:10")],
      })
    )
    expect(slots).toEqual(["09:10", "16:00"])
  })

  it("sem expediente, com duração inválida ou maior que o período: nada", () => {
    expect(computeDaySlots({ workSpans: [], breaks: [], busy: [], duration: 30 })).toEqual([])
    expect(computeDaySlots({ ...day9to18, duration: 0 })).toEqual([])
    expect(computeDaySlots({ ...day9to18, duration: Number.NaN })).toEqual([])
    expect(computeDaySlots({ ...day9to18, duration: 30, step: 0 })).toEqual([])
    expect(computeDaySlots({ ...day9to18, workSpans: [{ start: h("09:00"), end: h("09:30") }], duration: 45 })).toEqual([])
    // Período invertido é ignorado.
    expect(computeDaySlots({ workSpans: [{ start: h("18:00"), end: h("09:00") }], breaks: [], busy: [], duration: 30 })).toEqual([])
  })
})

describe("a régua do dia, em Brasília", () => {
  it("dia válido e dia da semana", () => {
    expect(isBookingDay("2026-11-18")).toBe(true)
    expect(isBookingDay("2026-02-30")).toBe(false)
    expect(isBookingDay("18/11/2026")).toBe(false)
    expect(isBookingDay(null)).toBe(false)
    // 18/nov/2026 é quarta-feira.
    expect(bookingDayOfWeek("2026-11-18")).toBe(3)
    expect(bookingDayOfWeek("2026-11-22")).toBe(0)
  })

  it("o dia começa às 03:00 UTC, e 23:30 de Brasília ainda é o mesmo dia", () => {
    expect(bookingDayStart("2026-11-18").toISOString()).toBe("2026-11-18T03:00:00.000Z")
    expect(bookingDayOf(new Date("2026-11-19T02:30:00Z"))).toBe("2026-11-18")
    expect(bookingDayOf(new Date("2026-11-19T03:00:00Z"))).toBe("2026-11-19")
    expect(addBookingDays("2026-12-30", 3)).toBe("2027-01-02")
  })

  it("instantes viram minutos do dia, com o fim arredondado para cima", () => {
    const dayStart = bookingDayStart("2026-11-18")
    expect(
      toDayMinutes(dayStart, { start: new Date("2026-11-18T13:00:00Z"), end: new Date("2026-11-18T14:00:30Z") })
    ).toEqual({ start: 600, end: 661 })
    expect(toDayMinutes(dayStart, { start: new Date("2026-11-18T01:00:00Z"), end: new Date("2026-11-18T04:00:00Z") })).toEqual({
      start: -120,
      end: 60,
    })
  })

  it("relógio", () => {
    expect(clockToMinutes("09:05")).toBe(545)
    expect(clockToMinutes("18:00:00")).toBe(1080)
    expect(clockToMinutes("24:00")).toBe(1440)
    expect(clockToMinutes("24:01")).toBeNull()
    expect(clockToMinutes("9h")).toBeNull()
    expect(clockToMinutes(900)).toBeNull()
    expect(minutesToClock(545)).toBe("09:05")
  })
})

describe("o que a página pública aceita", () => {
  // 18/nov/2026, 10:00 em Brasília.
  const now = new Date("2026-11-18T13:00:00Z")

  it("a janela vai de hoje a 30 dias", () => {
    expect(onlineBookingWindow(now)).toEqual({ firstDay: "2026-11-18", lastDay: "2026-12-18" })
  })

  it("hoje, só a partir de uma hora à frente; outro dia, o dia todo; fora da janela, nada", () => {
    expect(onlineBookingNotBefore("2026-11-18", now)).toBe(11 * 60)
    expect(onlineBookingNotBefore("2026-11-19", now)).toBe(0)
    expect(onlineBookingNotBefore("2026-12-18", now)).toBe(0)
    expect(onlineBookingNotBefore("2026-12-19", now)).toBeNull()
    expect(onlineBookingNotBefore("2026-11-17", now)).toBeNull()
    // 23:30 em Brasília: hoje não cabe mais nada.
    expect(onlineBookingNotBefore("2026-11-18", new Date("2026-11-19T02:30:00Z"))).toBeNull()
  })

  it("nome e WhatsApp com DDD", () => {
    expect(planOnlineBookingCustomer({ name: "  Maria   Teste ", phone: "(11) 91234-5678" })).toEqual({
      ok: true,
      name: "Maria Teste",
      phoneDigits: "11912345678",
    })
    expect(planOnlineBookingCustomer({ name: "Maria", phone: "+55 11 91234-5678" })).toMatchObject({
      ok: true,
      phoneDigits: "11912345678",
    })
    expect(planOnlineBookingCustomer({ name: "Maria", phone: "1132345678" })).toMatchObject({ ok: true })

    const error = (name: unknown, phone: unknown) => {
      const plan = planOnlineBookingCustomer({ name, phone })
      return plan.ok ? null : plan.error
    }
    const badPhone = "Informe o seu WhatsApp com DDD. Ex.: (11) 91234-5678"
    expect(error("M", "11912345678")).toBe("Escreva o seu nome")
    expect(error("12345", "11912345678")).toBe("Escreva o seu nome")
    expect(error("x".repeat(81), "11912345678")).toBe("O nome tem até 80 caracteres")
    expect(error("Maria", "912345678")).toBe(badPhone)
    expect(error("Maria", "01912345678")).toBe(badPhone)
    expect(error("Maria", "11999999999")).toBe(badPhone)
    expect(error("Maria", "119123456789")).toBe(badPhone)
    expect(error("Maria", null)).toBe(badPhone)
  })
})
