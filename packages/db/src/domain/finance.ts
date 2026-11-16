/**
 * Regra do financeiro — pura, sem I/O (docs/ROADMAP.md, fase 2).
 *
 * Mesmo desenho da comanda (domain/sales.ts): o serviço busca os dados, estas
 * funções decidem, o serviço grava. Dinheiro em centavos inteiros.
 *
 * Datas de vencimento, competência e baixa são DIAS DE CALENDÁRIO EM BRASÍLIA,
 * trafegando como "YYYY-MM-DD". Não são instantes: "vence dia 10" não muda de dia
 * conforme o fuso de quem olha.
 */
import { centsToNumeric, settlementDate, toCents } from './sales'

// ============================================================================
// Datas
// ============================================================================

/** O dia de hoje em Brasília, "YYYY-MM-DD". */
export function brazilToday(now: Date): string {
  return settlementDate(now, 0)
}

/** "YYYY-MM-DD" de um dia que existe (rejeita 2026-02-30). */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * O instante gravado em `paid_at` para uma baixa feita "no dia X": meio-dia de
 * Brasília. Meio-dia e não meia-noite para o dia não escorregar para o anterior ou
 * o seguinte em nenhuma conversão de fuso (Brasília é UTC−3, sem horário de verão).
 */
export function paidAtFromDate(date: string): Date {
  return new Date(`${date}T12:00:00-03:00`)
}

// ============================================================================
// Lançamento manual (recebimento / despesa)
// ============================================================================

export type FinanceRefs = {
  accounts: ReadonlyMap<string, { isActive: boolean }>
  categories: ReadonlyMap<string, { kind: 'income' | 'expense'; isActive: boolean }>
  paymentMethodIds: ReadonlySet<string>
  customerIds: ReadonlySet<string>
  professionalIds: ReadonlySet<string>
}

export type ManualTransactionDraft = {
  direction: 'in' | 'out'
  description: string
  amount: number
  dueDate: string
  /** Ausente = a mesma do vencimento. */
  competenceDate?: string | null
  categoryId?: string | null
  accountId?: string | null
  paymentMethodId?: string | null
  customerId?: string | null
  professionalId?: string | null
  counterparty?: string | null
  notes?: string | null
  /** Já entra baixada (recebido/pago). */
  paid: boolean
  /** Dia da baixa; ausente = hoje. Só quando `paid`. */
  paidDate?: string | null
}

export type PlannedTransaction = {
  direction: 'in' | 'out'
  kind: 'sale' | 'manual' | 'transfer'
  status: 'open' | 'paid'
  description: string
  amount: string
  feeAmount: string
  netAmount: string
  dueDate: string
  competenceDate: string
  paidAt: Date | null
  accountId: string | null
  categoryId: string | null
  paymentMethodId: string | null
  customerId: string | null
  professionalId: string | null
  counterparty: string | null
  notes: string | null
}

export type TransactionPlan = { ok: true; row: PlannedTransaction } | { ok: false; error: string }

const MAX_AMOUNT_CENTS = 10_000_000_000 // R$ 100.000.000,00 — cabe em numeric(12,2)

function cleanText(value: string | null | undefined, max: number): string | null {
  const text = (value ?? '').trim()
  return text ? text.slice(0, max) : null
}

/**
 * Valida um recebimento ou despesa digitado contra os cadastros do salão.
 *
 * As referências (`refs`) já vêm filtradas por salão: o que não está nelas é de
 * outro salão ou não existe, e nos dois casos é erro.
 */
