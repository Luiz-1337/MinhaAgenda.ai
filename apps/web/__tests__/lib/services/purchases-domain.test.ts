import { describe, it, expect } from "vitest"
import {
  planCatalogName,
  planCostRestore,
  planPurchase,
  planPurchasePayables,
  planSupplier,
  purchaseDeleteBlocker,
  purchasePaymentStatus,
  splitInstallments,
  type PurchaseFinanceRefs,
  type PurchaseRefs,
} from "@repo/db/src/domain/purchases"
import { deleteBlocker, editBlocker, planSettle, unsettleBlocker } from "@repo/db/src/domain/finance"

/**
 * A regra das compras, testada sem banco (docs/ROADMAP.md, fase 4, fatia 4b).
 *
 * O que estes testes seguram: o total da compra é o que vira conta a pagar, a soma
 * das parcelas é exatamente o total, e só produto controlado dá entrada no estoque.
 * Um centavo perdido no parcelamento aparece como diferença no financeiro que
 * ninguém consegue explicar.
 */

const NOW = new Date("2026-11-16T15:00:00-03:00")

const refs: PurchaseRefs = {
  suppliers: new Map([
    ["sup-ativo", { name: "Distribuidora Teste", isActive: true }],
    ["sup-inativo", { name: "Fornecedor Antigo", isActive: false }],
  ]),
  products: new Map([
    ["prd-shampoo", { name: "Shampoo 1L", trackStock: true, costPrice: "18.50" }],
    ["prd-oleo", { name: "Óleo 60ml", trackStock: true, costPrice: null }],
    ["prd-pente", { name: "Pente", trackStock: false, costPrice: "3.00" }],
  ]),
}

const base = {
  supplierId: "sup-ativo",
  purchasedOn: "2026-11-10",
  items: [{ productId: "prd-shampoo", quantity: 10, unitCost: 20 }],
}

describe("planSupplier", () => {
  it("apara o nome e guarda o documento sem pontuação", () => {
    expect(
      planSupplier({
        name: "  Distribuidora   Teste ",
        document: "12.345.678/0001-90",
        phone: " (11) 99999-0000 ",
        email: " Contato@Teste.com ",
        notes: "",
      })
    ).toEqual({
      ok: true,
      name: "Distribuidora Teste",
      document: "12345678000190",
      phone: "(11) 99999-0000",
      email: "contato@teste.com",
      notes: null,
    })
  })

  it("aceita CPF e CNPJ alfanumérico; campos opcionais vazios viram null", () => {
    expect(planSupplier({ name: "Maria Revendedora", document: "123.456.789-01" })).toMatchObject({
      ok: true,
      document: "12345678901",
      phone: null,
      email: null,
    })
    expect(planSupplier({ name: "Novo CNPJ", document: "12.abc.345/01de-35" })).toMatchObject({
      ok: true,
      document: "12ABC34501DE35",
    })
    expect(planSupplier({ name: "Sem documento" })).toMatchObject({ ok: true, document: null })
  })

  it("barra nome curto ou longo, documento de tamanho errado e e-mail torto", () => {
    expect(planSupplier({ name: " a " }).ok).toBe(false)
    expect(planSupplier({ name: "x".repeat(121) }).ok).toBe(false)
    expect(planSupplier({ name: "Fornecedor", document: "123" }).ok).toBe(false)
    expect(planSupplier({ name: "Fornecedor", document: "1234567800019X" }).ok).toBe(false)
    expect(planSupplier({ name: "Fornecedor", email: "sem-arroba" }).ok).toBe(false)
    expect(planSupplier({ name: 42 }).ok).toBe(false)
  })
})

describe("planCatalogName", () => {
  it("apara e junta espaços", () => {
    expect(planCatalogName("  Linha   Profissional ")).toEqual({ ok: true, name: "Linha Profissional" })
  })

  it("barra vazio, longo demais e o que não é texto", () => {
    expect(planCatalogName("   ").ok).toBe(false)
    expect(planCatalogName("x".repeat(61)).ok).toBe(false)
    expect(planCatalogName(null).ok).toBe(false)
  })
})

