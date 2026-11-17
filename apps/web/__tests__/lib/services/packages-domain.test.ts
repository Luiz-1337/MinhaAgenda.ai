import { describe, it, expect } from "vitest"
import {
  customerPackageStatus,
  packageExpiry,
  packageTemplateDeleteBlocker,
  planCustomerPackages,
  planPackageTemplate,
  type PackageCatalog,
  type PackageTemplateDraft,
} from "@repo/db/src/domain/packages"
import { planSaleItems, type SaleCatalog } from "@repo/db/src/domain/sales"
import { addDaysToDate } from "@repo/db/src/domain/finance"

/**
 * A regra dos pacotes, testada sem banco (docs/ROADMAP.md, fase 5, fatia 5a).
 *
 * O que estes testes seguram: o que o cliente leva quando paga um pacote. O
 * pacote dele é uma CÓPIA do modelo no faturamento, vale a partir do dia da
 * comanda em Brasília, e um item de comanda é um pacote — nem zero, nem dois.
 */

const catalog: PackageCatalog = {
  services: new Map([
    ["svc-laser", { name: "Laser" }],
    ["svc-hidra", { name: "Hidratação" }],
  ]),
  products: new Map([["prd-mask", { name: "Máscara" }]]),
}

const draft: PackageTemplateDraft = {
  name: "  5 sessões de laser  ",
  description: "",
  price: 900,
  validityDays: 180,
  isActive: true,
  items: [
    { kind: "service", serviceId: "svc-laser", quantity: 5 },
    { kind: "product", productId: "prd-mask", quantity: 1 },
  ],
}

describe("planPackageTemplate", () => {
  it("aceita o modelo e normaliza nome, valor e itens", () => {
    const plan = planPackageTemplate(draft, catalog)
    expect(plan).toEqual({
      ok: true,
      template: { name: "5 sessões de laser", description: null, price: "900.00", validityDays: 180, isActive: true },
      items: [
        { position: 0, kind: "service", serviceId: "svc-laser", productId: null, quantity: 5 },
        { position: 1, kind: "product", serviceId: null, productId: "prd-mask", quantity: 1 },
      ],
    })
  })

  it("sem validade, não vence", () => {
    const plan = planPackageTemplate({ ...draft, validityDays: null }, catalog)
    expect(plan.ok && plan.template.validityDays).toBeNull()
  })

  it("recusa nome vazio, valor negativo e validade fora de 1 a 3650 dias", () => {
    expect(planPackageTemplate({ ...draft, name: "  " }, catalog)).toEqual({ ok: false, error: "Informe o nome do pacote" })
    expect(planPackageTemplate({ ...draft, price: -1 }, catalog).ok).toBe(false)
    expect(planPackageTemplate({ ...draft, validityDays: 0 }, catalog).ok).toBe(false)
    expect(planPackageTemplate({ ...draft, validityDays: 3651 }, catalog).ok).toBe(false)
    expect(planPackageTemplate({ ...draft, validityDays: 1.5 }, catalog).ok).toBe(false)
  })

  it("recusa pacote sem item, item de outro salão e item repetido", () => {
    expect(planPackageTemplate({ ...draft, items: [] }, catalog)).toEqual({
      ok: false,
      error: "O pacote precisa de pelo menos um item",
    })
    expect(
      planPackageTemplate({ ...draft, items: [{ kind: "service", serviceId: "svc-outro", quantity: 1 }] }, catalog)
    ).toEqual({ ok: false, error: "Item 1: serviço não encontrado" })
    expect(
      planPackageTemplate(
        {
          ...draft,
          items: [
            { kind: "service", serviceId: "svc-laser", quantity: 1 },
            { kind: "service", serviceId: "svc-laser", quantity: 2 },
          ],
        },
        catalog
      )
    ).toEqual({ ok: false, error: "Item 2: já está no pacote" })
  })

  it("quantidade é inteira, de 1 a 999", () => {
    for (const quantity of [0, 1.5, 1000]) {
      expect(
        planPackageTemplate({ ...draft, items: [{ kind: "service", serviceId: "svc-laser", quantity }] }, catalog).ok
      ).toBe(false)
    }
  })
})

describe("packageTemplateDeleteBlocker", () => {
  it("modelo que já entrou em comanda não se apaga", () => {
    expect(packageTemplateDeleteBlocker({ saleItems: 0 })).toBeNull()
    expect(packageTemplateDeleteBlocker({ saleItems: 1 })).toMatch(/Desative/)
  })
})

describe("packageExpiry e addDaysToDate", () => {
  it("conta a validade a partir do dia da venda, atravessando mês e ano", () => {
    expect(packageExpiry("2026-11-17", 30)).toBe("2026-12-17")
    expect(packageExpiry("2026-12-15", 30)).toBe("2027-01-14")
    expect(packageExpiry("2028-02-28", 1)).toBe("2028-02-29")
    expect(packageExpiry("2026-11-17", null)).toBeNull()
    expect(addDaysToDate("2026-03-01", -1)).toBe("2026-02-28")
  })
})

