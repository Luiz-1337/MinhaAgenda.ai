import { describe, it, expect } from "vitest"
import {
  customerFirstName,
  decideCareDispatch,
  isPreCareDue,
  isWithinCareSendHours,
  planCareMessageRule,
  renderCareMessage,
  reviewMessageSchedule,
  saleMessageSchedule,
  toWhatsAppNumber,
  type CareDispatchContext,
} from "@repo/db/src/domain/care-messages"

/**
 * A regra das mensagens de cuidados e de retorno, testada sem banco
 * (docs/ROADMAP.md, fase 6, fatia 6d).
 *
 * O que estes testes seguram: a mensagem só sai quando ainda faz sentido. Quem
 * pediu para não receber não recebe, comanda antiga não dispara cuidado atrasado,
 * agendamento cancelado não recebe preparo e quem já remarcou não é chamado de
 * volta.
 */

const SERVICE = "11111111-1111-4111-8111-111111111111"
const PRODUCT = "22222222-2222-4222-8222-222222222222"

describe("planCareMessageRule", () => {
  it("aceita a mensagem de um serviço, sem espaço nas pontas", () => {
    expect(
      planCareMessageRule({ kind: "post_care", serviceId: SERVICE, offsetDays: 0, message: "  Evite lavar hoje.  " })
    ).toEqual({
      ok: true,
      rule: {
        kind: "post_care",
        serviceId: SERVICE,
        productId: null,
        offsetDays: 0,
        message: "Evite lavar hoje.",
        isActive: true,
      },
    })
  })

  it("é de um serviço OU de um produto, nunca dos dois nem de nenhum", () => {
    const base = { kind: "return", offsetDays: 30, message: "Volte!" }
    expect(planCareMessageRule({ ...base }).ok).toBe(false)
    expect(planCareMessageRule({ ...base, serviceId: SERVICE, productId: PRODUCT }).ok).toBe(false)
    expect(planCareMessageRule({ ...base, productId: PRODUCT }).ok).toBe(true)
  })

  it("cuidados de antes só valem para serviço", () => {
    expect(planCareMessageRule({ kind: "pre_care", productId: PRODUCT, offsetDays: 1, message: "x" })).toEqual({
      ok: false,
      error: "Cuidados antes do atendimento só valem para serviço",
    })
    expect(planCareMessageRule({ kind: "pre_care", serviceId: SERVICE, offsetDays: 1, message: "x" }).ok).toBe(true)
  })

  it("cada tipo tem o seu limite de dias", () => {
    const rule = (kind: string, offsetDays: unknown) =>
      planCareMessageRule({ kind, serviceId: SERVICE, offsetDays, message: "x" }).ok

    expect(rule("pre_care", 0)).toBe(false)
    expect(rule("pre_care", 30)).toBe(true)
    expect(rule("pre_care", 31)).toBe(false)
    expect(rule("post_care", 0)).toBe(true)
    expect(rule("post_care", 31)).toBe(false)
    expect(rule("return", 0)).toBe(false)
    expect(rule("return", 365)).toBe(true)
    expect(rule("return", 366)).toBe(false)
    expect(rule("return", 1.5)).toBe(false)
    expect(rule("return", "30")).toBe(false)
  })

  it("recusa tipo desconhecido, mensagem vazia e mensagem longa demais", () => {
    expect(planCareMessageRule({ kind: "promo", serviceId: SERVICE, offsetDays: 1, message: "x" }).ok).toBe(false)
    expect(planCareMessageRule({ kind: "return", serviceId: SERVICE, offsetDays: 1, message: "   " }).ok).toBe(false)
    expect(planCareMessageRule({ kind: "return", serviceId: SERVICE, offsetDays: 1, message: "a".repeat(1001) }).ok).toBe(
      false
    )
    expect(planCareMessageRule({ kind: "return", serviceId: SERVICE, offsetDays: 1, message: "a".repeat(1000) }).ok).toBe(
      true
    )
  })
})

