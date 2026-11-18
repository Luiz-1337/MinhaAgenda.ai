import { describe, it, expect } from "vitest"
import {
  buildPackageStatement,
  buildSubscriptionSalesReport,
  type PackageSaleRow,
  type PackageUseRow,
  type SubscriptionChargeRow,
} from "@repo/db/src/domain/package-reports"

/**
 * Os relatórios de pacotes e assinaturas, testados sem banco (docs/ROADMAP.md,
 * fase 5, fatia 5d).
 *
 * O que estes testes seguram: os totais. A venda soma o que o cliente PAGOU; o uso
 * soma o valor das sessões (não o preço de tabela, e não zero, que é o que o item
 * da comanda cobra); e a assinatura soma por plano sem contar o mesmo assinante
 * duas vezes.
 */

const sale: PackageSaleRow = {
  customerPackageId: "pkg-1",
  day: "2026-11-10",
  customerId: "cus-1",
  customerName: "Cliente Um",
  packageName: "3 cortes",
  saleId: "sale-16",
  saleNumber: 16,
  price: "432.00",
}

const use: PackageUseRow = {
  saleItemId: "item-1",
  day: "2026-11-12",
  customerId: "cus-1",
  customerName: "Cliente Um",
  packageName: "3 cortes",
  description: "Corte",
  professionalName: "Profissional A",
  saleId: "sale-17",
  saleNumber: 17,
  quantity: "1.000",
  lineValue: "408.00",
  lineQuantity: 3,
}

describe("buildPackageStatement", () => {
  it("sem movimento, extrato vazio e totais zerados", () => {
    expect(buildPackageStatement({ sales: [], uses: [] })).toEqual({
      entries: [],
      totals: { soldCount: 0, soldCents: 0, usedQuantity: 0, usedCents: 0 },
    })
  })

  it("a venda entra pelo preço pago e o uso pelo valor da sessão", () => {
    const statement = buildPackageStatement({ sales: [sale], uses: [use] })

    expect(statement.totals).toEqual({ soldCount: 1, soldCents: 43200, usedQuantity: 1, usedCents: 13600 })
    // Mais recente primeiro.
    expect(statement.entries.map((entry) => entry.kind)).toEqual(["use", "sale"])
    expect(statement.entries[0]).toMatchObject({
      kind: "use",
      day: "2026-11-12",
      description: "Corte",
      professionalName: "Profissional A",
      quantity: 1,
      saleNumber: 17,
      valueCents: 13600,
    })
    expect(statement.entries[1]).toMatchObject({
      kind: "sale",
      description: null,
      quantity: null,
      saleNumber: 16,
      valueCents: 43200,
    })
  })

  it("duas sessões num item valem duas sessões", () => {
    const statement = buildPackageStatement({ sales: [], uses: [{ ...use, quantity: "2.000" }] })
    expect(statement.totals).toMatchObject({ usedQuantity: 2, usedCents: 27200 })
  })

  it("linha sem valor (pacote anterior ao rateio) conta a sessão e vale zero", () => {
    const statement = buildPackageStatement({ sales: [], uses: [{ ...use, lineValue: "0.00" }] })
    expect(statement.totals).toMatchObject({ usedQuantity: 1, usedCents: 0 })
  })

  it("no mesmo dia e na mesma comanda, a venda vem antes do uso", () => {
    const sameSale = { day: "2026-11-10", saleId: "sale-16", saleNumber: 16 }
    const statement = buildPackageStatement({
      sales: [sale],
      uses: [{ ...use, ...sameSale }],
    })
    expect(statement.entries.map((entry) => entry.kind)).toEqual(["sale", "use"])
  })

  it("no mesmo dia, a comanda de número maior vem primeiro", () => {
    const statement = buildPackageStatement({
      sales: [sale, { ...sale, customerPackageId: "pkg-2", saleId: "sale-20", saleNumber: 20 }],
      uses: [],
    })
    expect(statement.entries.map((entry) => entry.saleNumber)).toEqual([20, 16])
    expect(statement.totals).toMatchObject({ soldCount: 2, soldCents: 86400 })
  })
})

describe("buildSubscriptionSalesReport", () => {
  const charge: SubscriptionChargeRow = {
    periodId: "per-1",
    day: "2026-11-17",
    customerId: "cus-1",
    customerName: "Cliente Um",
    planId: "plan-1",
    planName: "Clube de escova",
    subscriptionName: "Clube de escova",
    periodStart: "2026-11-17",
    periodEnd: "2026-12-17",
    saleId: "sale-18",
    saleNumber: 18,
    amount: "120.00",
  }

  it("sem cobrança, relatório vazio", () => {
    expect(buildSubscriptionSalesReport([])).toEqual({
      plans: [],
      charges: [],
      totals: { charges: 0, customers: 0, amountCents: 0 },
    })
  })

  it("soma por plano e não conta o mesmo assinante duas vezes", () => {
    const report = buildSubscriptionSalesReport([
      charge,
      // A mesma cliente renovou no período.
      { ...charge, periodId: "per-2", day: "2026-11-20", saleId: "sale-19", saleNumber: 19, amount: "110.00" },
      { ...charge, periodId: "per-3", customerId: "cus-2", customerName: "Cliente Dois", saleNumber: 21 },
      {
        ...charge,
        periodId: "per-4",
        customerId: "cus-2",
        customerName: "Cliente Dois",
        planId: "plan-2",
        planName: "Clube anual",
        subscriptionName: "Clube anual",
        saleNumber: 22,
        amount: "900.00",
      },
    ])

    expect(report.totals).toEqual({ charges: 4, customers: 2, amountCents: 125000 })
    // O plano que mais rendeu primeiro.
    expect(report.plans).toEqual([
      { planId: "plan-2", planName: "Clube anual", charges: 1, customers: 1, amountCents: 90000 },
      { planId: "plan-1", planName: "Clube de escova", charges: 3, customers: 2, amountCents: 35000 },
    ])
    // A lista, da mais recente para a mais antiga; no mesmo dia, a comanda maior.
    expect(report.charges.map((row) => row.saleNumber)).toEqual([19, 22, 21, 18])
  })

  it("agrupa pelo plano, mesmo que a assinatura guarde o nome antigo dele", () => {
    const report = buildSubscriptionSalesReport([
      charge,
      { ...charge, periodId: "per-2", customerId: "cus-2", subscriptionName: "Clube (nome antigo)" },
    ])
    expect(report.plans).toHaveLength(1)
    expect(report.plans[0]).toMatchObject({ charges: 2, customers: 2 })
    expect(report.charges.map((row) => row.subscriptionName).sort()).toEqual([
      "Clube (nome antigo)",
      "Clube de escova",
    ])
  })
})