describe("planCustomerPackages", () => {
  const templates = new Map([
    [
      "tpl-laser",
      {
        name: "5 sessões de laser",
        validityDays: 30,
        items: [
          { kind: "service" as const, serviceId: "svc-laser", productId: null, description: "Laser", quantity: 5 },
        ],
      },
    ],
  ])

  it("um pacote por item de pacote, com cópia do modelo, preço do item e vendedor", () => {
    const planned = planCustomerPackages({
      // 23h de 30/nov em Brasília = 02h de 1/dez em UTC: o pacote é de 30/nov.
      saleDate: new Date("2026-12-01T02:00:00Z"),
      items: [
        { id: "item-1", packageTemplateId: "tpl-laser", professionalId: "pro-1", total: "850.00" },
        { id: "item-2", packageTemplateId: null, professionalId: null, total: "50.00" },
      ],
      templates,
    })

    expect(planned).toEqual([
      {
        saleItemId: "item-1",
        templateId: "tpl-laser",
        name: "5 sessões de laser",
        soldOn: "2026-11-30",
        expiresOn: "2026-12-30",
        sellerId: "pro-1",
        price: "850.00",
        items: [{ position: 0, kind: "service", serviceId: "svc-laser", productId: null, description: "Laser", quantity: 5 }],
      },
    ])
  })

  it("dois itens do mesmo modelo geram dois pacotes", () => {
    const planned = planCustomerPackages({
      saleDate: new Date("2026-11-17T15:00:00Z"),
      items: [
        { id: "a", packageTemplateId: "tpl-laser", professionalId: null, total: "900.00" },
        { id: "b", packageTemplateId: "tpl-laser", professionalId: null, total: "900.00" },
      ],
      templates,
    })
    expect(planned.map((pkg) => pkg.saleItemId)).toEqual(["a", "b"])
  })

  it("modelo que não veio na consulta não gera pacote", () => {
    expect(
      planCustomerPackages({
        saleDate: new Date("2026-11-17T15:00:00Z"),
        items: [{ id: "a", packageTemplateId: "tpl-sumiu", professionalId: null, total: "1.00" }],
        templates,
      })
    ).toEqual([])
  })
})

describe("customerPackageStatus", () => {
  it("vale até o dia da validade, inclusive; sem saldo é utilizado", () => {
    expect(customerPackageStatus({ expiresOn: "2026-11-17", remaining: 3, today: "2026-11-17" })).toBe("active")
    expect(customerPackageStatus({ expiresOn: "2026-11-16", remaining: 3, today: "2026-11-17" })).toBe("expired")
    expect(customerPackageStatus({ expiresOn: null, remaining: 3, today: "2030-01-01" })).toBe("active")
    expect(customerPackageStatus({ expiresOn: "2026-11-16", remaining: 0, today: "2026-11-17" })).toBe("used")
  })
})

describe("planSaleItems com pacote", () => {
  const saleCatalog: SaleCatalog = {
    services: new Map([["svc-laser", { name: "Laser" }]]),
    products: new Map(),
    packageTemplates: new Map([["tpl-laser", { name: "5 sessões de laser" }]]),
    professionalIds: new Set(["pro-1"]),
    appointments: new Map(),
  }

  it("vende o pacote como item: descrição do modelo, vendedor opcional", () => {
    const plan = planSaleItems(
      "cus-1",
      [{ kind: "package", packageTemplateId: "tpl-laser", quantity: 1, unitPrice: 900, discountAmount: 50 }],
      saleCatalog
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.items[0]).toMatchObject({
      kind: "package",
      packageTemplateId: "tpl-laser",
      serviceId: null,
      productId: null,
      description: "5 sessões de laser",
      professionalId: null,
      quantity: "1.000",
      total: "850.00",
    })
    expect(plan.totalCents).toBe(85000)
  })

  it("item de pacote vai com quantidade 1", () => {
    const plan = planSaleItems(
      "cus-1",
      [{ kind: "package", packageTemplateId: "tpl-laser", quantity: 2, unitPrice: 900, discountAmount: 0 }],
      saleCatalog
    )
    expect(plan.ok).toBe(false)
  })

  it("pacote fora do catálogo (de outro salão, ou módulo desligado) não entra", () => {
    const plan = planSaleItems(
      "cus-1",
      [{ kind: "package", packageTemplateId: "tpl-x", quantity: 1, unitPrice: 1, discountAmount: 0 }],
      { ...saleCatalog, packageTemplates: new Map() }
    )
    expect(plan).toEqual({ ok: false, error: "Item 1: pacote não encontrado" })
  })

  it("pacote não tem auxiliar nem agendamento", () => {
    expect(
      planSaleItems(
        "cus-1",
        [
          {
            kind: "package",
            packageTemplateId: "tpl-laser",
            professionalId: "pro-1",
            assistantId: "pro-1",
            quantity: 1,
            unitPrice: 1,
            discountAmount: 0,
          },
        ],
        saleCatalog
      ).ok
    ).toBe(false)
  })
})
