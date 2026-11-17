import { describe, it, expect } from "vitest"
import {
  planProductRequestSettings,
  planStockRequest,
  planStockRequestApproval,
  requestDebitNotes,
  stockRequestDeleteBlocker,
  stockRequestRejectBlocker,
  type StockRequestRefs,
} from "@repo/db/src/domain/stock-requests"

/**
 * A regra das solicitações de saída, testada sem banco (docs/ROADMAP.md, fase 4,
 * fatia 4e).
 *
 * O que estes testes seguram: o que a retirada debita do profissional. O valor é o
 * preço para profissional da HORA do pedido, e a aprovação só debita quando há
 * valor e o salão usa comissões — débito a mais é dinheiro tirado de quem trabalha.
 */

const refs: StockRequestRefs = {
  product: { name: "Shampoo 1L", isActive: true, requestable: true, professionalPrice: "35.00" },
  professional: { isActive: true },
  allowedProfessionalIds: null,
}

const draft = { productId: "prd-shampoo", professionalId: "pro-1", quantity: 2 }

describe("planProductRequestSettings", () => {
  it("grava a disponibilidade e o preço com duas casas", () => {
    expect(planProductRequestSettings({ requestable: true, professionalPrice: 35 })).toEqual({
      ok: true,
      requestable: true,
      professionalPrice: "35.00",
    })
  })

  it("preço é opcional: vazio vira nulo, zero é um preço", () => {
    expect(planProductRequestSettings({ requestable: true })).toEqual({
      ok: true,
      requestable: true,
      professionalPrice: null,
    })
    expect(planProductRequestSettings({ requestable: false, professionalPrice: 0 })).toMatchObject({
      ok: true,
      professionalPrice: "0.00",
    })
  })

  it("barra disponibilidade sem sim ou não, e preço negativo ou em texto", () => {
    expect(planProductRequestSettings({ requestable: "sim" }).ok).toBe(false)
    expect(planProductRequestSettings({ requestable: true, professionalPrice: -1 }).ok).toBe(false)
    expect(planProductRequestSettings({ requestable: true, professionalPrice: "35" }).ok).toBe(false)
  })
})

describe("planStockRequest — pedir", () => {
  it("copia o nome e o preço para profissional da hora do pedido", () => {
    expect(planStockRequest({ ...draft, notes: "  para casa " }, refs)).toEqual({
      ok: true,
      productId: "prd-shampoo",
      professionalId: "pro-1",
      description: "Shampoo 1L",
      quantity: "2.000",
      unitPrice: "35.00",
      totalAmount: "70.00",
      notes: "para casa",
    })
  })

  it("quantidade fracionada arredonda o total para o centavo", () => {
    // 0,5 × R$ 9,99 = R$ 4,995 → R$ 5,00.
    expect(
      planStockRequest(
        { ...draft, quantity: 0.5 },
        { ...refs, product: { ...refs.product!, professionalPrice: "9.99" } }
      )
    ).toMatchObject({ ok: true, quantity: "0.500", totalAmount: "5.00" })
  })

  it("produto sem preço para profissional sai de graça", () => {
    expect(
      planStockRequest(draft, { ...refs, product: { ...refs.product!, professionalPrice: null } })
    ).toMatchObject({ ok: true, unitPrice: "0.00", totalAmount: "0.00" })
  })

  it("barra produto de outro salão, inativo ou não disponível para solicitação", () => {
    expect(planStockRequest(draft, { ...refs, product: null })).toEqual({ ok: false, error: "Escolha o produto" })
    expect(planStockRequest(draft, { ...refs, product: { ...refs.product!, isActive: false } })).toEqual({
      ok: false,
      error: "Produto inativo",
    })
    expect(planStockRequest(draft, { ...refs, product: { ...refs.product!, requestable: false } })).toEqual({
      ok: false,
      error: "Este produto não está disponível para solicitação",
    })
  })

  it("barra profissional de outro salão ou inativo", () => {
    expect(planStockRequest(draft, { ...refs, professional: null })).toEqual({
      ok: false,
      error: "Escolha o profissional",
    })
    expect(planStockRequest(draft, { ...refs, professional: { isActive: false } }).ok).toBe(false)
  })

  it("quem não movimenta o estoque só pede para si mesmo", () => {
    expect(planStockRequest(draft, { ...refs, allowedProfessionalIds: new Set(["pro-1"]) }).ok).toBe(true)
    expect(planStockRequest(draft, { ...refs, allowedProfessionalIds: new Set(["pro-2"]) })).toEqual({
      ok: false,
      error: "Você só pode solicitar para você mesmo",
    })
    // Usuário sem vínculo de profissional não pede para ninguém.
    expect(planStockRequest(draft, { ...refs, allowedProfessionalIds: new Set() }).ok).toBe(false)
  })

  it("barra quantidade zero, negativa ou em texto, e observação longa demais", () => {
    expect(planStockRequest({ ...draft, quantity: 0 }, refs).ok).toBe(false)
    expect(planStockRequest({ ...draft, quantity: -1 }, refs).ok).toBe(false)
    expect(planStockRequest({ ...draft, quantity: "2" }, refs).ok).toBe(false)
    expect(planStockRequest({ ...draft, notes: "x".repeat(501) }, refs).ok).toBe(false)
  })
})