export function planManualTransaction(
  draft: ManualTransactionDraft,
  refs: FinanceRefs,
  now: Date
): TransactionPlan {
  if (draft.direction !== 'in' && draft.direction !== 'out') return { ok: false, error: 'Tipo de lançamento inválido' }

  const description = cleanText(draft.description, 200)
  if (!description || description.length < 2) return { ok: false, error: 'Informe a descrição' }

  const amountCents = toCents(draft.amount)
  if (amountCents === null || amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) {
    return { ok: false, error: 'Informe um valor maior que zero' }
  }

  if (!isCalendarDate(draft.dueDate)) return { ok: false, error: 'Informe a data de vencimento' }

  const competenceDate = draft.competenceDate || draft.dueDate
  if (!isCalendarDate(competenceDate)) return { ok: false, error: 'Data de competência inválida' }

  const categoryId = draft.categoryId || null
  if (categoryId) {
    const category = refs.categories.get(categoryId)
    if (!category) return { ok: false, error: 'Categoria não encontrada' }
    if (!category.isActive) return { ok: false, error: 'Categoria inativa' }
    const expected = draft.direction === 'in' ? 'income' : 'expense'
    if (category.kind !== expected) {
      return {
        ok: false,
        error: draft.direction === 'in' ? 'Escolha uma categoria de receita' : 'Escolha uma categoria de despesa',
      }
    }
  }

  const accountId = draft.accountId || null
  if (accountId) {
    const account = refs.accounts.get(accountId)
    if (!account) return { ok: false, error: 'Conta não encontrada' }
    if (!account.isActive) return { ok: false, error: 'Conta inativa' }
  }

  const paymentMethodId = draft.paymentMethodId || null
  if (paymentMethodId && !refs.paymentMethodIds.has(paymentMethodId)) {
    return { ok: false, error: 'Forma de pagamento não encontrada' }
  }

  const customerId = draft.customerId || null
  if (customerId && !refs.customerIds.has(customerId)) return { ok: false, error: 'Cliente não encontrado' }

  const professionalId = draft.professionalId || null
  if (professionalId && !refs.professionalIds.has(professionalId)) {
    return { ok: false, error: 'Profissional não encontrado' }
  }

  let paidAt: Date | null = null
  if (draft.paid) {
    // Dinheiro que já se moveu tem que estar em alguma conta — senão não entra em
    // saldo nenhum.
    if (!accountId) return { ok: false, error: 'Informe a conta para dar baixa' }

    const paidDate = draft.paidDate || brazilToday(now)
    if (!isCalendarDate(paidDate)) return { ok: false, error: 'Data da baixa inválida' }
    if (paidDate > brazilToday(now)) return { ok: false, error: 'A baixa não pode ter data futura' }
    paidAt = paidAtFromDate(paidDate)
  }

  return {
    ok: true,
    row: {
      direction: draft.direction,
      kind: 'manual',
      status: draft.paid ? 'paid' : 'open',
      description,
      amount: centsToNumeric(amountCents),
      feeAmount: '0.00',
      netAmount: centsToNumeric(amountCents),
      dueDate: draft.dueDate,
      competenceDate,
      paidAt,
      accountId,
      categoryId,
      paymentMethodId,
      customerId,
      professionalId,
      counterparty: cleanText(draft.counterparty, 120),
      notes: cleanText(draft.notes, 1000),
    },
  }
}

// ============================================================================
// Transferência entre contas
// ============================================================================

export type TransferDraft = {
  fromAccountId: string
  toAccountId: string
  amount: number
  /** Dia da transferência; ausente = hoje. */
  date?: string | null
  notes?: string | null
}

export type TransferPlan = { ok: true; rows: [PlannedTransaction, PlannedTransaction] } | { ok: false; error: string }

/**
 * Uma transferência são DUAS linhas pagas: saída da conta de origem, entrada na de
 * destino. Não é receita nem despesa — só muda onde o dinheiro está.
 */
export function planTransfer(
  draft: TransferDraft,
  accounts: ReadonlyMap<string, { name: string; isActive: boolean }>,
  now: Date
): TransferPlan {
  const from = accounts.get(draft.fromAccountId)
  const to = accounts.get(draft.toAccountId)
  if (!from || !to) return { ok: false, error: 'Conta não encontrada' }
  if (draft.fromAccountId === draft.toAccountId) {
    return { ok: false, error: 'Escolha contas diferentes para origem e destino' }
  }
  if (!from.isActive || !to.isActive) return { ok: false, error: 'Conta inativa' }

  const amountCents = toCents(draft.amount)
  if (amountCents === null || amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) {
    return { ok: false, error: 'Informe um valor maior que zero' }
  }

  const date = draft.date || brazilToday(now)
  if (!isCalendarDate(date)) return { ok: false, error: 'Data inválida' }
  if (date > brazilToday(now)) return { ok: false, error: 'A transferência não pode ter data futura' }

  const amount = centsToNumeric(amountCents)
  const base = {
    kind: 'transfer' as const,
    status: 'paid' as const,
    amount,
    feeAmount: '0.00',
    netAmount: amount,
    dueDate: date,
    competenceDate: date,
    paidAt: paidAtFromDate(date),
    categoryId: null,
    paymentMethodId: null,
    customerId: null,
    professionalId: null,
    counterparty: null,
    notes: cleanText(draft.notes, 1000),
  }

  return {
    ok: true,
    rows: [
      { ...base, direction: 'out', description: `Transferência para ${to.name}`, accountId: draft.fromAccountId },
      { ...base, direction: 'in', description: `Transferência de ${from.name}`, accountId: draft.toAccountId },
    ],
  }
}

// ============================================================================
// Baixa, estorno e exclusão
// ============================================================================