describe("renderCareMessage", () => {
  it("troca cliente (primeiro nome), salão, item e link", () => {
    expect(
      renderCareMessage("Oi, {cliente}! Sobre {item} no {salao}: {link}", {
        customerName: "Maria Teste da Silva",
        salonName: "Salão Exemplo",
        itemName: "Coloração",
        link: "https://exemplo.test/avaliar/abc",
      })
    ).toBe("Oi, Maria! Sobre Coloração no Salão Exemplo: https://exemplo.test/avaliar/abc")
  })

  it("variável sem valor ou desconhecida fica como está", () => {
    expect(renderCareMessage("{cliente}, veja {link} e {outra}", { customerName: "Ana", salonName: "S" })).toBe(
      "Ana, veja {link} e {outra}"
    )
  })

  it("cliente sem nome vira 'cliente'", () => {
    expect(customerFirstName("  ")).toBe("cliente")
    expect(customerFirstName(null)).toBe("cliente")
    expect(customerFirstName("  Bia  Souza")).toBe("Bia")
  })
})

describe("quando a mensagem sai", () => {
  const now = new Date("2026-11-17T15:00:00Z")
  const day = 24 * 60 * 60 * 1000

  it("comanda de hoje: N dias depois do dia da comanda", () => {
    const saleDate = new Date("2026-11-17T14:00:00Z")
    expect(saleMessageSchedule({ saleDate, offsetDays: 30, now })).toEqual(new Date(saleDate.getTime() + 30 * day))
  })

  it("0 dias, ou hora que acabou de passar: sai agora", () => {
    const saleDate = new Date("2026-11-17T14:00:00Z")
    expect(saleMessageSchedule({ saleDate, offsetDays: 0, now })).toEqual(now)
  })

  it("comanda lançada com data antiga: mensagem vencida há mais de um dia não sai", () => {
    const saleDate = new Date("2026-11-10T14:00:00Z")
    expect(saleMessageSchedule({ saleDate, offsetDays: 2, now })).toBeNull()
    // Mas o retorno de 30 dias ainda está no futuro.
    expect(saleMessageSchedule({ saleDate, offsetDays: 30, now })).toEqual(new Date(saleDate.getTime() + 30 * day))
  })

  it("o pedido de avaliação sai N horas depois de faturar", () => {
    expect(reviewMessageSchedule({ now, delayHours: 2 })).toEqual(new Date("2026-11-17T17:00:00Z"))
    expect(reviewMessageSchedule({ now, delayHours: 0 })).toEqual(now)
  })

  it("cuidados de antes: dentro da janela de N dias, e só antes do horário", () => {
    const appointmentAt = new Date("2026-11-19T15:00:00Z")
    expect(isPreCareDue({ appointmentAt, offsetDays: 2, now })).toBe(true)
    expect(isPreCareDue({ appointmentAt, offsetDays: 1, now })).toBe(false)
    expect(isPreCareDue({ appointmentAt: new Date("2026-11-17T14:00:00Z"), offsetDays: 2, now })).toBe(false)
  })

  it("a fila só envia das 9h às 20h de Brasília", () => {
    // Brasília = UTC-3.
    expect(isWithinCareSendHours(new Date("2026-11-17T11:59:00Z"))).toBe(false)
    expect(isWithinCareSendHours(new Date("2026-11-17T12:00:00Z"))).toBe(true)
    expect(isWithinCareSendHours(new Date("2026-11-17T22:59:00Z"))).toBe(true)
    expect(isWithinCareSendHours(new Date("2026-11-17T23:00:00Z"))).toBe(false)
    expect(isWithinCareSendHours(new Date("2026-11-18T02:00:00Z"))).toBe(false)
  })
})

