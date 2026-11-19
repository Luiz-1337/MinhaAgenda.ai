import { describe, it, expect } from "vitest"
import {
  appointmentOrigin,
  buildBirthdayList,
  buildCreationReport,
  buildInactiveList,
  buildOriginReport,
  countByStatus,
  parseAppointmentReportView,
  parseCustomerReportView,
  planBirthdayMonth,
  planInactiveDays,
  type ReportAppointment,
} from "@repo/db/src/domain/agenda-reports"

/**
 * Os relatórios de agendamentos e de clientes, testados sem banco
 * (docs/ROADMAP.md, fase 9, fatia 9c).
 */

const appointment = (over: Partial<ReportAppointment>): ReportAppointment => ({
  id: "a",
  day: "2026-11-20",
  time: "10:00",
  status: "pending",
  customerName: "Cliente Teste",
  serviceName: "Corte",
  professionalName: "Profissional Teste",
  leadSource: null,
  syncSource: "app",
  createdDay: "2026-11-18",
  cancelledDay: null,
  cancelReason: null,
  cancelledByName: null,
  ...over,
})

describe("agendamentos", () => {
  it("conta por situação", () => {
    expect(
      countByStatus([
        appointment({ status: "pending" }),
        appointment({ status: "completed" }),
        appointment({ status: "completed" }),
        appointment({ status: "cancelled" }),
        appointment({ status: "no_show" }),
      ])
    ).toEqual({ pending: 1, confirmed: 0, completed: 2, no_show: 1, cancelled: 1, total: 5 })
    expect(countByStatus([]).total).toBe(0)
  })

  it("origem: o Google vem antes da origem do lead; sem nada, não se sabe", () => {
    expect(appointmentOrigin({ leadSource: "paid_traffic", syncSource: "app" })).toBe("paid_traffic")
    expect(appointmentOrigin({ leadSource: "organic", syncSource: "app" })).toBe("organic")
    expect(appointmentOrigin({ leadSource: "paid_traffic", syncSource: "google" })).toBe("google_calendar")
    expect(appointmentOrigin({ leadSource: null, syncSource: null })).toBe("unknown")
    expect(appointmentOrigin({ leadSource: "outra", syncSource: "app" })).toBe("unknown")
  })

  it("relatório de origem: as quatro linhas, com o comparecimento só do que já teve desfecho", () => {
    const report = buildOriginReport([
      appointment({ leadSource: "paid_traffic", status: "completed" }),
      appointment({ leadSource: "paid_traffic", status: "completed" }),
      appointment({ leadSource: "paid_traffic", status: "no_show" }),
      appointment({ leadSource: "paid_traffic", status: "pending" }),
      appointment({ leadSource: "organic", status: "cancelled" }),
    ])
    expect(report.map((row) => row.origin)).toEqual(["paid_traffic", "organic", "google_calendar", "unknown"])
    expect(report[0]).toEqual({
      origin: "paid_traffic",
      total: 4,
      completed: 2,
      noShow: 1,
      cancelled: 0,
      completionPercent: 66.7,
    })
    expect(report[1]).toMatchObject({ total: 1, cancelled: 1, completionPercent: 0 })
    expect(report[2]).toMatchObject({ total: 0, completionPercent: null })
  })

  it("criação: por dia, faixas de antecedência e a média", () => {
    const report = buildCreationReport([
      appointment({ createdDay: "2026-11-18", day: "2026-11-18" }),
      appointment({ createdDay: "2026-11-18", day: "2026-11-20" }),
      appointment({ createdDay: "2026-11-19", day: "2026-11-26" }),
      appointment({ createdDay: "2026-11-19", day: "2026-12-19" }),
      // Registrado depois do atendimento: conta como no mesmo dia.
      appointment({ createdDay: "2026-11-19", day: "2026-11-17" }),
    ])
    expect(report.days).toEqual([
      { day: "2026-11-18", created: 2 },
      { day: "2026-11-19", created: 3 },
    ])
    expect(report.buckets.map((bucket) => bucket.count)).toEqual([2, 1, 1, 1])
    expect(report.total).toBe(5)
    // (0 + 2 + 7 + 30 + 0) ÷ 5
    expect(report.averageLeadDays).toBe(7.8)
    expect(buildCreationReport([])).toMatchObject({ days: [], total: 0, averageLeadDays: null })
  })

  it("o que não é um relatório cai no primeiro", () => {
    expect(parseAppointmentReportView("origin")).toBe("origin")
    expect(parseAppointmentReportView("x")).toBe("all")
    expect(parseCustomerReportView("inactive")).toBe("inactive")
    expect(parseCustomerReportView(undefined)).toBe("birthdays")
  })
})

describe("clientes", () => {
  it("mês dos aniversariantes: 1 a 12; sem mês válido, o de hoje em Brasília", () => {
    // 01/dez 01:00 UTC ainda é 30/nov em Brasília.
    const now = new Date("2026-12-01T01:00:00Z")
    expect(planBirthdayMonth("3", now)).toBe(3)
    expect(planBirthdayMonth("12", now)).toBe(12)
    expect(planBirthdayMonth("13", now)).toBe(11)
    expect(planBirthdayMonth("0", now)).toBe(11)
    expect(planBirthdayMonth("março", now)).toBe(11)
    expect(planBirthdayMonth(undefined, now)).toBe(11)
  })

  it("aniversariantes pelo dia, com a idade que fazem; nascimento no futuro não entra", () => {
    expect(
      buildBirthdayList(
        [
          { id: "1", name: "Zélia", birthDate: "1990-11-20", phone: "5511900000001" },
          { id: "2", name: "Ana", birthDate: "2000-11-20", phone: null },
          { id: "3", name: "Bia", birthDate: "1985-11-03", phone: null },
          { id: "4", name: "Futuro", birthDate: "2027-11-01", phone: null },
        ],
        2026
      )
    ).toEqual([
      { id: "3", name: "Bia", day: 3, turning: 41, phone: null },
      { id: "2", name: "Ana", day: 20, turning: 26, phone: null },
      { id: "1", name: "Zélia", day: 20, turning: 36, phone: "5511900000001" },
    ])
  })

  it("prazo de inatividade: só as opções; fora delas, 60", () => {
    expect(planInactiveDays("90")).toBe(90)
    expect(planInactiveDays("45")).toBe(60)
    expect(planInactiveDays(undefined)).toBe(60)
  })

  it("inativos: sem horário marcado e fora do prazo; quem sumiu há menos tempo primeiro", () => {
    const customer = (id: string, lastVisit: string, hasUpcoming = false) => ({
      id,
      name: `Cliente ${id}`,
      lastVisit,
      visits: 2,
      hasUpcoming,
      phone: null,
    })
    const rows = buildInactiveList(
      [
        customer("antigo", "2026-05-01"),
        customer("no-limite", "2026-09-20"),
        customer("recente", "2026-09-21"),
        customer("com-horario", "2026-01-01", true),
      ],
      { today: "2026-11-19", days: 60 }
    )
    expect(rows.map((row) => [row.id, row.daysAway])).toEqual([
      ["no-limite", 60],
      ["antigo", 202],
    ])
  })
})
