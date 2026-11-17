import { describe, it, expect } from "vitest"
import {
  packageUseValue,
  planCustomerPackages,
  planPackageUsage,
  splitPackagePrice,
  type PackageLine,
} from "@repo/db/src/domain/packages"
import { planSaleItems, type SaleCatalog } from "@repo/db/src/domain/sales"
import { planSaleCommissions, type CommissionSaleInput } from "@repo/db/src/domain/commissions"

/**
 * Usar o pacote na comanda, testado sem banco (docs/ROADMAP.md, fase 5, fatia 5b).
 *
 * O que estes testes seguram: a sessão que o cliente já pagou não é cobrada de
 * novo, não sai além do saldo nem fora da validade, e quem executa recebe comissão
 * sobre o que a sessão vale dentro do pacote.
 */

describe("splitPackagePrice", () => {
  it("reparte pelo preço de tabela × quantidade, somando exatamente o preço", () => {
    // 3 cortes de R$ 50 + 1 hidratação de R$ 150 = R$ 300 de tabela; pacote por R$ 270.
    const shares = splitPackagePrice(27000, [
      { quantity: 3, listPrice: "50.00" },
      { quantity: 1, listPrice: "150.00" },
    ])
    expect(shares).toEqual([13500, 13500])
    expect(shares.reduce((a, b) => a + b, 0)).toBe(27000)
  })

  it("centavo que sobra vai para a maior fração", () => {
    const shares = splitPackagePrice(10000, [
      { quantity: 1, listPrice: "10.00" },
      { quantity: 1, listPrice: "10.00" },
      { quantity: 1, listPrice: "10.00" },
    ])
    expect(shares).toEqual([3334, 3333, 3333])
  })

  it("sem preço de tabela reparte pela quantidade", () => {
    expect(
      splitPackagePrice(40000, [
        { quantity: 3, listPrice: null },
        { quantity: 1, listPrice: "0" },
      ])
    ).toEqual([30000, 10000])
  })

  it("pacote de graça: tudo zero", () => {
    expect(splitPackagePrice(0, [{ quantity: 5, listPrice: "80.00" }])).toEqual([0])
  })
})

describe("planCustomerPackages com o valor das linhas", () => {
  it("cada linha do pacote do cliente leva a sua parte do preço pago", () => {
    const [pkg] = planCustomerPackages({
      saleDate: new Date("2026-11-17T15:00:00Z"),
      items: [{ id: "item-1", packageTemplateId: "tpl", professionalId: null, total: "380.00" }],
      templates: new Map([
        [
          "tpl",
          {
            name: "3 cortes e 1 shampoo",
            validityDays: 30,
            items: [
              { kind: "service" as const, serviceId: "svc", productId: null, description: "Corte", quantity: 3, listPrice: "100.00" },
              { kind: "product" as const, serviceId: null, productId: "prd", description: "Shampoo", quantity: 1, listPrice: "100.00" },
            ],
          },
        ],
      ]),
    })
    expect(pkg.items.map((line) => line.value)).toEqual(["285.00", "95.00"])
  })
})

const LINE: PackageLine = {
  customerPackageId: "pkg-1",
  customerId: "cus-1",
  packageName: "5 sessões de laser",
  kind: "service",
  serviceId: "svc-laser",
  productId: null,
  description: "Laser",
  quantity: 5,
  used: 3,
  soldOn: "2026-11-01",
  expiresOn: "2026-11-30",
}

function usage(overrides: Partial<Parameters<typeof planPackageUsage>[0]> = {}) {
  return planPackageUsage({
    customerId: "cus-1",
    saleDay: "2026-11-17",
    uses: [{ customerPackageItemId: "line-1", quantity: "1.000" }],
    lines: new Map([["line-1", LINE]]),
    ...overrides,
  })
}

describe("planPackageUsage", () => {
  it("cabe no saldo, é do cliente e está na validade", () => {
    expect(usage()).toEqual({ ok: true })
  })

  it("dois itens da mesma comanda somam no saldo", () => {
    expect(
      usage({
        uses: [
          { customerPackageItemId: "line-1", quantity: "1.000" },
          { customerPackageItemId: "line-1", quantity: "1.000" },
        ],
      })
    ).toEqual({ ok: true })
    expect(
      usage({
        uses: [
          { customerPackageItemId: "line-1", quantity: "2.000" },
          { customerPackageItemId: "line-1", quantity: "1.000" },
        ],
      })
    ).toEqual({ ok: false, error: 'Pacote "5 sessões de laser": Laser tem saldo de 2, e a comanda usa 3' })
  })

  it("sem saldo nenhum, diz que acabou", () => {
    expect(usage({ lines: new Map([["line-1", { ...LINE, used: 5 }]]) })).toEqual({
      ok: false,
      error: 'Pacote "5 sessões de laser": Laser não tem mais saldo',
    })
  })

  it("pacote de outro cliente não serve", () => {
    expect(usage({ customerId: "cus-2" })).toEqual({ ok: false, error: 'Pacote "5 sessões de laser": é de outro cliente' })
  })

  it("vale até o último dia, inclusive; não antes da compra", () => {
    expect(usage({ saleDay: "2026-11-30" }).ok).toBe(true)
    expect(usage({ saleDay: "2026-12-01" })).toEqual({
      ok: false,
      error: 'Pacote "5 sessões de laser": venceu em 30/11/2026',
    })
    expect(usage({ saleDay: "2026-10-31" }).ok).toBe(false)
    expect(usage({ lines: new Map([["line-1", { ...LINE, expiresOn: null }]]), saleDay: "2030-01-01" }).ok).toBe(true)
  })

  it("linha que não veio na consulta (outro salão) é inexistente", () => {
    expect(usage({ lines: new Map() })).toEqual({ ok: false, error: "Um item do pacote não foi encontrado" })
  })

  it("quantidade fracionada não é sessão", () => {
    expect(usage({ uses: [{ customerPackageItemId: "line-1", quantity: "0.500" }] }).ok).toBe(false)
  })
})

