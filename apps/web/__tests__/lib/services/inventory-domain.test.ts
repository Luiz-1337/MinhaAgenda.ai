import { describe, it, expect } from "vitest"
import {
  milliToNumeric,
  planProductStockSettings,
  planSaleStockMovements,
  planStockMovement,
  purchaseSuggestionMilli,
  stockStatus,
  stockValueCents,
  toMilli,
} from "@repo/db/src/domain/inventory"

/**
 * A regra do estoque, testada sem banco (docs/ROADMAP.md, fase 4, fatia 4a).
 *
 * O que estes testes seguram: o saldo é a SOMA dos movimentos. Todo movimento sai
 * daqui com o sinal certo — se um acerto ou uma venda errar o sinal, o estoque do
 * sistema deixa de bater com o da prateleira e ninguém percebe até faltar produto.
 */

describe("quantidade em milésimos", () => {
  it("converte número e string de coluna numeric", () => {
    expect(toMilli(1.5)).toBe(1500)
    expect(toMilli("12.500")).toBe(12500)
    expect(toMilli("-3.000")).toBe(-3000)
    expect(toMilli(0)).toBe(0)
  })

  it("o que não é número vira null, não zero", () => {
    expect(toMilli(null)).toBeNull()
    expect(toMilli(undefined)).toBeNull()
    expect(toMilli("")).toBeNull()
    expect(toMilli("abc")).toBeNull()
    expect(toMilli(Number.NaN)).toBeNull()
  })

  it("0,1 + 0,2 dá 0,3 exato", () => {
    expect((toMilli(0.1) ?? 0) + (toMilli(0.2) ?? 0)).toBe(300)
  })

  it("volta para a coluna com três casas, com sinal", () => {
    expect(milliToNumeric(1500)).toBe("1.500")
    expect(milliToNumeric(0)).toBe("0.000")
    expect(milliToNumeric(-250)).toBe("-0.250")
    expect(milliToNumeric(-12005)).toBe("-12.005")
  })
})

describe("situação do produto", () => {
  const tracked = { trackStock: true, minMilli: 5000 }

  it("sem controle não tem situação de estoque, mesmo com saldo", () => {
    expect(stockStatus({ trackStock: false, quantityMilli: 0, minMilli: 5000 })).toBe("untracked")
    expect(stockStatus({ trackStock: false, quantityMilli: -1000, minMilli: 0 })).toBe("untracked")
  })

  it("negativo, zerado, abaixo do mínimo e em dia", () => {
    expect(stockStatus({ ...tracked, quantityMilli: -1000 })).toBe("negative")
    expect(stockStatus({ ...tracked, quantityMilli: 0 })).toBe("out")
    expect(stockStatus({ ...tracked, quantityMilli: 4999 })).toBe("low")
    expect(stockStatus({ ...tracked, quantityMilli: 8000 })).toBe("ok")
  })

  it("ter exatamente o mínimo ainda não pede compra", () => {
    expect(stockStatus({ ...tracked, quantityMilli: 5000 })).toBe("ok")
  })

  it("sem mínimo definido, só zerado e negativo chamam atenção", () => {
    expect(stockStatus({ trackStock: true, quantityMilli: 1, minMilli: 0 })).toBe("ok")
    expect(stockStatus({ trackStock: true, quantityMilli: 0, minMilli: 0 })).toBe("out")
  })
})

