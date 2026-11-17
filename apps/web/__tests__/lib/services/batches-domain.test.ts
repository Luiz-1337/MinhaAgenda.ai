import { describe, it, expect } from "vitest"
import {
  EXPIRY_WARNING_DAYS,
  batchStatus,
  compareBatchesByConsumption,
  daysBetween,
  distributeBalance,
  hasBatchData,
  planBatch,
  type BatchForBalance,
} from "@repo/db/src/domain/batches"
import { planPurchase, type PurchaseRefs } from "@repo/db/src/domain/purchases"

/**
 * A regra dos lotes e validades, testada sem banco (docs/ROADMAP.md, fase 4,
 * fatia 4c).
 *
 * O que estes testes seguram: o que resta em cada lote não é gravado — sai do saldo
 * do produto, supondo que sai primeiro o que vence primeiro. Se essa conta errar, a
 * tela diz que um lote vencido já acabou quando ele ainda está na prateleira.
 */

const NOW = new Date("2026-11-16T15:00:00-03:00")
const TODAY = "2026-11-16"

function batch(id: string, quantityMilli: number, expiresOn: string | null, createdAt = "2026-01-01"): BatchForBalance {
  return { id, quantityMilli, expiresOn, createdAt: new Date(`${createdAt}T12:00:00-03:00`) }
}

describe("planBatch", () => {
  it("grava código aparado, datas e a quantidade com três casas", () => {
    expect(
      planBatch(
        { code: "  L-2026/11 ", manufacturedOn: "2026-10-01", expiresOn: "2028-10-01", quantity: 12.5, notes: " caixa 2 " },
        NOW
      )
    ).toEqual({
      ok: true,
      code: "L-2026/11",
      manufacturedOn: "2026-10-01",
      expiresOn: "2028-10-01",
      quantity: "12.500",
      notes: "caixa 2",
    })
  })

  it("aceita só o código ou só a validade", () => {
    expect(planBatch({ code: "L1", quantity: 1 }, NOW)).toMatchObject({ ok: true, code: "L1", expiresOn: null })
    expect(planBatch({ expiresOn: "2027-01-31", quantity: 1 }, NOW)).toMatchObject({
      ok: true,
      code: null,
      expiresOn: "2027-01-31",
    })
  })

  it("sem código e sem validade o lote não diz nada", () => {
    expect(planBatch({ quantity: 1 }, NOW)).toEqual({ ok: false, error: "Informe o código do lote ou a validade" })
    expect(planBatch({ code: "   ", manufacturedOn: "2026-10-01", quantity: 1 }, NOW).ok).toBe(false)
  })

  it("validade já vencida é aceita: é assim que o lote aparece como vencido", () => {
    expect(planBatch({ code: "L1", expiresOn: "2026-01-01", quantity: 1 }, NOW).ok).toBe(true)
  })

  it("barra fabricação futura e validade antes da fabricação", () => {
    expect(planBatch({ code: "L1", manufacturedOn: "2026-11-17", quantity: 1 }, NOW).ok).toBe(false)
    expect(planBatch({ code: "L1", manufacturedOn: "2026-11-16", quantity: 1 }, NOW).ok).toBe(true)
    expect(planBatch({ code: "L1", manufacturedOn: "2026-06-01", expiresOn: "2026-05-31", quantity: 1 }, NOW)).toEqual({
      ok: false,
      error: "A validade não pode ser antes da fabricação",
    })
  })

  it("barra data que não existe, quantidade zero, negativa ou em texto, e textos longos", () => {
    expect(planBatch({ code: "L1", expiresOn: "2027-02-30", quantity: 1 }, NOW).ok).toBe(false)
    expect(planBatch({ code: "L1", manufacturedOn: "ontem", quantity: 1 }, NOW).ok).toBe(false)
    expect(planBatch({ code: "L1", quantity: 0 }, NOW).ok).toBe(false)
    expect(planBatch({ code: "L1", quantity: -1 }, NOW).ok).toBe(false)
    expect(planBatch({ code: "L1", quantity: "3" }, NOW).ok).toBe(false)
    expect(planBatch({ code: "x".repeat(61), quantity: 1 }, NOW).ok).toBe(false)
    expect(planBatch({ code: "L1", quantity: 1, notes: "x".repeat(501) }, NOW).ok).toBe(false)
  })
})

