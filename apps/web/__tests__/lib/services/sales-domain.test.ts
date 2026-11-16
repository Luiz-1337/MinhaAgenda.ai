import { describe, it, expect } from "vitest"
import {
  centsToNumeric,
  planInvoice,
  planSaleItems,
  settlementDate,
  toCents,
  type InvoiceInput,
  type SaleCatalog,
  type SaleItemDraft,
} from "@repo/db/src/domain/sales"

/**
 * A regra de comanda, testada sem banco (docs/ROADMAP.md, fase 1).
 *
 * É aqui que o dinheiro é decidido: totais, taxa, prazo e o valor que vai para o
 * agendamento. O serviço que grava (sales.service.ts) só executa o que estas
 * funções devolvem.
 */

const CUSTOMER = "c-1"

const catalog: SaleCatalog = {
  services: new Map([
    ["s-corte", { name: "Corte" }],
    ["s-progressiva", { name: "Progressiva" }],
  ]),
  products: new Map([["p-shampoo", { name: "Shampoo" }]]),
  professionalIds: new Set(["pro-1", "pro-2"]),
  appointments: new Map([
    ["a-1", { customerId: CUSTOMER, status: "confirmed" }],
    ["a-outro", { customerId: "c-2", status: "confirmed" }],
    ["a-cancelado", { customerId: CUSTOMER, status: "cancelled" }],
  ]),
}

function service(overrides: Partial<SaleItemDraft> = {}): SaleItemDraft {
  return {
    kind: "service",
    serviceId: "s-corte",
    professionalId: "pro-1",
    quantity: 1,
    unitPrice: 80,
    discountAmount: 0,
    ...overrides,
  }
}

function product(overrides: Partial<SaleItemDraft> = {}): SaleItemDraft {
  return {
    kind: "product",
    productId: "p-shampoo",
    quantity: 1,
    unitPrice: 59.9,
    discountAmount: 0,
    ...overrides,
  }
}

function expectError(drafts: SaleItemDraft[], fragment: string) {
  const plan = planSaleItems(CUSTOMER, drafts, catalog)
  expect(plan.ok).toBe(false)
  if (!plan.ok) expect(plan.error).toContain(fragment)
}

describe("centavos", () => {
  it("converte sem erro de ponto flutuante", () => {
    expect(toCents("0.10")! + toCents("0.20")!).toBe(30)
    expect(toCents(19.99)).toBe(1999)
    expect(toCents("1234.5")).toBe(123450)
  })

  it("sem valor é null, não zero", () => {
    expect(toCents(null)).toBeNull()
    expect(toCents("")).toBeNull()
    expect(toCents("abc")).toBeNull()
  })

  it("volta para string de coluna numeric", () => {
    expect(centsToNumeric(0)).toBe("0.00")
    expect(centsToNumeric(5)).toBe("0.05")
    expect(centsToNumeric(123450)).toBe("1234.50")
  })
})

describe("planSaleItems — totais", () => {
  it("soma itens, aplica desconto por item e fecha subtotal − desconto = total", () => {
    const plan = planSaleItems(
      CUSTOMER,
      [service({ unitPrice: 80, discountAmount: 10 }), product({ quantity: 2, unitPrice: 59.9 })],
      catalog
    )

    expect(plan.ok).toBe(true)
    if (!plan.ok) return

    expect(plan.subtotalCents).toBe(8000 + 11980)
    expect(plan.discountCents).toBe(1000)
    expect(plan.totalCents).toBe(18980)
    expect(plan.items.map((i) => i.total)).toEqual(["70.00", "119.80"])
  })

  it("três itens de R$ 0,10 dão R$ 0,30 exatos", () => {
    const plan = planSaleItems(
      CUSTOMER,
      [product({ unitPrice: 0.1 }), product({ unitPrice: 0.1 }), product({ unitPrice: 0.1 })],
      catalog
    )
    expect(plan.ok && plan.totalCents).toBe(30)
  })

  it("quantidade fracionada arredonda no centavo", () => {
    const plan = planSaleItems(CUSTOMER, [product({ quantity: 0.333, unitPrice: 10 })], catalog)
    expect(plan.ok && plan.items[0].total).toBe("3.33")
    expect(plan.ok && plan.items[0].quantity).toBe("0.333")
  })

  it("comanda sem itens é válida enquanto aberta", () => {
    const plan = planSaleItems(CUSTOMER, [], catalog)
    expect(plan.ok && plan.totalCents).toBe(0)
  })

  it("a descrição é copiada do cadastro, não do que o cliente enviou", () => {
    const plan = planSaleItems(CUSTOMER, [service(), product()], catalog)
    expect(plan.ok && plan.items.map((i) => i.description)).toEqual(["Corte", "Shampoo"])
  })

  it("item sem preço informado vale zero e guarda unitPrice nulo", () => {
    const plan = planSaleItems(CUSTOMER, [service({ unitPrice: null })], catalog)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.items[0].unitPrice).toBeNull()
    expect(plan.items[0].total).toBe("0.00")
  })
})