describe("planPurchase — o que a compra grava", () => {
  it("soma os itens e monta o total com frete e desconto", () => {
    const plan = planPurchase(
      {
        ...base,
        invoiceNumber: " 1234 ",
        freight: 15,
        discount: 5,
        items: [
          { productId: "prd-shampoo", quantity: 10, unitCost: 20 },
          { productId: "prd-oleo", quantity: 2.5, unitCost: 9.99 },
        ],
      },
      refs,
      NOW
    )

    expect(plan).toMatchObject({
      ok: true,
      supplierId: "sup-ativo",
      supplierName: "Distribuidora Teste",
      purchasedOn: "2026-11-10",
      invoiceNumber: "1234",
      itemsAmount: "224.98", // 200,00 + 24,975 → 24,98
      freightAmount: "15.00",
      discountAmount: "5.00",
      totalAmount: "234.98",
      totalCents: 23498,
    })
  })

  it("cada item leva o nome do produto, o custo de antes e se dá entrada", () => {
    const plan = planPurchase(
      {
        ...base,
        items: [
          { productId: "prd-shampoo", quantity: 10, unitCost: 20 },
          { productId: "prd-pente", quantity: 3, unitCost: 4 },
          { productId: "prd-oleo", quantity: 1, unitCost: 12 },
        ],
      },
      refs,
      NOW
    )
    if (!plan.ok) throw new Error(plan.error)

    expect(plan.items).toEqual([
      {
        position: 0,
        productId: "prd-shampoo",
        description: "Shampoo 1L",
        quantity: "10.000",
        unitCost: "20.00",
        totalAmount: "200.00",
        previousCost: "18.50",
        movesStock: true,
        batch: null,
      },
      {
        position: 1,
        productId: "prd-pente",
        description: "Pente",
        quantity: "3.000",
        unitCost: "4.00",
        totalAmount: "12.00",
        previousCost: "3.00",
        // Sem controle de estoque: entra na compra, não no estoque.
        movesStock: false,
        batch: null,
      },
      {
        position: 2,
        productId: "prd-oleo",
        description: "Óleo 60ml",
        quantity: "1.000",
        unitCost: "12.00",
        totalAmount: "12.00",
        previousCost: null,
        movesStock: true,
        batch: null,
      },
    ])
  })

  it("o custo novo do produto é o último preço pago — também no produto sem controle", () => {
    const plan = planPurchase(
      {
        ...base,
        items: [
          { productId: "prd-shampoo", quantity: 5, unitCost: 20 },
          { productId: "prd-shampoo", quantity: 5, unitCost: 19 },
          { productId: "prd-pente", quantity: 1, unitCost: 4 },
        ],
      },
      refs,
      NOW
    )
    if (!plan.ok) throw new Error(plan.error)

    expect(plan.costUpdates).toEqual([
      { productId: "prd-shampoo", costPrice: "19.00" },
      { productId: "prd-pente", costPrice: "4.00" },
    ])
  })

  it("item a custo zero (bonificação) entra na compra mas não vira o custo do produto", () => {
    const plan = planPurchase(
      {
        ...base,
        items: [
          { productId: "prd-shampoo", quantity: 10, unitCost: 20 },
          { productId: "prd-shampoo", quantity: 2, unitCost: 0 },
        ],
      },
      refs,
      NOW
    )
    if (!plan.ok) throw new Error(plan.error)

    expect(plan.items[1]).toMatchObject({ totalAmount: "0.00", movesStock: true })
    expect(plan.costUpdates).toEqual([{ productId: "prd-shampoo", costPrice: "20.00" }])
    expect(plan.totalCents).toBe(20000)
  })

  it("fornecedor é opcional", () => {
    expect(planPurchase({ ...base, supplierId: null }, refs, NOW)).toMatchObject({
      ok: true,
      supplierId: null,
      supplierName: null,
    })
  })

  it("barra fornecedor de outro salão ou inativo", () => {
    expect(planPurchase({ ...base, supplierId: "sup-outro-salao" }, refs, NOW)).toEqual({
      ok: false,
      error: "Fornecedor não encontrado",
    })
    expect(planPurchase({ ...base, supplierId: "sup-inativo" }, refs, NOW)).toEqual({
      ok: false,
      error: "Fornecedor inativo",
    })
  })

  it("barra data ausente, inexistente ou futura; hoje vale", () => {
    expect(planPurchase({ ...base, purchasedOn: "" }, refs, NOW).ok).toBe(false)
    expect(planPurchase({ ...base, purchasedOn: "2026-02-30" }, refs, NOW).ok).toBe(false)
    expect(planPurchase({ ...base, purchasedOn: "2026-11-17" }, refs, NOW).ok).toBe(false)
    expect(planPurchase({ ...base, purchasedOn: "2026-11-16" }, refs, NOW).ok).toBe(true)
  })

  it("barra compra sem item e com itens demais", () => {
    expect(planPurchase({ ...base, items: [] }, refs, NOW).ok).toBe(false)
    expect(planPurchase({ ...base, items: "nada" }, refs, NOW).ok).toBe(false)
    expect(
      planPurchase({ ...base, items: Array.from({ length: 101 }, () => base.items[0]) }, refs, NOW).ok
    ).toBe(false)
  })

  it("o erro de item diz a linha", () => {
    const items = (second: Record<string, unknown>) => [base.items[0], second]

    expect(planPurchase({ ...base, items: items({ productId: "prd-outro-salao", quantity: 1, unitCost: 1 }) }, refs, NOW))
      .toEqual({ ok: false, error: "Item 2: escolha o produto" })
    expect(planPurchase({ ...base, items: items({ productId: "prd-oleo", quantity: 0, unitCost: 1 }) }, refs, NOW))
      .toEqual({ ok: false, error: "Item 2: informe uma quantidade maior que zero" })
    expect(planPurchase({ ...base, items: items({ productId: "prd-oleo", quantity: 1 }) }, refs, NOW))
      .toEqual({ ok: false, error: "Item 2: informe o custo unitário" })
    expect(planPurchase({ ...base, items: items({ productId: "prd-oleo", quantity: 1, unitCost: -1 }) }, refs, NOW).ok)
      .toBe(false)
    expect(planPurchase({ ...base, items: items({ productId: "prd-oleo", quantity: "2", unitCost: 1 }) }, refs, NOW).ok)
      .toBe(false)
  })

  it("o desconto pode zerar a compra, mas não passar dela", () => {
    expect(planPurchase({ ...base, freight: 10, discount: 210 }, refs, NOW)).toMatchObject({
      ok: true,
      totalAmount: "0.00",
    })
    expect(planPurchase({ ...base, freight: 10, discount: 210.01 }, refs, NOW)).toEqual({
      ok: false,
      error: "O desconto não pode ser maior que o valor da compra",
    })
  })

  it("frete e desconto negativos ou em texto são barrados", () => {
    expect(planPurchase({ ...base, freight: -1 }, refs, NOW).ok).toBe(false)
    expect(planPurchase({ ...base, discount: "5" }, refs, NOW).ok).toBe(false)
  })
})