describe("hasBatchData", () => {
  it("só conta campo de lote preenchido de verdade", () => {
    expect(hasBatchData(null)).toBe(false)
    expect(hasBatchData({})).toBe(false)
    expect(hasBatchData({ code: "  ", manufacturedOn: null, expiresOn: "" })).toBe(false)
    expect(hasBatchData({ code: "L1" })).toBe(true)
    expect(hasBatchData({ expiresOn: "2027-01-01" })).toBe(true)
    expect(hasBatchData({ manufacturedOn: "2026-01-01" })).toBe(true)
  })
})

describe("ordem de consumo — vence primeiro, sai primeiro", () => {
  it("ordena pela validade; sem validade sai por último", () => {
    const sorted = [batch("sem", 1000, null), batch("mar", 1000, "2027-03-01"), batch("jan", 1000, "2027-01-01")]
      .sort(compareBatchesByConsumption)
      .map((item) => item.id)

    expect(sorted).toEqual(["jan", "mar", "sem"])
  })

  it("na mesma validade, sai primeiro o que foi registrado antes", () => {
    const sorted = [batch("novo", 1000, "2027-01-01", "2026-06-01"), batch("antigo", 1000, "2027-01-01", "2026-02-01")]
      .sort(compareBatchesByConsumption)
      .map((item) => item.id)

    expect(sorted).toEqual(["antigo", "novo"])
  })
})

describe("distributeBalance — o que resta em cada lote", () => {
  const lots = [batch("jan", 10000, "2027-01-01"), batch("mar", 5000, "2027-03-01")]

  it("saldo igual à soma dos lotes: nenhum foi consumido", () => {
    const { remaining, unbatchedMilli } = distributeBalance(15000, lots)
    expect(Object.fromEntries(remaining)).toEqual({ jan: 10000, mar: 5000 })
    expect(unbatchedMilli).toBe(0)
  })

  it("o que saiu saiu do lote que vence primeiro", () => {
    // Entraram 15, restam 12: os 3 que saíram eram do lote de janeiro.
    expect(Object.fromEntries(distributeBalance(12000, lots).remaining)).toEqual({ jan: 7000, mar: 5000 })
  })

  it("lote que vence primeiro esgota antes de o seguinte começar a sair", () => {
    expect(Object.fromEntries(distributeBalance(5000, lots).remaining)).toEqual({ jan: 0, mar: 5000 })
    expect(Object.fromEntries(distributeBalance(4000, lots).remaining)).toEqual({ jan: 0, mar: 4000 })
  })

  it("saldo maior que os lotes: a sobra é estoque sem lote", () => {
    const { remaining, unbatchedMilli } = distributeBalance(20000, lots)
    expect(Object.fromEntries(remaining)).toEqual({ jan: 10000, mar: 5000 })
    expect(unbatchedMilli).toBe(5000)
  })

  it("saldo zerado ou negativo: nenhum lote tem nada", () => {
    expect(Object.fromEntries(distributeBalance(0, lots).remaining)).toEqual({ jan: 0, mar: 0 })
    const negative = distributeBalance(-3000, lots)
    expect(Object.fromEntries(negative.remaining)).toEqual({ jan: 0, mar: 0 })
    expect(negative.unbatchedMilli).toBe(0)
  })

  it("lote sem validade é o último a sair: fica com o saldo antes dos outros", () => {
    const withOpenEnded = [...lots, batch("sem", 4000, null)]
    expect(Object.fromEntries(distributeBalance(6000, withOpenEnded).remaining)).toEqual({ jan: 0, mar: 2000, sem: 4000 })
  })

  it("a soma do que resta nunca passa do saldo", () => {
    for (const balance of [0, 1, 4999, 5000, 5001, 14999, 15000, 99999]) {
      const { remaining, unbatchedMilli } = distributeBalance(balance, lots)
      const inLots = Array.from(remaining.values()).reduce((sum, value) => sum + value, 0)
      expect(inLots + unbatchedMilli).toBe(balance)
    }
  })

  it("produto sem lote: todo o saldo é sem lote", () => {
    expect(distributeBalance(8000, [])).toEqual({ remaining: new Map(), unbatchedMilli: 8000 })
  })
})

