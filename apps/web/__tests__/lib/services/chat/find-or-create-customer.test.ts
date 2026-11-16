/**
 * Entrada de mensagem do WhatsApp: achar o cliente pelo telefone, ou criar.
 *
 * Em 12/nov/2026 o Spettacolo Salone tinha quatro pessoas em dois cadastros cada:
 * o do painel, com o telefone sem o 55 ("11900002222") e com o agendamento, e o
 * do WhatsApp ("5511900002222"), criado aqui porque a busca comparava o texto
 * exato. Falando com o segundo, a IA não enxergava o agendamento do primeiro.
 * Os números e o nome usados aqui são fictícios.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  insertValues: vi.fn(),
  adoptCustomerByPhone: vi.fn(),
  recordCustomerLeadSource: vi.fn(),
}))

vi.mock("@repo/db", () => ({
  db: {
    query: { customers: { findFirst: h.findFirst } },
    insert: vi.fn(() => ({
      values: (values: unknown) => {
        h.insertValues(values)
        return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }
      },
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
  },
  customers: { salonId: "salon_id", phone: "phone", id: "id" },
  chats: {},
  messages: {},
  salons: {},
  profiles: {},
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  sql: vi.fn(),
  BRAZIL_TIMEZONE: "America/Sao_Paulo",
  domainServices: {
    adoptCustomerByPhone: h.adoptCustomerByPhone,
    recordCustomerLeadSource: h.recordCustomerLeadSource,
  },
}))

const { findOrCreateCustomer, recordLeadSource } = await import("@/lib/services/chat.service")

const SALON = "d4067a85-0c76-42d0-94c8-448f0ed21fcd"
const WHATSAPP_PHONE = "5511900002222"

beforeEach(() => {
  vi.clearAllMocks()
  h.adoptCustomerByPhone.mockResolvedValue(null)
})

describe("findOrCreateCustomer", () => {
  it("telefone idêntico já cadastrado → devolve o cliente, sem procurar em outro formato", async () => {
    h.findFirst.mockResolvedValue({ id: "c-1", name: "Carla Mendes Rocha" })

    const customer = await findOrCreateCustomer(WHATSAPP_PHONE, SALON, "Camila")

    expect(customer).toEqual({ id: "c-1", name: "Carla Mendes Rocha" })
    expect(h.adoptCustomerByPhone).not.toHaveBeenCalled()
    expect(h.insertValues).not.toHaveBeenCalled()
  })

  it("caso real: o contato do painel (telefone sem o 55) é reaproveitado — não nasce um segundo cadastro", async () => {
    h.findFirst.mockResolvedValue(undefined)
    h.adoptCustomerByPhone.mockResolvedValue({ id: "painel", name: "Carla Mendes Rocha", phone: WHATSAPP_PHONE })

    const customer = await findOrCreateCustomer(`+${WHATSAPP_PHONE}`, SALON, "Camila")

    expect(h.adoptCustomerByPhone).toHaveBeenCalledWith({ salonId: SALON, phone: WHATSAPP_PHONE })
    expect(customer).toEqual({ id: "painel", name: "Carla Mendes Rocha" })
    expect(h.insertValues).not.toHaveBeenCalled()
  })

  it("ninguém com esse número, em formato nenhum → cria com o nome do perfil", async () => {
    h.findFirst
      .mockResolvedValueOnce(undefined) // busca exata
      .mockResolvedValueOnce({ id: "novo", name: "Sil" }) // releitura depois do insert

    const customer = await findOrCreateCustomer(WHATSAPP_PHONE, SALON, "Sil")

    expect(h.insertValues).toHaveBeenCalledWith({ salonId: SALON, name: "Sil", phone: WHATSAPP_PHONE })
    expect(customer).toEqual({ id: "novo", name: "Sil" })
  })

  it("a busca em outro formato falha → a mensagem não se perde: cria como antes", async () => {
    h.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "novo", name: "Sil" })
    h.adoptCustomerByPhone.mockRejectedValue(new Error("banco fora do ar"))

    const customer = await findOrCreateCustomer(WHATSAPP_PHONE, SALON, "Sil")

    expect(customer).toEqual({ id: "novo", name: "Sil" })
    expect(h.insertValues).toHaveBeenCalled()
  })

  it("o nome do perfil não sobrescreve o nome do contato reaproveitado", async () => {
    h.findFirst.mockResolvedValue(undefined)
    h.adoptCustomerByPhone.mockResolvedValue({ id: "painel", name: "Carla Mendes Rocha", phone: WHATSAPP_PHONE })

    const customer = await findOrCreateCustomer(WHATSAPP_PHONE, SALON, "Cami 💇‍♀️")

    expect(customer.name).toBe("Carla Mendes Rocha")
  })
})

describe("recordLeadSource — a origem do lead nunca derruba a entrada da mensagem", () => {
  it("grava a origem classificada pelo canal", async () => {
    h.recordCustomerLeadSource.mockResolvedValue(undefined)

    await recordLeadSource({ salonId: SALON, customerId: "c-1", incoming: "paid_traffic" })

    expect(h.recordCustomerLeadSource).toHaveBeenCalledWith({ salonId: SALON, customerId: "c-1", source: "paid_traffic" })
  })

  it("a gravação falha (ex.: coluna ainda não existe) → não lança", async () => {
    h.recordCustomerLeadSource.mockRejectedValue(new Error('column "lead_source" does not exist'))

    await expect(recordLeadSource({ salonId: SALON, customerId: "c-1", incoming: "organic" })).resolves.toBeUndefined()
  })
})
