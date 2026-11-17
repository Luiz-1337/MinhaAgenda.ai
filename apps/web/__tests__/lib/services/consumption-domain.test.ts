import { describe, it, expect } from "vitest"
import {
  consumptionCostCents,
  consumptionUnitsMilli,
  planProductContent,
  planSaleConsumptionMovements,
  planServiceConsumption,
  type ProductForConsumption,
} from "@repo/db/src/domain/consumption"

/**
 * A regra do consumo por serviço e do fracionamento, testada sem banco
 * (docs/ROADMAP.md, fase 4, fatia 4d).
 *
 * O que estes testes seguram: a conversão de "30 ml por atendimento" para a fração
 * de frasco que sai do estoque. Se ela errar por um fator de mil, um corte de cabelo
 * some com trinta frascos — ou com nenhum.
 */

describe("planProductContent — uma unidade equivale a", () => {
  it("grava a quantidade com três casas e a unidade", () => {
    expect(planProductContent({ contentAmount: 1000, contentUnit: "ml" })).toEqual({
      ok: true,
      contentAmount: "1000.000",
      contentUnit: "ml",
    })
    expect(planProductContent({ contentAmount: 0.5, contentUnit: "g" })).toMatchObject({ ok: true, contentAmount: "0.500" })
    expect(planProductContent({ contentAmount: 12, contentUnit: "un" })).toMatchObject({ ok: true, contentUnit: "un" })
  })

  it("sem quantidade o produto não é fracionado, e a unidade é ignorada", () => {
    expect(planProductContent({})).toEqual({ ok: true, contentAmount: null, contentUnit: null })
    expect(planProductContent({ contentAmount: null, contentUnit: "ml" })).toEqual({
      ok: true,
      contentAmount: null,
      contentUnit: null,
    })
  })

  it("com quantidade, a unidade é obrigatória e tem que ser conhecida", () => {
    expect(planProductContent({ contentAmount: 1000 }).ok).toBe(false)
    expect(planProductContent({ contentAmount: 1000, contentUnit: "litro" }).ok).toBe(false)
  })

  it("barra quantidade zero, negativa e em texto", () => {
    expect(planProductContent({ contentAmount: 0, contentUnit: "ml" }).ok).toBe(false)
    expect(planProductContent({ contentAmount: -1, contentUnit: "ml" }).ok).toBe(false)
    expect(planProductContent({ contentAmount: "1000", contentUnit: "ml" }).ok).toBe(false)
  })
})

describe("planServiceConsumption — o que o serviço consome", () => {
  const productIds = new Set(["prd-shampoo", "prd-tinta"])

  it("grava a quantidade de cada produto com três casas", () => {
    expect(
      planServiceConsumption(
        [
          { productId: "prd-shampoo", quantity: 30 },
          { productId: "prd-tinta", quantity: 0.5 },
        ],
        productIds
      )
    ).toEqual({
      ok: true,
      items: [
        { productId: "prd-shampoo", quantity: "30.000" },
        { productId: "prd-tinta", quantity: "0.500" },
      ],
    })
  })

  it("lista vazia é válida: tira o consumo do serviço", () => {
    expect(planServiceConsumption([], productIds)).toEqual({ ok: true, items: [] })
  })

  it("barra produto de outro salão, repetido e quantidade zero, dizendo a linha", () => {
    expect(planServiceConsumption([{ productId: "prd-outro-salao", quantity: 1 }], productIds)).toEqual({
      ok: false,
      error: "Produto 1: escolha o produto",
    })
    expect(
      planServiceConsumption(
        [
          { productId: "prd-shampoo", quantity: 30 },
          { productId: "prd-shampoo", quantity: 10 },
        ],
        productIds
      )
    ).toEqual({ ok: false, error: "Produto 2: já está na lista" })
    expect(planServiceConsumption([{ productId: "prd-shampoo", quantity: 0 }], productIds)).toEqual({
      ok: false,
      error: "Produto 1: informe uma quantidade maior que zero",
    })
  })

  it("barra o que não é lista, quantidade em texto e produtos demais", () => {
    expect(planServiceConsumption("nada", productIds).ok).toBe(false)
    expect(planServiceConsumption([{ productId: "prd-shampoo", quantity: "30" }], productIds).ok).toBe(false)

    const many = new Set(Array.from({ length: 31 }, (_, index) => `prd-${index}`))
    expect(
      planServiceConsumption(
        Array.from(many, (productId) => ({ productId, quantity: 1 })),
        many
      ).ok
    ).toBe(false)
  })
})

