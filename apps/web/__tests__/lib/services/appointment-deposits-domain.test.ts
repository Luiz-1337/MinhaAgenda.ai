import { describe, it, expect } from "vitest"
import {
  parseAdvancePayment,
  planDepositAmount,
  planDepositCredit,
  planDepositTransition,
} from "@repo/db/src/domain/appointment-deposits"

/**
 * O sinal do agendamento, testado sem banco (docs/ROADMAP.md, fase 8, fatia 8a).
 *
 * O que estes testes seguram: o salão só "pede sinal" com a configuração
 * completa (a mesma condição da IA), e o sinal só anda pelos caminhos certos.
 */

describe("parseAdvancePayment", () => {
  const settings = (advance_payment: unknown) => ({ modules: ["sales"], advance_payment })

  it("lê valor, chave e nome da configuração do salão", () => {
    expect(
      parseAdvancePayment(settings({ enabled: true, amount: 75, pix_key: " chave@exemplo.test ", pix_name: " Salão Teste " }))
    ).toEqual({ amountCents: 7500, pixKey: "chave@exemplo.test", pixName: "Salão Teste" })
    expect(parseAdvancePayment(settings({ enabled: true, amount: 49.9, pix_key: "abc" }))).toEqual({
      amountCents: 4990,
      pixKey: "abc",
      pixName: null,
    })
  })

  it("sem estar ligado, sem valor ou sem chave: o salão não pede sinal", () => {
    expect(parseAdvancePayment(settings({ enabled: false, amount: 75, pix_key: "abc" }))).toBeNull()
    expect(parseAdvancePayment(settings({ amount: 75, pix_key: "abc" }))).toBeNull()
    expect(parseAdvancePayment(settings({ enabled: true, amount: 0, pix_key: "abc" }))).toBeNull()
    expect(parseAdvancePayment(settings({ enabled: true, pix_key: "abc" }))).toBeNull()
    expect(parseAdvancePayment(settings({ enabled: true, amount: "75", pix_key: "abc" }))).toBeNull()
    expect(parseAdvancePayment(settings({ enabled: true, amount: 75, pix_key: "  " }))).toBeNull()
    expect(parseAdvancePayment(settings({ enabled: true, amount: 75 }))).toBeNull()
    expect(parseAdvancePayment(settings({ enabled: "true", amount: 75, pix_key: "abc" }))).toBeNull()
  })

  it("configuração ausente ou torta não lança", () => {
    expect(parseAdvancePayment(null)).toBeNull()
    expect(parseAdvancePayment("x")).toBeNull()
    expect(parseAdvancePayment({})).toBeNull()
    expect(parseAdvancePayment(settings("sim"))).toBeNull()
    expect(parseAdvancePayment(settings({ enabled: true, amount: 2000000, pix_key: "abc" }))).toBeNull()
  })
})

describe("planDepositAmount", () => {
  it("centavos inteiros e positivos, até o teto", () => {
    expect(planDepositAmount(7500)).toEqual({ ok: true, amountCents: 7500 })
    expect(planDepositAmount(10000000)).toEqual({ ok: true, amountCents: 10000000 })
    expect(planDepositAmount(0)).toEqual({ ok: false, error: "Informe o valor do sinal" })
    expect(planDepositAmount(-100)).toEqual({ ok: false, error: "Informe o valor do sinal" })
    expect(planDepositAmount(75.5)).toEqual({ ok: false, error: "Informe o valor do sinal" })
    expect(planDepositAmount("7500")).toEqual({ ok: false, error: "Informe o valor do sinal" })
    expect(planDepositAmount(10000001)).toEqual({ ok: false, error: "O valor do sinal é alto demais" })
  })
})

describe("planDepositTransition", () => {
  it("receber: de aguardando ou de dispensado", () => {
    expect(planDepositTransition("pending", "receive")).toEqual({ ok: true, status: "received" })
    expect(planDepositTransition("waived", "receive")).toEqual({ ok: true, status: "received" })
    expect(planDepositTransition("received", "receive")).toEqual({
      ok: false,
      error: "Este sinal já está marcado como recebido",
    })
  })

  it("dispensar: só o que está aguardando", () => {
    expect(planDepositTransition("pending", "waive")).toEqual({ ok: true, status: "waived" })
    expect(planDepositTransition("received", "waive")).toEqual({
      ok: false,
      error: "Este sinal já foi recebido. Reabra antes de dispensar",
    })
    expect(planDepositTransition("waived", "waive")).toEqual({ ok: false, error: "Este sinal já está dispensado" })
  })

  it("reabrir: volta para aguardando", () => {
    expect(planDepositTransition("received", "reopen")).toEqual({ ok: true, status: "pending" })
    expect(planDepositTransition("waived", "reopen")).toEqual({ ok: true, status: "pending" })
    expect(planDepositTransition("pending", "reopen")).toEqual({ ok: false, error: "Este sinal já está aguardando" })
  })

  it("sinal abatido numa comanda não muda: a comanda tem que ser reaberta antes", () => {
    const blocked = {
      ok: false,
      error: "Este sinal já foi abatido numa comanda. Reabra a comanda antes de mexer nele",
    }
    expect(planDepositTransition("received", "reopen", true)).toEqual(blocked)
    expect(planDepositTransition("received", "waive", true)).toEqual(blocked)
    expect(planDepositTransition("received", "reopen", false)).toEqual({ ok: true, status: "pending" })
  })
})

describe("planDepositCredit", () => {
  const method = "11111111-1111-4111-8111-111111111111"

  it("sem forma escolhida, nada é abatido", () => {
    expect(
      planDepositCredit({ deposits: [{ id: "a", amountCents: 7500 }], totalCents: 17000, paymentMethodId: null })
    ).toEqual({ ok: true, depositIds: [], payment: null, amountCents: 0 })
    expect(planDepositCredit({ deposits: [], totalCents: 17000, paymentMethodId: "" })).toEqual({
      ok: true,
      depositIds: [],
      payment: null,
      amountCents: 0,
    })
  })

  it("o sinal vira um pagamento na forma escolhida, somando os agendamentos da comanda", () => {
    expect(
      planDepositCredit({ deposits: [{ id: "a", amountCents: 7500 }], totalCents: 17000, paymentMethodId: method })
    ).toEqual({
      ok: true,
      depositIds: ["a"],
      payment: { paymentMethodId: method, amount: 75 },
      amountCents: 7500,
    })
    expect(
      planDepositCredit({
        deposits: [
          { id: "a", amountCents: 7500 },
          { id: "b", amountCents: 4990 },
        ],
        totalCents: 12490,
        paymentMethodId: method,
      })
    ).toEqual({
      ok: true,
      depositIds: ["a", "b"],
      payment: { paymentMethodId: method, amount: 124.9 },
      amountCents: 12490,
    })
  })

  it("forma escolhida sem sinal recebido é erro", () => {
    expect(planDepositCredit({ deposits: [], totalCents: 17000, paymentMethodId: method })).toEqual({
      ok: false,
      error: "Esta comanda não tem sinal recebido para abater",
    })
  })

  it("sinal maior que o total não é abatido: não há troco", () => {
    expect(
      planDepositCredit({ deposits: [{ id: "a", amountCents: 7500 }], totalCents: 5000, paymentMethodId: method })
    ).toEqual({
      ok: false,
      error: "O sinal recebido (R$ 75,00) passa do total da comanda. Fature sem abater o sinal",
    })
  })
})
