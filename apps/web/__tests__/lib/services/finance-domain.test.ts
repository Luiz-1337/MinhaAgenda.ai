import { describe, it, expect } from "vitest"
import {
  accountBalanceCents,
  brazilToday,
  deleteBlocker,
  isCalendarDate,
  paidAtFromDate,
  planManualTransaction,
  planSaleTransactions,
  planSettle,
  planTransfer,
  unsettleBlocker,
  type FinanceRefs,
  type ManualTransactionDraft,
} from "@repo/db/src/domain/finance"

/**
 * A regra do financeiro, testada sem banco (docs/ROADMAP.md, fase 2).
 *
 * O que estes testes seguram: o líquido que entra no saldo, a diferença entre
 * vender e receber, e que nada entra em saldo sem conta.
 */

// 15/nov/2026, 15h em Brasília.
const now = new Date("2026-11-15T18:00:00Z")

const refs: FinanceRefs = {
  accounts: new Map([
    ["acc-banco", { isActive: true }],
    ["acc-caixa", { isActive: true }],
    ["acc-inativa", { isActive: false }],
  ]),
  categories: new Map([
    ["cat-receita", { kind: "income", isActive: true }],
    ["cat-despesa", { kind: "expense", isActive: true }],
    ["cat-inativa", { kind: "expense", isActive: false }],
  ]),
  paymentMethodIds: new Set(["pm-pix"]),
  customerIds: new Set(["cus-1"]),
  professionalIds: new Set(["pro-1"]),
}

function draft(overrides: Partial<ManualTransactionDraft> = {}): ManualTransactionDraft {
  return {
    direction: "out",
    description: "Aluguel",
    amount: 3500,
    dueDate: "2026-11-20",
    paid: false,
    ...overrides,
  }
}

function expectManualError(overrides: Partial<ManualTransactionDraft>, fragment: string) {
  const plan = planManualTransaction(draft(overrides), refs, now)
  expect(plan.ok).toBe(false)
  if (!plan.ok) expect(plan.error).toContain(fragment)
}

describe("datas de calendário", () => {
  it("hoje é o dia de Brasília, não o de UTC", () => {
    // 01:30 UTC de 16/nov = 22:30 de 15/nov em Brasília.
    expect(brazilToday(new Date("2026-11-16T01:30:00Z"))).toBe("2026-11-15")
  })

  it("rejeita formato errado e dia que não existe", () => {
    expect(isCalendarDate("2026-11-15")).toBe(true)
    expect(isCalendarDate("2026-02-30")).toBe(false)
    expect(isCalendarDate("15/11/2026")).toBe(false)
    expect(isCalendarDate(null)).toBe(false)
  })

  it("a baixa de um dia cai nesse mesmo dia em Brasília", () => {
    expect(brazilToday(paidAtFromDate("2026-11-10"))).toBe("2026-11-10")
  })
})

describe("planManualTransaction", () => {
  it("despesa em aberto: líquido igual ao valor, competência igual ao vencimento", () => {
    const plan = planManualTransaction(draft({ categoryId: "cat-despesa" }), refs, now)

    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.row).toMatchObject({
      direction: "out",
      kind: "manual",
      status: "open",
      amount: "3500.00",
      feeAmount: "0.00",
      netAmount: "3500.00",
      dueDate: "2026-11-20",
      competenceDate: "2026-11-20",
      paidAt: null,
      categoryId: "cat-despesa",
    })
  })

  it("já baixada: exige conta e usa o dia de hoje quando não informado", () => {
    expectManualError({ paid: true }, "Informe a conta")

    const plan = planManualTransaction(draft({ paid: true, accountId: "acc-banco" }), refs, now)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.row.status).toBe("paid")
    expect(brazilToday(plan.row.paidAt!)).toBe("2026-11-15")
  })

  it("baixa não pode ser no futuro", () => {
    expectManualError({ paid: true, accountId: "acc-banco", paidDate: "2026-11-16" }, "data futura")
  })

  it("categoria tem que ser do tipo do lançamento", () => {
    expectManualError({ direction: "out", categoryId: "cat-receita" }, "categoria de despesa")
    expectManualError({ direction: "in", categoryId: "cat-despesa" }, "categoria de receita")
  })

  it("barra conta, categoria, cliente e profissional de fora do salão ou inativos", () => {
    expectManualError({ accountId: "acc-de-fora" }, "Conta não encontrada")
    expectManualError({ accountId: "acc-inativa" }, "Conta inativa")
    expectManualError({ categoryId: "cat-de-fora" }, "Categoria não encontrada")
    expectManualError({ categoryId: "cat-inativa" }, "Categoria inativa")
    expectManualError({ customerId: "cus-de-fora" }, "Cliente não encontrado")
    expectManualError({ professionalId: "pro-de-fora" }, "Profissional não encontrado")
    expectManualError({ paymentMethodId: "pm-de-fora" }, "Forma de pagamento não encontrada")
  })

  it("barra valor zero, descrição vazia e data inválida", () => {
    expectManualError({ amount: 0 }, "maior que zero")
    expectManualError({ amount: -10 }, "maior que zero")
    expectManualError({ description: "  " }, "descrição")
    expectManualError({ dueDate: "2026-13-01" }, "vencimento")
    expectManualError({ competenceDate: "ontem" }, "competência")
  })
})