describe("splitInstallments", () => {
  it("a soma das parcelas é exatamente o total; a sobra vai para a última", () => {
    expect(splitInstallments(10000, 3)).toEqual([3333, 3333, 3334])
    expect(splitInstallments(10000, 4)).toEqual([2500, 2500, 2500, 2500])
    expect(splitInstallments(1, 1)).toEqual([1])

    for (const [total, count] of [[23498, 7], [99999, 24], [100, 3]] as const) {
      expect(splitInstallments(total, count).reduce((sum, part) => sum + part, 0)).toBe(total)
    }
  })
})

describe("planPurchasePayables — a compra no financeiro", () => {
  const financeRefs: PurchaseFinanceRefs = {
    accounts: new Map([
      ["acc-banco", { isActive: true }],
      ["acc-fechada", { isActive: false }],
    ]),
    categories: new Map([
      ["cat-compras", { kind: "expense", isActive: true }],
      ["cat-vendas", { kind: "income", isActive: true }],
      ["cat-antiga", { kind: "expense", isActive: false }],
    ]),
  }

  const purchase = {
    totalCents: 10000,
    purchasedOn: "2026-11-10",
    supplierName: "Distribuidora Teste",
    invoiceNumber: "1234",
  }

  it("a pagar em 3 parcelas: uma por mês, somando o total, competência no dia da compra", () => {
    const plan = planPurchasePayables(
      purchase,
      { paid: false, firstDueDate: "2026-12-10", installments: 3, categoryId: "cat-compras" },
      financeRefs,
      NOW
    )
    if (!plan.ok) throw new Error(plan.error)

    expect(plan.rows.map((row) => [row.description, row.amount, row.dueDate, row.status])).toEqual([
      ["Compra NF 1234 — Distribuidora Teste (1/3)", "33.33", "2026-12-10", "open"],
      ["Compra NF 1234 — Distribuidora Teste (2/3)", "33.33", "2027-01-10", "open"],
      ["Compra NF 1234 — Distribuidora Teste (3/3)", "33.34", "2027-02-10", "open"],
    ])

    for (const row of plan.rows) {
      expect(row).toMatchObject({
        direction: "out",
        kind: "purchase",
        feeAmount: "0.00",
        netAmount: row.amount,
        competenceDate: "2026-11-10",
        paidAt: null,
        accountId: null,
        categoryId: "cat-compras",
        counterparty: "Distribuidora Teste",
      })
    }
  })

  it("parcela única não ganha sufixo; sem nota e sem fornecedor a descrição é só 'Compra'", () => {
    const plan = planPurchasePayables(
      { ...purchase, supplierName: null, invoiceNumber: null },
      { paid: false, firstDueDate: "2026-11-10" },
      financeRefs,
      NOW
    )
    if (!plan.ok) throw new Error(plan.error)

    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0]).toMatchObject({ description: "Compra", amount: "100.00", counterparty: null })
  })

  it("vencimento no dia 31 recua para o último dia dos meses mais curtos", () => {
    const plan = planPurchasePayables(
      { ...purchase, purchasedOn: "2026-10-20" },
      { paid: false, firstDueDate: "2026-10-31", installments: 3 },
      financeRefs,
      NOW
    )
    if (!plan.ok) throw new Error(plan.error)

    expect(plan.rows.map((row) => row.dueDate)).toEqual(["2026-10-31", "2026-11-30", "2026-12-31"])
  })

  it("já paga: uma linha baixada no dia da compra, na conta informada", () => {
    const plan = planPurchasePayables(purchase, { paid: true, accountId: "acc-banco" }, financeRefs, NOW)
    if (!plan.ok) throw new Error(plan.error)

    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0]).toMatchObject({
      status: "paid",
      amount: "100.00",
      dueDate: "2026-11-10",
      accountId: "acc-banco",
      paidAt: new Date("2026-11-10T12:00:00-03:00"),
    })
  })

  it("já paga sem conta é barrada: dinheiro que saiu tem que ter saído de algum lugar", () => {
    expect(planPurchasePayables(purchase, { paid: true }, financeRefs, NOW)).toEqual({
      ok: false,
      error: "Informe a conta de onde o pagamento saiu",
    })
  })

  it("a pagar aceita a conta prevista", () => {
    expect(
      planPurchasePayables(purchase, { paid: false, firstDueDate: "2026-12-01", accountId: "acc-banco" }, financeRefs, NOW)
    ).toMatchObject({ ok: true, rows: [{ accountId: "acc-banco", status: "open" }] })
  })

  it("barra conta e categoria de outro salão, inativas ou do tipo errado", () => {
    const open = { paid: false, firstDueDate: "2026-12-01" }
    expect(planPurchasePayables(purchase, { ...open, accountId: "acc-outro" }, financeRefs, NOW).ok).toBe(false)
    expect(planPurchasePayables(purchase, { ...open, accountId: "acc-fechada" }, financeRefs, NOW).ok).toBe(false)
    expect(planPurchasePayables(purchase, { ...open, categoryId: "cat-outra" }, financeRefs, NOW).ok).toBe(false)
    expect(planPurchasePayables(purchase, { ...open, categoryId: "cat-antiga" }, financeRefs, NOW).ok).toBe(false)
    expect(planPurchasePayables(purchase, { ...open, categoryId: "cat-vendas" }, financeRefs, NOW)).toEqual({
      ok: false,
      error: "Escolha uma categoria de despesa",
    })
  })

  it("barra vencimento ausente ou antes da compra, e parcelas fora de 1 a 24", () => {
    expect(planPurchasePayables(purchase, { paid: false }, financeRefs, NOW).ok).toBe(false)
    expect(planPurchasePayables(purchase, { paid: false, firstDueDate: "2026-11-09" }, financeRefs, NOW).ok).toBe(false)
    for (const installments of [0, 25, 1.5, "3"]) {
      expect(
        planPurchasePayables(purchase, { paid: false, firstDueDate: "2026-12-01", installments }, financeRefs, NOW).ok
      ).toBe(false)
    }
  })

  it("compra sem valor não gera lançamento, e não cabe mais parcela que centavo", () => {
    expect(
      planPurchasePayables({ ...purchase, totalCents: 0 }, { paid: false, firstDueDate: "2026-12-01" }, financeRefs, NOW)
    ).toEqual({ ok: false, error: "Compra sem valor não gera lançamento no financeiro" })
    expect(
      planPurchasePayables(
        { ...purchase, totalCents: 5 },
        { paid: false, firstDueDate: "2026-12-01", installments: 6 },
        financeRefs,
        NOW
      ).ok
    ).toBe(false)
  })

  it("sem dizer se foi paga, não lança", () => {
    expect(planPurchasePayables(purchase, { paid: "sim" }, financeRefs, NOW).ok).toBe(false)
  })
})