describe("situação do lote", () => {
  it("dias de calendário entre duas datas", () => {
    expect(daysBetween(TODAY, "2026-11-16")).toBe(0)
    expect(daysBetween(TODAY, "2026-12-16")).toBe(30)
    expect(daysBetween(TODAY, "2026-11-15")).toBe(-1)
    // Atravessa fevereiro de ano não bissexto.
    expect(daysBetween("2027-02-28", "2027-03-01")).toBe(1)
  })

  it("sem nada na prateleira é esgotado, vencido ou não", () => {
    expect(batchStatus({ remainingMilli: 0, expiresOn: "2020-01-01" }, TODAY)).toBe("depleted")
    expect(batchStatus({ remainingMilli: 0, expiresOn: null }, TODAY)).toBe("depleted")
  })

  it("com produto na prateleira: vencido, vencendo, em dia e sem validade", () => {
    expect(batchStatus({ remainingMilli: 1000, expiresOn: "2026-11-15" }, TODAY)).toBe("expired")
    expect(batchStatus({ remainingMilli: 1000, expiresOn: "2026-11-30" }, TODAY)).toBe("expiring")
    expect(batchStatus({ remainingMilli: 1000, expiresOn: "2027-06-01" }, TODAY)).toBe("ok")
    expect(batchStatus({ remainingMilli: 1000, expiresOn: null }, TODAY)).toBe("no_expiry")
  })

  it("vence hoje ainda não é vencido; o aviso inclui o último dia da janela", () => {
    expect(batchStatus({ remainingMilli: 1000, expiresOn: TODAY }, TODAY)).toBe("expiring")
    expect(EXPIRY_WARNING_DAYS).toBe(30)
    expect(batchStatus({ remainingMilli: 1000, expiresOn: "2026-12-16" }, TODAY)).toBe("expiring")
    expect(batchStatus({ remainingMilli: 1000, expiresOn: "2026-12-17" }, TODAY)).toBe("ok")
  })

  it("a janela do aviso pode ser outra", () => {
    expect(batchStatus({ remainingMilli: 1000, expiresOn: "2026-12-17" }, TODAY, 60)).toBe("expiring")
    expect(batchStatus({ remainingMilli: 1000, expiresOn: "2026-11-30" }, TODAY, 7)).toBe("ok")
  })
})

describe("lote no item da compra", () => {
  const refs: PurchaseRefs = {
    suppliers: new Map(),
    products: new Map([
      ["prd-shampoo", { name: "Shampoo 1L", trackStock: true, costPrice: "18.50" }],
      ["prd-pente", { name: "Pente", trackStock: false, costPrice: null }],
    ]),
  }
  const base = { purchasedOn: "2026-11-10" }

  it("o lote do item leva a quantidade do item", () => {
    const plan = planPurchase(
      {
        ...base,
        items: [{ productId: "prd-shampoo", quantity: 10, unitCost: 20, batchCode: " L-77 ", expiresOn: "2028-01-31" }],
      },
      refs,
      NOW
    )
    if (!plan.ok) throw new Error(plan.error)

    expect(plan.items[0].batch).toEqual({ code: "L-77", expiresOn: "2028-01-31", quantity: "10.000" })
  })

  it("item sem lote não gera lote; campos vazios contam como sem lote", () => {
    const plan = planPurchase(
      {
        ...base,
        items: [
          { productId: "prd-shampoo", quantity: 1, unitCost: 20 },
          { productId: "prd-shampoo", quantity: 1, unitCost: 20, batchCode: "", expiresOn: null },
        ],
      },
      refs,
      NOW
    )
    if (!plan.ok) throw new Error(plan.error)

    expect(plan.items.map((item) => item.batch)).toEqual([null, null])
  })

  it("só a validade já basta", () => {
    const plan = planPurchase(
      { ...base, items: [{ productId: "prd-shampoo", quantity: 2, unitCost: 20, expiresOn: "2027-05-01" }] },
      refs,
      NOW
    )
    if (!plan.ok) throw new Error(plan.error)

    expect(plan.items[0].batch).toEqual({ code: null, expiresOn: "2027-05-01", quantity: "2.000" })
  })

  it("produto sem controle de estoque não aceita lote: não há entrada de onde ele nasça", () => {
    expect(
      planPurchase({ ...base, items: [{ productId: "prd-pente", quantity: 1, unitCost: 4, batchCode: "L1" }] }, refs, NOW)
    ).toEqual({ ok: false, error: "Item 1: lote só em produto com controle de estoque" })
  })

  it("validade inválida barra a compra inteira, dizendo a linha", () => {
    expect(
      planPurchase(
        {
          ...base,
          items: [
            { productId: "prd-shampoo", quantity: 1, unitCost: 20 },
            { productId: "prd-shampoo", quantity: 1, unitCost: 20, expiresOn: "2027-02-30" },
          ],
        },
        refs,
        NOW
      )
    ).toEqual({ ok: false, error: "Item 2: Data de validade inválida" })
  })
})