describe("planSaleItems — o que é barrado", () => {
  it("serviço ou produto fora do catálogo do salão", () => {
    expectError([service({ serviceId: "s-de-outro-salao" })], "serviço não encontrado")
    expectError([product({ productId: "p-de-outro-salao" })], "produto não encontrado")
  })

  it("profissional de outro salão", () => {
    expectError([service({ professionalId: "pro-de-fora" })], "profissional não encontrado")
  })

  it("serviço sem profissional — produto pode ficar sem", () => {
    expectError([service({ professionalId: null })], "informe o profissional")
    expect(planSaleItems(CUSTOMER, [product({ professionalId: null })], catalog).ok).toBe(true)
  })

  it("quantidade zero, negativa ou absurda", () => {
    expectError([service({ quantity: 0 })], "quantidade inválida")
    expectError([service({ quantity: -1 })], "quantidade inválida")
    expectError([service({ quantity: 0.0001 })], "quantidade inválida")
    expectError([service({ quantity: 100000 })], "quantidade inválida")
  })

  it("valor negativo", () => {
    expectError([service({ unitPrice: -5 })], "valor unitário inválido")
    expectError([service({ discountAmount: -1 })], "desconto inválido")
  })

  it("desconto maior que o item — inclusive em item sem preço", () => {
    expectError([service({ unitPrice: 50, discountAmount: 50.01 })], "desconto é maior")
    expectError([service({ unitPrice: null, discountAmount: 1 })], "desconto é maior")
  })

  it("agendamento de outro cliente, cancelado, inexistente ou repetido", () => {
    expectError([service({ appointmentId: "a-outro" })], "outro cliente")
    expectError([service({ appointmentId: "a-cancelado" })], "cancelado")
    expectError([service({ appointmentId: "a-nao-existe" })], "agendamento não encontrado")
    expectError(
      [service({ appointmentId: "a-1" }), service({ appointmentId: "a-1" })],
      "aparece em dois itens"
    )
  })

  it("produto não pode vir de agendamento", () => {
    expectError([product({ appointmentId: "a-1" })], "só serviço")
  })

  it("mais de 100 itens", () => {
    expectError(Array.from({ length: 101 }, () => product()), "no máximo 100")
  })
})

describe("settlementDate", () => {
  it("usa o dia de Brasília, não o de UTC", () => {
    // 01:30 UTC de sábado = 22:30 de sexta em Brasília.
    const sextaANoite = new Date("2026-11-14T01:30:00Z")
    expect(settlementDate(sextaANoite, 0)).toBe("2026-11-13")
    expect(settlementDate(sextaANoite, 1)).toBe("2026-11-14")
  })

  it("atravessa mês e ano", () => {
    expect(settlementDate(new Date("2026-12-15T15:00:00Z"), 30)).toBe("2027-01-14")
  })
})