describe("decideCareDispatch", () => {
  const now = new Date("2026-11-17T15:00:00Z")

  const base: CareDispatchContext = {
    kind: "post_care",
    scheduledFor: new Date("2026-11-17T14:00:00Z"),
    now,
    moduleEnabled: true,
    customerHasPhone: true,
    customerOptedOut: false,
    rule: { isActive: true },
    saleStatus: "invoiced",
    appointment: null,
    review: null,
    customerHasUpcomingAppointment: false,
  }

  it("envia quando está tudo certo", () => {
    expect(decideCareDispatch(base)).toEqual({ action: "send" })
  })

  it("quem pediu para não receber não recebe — de nenhum tipo", () => {
    for (const kind of ["pre_care", "post_care", "return", "review"] as const) {
      expect(decideCareDispatch({ ...base, kind, customerOptedOut: true })).toEqual({
        action: "skip",
        reason: "O cliente pediu para não receber mensagens",
      })
    }
  })

  it("pula sem módulo, sem telefone, com a mensagem excluída ou desativada", () => {
    expect(decideCareDispatch({ ...base, moduleEnabled: false }).action).toBe("skip")
    expect(decideCareDispatch({ ...base, customerHasPhone: false }).action).toBe("skip")
    expect(decideCareDispatch({ ...base, rule: null })).toEqual({ action: "skip", reason: "A mensagem foi excluída" })
    expect(decideCareDispatch({ ...base, rule: { isActive: false } })).toEqual({
      action: "skip",
      reason: "A mensagem foi desativada",
    })
  })

  it("comanda reaberta espera; parada há mais de 3 dias, desiste", () => {
    expect(decideCareDispatch({ ...base, saleStatus: "open" })).toEqual({ action: "wait" })
    expect(
      decideCareDispatch({ ...base, saleStatus: "open", scheduledFor: new Date("2026-11-14T14:00:00Z") })
    ).toEqual({ action: "skip", reason: "Passou do prazo sem conseguir enviar" })
  })

  it("retorno não sai para quem já tem horário marcado", () => {
    expect(decideCareDispatch({ ...base, kind: "return", customerHasUpcomingAppointment: true })).toEqual({
      action: "skip",
      reason: "O cliente já tem um agendamento marcado",
    })
    // Cuidado de depois não depende disso.
    expect(decideCareDispatch({ ...base, customerHasUpcomingAppointment: true })).toEqual({ action: "send" })
  })

  it("cuidados de antes: só para agendamento de pé e que ainda não aconteceu", () => {
    const pre: CareDispatchContext = {
      ...base,
      kind: "pre_care",
      saleStatus: null,
      appointment: { status: "confirmed", at: new Date("2026-11-18T15:00:00Z") },
    }
    expect(decideCareDispatch(pre)).toEqual({ action: "send" })
    expect(decideCareDispatch({ ...pre, appointment: { status: "cancelled", at: pre.appointment!.at } }).action).toBe(
      "skip"
    )
    expect(
      decideCareDispatch({ ...pre, appointment: { status: "pending", at: new Date("2026-11-17T14:00:00Z") } }).action
    ).toBe("skip")
    expect(decideCareDispatch({ ...pre, appointment: null }).action).toBe("skip")
  })

  it("pedido de avaliação: não sai se já foi respondido, excluído ou desativado", () => {
    const review: CareDispatchContext = {
      ...base,
      kind: "review",
      rule: null,
      review: { answered: false, settingsEnabled: true },
    }
    expect(decideCareDispatch(review)).toEqual({ action: "send" })
    expect(decideCareDispatch({ ...review, review: { answered: true, settingsEnabled: true } })).toEqual({
      action: "skip",
      reason: "O cliente já avaliou",
    })
    expect(decideCareDispatch({ ...review, review: { answered: false, settingsEnabled: false } }).action).toBe("skip")
    expect(decideCareDispatch({ ...review, review: null }).action).toBe("skip")
  })
})

describe("toWhatsAppNumber", () => {
  it("número brasileiro sem DDI ganha o +55", () => {
    expect(toWhatsAppNumber("(11) 90000-0000")).toBe("+5511900000000")
    expect(toWhatsAppNumber("1130000000")).toBe("+551130000000")
  })

  it("número com DDI só ganha o +", () => {
    expect(toWhatsAppNumber("5511900000000")).toBe("+5511900000000")
    expect(toWhatsAppNumber("+55 11 90000-0000")).toBe("+5511900000000")
  })

  it("sem telefone, ou curto demais, não dá para enviar", () => {
    expect(toWhatsAppNumber(null)).toBeNull()
    expect(toWhatsAppNumber("")).toBeNull()
    expect(toWhatsAppNumber("90000-0000")).toBeNull()
  })
})
