import { describe, it, expect } from "vitest"
import {
  buildOrganizationUnits,
  groupOrganizationMembers,
  type OrganizationProfessional,
  type OrganizationUnitInput,
} from "@repo/db/src/domain/organization"

/**
 * A tela Organização, testada sem banco (docs/ROADMAP.md, fase 9, fatia 9g,
 * caminho A).
 *
 * O que estes testes seguram: as unidades somam certo e a mesma pessoa em duas
 * unidades vira uma linha só na equipe.
 */

const unit = (over: Partial<OrganizationUnitInput> & { salonId: string }): OrganizationUnitInput => ({
  name: `Unidade ${over.salonId}`,
  sales: 0,
  revenueCents: 0,
  buyers: 0,
  appointments: 0,
  customers: 0,
  professionals: 0,
  ...over,
})

const professional = (over: Partial<OrganizationProfessional> & { id: string; salonId: string }): OrganizationProfessional => ({
  salonName: `Unidade ${over.salonId}`,
  name: "Pessoa Teste",
  email: "pessoa@exemplo.test",
  role: "STAFF",
  isActive: true,
  userId: null,
  personKey: null,
  ...over,
})

describe("buildOrganizationUnits", () => {
  it("a que mais faturou primeiro, com ticket, parte do total e a soma", () => {
    const { rows, totals } = buildOrganizationUnits([
      unit({ salonId: "a", sales: 10, revenueCents: 100000, buyers: 8, appointments: 20, customers: 50, professionals: 3 }),
      unit({ salonId: "b", sales: 30, revenueCents: 300000, buyers: 25, appointments: 40, customers: 90, professionals: 5 }),
    ])
    expect(rows.map((row) => [row.salonId, row.averageTicketCents, row.sharePercent])).toEqual([
      ["b", 10000, 75],
      ["a", 10000, 25],
    ])
    expect(totals).toEqual({
      sales: 40,
      revenueCents: 400000,
      buyers: 33,
      appointments: 60,
      customers: 140,
      professionals: 8,
      averageTicketCents: 10000,
    })
  })

  it("sem comanda: ticket e parte em branco, não zero", () => {
    const { rows, totals } = buildOrganizationUnits([unit({ salonId: "a" }), unit({ salonId: "b", appointments: 3 })])
    expect(rows[0]).toMatchObject({ averageTicketCents: null, sharePercent: null })
    expect(totals).toMatchObject({ revenueCents: 0, averageTicketCents: null, appointments: 3 })
    expect(buildOrganizationUnits([]).rows).toEqual([])
  })
})

describe("groupOrganizationMembers", () => {
  it("mesmo login em duas unidades é uma pessoa só, e vem primeiro", () => {
    const members = groupOrganizationMembers([
      professional({ id: "1", salonId: "a", name: "Zeca", email: "zeca@exemplo.test" }),
      professional({ id: "2", salonId: "a", name: "Ana", email: "ana@exemplo.test", userId: "u1", role: "OWNER" }),
      professional({ id: "3", salonId: "b", name: "Ana", email: "ana.b@exemplo.test", userId: "u1", role: "MANAGER", isActive: false }),
    ])
    expect(members.map((member) => member.name)).toEqual(["Ana", "Zeca"])
    expect(members[0]).toMatchObject({ key: "user:u1", hasLogin: true })
    expect(members[0].units).toEqual([
      { salonId: "a", salonName: "Unidade a", professionalId: "2", role: "OWNER", isActive: true },
      { salonId: "b", salonName: "Unidade b", professionalId: "3", role: "MANAGER", isActive: false },
    ])
    expect(members[1]).toMatchObject({ hasLogin: false, units: [{ salonId: "a" }] })
  })

  it("junta pela chave de pessoa e pelo e-mail, sem diferença de maiúscula", () => {
    const members = groupOrganizationMembers([
      professional({ id: "1", salonId: "a", email: "Bia@Exemplo.test", personKey: "k1" }),
      professional({ id: "2", salonId: "b", email: "outro@exemplo.test", personKey: "k1" }),
      professional({ id: "3", salonId: "c", email: " bia@exemplo.test " }),
    ])
    expect(members).toHaveLength(1)
    expect(members[0].units.map((unit) => unit.salonId)).toEqual(["a", "b", "c"])
  })

  it("e-mails diferentes, sem login nem chave: pessoas diferentes", () => {
    const members = groupOrganizationMembers([
      professional({ id: "1", salonId: "a", name: "Um", email: "um@exemplo.test" }),
      professional({ id: "2", salonId: "b", name: "Dois", email: "dois@exemplo.test" }),
      professional({ id: "3", salonId: "b", name: "Sem e-mail", email: "" }),
    ])
    expect(members.map((member) => member.name)).toEqual(["Dois", "Sem e-mail", "Um"])
    expect(members.find((member) => member.name === "Sem e-mail")?.key).toBe("professional:3")
  })
})