describe("planInvoice", () => {
  const now = new Date("2026-11-15T18:00:00Z")

  const methods: InvoiceInput["methods"] = new Map([
    ["m-dinheiro", { feePercent: "0.00", settlementDays: 0, isActive: true }],
    ["m-credito", { feePercent: "2.92", settlementDays: 30, isActive: true }],
    ["m-inativa", { feePercent: "0.00", settlementDays: 0, isActive: false }],
  ])

  const appointments: InvoiceInput["appointments"] = new Map([
    ["a-1", { status: "confirmed", date: new Date("2026-11-15T14:00:00Z") }],
    ["a-futuro", { status: "confirmed", date: new Date("2026-11-16T14:00:00Z") }],
    ["a-cancelado", { status: "cancelled", date: new Date("2026-11-15T14:00:00Z") }],
    ["a-falta", { status: "no_show", date: new Date("2026-11-15T14:00:00Z") }],
  ])

  function invoice(overrides: Partial<InvoiceInput>): ReturnType<typeof planInvoice> {
    return planInvoice({
      items: [{ unitPrice: "200.00", total: "200.00", appointmentId: null }],
      payments: [{ paymentMethodId: "m-dinheiro", amount: 200 }],
      methods,
      appointments,
      now,
      ...overrides,
    })
  }

  function expectInvoiceError(overrides: Partial<InvoiceInput>, fragment: string) {
    const plan = invoice(overrides)
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.error).toContain(fragment)
  }

  it("copia taxa e prazo da forma de pagamento — exemplo da auditoria: R$ 200 a 2,92%", () => {
    const plan = invoice({ payments: [{ paymentMethodId: "m-credito", amount: 200 }] })

    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.payments).toEqual([
      {
        paymentMethodId: "m-credito",
        amount: "200.00",
        feePercent: "2.92",
        feeAmount: "5.84",
        settlesOn: "2026-12-15",
      },
    ])
  })

  it("aceita dividir em mais de uma forma, desde que feche o total", () => {
    const plan = invoice({
      payments: [
        { paymentMethodId: "m-dinheiro", amount: 50 },
        { paymentMethodId: "m-credito", amount: 150 },
      ],
    })
    expect(plan.ok && plan.payments.map((p) => p.amount)).toEqual(["50.00", "150.00"])
  })

  it("não fatura se faltar ou sobrar, e diz quanto", () => {
    expectInvoiceError({ payments: [{ paymentMethodId: "m-dinheiro", amount: 199.99 }] }, "Faltam R$ 0,01")
    expectInvoiceError({ payments: [{ paymentMethodId: "m-dinheiro", amount: 250 }] }, "passam do total em R$ 50,00")
    expectInvoiceError({ payments: [] }, "Faltam R$ 200,00")
  })

  it("comanda de valor zero (cortesia) fatura sem pagamento", () => {
    const plan = invoice({
      items: [{ unitPrice: "0.00", total: "0.00", appointmentId: null }],
      payments: [],
    })
    expect(plan.ok && plan.payments).toEqual([])
  })

  it("barra comanda sem itens e item sem preço informado", () => {
    expectInvoiceError({ items: [], payments: [] }, "não tem itens")
    expectInvoiceError(
      { items: [{ unitPrice: null, total: "0.00", appointmentId: null }], payments: [] },
      "Informe o valor"
    )
  })

  it("barra forma de pagamento inativa ou de outro salão", () => {
    expectInvoiceError({ payments: [{ paymentMethodId: "m-inativa", amount: 200 }] }, "inativa")
    expectInvoiceError({ payments: [{ paymentMethodId: "m-de-fora", amount: 200 }] }, "não encontrada")
  })

  it("barra pagamento de valor zero ou negativo", () => {
    expectInvoiceError(
      {
        payments: [
          { paymentMethodId: "m-dinheiro", amount: 200 },
          { paymentMethodId: "m-credito", amount: 0 },
        ],
      },
      "pagamento inválido"
    )
  })

  it("fecha o agendamento com a SOMA dos itens dele", () => {
    const plan = invoice({
      items: [
        { unitPrice: "120.00", total: "120.00", appointmentId: "a-1" },
        { unitPrice: "30.00", total: "30.00", appointmentId: "a-1" },
        { unitPrice: "50.00", total: "50.00", appointmentId: null },
      ],
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.totalCents).toBe(20000)
    expect(plan.appointmentOutcomes).toEqual([{ appointmentId: "a-1", priceCharged: "150.00" }])
  })

  it("não fatura com agendamento cancelado, com falta, futuro ou inexistente", () => {
    const withAppointment = (appointmentId: string): Partial<InvoiceInput> => ({
      items: [{ unitPrice: "200.00", total: "200.00", appointmentId }],
    })

    expectInvoiceError(withAppointment("a-cancelado"), "cancelado")
    expectInvoiceError(withAppointment("a-falta"), "falta")
    expectInvoiceError(withAppointment("a-futuro"), "ainda não começou")
    expectInvoiceError(withAppointment("a-sumiu"), "não foi encontrado")
  })
})