describe("situação da compra no financeiro e exclusão", () => {
  it("sem parcela, aberta, paga em parte e paga", () => {
    expect(purchasePaymentStatus({ installments: 0, paidInstallments: 0 })).toBe("none")
    expect(purchasePaymentStatus({ installments: 3, paidInstallments: 0 })).toBe("open")
    expect(purchasePaymentStatus({ installments: 3, paidInstallments: 1 })).toBe("partial")
    expect(purchasePaymentStatus({ installments: 3, paidInstallments: 3 })).toBe("paid")
  })

  it("compra com parcela paga não se exclui; sem parcela paga, sim", () => {
    expect(purchaseDeleteBlocker({ paidInstallments: 0 })).toBeNull()
    expect(purchaseDeleteBlocker({ paidInstallments: 1 })).toMatch(/Estorne a baixa/)
  })
})

describe("planCostRestore — o custo volta ao excluir a compra", () => {
  const items = [{ productId: "prd-shampoo", unitCost: "20.00", previousCost: "18.50" }]

  it("volta ao custo de antes quando o custo atual ainda é o desta compra", () => {
    expect(planCostRestore(items, new Map([["prd-shampoo", "20.00"]]))).toEqual([
      { productId: "prd-shampoo", costPrice: "18.50" },
    ])
  })

  it("produto que não tinha custo volta a não ter", () => {
    expect(
      planCostRestore(
        [{ productId: "prd-oleo", unitCost: "12.00", previousCost: null }],
        new Map([["prd-oleo", "12.00"]])
      )
    ).toEqual([{ productId: "prd-oleo", costPrice: null }])
  })

  it("se o custo já mudou depois da compra, fica como está", () => {
    expect(planCostRestore(items, new Map([["prd-shampoo", "22.00"]]))).toEqual([])
    expect(planCostRestore(items, new Map([["prd-shampoo", null]]))).toEqual([])
    expect(planCostRestore(items, new Map())).toEqual([])
  })

  it("com o mesmo produto em dois itens, compara com o último custo gravado", () => {
    const twice = [
      { productId: "prd-shampoo", unitCost: "20.00", previousCost: "18.50" },
      { productId: "prd-shampoo", unitCost: "19.00", previousCost: "18.50" },
    ]
    expect(planCostRestore(twice, new Map([["prd-shampoo", "19.00"]]))).toEqual([
      { productId: "prd-shampoo", costPrice: "18.50" },
    ])
    expect(planCostRestore(twice, new Map([["prd-shampoo", "20.00"]]))).toEqual([])
  })

  it("item de bonificação (custo zero) não mexeu no custo, então não devolve nada", () => {
    expect(
      planCostRestore(
        [{ productId: "prd-shampoo", unitCost: "0.00", previousCost: "18.50" }],
        new Map([["prd-shampoo", "18.50"]])
      )
    ).toEqual([])
  })

  it("comprar pelo mesmo custo de antes não gera atualização à toa", () => {
    expect(
      planCostRestore(
        [{ productId: "prd-shampoo", unitCost: "18.50", previousCost: "18.50" }],
        new Map([["prd-shampoo", "18.50"]])
      )
    ).toEqual([])
  })
})

describe("parcela de compra na tela do financeiro", () => {
  const open = { kind: "purchase" as const, status: "open" as const, accountId: null }
  const paid = { kind: "purchase" as const, status: "paid" as const, accountId: "acc-banco" }

  it("não se edita nem se exclui por lá, aberta ou paga", () => {
    expect(editBlocker(open)).toMatch(/exclua a compra/)
    expect(editBlocker(paid)).toMatch(/exclua a compra/)
    expect(deleteBlocker(open)).toMatch(/exclua a compra/)
    expect(deleteBlocker(paid)).toMatch(/exclua a compra/)
  })

  it("recebe baixa e estorno como qualquer despesa", () => {
    expect(planSettle(open, { accountId: "acc-banco" }, new Map([["acc-banco", { isActive: true }]]), NOW).ok).toBe(true)
    expect(unsettleBlocker(paid)).toBeNull()
  })
})
