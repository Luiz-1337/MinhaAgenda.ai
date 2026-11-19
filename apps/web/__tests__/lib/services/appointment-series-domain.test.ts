import { describe, it, expect } from "vitest"
import {
  addCalendarDays,
  describeSeriesOutcome,
  planAppointmentSeries,
  seriesDateLabel,
} from "@repo/db/src/domain/appointment-series"

/**
 * A regra da recorrência de agendamento, testada sem banco (docs/ROADMAP.md,
 * fase 7, fatia 7c).
 *
 * O que estes testes seguram: a série cai sempre no mesmo dia da semana e na mesma
 * hora — inclusive atravessando mês, ano e fevereiro —, e o resumo não esconde as
 * datas que não couberam.
 */

describe("addCalendarDays", () => {
  it("vira o mês e o ano", () => {
    expect(addCalendarDays("2026-11-27", 7)).toBe("2026-12-04")
    expect(addCalendarDays("2026-12-25", 7)).toBe("2027-01-01")
    expect(addCalendarDays("2026-11-20", 0)).toBe("2026-11-20")
  })

  it("respeita fevereiro, bissexto ou não", () => {
    expect(addCalendarDays("2027-02-22", 7)).toBe("2027-03-01")
    expect(addCalendarDays("2028-02-22", 7)).toBe("2028-02-29")
  })
})

describe("planAppointmentSeries", () => {
  it("toda semana, mesma hora: as datas andam de 7 em 7 dias", () => {
    expect(planAppointmentSeries({ start: "2026-11-20T15:00", intervalWeeks: 1, occurrences: 4 })).toEqual({
      ok: true,
      intervalWeeks: 1,
      occurrences: 4,
      dates: ["2026-11-20T15:00", "2026-11-27T15:00", "2026-12-04T15:00", "2026-12-11T15:00"],
    })
  })

  it("a cada 4 semanas, atravessando o ano, cai sempre no mesmo dia da semana", () => {
    const plan = planAppointmentSeries({ start: "2026-12-04T09:30", intervalWeeks: 4, occurrences: 3 })
    expect(plan).toMatchObject({
      ok: true,
      dates: ["2026-12-04T09:30", "2027-01-01T09:30", "2027-01-29T09:30"],
    })
    if (plan.ok) {
      const weekdays = plan.dates.map((date) => new Date(`${date}:00Z`).getUTCDay())
      expect(new Set(weekdays).size).toBe(1)
    }
  })

  it("recusa data ou hora impossível e formato fora do padrão", () => {
    for (const start of ["2026-02-30T10:00", "2026-11-20T24:00", "2026-11-20T10:60", "2026-11-20", "20/11/2026 10:00", "", null]) {
      expect(planAppointmentSeries({ start, intervalWeeks: 1, occurrences: 2 })).toEqual({
        ok: false,
        error: "Data e hora inválidas",
      })
    }
  })

  it("o intervalo é de 1 a 8 semanas, inteiro", () => {
    const plan = (intervalWeeks: unknown) =>
      planAppointmentSeries({ start: "2026-11-20T15:00", intervalWeeks, occurrences: 2 }).ok
    expect(plan(0)).toBe(false)
    expect(plan(1)).toBe(true)
    expect(plan(8)).toBe(true)
    expect(plan(9)).toBe(false)
    expect(plan(1.5)).toBe(false)
    expect(plan("2")).toBe(false)
  })

  it("são de 2 a 12 vezes, contando a primeira", () => {
    const plan = (occurrences: unknown) =>
      planAppointmentSeries({ start: "2026-11-20T15:00", intervalWeeks: 1, occurrences }).ok
    expect(plan(1)).toBe(false)
    expect(plan(2)).toBe(true)
    expect(plan(12)).toBe(true)
    expect(plan(13)).toBe(false)
    expect(plan(Number.NaN)).toBe(false)
  })
})

describe("describeSeriesOutcome", () => {
  it("tudo coube", () => {
    expect(
      describeSeriesOutcome({ created: [{ date: "2026-11-20T15:00" }, { date: "2026-11-27T15:00" }], failed: [] })
    ).toBe("2 agendamentos criados")
  })

  it("lista as datas que não couberam, com o motivo de cada uma", () => {
    expect(
      describeSeriesOutcome({
        created: [{ date: "2026-11-20T15:00" }],
        failed: [
          { date: "2026-11-27T15:00", error: "Horário indisponível" },
          { date: "2026-12-04T15:00", error: "Fora do expediente" },
        ],
      })
    ).toBe(
      "1 agendamento criado. Não couberam: 27/11/2026 (Horário indisponível); 04/12/2026 (Fora do expediente)"
    )
  })

  it("uma só fora: singular", () => {
    expect(
      describeSeriesOutcome({
        created: [{ date: "2026-11-20T15:00" }, { date: "2026-12-04T15:00" }],
        failed: [{ date: "2026-11-27T15:00", error: "Horário indisponível" }],
      })
    ).toBe("2 agendamentos criados. Não coube: 27/11/2026 (Horário indisponível)")
  })

  it("a data do rótulo é dd/mm/aaaa", () => {
    expect(seriesDateLabel("2027-01-01T09:30")).toBe("01/01/2027")
  })
})