describe("sugestão de compra e valor do estoque", () => {
  it("sugere o que falta para voltar ao mínimo", () => {
    expect(purchaseSuggestionMilli({ trackStock: true, quantityMilli: 2000, minMilli: 5000 })).toBe(3000)
    expect(purchaseSuggestionMilli({ trackStock: true, quantityMilli: 5000, minMilli: 5000 })).toBe(0)
    expect(purchaseSuggestionMilli({ trackStock: true, quantityMilli: 9000, minMilli: 5000 })).toBe(0)
  })

  it("saldo negativo entra na conta: repõe o que falta e o que ficou devendo", () => {
    expect(purchaseSuggestionMilli({ trackStock: true, quantityMilli: -2000, minMilli: 5000 })).toBe(7000)
  })

  it("não sugere para produto sem controle ou sem mínimo", () => {
    expect(purchaseSuggestionMilli({ trackStock: false, quantityMilli: 0, minMilli: 5000 })).toBe(0)
    expect(purchaseSuggestionMilli({ trackStock: true, quantityMilli: 0, minMilli: 0 })).toBe(0)
  })

  it("valor = saldo × custo, em centavos", () => {
    expect(stockValueCents({ quantityMilli: 12000, costPrice: "18.50" })).toBe(22200)
    expect(stockValueCents({ quantityMilli: 500, costPrice: "9.99" })).toBe(500) // 0,5 × 9,99 = 4,995 → 5,00
  })

  it("saldo negativo ou produto sem custo não vale nada", () => {
    expect(stockValueCents({ quantityMilli: -3000, costPrice: "18.50" })).toBe(0)
    expect(stockValueCents({ quantityMilli: 12000, costPrice: null })).toBe(0)
  })
})

describe("planStockMovement — entrada, saída e acerto", () => {
  it("entrada soma, com o custo unitário informado", () => {
    expect(planStockMovement({ kind: "in", quantity: 10, unitCost: 18.5, notes: "  NF 123  " }, 2000)).toEqual({
      ok: true,
      kind: "in",
      quantity: "10.000",
      unitCost: "18.50",
      notes: "NF 123",
      balanceMilli: 12000,
    })
  })

  it("entrada sem custo grava custo nulo, não zero", () => {
    const plan = planStockMovement({ kind: "in", quantity: 3 }, 0)
    expect(plan).toMatchObject({ ok: true, unitCost: null, notes: null })
  })

  it("saída grava a quantidade NEGATIVA e ignora custo", () => {
    expect(planStockMovement({ kind: "out", quantity: 2.5, unitCost: 99 }, 10000)).toMatchObject({
      ok: true,
      kind: "out",
      quantity: "-2.500",
      unitCost: null,
      balanceMilli: 7500,
    })
  })

  it("saída maior que o saldo é aceita: o saldo fica negativo", () => {
    expect(planStockMovement({ kind: "out", quantity: 5 }, 2000)).toMatchObject({
      ok: true,
      quantity: "-5.000",
      balanceMilli: -3000,
    })
  })

  it("acerto grava a DIFERENÇA para o que foi contado", () => {
    // O sistema diz 10, a prateleira tem 7: saem 3.
    expect(planStockMovement({ kind: "adjustment", quantity: 7 }, 10000)).toMatchObject({
      ok: true,
      kind: "adjustment",
      quantity: "-3.000",
      balanceMilli: 7000,
    })
    // O sistema diz 10, a prateleira tem 12: entram 2.
    expect(planStockMovement({ kind: "adjustment", quantity: 12 }, 10000)).toMatchObject({
      ok: true,
      quantity: "2.000",
      balanceMilli: 12000,
    })
  })

  it("acerto para zero é válido, e corrige saldo negativo", () => {
    expect(planStockMovement({ kind: "adjustment", quantity: 0 }, 4000)).toMatchObject({
      ok: true,
      quantity: "-4.000",
      balanceMilli: 0,
    })
    expect(planStockMovement({ kind: "adjustment", quantity: 0 }, -3000)).toMatchObject({
      ok: true,
      quantity: "3.000",
      balanceMilli: 0,
    })
  })

  it("contar o que o sistema já mostra não é movimento", () => {
    expect(planStockMovement({ kind: "adjustment", quantity: 10 }, 10000).ok).toBe(false)
  })

  it("entrada e saída de zero, quantidade negativa e texto são barrados", () => {
    expect(planStockMovement({ kind: "in", quantity: 0 }, 0).ok).toBe(false)
    expect(planStockMovement({ kind: "out", quantity: 0 }, 0).ok).toBe(false)
    expect(planStockMovement({ kind: "in", quantity: -1 }, 0).ok).toBe(false)
    expect(planStockMovement({ kind: "in", quantity: "10" }, 0).ok).toBe(false)
    expect(planStockMovement({ kind: "in", quantity: Number.NaN }, 0).ok).toBe(false)
  })

  it("venda não se lança pela tela, e tipo desconhecido é barrado", () => {
    expect(planStockMovement({ kind: "sale", quantity: 1 }, 5000).ok).toBe(false)
    expect(planStockMovement({ kind: "devolucao", quantity: 1 }, 5000).ok).toBe(false)
  })

  it("custo negativo e observação longa demais são barrados", () => {
    expect(planStockMovement({ kind: "in", quantity: 1, unitCost: -1 }, 0).ok).toBe(false)
    expect(planStockMovement({ kind: "in", quantity: 1, notes: "x".repeat(501) }, 0).ok).toBe(false)
  })
})