export type TransactionState = {
  kind: 'sale' | 'manual' | 'transfer'
  status: 'open' | 'paid'
  accountId: string | null
}

export type SettlePlan = { ok: true; accountId: string; paidAt: Date } | { ok: false; error: string }

/** Dar baixa: a transação aberta passa a paga, numa conta e num dia. */
export function planSettle(
  transaction: TransactionState,
  input: { accountId?: string | null; paidDate?: string | null },
  accounts: ReadonlyMap<string, { isActive: boolean }>,
  now: Date
): SettlePlan {
  if (transaction.status === 'paid') return { ok: false, error: 'Este lançamento já foi baixado' }

  const accountId = input.accountId || transaction.accountId
  if (!accountId) return { ok: false, error: 'Informe a conta para dar baixa' }

  const account = accounts.get(accountId)
  if (!account) return { ok: false, error: 'Conta não encontrada' }
  if (!account.isActive) return { ok: false, error: 'Conta inativa' }

  const paidDate = input.paidDate || brazilToday(now)
  if (!isCalendarDate(paidDate)) return { ok: false, error: 'Data da baixa inválida' }
  if (paidDate > brazilToday(now)) return { ok: false, error: 'A baixa não pode ter data futura' }

  return { ok: true, accountId, paidAt: paidAtFromDate(paidDate) }
}

/** Estornar a baixa: volta a "a receber / a pagar". Devolve o motivo se não pode. */
export function unsettleBlocker(transaction: TransactionState): string | null {
  if (transaction.status !== 'paid') return 'Este lançamento não está baixado'
  // Transferência só existe paga: desfazer é excluir as duas pernas.
  if (transaction.kind === 'transfer') return 'Transferência não se estorna: exclua a transferência'
  return null
}

/** Excluir. Devolve o motivo se não pode. */
export function deleteBlocker(transaction: TransactionState): string | null {
  // O lançamento de venda é consequência da comanda: quem o desfaz é a reabertura.
  if (transaction.kind === 'sale') return 'Lançamento de comanda não se exclui aqui: reabra a comanda'
  if (transaction.kind === 'manual' && transaction.status === 'paid') {
    return 'Estorne a baixa antes de excluir'
  }
  return null
}

// ============================================================================
// O que o faturamento de uma comanda gera
// ============================================================================

export type SalePaymentForFinance = {
  id: string
  paymentMethodId: string
  amount: string
  feeAmount: string
  settlesOn: string
  /** Conta de destino da forma de pagamento; NULL = não configurada. */
  accountId: string | null
}

export type PlannedSaleTransaction = PlannedTransaction & { salePaymentId: string }

/**
 * Uma conta a receber por pagamento da comanda.
 *
 * Com prazo zero (dinheiro, PIX) o valor já entrou: nasce paga. Com prazo (cartão)
 * nasce aberta, vencendo no dia do recebimento — é a diferença entre vender e
 * receber, que a comissão por "disponibilidade" (fase 3) vai ler.
 *
 * A taxa da forma de pagamento vira `feeAmount`; o líquido é o que entra no saldo.
 */
export function planSaleTransactions(input: {
  saleNumber: number
  customerId: string
  customerName: string
  payments: readonly SalePaymentForFinance[]
  now: Date
}): PlannedSaleTransaction[] {
  const today = brazilToday(input.now)

  return input.payments.map((payment) => {
    const amountCents = toCents(payment.amount) ?? 0
    const feeCents = toCents(payment.feeAmount) ?? 0
    const receivedNow = payment.settlesOn <= today

    return {
      salePaymentId: payment.id,
      direction: 'in',
      kind: 'sale',
      status: receivedNow ? 'paid' : 'open',
      description: `Comanda #${input.saleNumber} — ${input.customerName}`.slice(0, 200),
      amount: centsToNumeric(amountCents),
      feeAmount: centsToNumeric(feeCents),
      netAmount: centsToNumeric(amountCents - feeCents),
      dueDate: payment.settlesOn,
      competenceDate: today,
      paidAt: receivedNow ? input.now : null,
      accountId: payment.accountId,
      categoryId: null,
      paymentMethodId: payment.paymentMethodId,
      customerId: input.customerId,
      professionalId: null,
      counterparty: null,
      notes: null,
    }
  })
}

// ============================================================================
// Saldo
// ============================================================================

/** Saldo de uma conta: saldo inicial + entradas pagas (líquidas) − saídas pagas. */
export function accountBalanceCents(
  openingBalance: string,
  paidIn: string | null,
  paidOut: string | null
): number {
  return (toCents(openingBalance) ?? 0) + (toCents(paidIn) ?? 0) - (toCents(paidOut) ?? 0)
}