describe("planTransfer", () => {
  const accounts = new Map([
    ["acc-banco", { name: "Banco", isActive: true }],
    ["acc-caixa", { name: "Caixa", isActive: true }],
    ["acc-inativa", { name: "Antiga", isActive: false }],
  ])

  it("gera duas linhas pagas, uma saída e uma entrada, do mesmo valor", () => {
    const plan = planTransfer({ fromAccountId: "acc-caixa", toAccountId: "acc-banco", amount: 500 }, accounts, now)

    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const [out, into] = plan.rows
    expect(out).toMatchObject({ direction: "out", accountId: "acc-caixa", amount: "500.00", status: "paid", kind: "transfer" })
    expect(into).toMatchObject({ direction: "in", accountId: "acc-banco", amount: "500.00", status: "paid", kind: "transfer" })
    expect(out.description).toBe("Transferência para Banco")
    expect(into.description).toBe("Transferência de Caixa")
  })

  it("barra mesma conta, conta inativa, conta de fora, valor zero e data futura", () => {
    const fail = (overrides: Partial<Parameters<typeof planTransfer>[0]>, fragment: string) => {
      const plan = planTransfer(
        { fromAccountId: "acc-caixa", toAccountId: "acc-banco", amount: 100, ...overrides },
        accounts,
        now
      )
      expect(plan.ok).toBe(false)
      if (!plan.ok) expect(plan.error).toContain(fragment)
    }

    fail({ toAccountId: "acc-caixa" }, "contas diferentes")
    fail({ toAccountId: "acc-inativa" }, "inativa")
    fail({ fromAccountId: "acc-de-fora" }, "não encontrada")
    fail({ amount: 0 }, "maior que zero")
    fail({ date: "2026-11-16" }, "data futura")
  })
})

describe("baixa, estorno e exclusão", () => {
  const open = { kind: "manual", status: "open", accountId: null } as const
  const paid = { kind: "manual", status: "paid", accountId: "acc-banco" } as const
  const saleOpen = { kind: "sale", status: "open", accountId: "acc-banco" } as const
  const transfer = { kind: "transfer", status: "paid", accountId: "acc-banco" } as const

  it("dar baixa usa a conta informada, ou a que o lançamento já tinha", () => {
    const explicit = planSettle(open, { accountId: "acc-caixa" }, refs.accounts, now)
    expect(explicit.ok && explicit.accountId).toBe("acc-caixa")

    const inherited = planSettle(saleOpen, {}, refs.accounts, now)
    expect(inherited.ok && inherited.accountId).toBe("acc-banco")
  })

  it("dar baixa sem conta nenhuma é barrado — nada entra em saldo sem conta", () => {
    const plan = planSettle(open, {}, refs.accounts, now)
    expect(plan.ok).toBe(false)
  })

  it("não dá baixa duas vezes, nem em conta inativa, nem com data futura", () => {
    expect(planSettle(paid, { accountId: "acc-banco" }, refs.accounts, now).ok).toBe(false)
    expect(planSettle(open, { accountId: "acc-inativa" }, refs.accounts, now).ok).toBe(false)
    expect(planSettle(open, { accountId: "acc-banco", paidDate: "2026-12-01" }, refs.accounts, now).ok).toBe(false)
  })

  it("estorno: só o que está baixado, e nunca transferência", () => {
    expect(unsettleBlocker(paid)).toBeNull()
    expect(unsettleBlocker(open)).not.toBeNull()
    expect(unsettleBlocker(transfer)).toContain("exclua")
  })

  it("exclusão: manual aberto e transferência sim; venda e manual baixado não", () => {
    expect(deleteBlocker(open)).toBeNull()
    expect(deleteBlocker(transfer)).toBeNull()
    expect(deleteBlocker(paid)).toContain("Estorne")
    expect(deleteBlocker(saleOpen)).toContain("reabra a comanda")
  })
})

describe("planSaleTransactions — o que o faturamento gera", () => {
  const base = { saleNumber: 42, customerId: "cus-1", customerName: "Cliente Teste", now }

  it("prazo zero nasce paga; cartão nasce aberta, vencendo no dia do recebimento", () => {
    const rows = planSaleTransactions({
      ...base,
      payments: [
        { id: "sp-1", paymentMethodId: "pm-pix", amount: "50.00", feeAmount: "0.00", settlesOn: "2026-11-15", accountId: "acc-banco" },
        { id: "sp-2", paymentMethodId: "pm-credito", amount: "200.00", feeAmount: "5.84", settlesOn: "2026-12-15", accountId: "acc-banco" },
      ],
    })

    expect(rows[0]).toMatchObject({ salePaymentId: "sp-1", status: "paid", netAmount: "50.00", dueDate: "2026-11-15" })
    expect(rows[0].paidAt).toEqual(now)

    expect(rows[1]).toMatchObject({
      salePaymentId: "sp-2",
      status: "open",
      amount: "200.00",
      feeAmount: "5.84",
      netAmount: "194.16",
      dueDate: "2026-12-15",
      competenceDate: "2026-11-15",
      paidAt: null,
    })
  })

  it("é sempre entrada de venda, ligada ao cliente, com a descrição da comanda", () => {
    const [row] = planSaleTransactions({
      ...base,
      payments: [{ id: "sp-1", paymentMethodId: "pm-pix", amount: "10.00", feeAmount: "0.00", settlesOn: "2026-11-15", accountId: null }],
    })

    expect(row).toMatchObject({
      direction: "in",
      kind: "sale",
      customerId: "cus-1",
      description: "Comanda #42 — Cliente Teste",
      // Forma de pagamento sem conta de destino não trava o faturamento.
      accountId: null,
    })
  })
})

describe("accountBalanceCents", () => {
  it("saldo inicial + entradas pagas − saídas pagas", () => {
    expect(accountBalanceCents("1000.00", "250.50", "100.25")).toBe(115025)
  })

  it("sem movimento é o saldo inicial; pode ficar negativo", () => {
    expect(accountBalanceCents("300.00", null, null)).toBe(30000)
    expect(accountBalanceCents("0.00", null, "50.00")).toBe(-5000)
  })
})