describe("consumptionUnitsMilli — consumo → fração de unidade", () => {
  it("30 ml de um frasco de 1000 ml são 0,030 frasco", () => {
    expect(consumptionUnitsMilli(30_000, 1000, 1_000_000)).toBe(30)
  })

  it("a quantidade do item multiplica: 2 atendimentos gastam o dobro", () => {
    expect(consumptionUnitsMilli(30_000, 2000, 1_000_000)).toBe(60)
    expect(consumptionUnitsMilli(30_000, 500, 1_000_000)).toBe(15)
  })

  it("produto não fracionado: o consumo já está em unidades", () => {
    expect(consumptionUnitsMilli(1000, 1000, null)).toBe(1000) // 1 unidade por atendimento
    expect(consumptionUnitsMilli(50, 3000, null)).toBe(150) // 0,05 × 3
  })

  it("arredonda para o milésimo de unidade", () => {
    // 5 g de um pote de 300 g = 0,01666… → 0,017.
    expect(consumptionUnitsMilli(5000, 1000, 300_000)).toBe(17)
    // 10 g de 300 g = 0,0333… → 0,033.
    expect(consumptionUnitsMilli(10_000, 1000, 300_000)).toBe(33)
  })

  it("consumo pequeno demais para um milésimo de unidade dá zero", () => {
    // 0,2 ml de um frasco de 1000 ml = 0,0002 frasco.
    expect(consumptionUnitsMilli(200, 1000, 1_000_000)).toBe(0)
  })

  it("consumo, quantidade ou conteúdo zerados não geram nada", () => {
    expect(consumptionUnitsMilli(0, 1000, 1_000_000)).toBe(0)
    expect(consumptionUnitsMilli(30_000, 0, 1_000_000)).toBe(0)
    expect(consumptionUnitsMilli(30_000, 1000, 0)).toBe(0)
  })
})

describe("consumptionCostCents — custo estimado por atendimento", () => {
  it("fração da unidade × custo de compra", () => {
    // 30 ml de 1000 ml de um frasco de R$ 60,00 = R$ 1,80.
    expect(consumptionCostCents({ perServiceMilli: 30_000, contentMilli: 1_000_000, costPrice: "60.00" })).toBe(180)
  })

  it("produto não fracionado: unidades × custo", () => {
    expect(consumptionCostCents({ perServiceMilli: 1000, contentMilli: null, costPrice: "4.00" })).toBe(400)
    expect(consumptionCostCents({ perServiceMilli: 500, contentMilli: null, costPrice: "9.99" })).toBe(500) // 4,995 → 5,00
  })

  it("sem custo cadastrado, zero", () => {
    expect(consumptionCostCents({ perServiceMilli: 30_000, contentMilli: 1_000_000, costPrice: null })).toBe(0)
  })
})

describe("planSaleConsumptionMovements — o que o faturamento consome", () => {
  const products = new Map<string, ProductForConsumption>([
    ["prd-shampoo", { trackStock: true, contentAmount: "1000.000" }],
    ["prd-toalha", { trackStock: true, contentAmount: null }],
    ["prd-sem-controle", { trackStock: false, contentAmount: "500.000" }],
  ])

  const recipes = new Map([
    [
      "svc-lavagem",
      [
        { productId: "prd-shampoo", quantity: "30.000" },
        { productId: "prd-toalha", quantity: "1.000" },
        { productId: "prd-sem-controle", quantity: "10.000" },
      ],
    ],
  ])

  it("uma baixa negativa por produto consumido, apontando para o item de serviço", () => {
    expect(
      planSaleConsumptionMovements([{ id: "item-1", serviceId: "svc-lavagem", quantity: "1.000" }], recipes, products)
    ).toEqual([
      { saleItemId: "item-1", productId: "prd-shampoo", quantity: "-0.030" },
      { saleItemId: "item-1", productId: "prd-toalha", quantity: "-1.000" },
      // prd-sem-controle não baixa: o salão não acompanha o estoque dele.
    ])
  })

  it("a quantidade do item multiplica o consumo", () => {
    expect(
      planSaleConsumptionMovements([{ id: "item-1", serviceId: "svc-lavagem", quantity: "2.000" }], recipes, products)
    ).toEqual([
      { saleItemId: "item-1", productId: "prd-shampoo", quantity: "-0.060" },
      { saleItemId: "item-1", productId: "prd-toalha", quantity: "-2.000" },
    ])
  })

  it("o mesmo serviço em dois itens gera baixas separadas, cada uma no seu item", () => {
    const movements = planSaleConsumptionMovements(
      [
        { id: "item-1", serviceId: "svc-lavagem", quantity: "1.000" },
        { id: "item-2", serviceId: "svc-lavagem", quantity: "1.000" },
      ],
      recipes,
      products
    )

    expect(movements.map((movement) => `${movement.saleItemId}:${movement.productId}`)).toEqual([
      "item-1:prd-shampoo",
      "item-1:prd-toalha",
      "item-2:prd-shampoo",
      "item-2:prd-toalha",
    ])
  })

  it("item de produto, serviço sem consumo e produto apagado não geram nada", () => {
    expect(
      planSaleConsumptionMovements(
        [
          { id: "item-1", serviceId: null, quantity: "1.000" },
          { id: "item-2", serviceId: "svc-corte", quantity: "1.000" },
        ],
        recipes,
        products
      )
    ).toEqual([])

    expect(
      planSaleConsumptionMovements(
        [{ id: "item-1", serviceId: "svc-x", quantity: "1.000" }],
        new Map([["svc-x", [{ productId: "prd-apagado", quantity: "1.000" }]]]),
        products
      )
    ).toEqual([])
  })

  it("consumo que arredonda para zero unidades não vira movimento", () => {
    expect(
      planSaleConsumptionMovements(
        [{ id: "item-1", serviceId: "svc-gota", quantity: "1.000" }],
        new Map([["svc-gota", [{ productId: "prd-shampoo", quantity: "0.200" }]]]),
        products
      )
    ).toEqual([])
  })
})