describe("planProductStockSettings", () => {
  it("grava o controle, o mínimo, o custo e os códigos aparados", () => {
    expect(
      planProductStockSettings({ trackStock: true, minStock: 5, costPrice: 18.5, sku: "  SH-01 ", barcode: " 789 " })
    ).toEqual({
      ok: true,
      trackStock: true,
      minStock: "5.000",
      costPrice: "18.50",
      sku: "SH-01",
      barcode: "789",
    })
  })

  it("campos vazios viram mínimo zero e custo e códigos nulos", () => {
    expect(planProductStockSettings({ trackStock: false })).toEqual({
      ok: true,
      trackStock: false,
      minStock: "0.000",
      costPrice: null,
      sku: null,
      barcode: null,
    })
  })

  it("custo zero é um custo (brinde), diferente de não informado", () => {
    expect(planProductStockSettings({ trackStock: true, costPrice: 0 })).toMatchObject({ ok: true, costPrice: "0.00" })
  })

  it("controle sem sim ou não, mínimo e custo negativos e código longo são barrados", () => {
    expect(planProductStockSettings({ trackStock: "sim" }).ok).toBe(false)
    expect(planProductStockSettings({ trackStock: true, minStock: -1 }).ok).toBe(false)
    expect(planProductStockSettings({ trackStock: true, costPrice: -0.01 }).ok).toBe(false)
    expect(planProductStockSettings({ trackStock: true, sku: "x".repeat(61) }).ok).toBe(false)
  })
})

describe("planSaleStockMovements — o que o faturamento baixa", () => {
  const tracked = new Set(["prd-shampoo", "prd-oleo"])

  it("uma baixa negativa por item de produto controlado", () => {
    const movements = planSaleStockMovements(
      [
        { id: "item-1", productId: "prd-shampoo", quantity: "2.000" },
        { id: "item-2", productId: "prd-oleo", quantity: "0.500" },
      ],
      tracked
    )

    expect(movements).toEqual([
      { saleItemId: "item-1", productId: "prd-shampoo", quantity: "-2.000" },
      { saleItemId: "item-2", productId: "prd-oleo", quantity: "-0.500" },
    ])
  })

  it("serviço e produto sem controle não baixam nada", () => {
    const movements = planSaleStockMovements(
      [
        { id: "item-1", productId: null, quantity: "1.000" },
        { id: "item-2", productId: "prd-sem-controle", quantity: "3.000" },
      ],
      tracked
    )

    expect(movements).toEqual([])
  })

  it("o mesmo produto em dois itens gera duas baixas, cada uma no seu item", () => {
    const movements = planSaleStockMovements(
      [
        { id: "item-1", productId: "prd-shampoo", quantity: "1.000" },
        { id: "item-2", productId: "prd-shampoo", quantity: "1.000" },
      ],
      tracked
    )

    expect(movements.map((movement) => movement.saleItemId)).toEqual(["item-1", "item-2"])
  })
})