describe("packageUseValue", () => {
  it("valor da linha ÷ sessões × usadas, ao centavo", () => {
    expect(packageUseValue({ lineValue: "285.00", lineQuantity: 3, usedQuantity: "1.000" })).toBe("95.00")
    expect(packageUseValue({ lineValue: "100.00", lineQuantity: 3, usedQuantity: "1.000" })).toBe("33.33")
    expect(packageUseValue({ lineValue: "100.00", lineQuantity: 3, usedQuantity: "2.000" })).toBe("66.67")
    expect(packageUseValue({ lineValue: "0.00", lineQuantity: 3, usedQuantity: "1.000" })).toBe("0.00")
  })
})

describe("planSaleItems com item do pacote", () => {
  const catalog: SaleCatalog = {
    services: new Map([["svc-laser", { name: "Laser" }]]),
    products: new Map([["prd-mask", { name: "Máscara" }]]),
    packageTemplates: new Map(),
    professionalIds: new Set(["pro-1"]),
    appointments: new Map(),
    packageLines: new Map([["line-1", { kind: "service", serviceId: "svc-laser", productId: null }]]),
  }

  const useDraft = {
    kind: "service" as const,
    serviceId: "svc-laser",
    professionalId: "pro-1",
    customerPackageItemId: "line-1",
    quantity: 1,
    unitPrice: 0,
    discountAmount: 0,
  }

  it("entra sem cobrança, ligado à linha", () => {
    const plan = planSaleItems("cus-1", [useDraft], catalog)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.items[0]).toMatchObject({ customerPackageItemId: "line-1", total: "0.00", unitPrice: "0.00" })
    expect(plan.totalCents).toBe(0)
  })

  it("item do pacote não é cobrado nem leva desconto", () => {
    expect(planSaleItems("cus-1", [{ ...useDraft, unitPrice: 50 }], catalog)).toEqual({
      ok: false,
      error: "Item 1: item do pacote não é cobrado",
    })
  })

  it("é exatamente o serviço da linha", () => {
    const other = { ...catalog, services: new Map([...catalog.services, ["svc-outro", { name: "Outro" }]]) }
    expect(planSaleItems("cus-1", [{ ...useDraft, serviceId: "svc-outro" }], other)).toEqual({
      ok: false,
      error: "Item 1: não é o item do pacote",
    })
    expect(
      planSaleItems("cus-1", [{ kind: "product" as const, productId: "prd-mask", customerPackageItemId: "line-1", quantity: 1, unitPrice: 0, discountAmount: 0 }], catalog).ok
    ).toBe(false)
  })

  it("linha fora do catálogo (módulo desligado, outro salão) não entra", () => {
    expect(planSaleItems("cus-1", [useDraft], { ...catalog, packageLines: new Map() })).toEqual({
      ok: false,
      error: "Item 1: item do pacote não encontrado",
    })
  })

  it("quantidade inteira", () => {
    expect(planSaleItems("cus-1", [{ ...useDraft, quantity: 1.5 }], catalog).ok).toBe(false)
  })

  it("serviço do pacote continua exigindo quem executou", () => {
    expect(planSaleItems("cus-1", [{ ...useDraft, professionalId: null }], catalog).ok).toBe(false)
  })
})

describe("comissão do item do pacote", () => {
  function input(overrides: Partial<CommissionSaleInput> = {}): CommissionSaleInput {
    return {
      sale: { saleDate: new Date("2026-11-17T15:00:00Z"), total: "0.00", amountDue: "0.00" },
      items: [
        {
          id: "item-1",
          serviceId: "svc-laser",
          productId: null,
          professionalId: "pro-1",
          quantity: "1.000",
          discountAmount: "0.00",
          total: "0.00",
          packageValue: "95.00",
        },
      ],
      payments: [],
      salonSettings: null,
      professionals: new Map([["pro-1", { commissionRate: "40.00", settings: null }]]),
      rules: [],
      ...overrides,
    }
  }

  it("é sobre o que a sessão vale no pacote, sem taxa", () => {
    const [entry] = planSaleCommissions(input())
    expect(entry).toMatchObject({ baseAmount: "95.00", grossAmount: "38.00", feeAmount: "0.00", amount: "38.00" })
  })

  it("comanda com item pago e item do pacote: a taxa fica só no item pago", () => {
    const entries = planSaleCommissions(
      input({
        sale: { saleDate: new Date("2026-11-17T15:00:00Z"), total: "100.00", amountDue: "0.00" },
        items: [
          ...input().items,
          {
            id: "item-2",
            serviceId: "svc-laser",
            productId: null,
            professionalId: "pro-1",
            quantity: "1.000",
            discountAmount: "0.00",
            total: "100.00",
          },
        ],
        payments: [{ feeAmount: "10.00", settlesOn: "2026-12-17" }],
      })
    )
    expect(entries.find((entry) => entry.saleItemId === "item-1")?.feeAmount).toBe("0.00")
    // 40% da taxa de R$ 10 (proporcional): R$ 4.
    expect(entries.find((entry) => entry.saleItemId === "item-2")?.feeAmount).toBe("4.00")
  })

  it("sem valor de pacote (zero), a linha existe com comissão zero", () => {
    const [entry] = planSaleCommissions(
      input({ items: [{ ...input().items[0], packageValue: "0.00" }] })
    )
    expect(entry.amount).toBe("0.00")
  })
})
