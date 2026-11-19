import { describe, it, expect } from "vitest"
import {
  buildProfessionalPanel,
  countWeekdays,
  weeklyWorkMinutes,
  type PanelAvailability,
  type PanelSaleItem,
} from "@repo/db/src/domain/professional-panel"

/**
 * O painel de profissionais, testado sem banco (docs/ROADMAP.md, fase 9, fatia 9e).
 *
 * O que estes testes seguram: o expediente desconta os intervalos, a ocupação é
 * tempo marcado ÷ expediente nos dias do período, e os totais do salão não
 * contam duas vezes o cliente que passou por dois profissionais.
 */

const rule = (over: Partial<PanelAvailability>): PanelAvailability => ({
  professionalId: "p1",
  dayOfWeek: 1,
  startTime: "09:00:00",
  endTime: "18:00:00",
  isBreak: false,
  ...over,
})

const item = (over: Partial<PanelSaleItem>): PanelSaleItem => ({
  professionalId: "p1",
  saleId: "s1",
  customerId: "c1",
  kind: "service",
  totalCents: 10000,
  ...over,
})

describe("dias e expediente", () => {
  it("conta cada dia da semana do período", () => {
    // 16 a 22/nov/2026: de segunda a domingo, um de cada.
    expect(countWeekdays("2026-11-16", "2026-11-22")).toEqual([1, 1, 1, 1, 1, 1, 1])
    // 01 a 30/nov/2026 começa num domingo: 5 domingos e 5 segundas.
    expect(countWeekdays("2026-11-01", "2026-11-30")).toEqual([5, 5, 4, 4, 4, 4, 4])
    expect(countWeekdays("2026-11-18", "2026-11-18")).toEqual([0, 0, 0, 1, 0, 0, 0])
    expect(countWeekdays("2026-11-19", "2026-11-18")).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it("expediente menos intervalo; períodos sobrepostos não contam duas vezes", () => {
    const minutes = weeklyWorkMinutes([
      rule({ dayOfWeek: 1 }),
      rule({ dayOfWeek: 1, startTime: "12:00", endTime: "13:00", isBreak: true }),
      rule({ dayOfWeek: 2, startTime: "09:00", endTime: "12:00" }),
      rule({ dayOfWeek: 2, startTime: "11:00", endTime: "14:00" }),
      // Intervalo fora do expediente não tira nada; linha invertida é ignorada.
      rule({ dayOfWeek: 3, startTime: "10:00", endTime: "12:00" }),
      rule({ dayOfWeek: 3, startTime: "20:00", endTime: "21:00", isBreak: true }),
      rule({ dayOfWeek: 4, startTime: "18:00", endTime: "09:00" }),
    ])
    expect(minutes).toEqual([0, 480, 300, 120, 0, 0, 0])
  })
})

describe("buildProfessionalPanel", () => {
  const professionals = [
    { id: "p1", name: "Ana", isActive: true },
    { id: "p2", name: "Bia", isActive: true },
    { id: "p3", name: "Saiu", isActive: false },
  ]

  it("valor, clientes únicos, ticket, frequência e ocupação de cada um", () => {
    const panel = buildProfessionalPanel({
      professionals,
      items: [
        item({ saleId: "s1", customerId: "c1", totalCents: 10000 }),
        item({ saleId: "s1", customerId: "c1", kind: "product", totalCents: 2000 }),
        item({ saleId: "s2", customerId: "c1", totalCents: 8000 }),
        item({ saleId: "s3", customerId: "c2", totalCents: 4000 }),
        // Pacote não é serviço executado: fica de fora.
        item({ saleId: "s4", customerId: "c3", kind: "package", totalCents: 90000 }),
        item({ professionalId: "p2", saleId: "s1", customerId: "c1", totalCents: 30000 }),
      ],
      appointments: [
        { professionalId: "p1", minutes: 60 },
        { professionalId: "p1", minutes: 60 },
        { professionalId: "p2", minutes: 240 },
      ],
      // Ana e Bia trabalham na segunda, das 9h às 18h, com uma hora de almoço: 8h.
      availability: [
        rule({ professionalId: "p1" }),
        rule({ professionalId: "p1", startTime: "12:00", endTime: "13:00", isBreak: true }),
        rule({ professionalId: "p2" }),
        rule({ professionalId: "p2", startTime: "12:00", endTime: "13:00", isBreak: true }),
      ],
      // Uma semana: uma segunda-feira.
      from: "2026-11-16",
      to: "2026-11-22",
    })

    expect(panel.rows.map((row) => row.name)).toEqual(["Bia", "Ana"])
    expect(panel.rows[1]).toEqual({
      professionalId: "p1",
      name: "Ana",
      isActive: true,
      uniqueCustomers: 2,
      sales: 3,
      revenueCents: 24000,
      averageTicketCents: 8000,
      frequency: 1.5,
      appointments: 2,
      bookedMinutes: 120,
      availableMinutes: 480,
      occupancyPercent: 25,
      lowOccupancy: true,
    })
    expect(panel.rows[0]).toMatchObject({ revenueCents: 30000, occupancyPercent: 50, lowOccupancy: false })

    // O salão: c1 e c2 (o cliente da Bia é o mesmo c1), três comandas.
    expect(panel.totals).toEqual({
      uniqueCustomers: 2,
      sales: 3,
      revenueCents: 54000,
      averageTicketCents: 18000,
      bookedMinutes: 360,
      availableMinutes: 960,
      occupancyPercent: 37.5,
    })
  })

  it("inativo só entra se teve movimento; sem expediente, a ocupação fica em branco", () => {
    const base = { professionals, availability: [], from: "2026-11-16", to: "2026-11-22" }

    const quiet = buildProfessionalPanel({ ...base, items: [], appointments: [] })
    expect(quiet.rows.map((row) => row.professionalId)).toEqual(["p1", "p2"])
    expect(quiet.rows[0]).toMatchObject({
      revenueCents: 0,
      averageTicketCents: null,
      frequency: null,
      occupancyPercent: null,
      lowOccupancy: false,
    })
    expect(quiet.totals).toMatchObject({ uniqueCustomers: 0, averageTicketCents: null, occupancyPercent: null })

    const withInactive = buildProfessionalPanel({
      ...base,
      items: [item({ professionalId: "p3" })],
      appointments: [],
    })
    expect(withInactive.rows[0]).toMatchObject({ professionalId: "p3", isActive: false, revenueCents: 10000 })
  })
})