describe("planStockRequestApproval — aprovar", () => {
  const pending = { status: "pending" as const, quantity: "2.000", totalAmount: "70.00", description: "Shampoo 1L" }

  it("produto controlado e salão com comissões: sai do estoque e debita", () => {
    expect(planStockRequestApproval(pending, { trackStock: true, commissionsEnabled: true })).toEqual({
      ok: true,
      movementQuantity: "-2.000",
      debit: { amount: "70.00", notes: "Retirada de produto: 2 × Shampoo 1L" },
    })
  })

  it("produto sem controle de estoque só gera o débito", () => {
    expect(planStockRequestApproval(pending, { trackStock: false, commissionsEnabled: true })).toMatchObject({
      ok: true,
      movementQuantity: null,
      debit: { amount: "70.00" },
    })
  })

  it("salão sem comissões só tira do estoque", () => {
    expect(planStockRequestApproval(pending, { trackStock: true, commissionsEnabled: false })).toMatchObject({
      ok: true,
      movementQuantity: "-2.000",
      debit: null,
    })
  })

  it("solicitação sem valor não debita nada", () => {
    expect(
      planStockRequestApproval({ ...pending, totalAmount: "0.00" }, { trackStock: true, commissionsEnabled: true })
    ).toMatchObject({ ok: true, debit: null })
  })

  it("só solicitação pendente se aprova", () => {
    for (const status of ["approved", "rejected"] as const) {
      expect(planStockRequestApproval({ ...pending, status }, { trackStock: true, commissionsEnabled: true })).toEqual({
        ok: false,
        error: "Esta solicitação já foi decidida",
      })
    }
  })

  it("o texto do débito mostra quantidade fracionada com vírgula", () => {
    expect(requestDebitNotes({ quantity: "0.500", description: "Óleo 60ml" })).toBe("Retirada de produto: 0,5 × Óleo 60ml")
  })
})

describe("recusar e excluir", () => {
  it("só pendente se recusa", () => {
    expect(stockRequestRejectBlocker({ status: "pending" })).toBeNull()
    expect(stockRequestRejectBlocker({ status: "approved" })).toMatch(/já foi decidida/)
    expect(stockRequestRejectBlocker({ status: "rejected" })).toMatch(/já foi decidida/)
  })

  it("pendente e recusada se excluem sempre", () => {
    expect(stockRequestDeleteBlocker({ status: "pending", debitPaid: false })).toBeNull()
    expect(stockRequestDeleteBlocker({ status: "rejected", debitPaid: false })).toBeNull()
  })

  it("aprovada se exclui enquanto o débito não entrou num pagamento", () => {
    expect(stockRequestDeleteBlocker({ status: "approved", debitPaid: false })).toBeNull()
    expect(stockRequestDeleteBlocker({ status: "approved", debitPaid: true })).toMatch(/Estorne o pagamento/)
  })
})
