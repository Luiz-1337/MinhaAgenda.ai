import { randomUUID } from "node:crypto"
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm"

import {
  db,
  customers,
  financialAccounts,
  financialCategories,
  financialTransactions,
  paymentMethods,
  professionals,
} from "../index"
import type { FinancialDirection, FinancialTransactionKind, FinancialTransactionStatus } from "../schema"
import {
  accountBalanceCents,
  deleteBlocker,
  planManualTransaction,
  planSaleTransactions,
  planSettle,
  planTransfer,
  unsettleBlocker,
  type FinanceRefs,
  type ManualTransactionDraft,
  type SalePaymentForFinance,
  type TransferDraft,
} from "../domain/finance"
import { toCents } from "../domain/sales"
import type { ActionResult } from "./appointments"

/**
 * Financeiro (docs/ROADMAP.md, fase 2).
 *
 * Só I/O: carrega o que a regra pura (domain/finance.ts) precisa, deixa ela decidir
 * e grava. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`; referência que não aparece
 * na consulta escopada é tratada como inexistente.
 *
 * Baixa, estorno e exclusão travam a linha (SELECT ... FOR UPDATE) antes de decidir
 * pelo status — dois cliques em "Dar baixa" não podem virar duas baixas.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Executor = typeof db | Tx

class FinanceRuleError extends Error {}

function fail(message: string): never {
  throw new FinanceRuleError(message)
}

function toFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof FinanceRuleError) return { success: false, error: error.message }
  console.error(fallback, error)
  return { success: false, error: fallback }
}

// ============================================================================
// Carga das referências
// ============================================================================

async function loadAccounts(executor: Executor, salonId: string, ids: (string | null | undefined)[]) {
  const wanted = Array.from(new Set(ids.filter((id): id is string => !!id)))
  if (wanted.length === 0) return new Map<string, { name: string; isActive: boolean }>()

  const rows = await executor
    .select({ id: financialAccounts.id, name: financialAccounts.name, isActive: financialAccounts.isActive })
    .from(financialAccounts)
    .where(and(eq(financialAccounts.salonId, salonId), inArray(financialAccounts.id, wanted)))

  return new Map(rows.map((r) => [r.id, { name: r.name, isActive: r.isActive }]))
}

/** Só o que o lançamento referencia, sempre escopado pelo salão. */
async function loadRefs(executor: Executor, salonId: string, draft: ManualTransactionDraft): Promise<FinanceRefs> {
  const [accounts, categoryRows, methodRows, customerRows, professionalRows] = await Promise.all([
    loadAccounts(executor, salonId, [draft.accountId]),
    draft.categoryId
      ? executor
          .select({ id: financialCategories.id, kind: financialCategories.kind, isActive: financialCategories.isActive })
          .from(financialCategories)
          .where(and(eq(financialCategories.salonId, salonId), eq(financialCategories.id, draft.categoryId)))
      : [],
    draft.paymentMethodId
      ? executor
          .select({ id: paymentMethods.id })
          .from(paymentMethods)
          .where(and(eq(paymentMethods.salonId, salonId), eq(paymentMethods.id, draft.paymentMethodId)))
      : [],
    draft.customerId
      ? executor
          .select({ id: customers.id })
          .from(customers)
          .where(and(eq(customers.salonId, salonId), eq(customers.id, draft.customerId), eq(customers.isSystem, false)))
      : [],
    draft.professionalId
      ? executor
          .select({ id: professionals.id })
          .from(professionals)
          .where(and(eq(professionals.salonId, salonId), eq(professionals.id, draft.professionalId)))
      : [],
  ])

  return {
    accounts,
    categories: new Map(categoryRows.map((r) => [r.id, { kind: r.kind, isActive: r.isActive }])),
    paymentMethodIds: new Set(methodRows.map((r) => r.id)),
    customerIds: new Set(customerRows.map((r) => r.id)),
    professionalIds: new Set(professionalRows.map((r) => r.id)),
  }
}

async function lockTransaction(tx: Tx, salonId: string, transactionId: string) {
  const [row] = await tx
    .select({
      id: financialTransactions.id,
      kind: financialTransactions.kind,
      status: financialTransactions.status,
      accountId: financialTransactions.accountId,
      transferGroup: financialTransactions.transferGroup,
    })
    .from(financialTransactions)
    .where(and(eq(financialTransactions.id, transactionId), eq(financialTransactions.salonId, salonId)))
    .for("update")

  return row ?? null
}

// ============================================================================
// Lançar
// ============================================================================

/** Novo recebimento ou nova despesa. */
export async function createManualTransactionService(input: {
  salonId: string
  userId: string
  draft: ManualTransactionDraft
}): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const refs = await loadRefs(db, input.salonId, input.draft)
    const plan = planManualTransaction(input.draft, refs, new Date())
    if (!plan.ok) return { success: false, error: plan.error }

    const [created] = await db
      .insert(financialTransactions)
      .values({ ...plan.row, salonId: input.salonId, createdBy: input.userId })
      .returning({ id: financialTransactions.id })

    return { success: true, data: { transactionId: created.id } }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar o lançamento")
  }
}

/** Transferência entre contas: as duas pernas entram juntas ou nenhuma entra. */
export async function createTransferService(input: {
  salonId: string
  userId: string
  draft: TransferDraft
}): Promise<ActionResult<void>> {
  try {
    const accounts = await loadAccounts(db, input.salonId, [input.draft.fromAccountId, input.draft.toAccountId])
    const plan = planTransfer(input.draft, accounts, new Date())
    if (!plan.ok) return { success: false, error: plan.error }

    const transferGroup = randomUUID()
    await db.transaction(async (tx) => {
      await tx.insert(financialTransactions).values(
        plan.rows.map((row) => ({ ...row, salonId: input.salonId, transferGroup, createdBy: input.userId }))
      )
    })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível registrar a transferência")
  }
}

// ============================================================================
// Baixa, estorno, exclusão
// ============================================================================

export async function settleTransactionService(input: {
  salonId: string
  transactionId: string
  accountId?: string | null
  paidDate?: string | null
}): Promise<ActionResult<void>> {
  try {
    await db.transaction(async (tx) => {
      const transaction = await lockTransaction(tx, input.salonId, input.transactionId)
      if (!transaction) fail("Lançamento não encontrado")

      const accounts = await loadAccounts(tx, input.salonId, [input.accountId, transaction.accountId])
      const plan = planSettle(transaction, input, accounts, new Date())
      if (!plan.ok) fail(plan.error)

      await tx
        .update(financialTransactions)
        .set({ status: "paid", paidAt: plan.paidAt, accountId: plan.accountId, updatedAt: new Date() })
        .where(and(eq(financialTransactions.id, transaction.id), eq(financialTransactions.salonId, input.salonId)))
    })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível dar baixa no lançamento")
  }
}

/** Estorna a baixa: o lançamento volta a "a receber / a pagar". A conta fica. */
export async function unsettleTransactionService(input: {
  salonId: string
  transactionId: string
}): Promise<ActionResult<void>> {
  try {
    await db.transaction(async (tx) => {
      const transaction = await lockTransaction(tx, input.salonId, input.transactionId)
      if (!transaction) fail("Lançamento não encontrado")

      const blocker = unsettleBlocker(transaction)
      if (blocker) fail(blocker)

      await tx
        .update(financialTransactions)
        .set({ status: "open", paidAt: null, updatedAt: new Date() })
        .where(and(eq(financialTransactions.id, transaction.id), eq(financialTransactions.salonId, input.salonId)))
    })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível estornar a baixa")
  }
}

/** Exclui um lançamento manual aberto, ou uma transferência (as duas pernas). */
export async function deleteTransactionService(input: {
  salonId: string
  transactionId: string
}): Promise<ActionResult<void>> {
  try {
    await db.transaction(async (tx) => {
      const transaction = await lockTransaction(tx, input.salonId, input.transactionId)
      if (!transaction) fail("Lançamento não encontrado")

      const blocker = deleteBlocker(transaction)
      if (blocker) fail(blocker)

      if (transaction.kind === "transfer" && transaction.transferGroup) {
        await tx
          .delete(financialTransactions)
          .where(
            and(
              eq(financialTransactions.salonId, input.salonId),
              eq(financialTransactions.transferGroup, transaction.transferGroup)
            )
          )
        return
      }

      await tx
        .delete(financialTransactions)
        .where(and(eq(financialTransactions.id, transaction.id), eq(financialTransactions.salonId, input.salonId)))
    })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir o lançamento")
  }
}

// ============================================================================
// Comanda → financeiro
// ============================================================================

/**
 * Gera as contas a receber dos pagamentos de uma comanda que acabou de ser
 * faturada. Roda DENTRO da transação do faturamento (services/sales.service.ts):
 * ou a comanda fatura e o financeiro registra, ou nada acontece.
 *
 * O caminho de volta não precisa de código: reabrir a comanda apaga os pagamentos,
 * e a FK sale_payment_id é ON DELETE CASCADE.
 */
export async function recordSaleTransactions(
  tx: Tx,
  input: {
    salonId: string
    saleId: string
    saleNumber: number
    customerId: string
    userId: string
    payments: Omit<SalePaymentForFinance, "accountId">[]
    now: Date
  }
): Promise<void> {
  if (input.payments.length === 0) return

  const methodIds = Array.from(new Set(input.payments.map((p) => p.paymentMethodId)))

  const [methodRows, [customer]] = await Promise.all([
    tx
      .select({ id: paymentMethods.id, accountId: paymentMethods.accountId })
      .from(paymentMethods)
      .where(and(eq(paymentMethods.salonId, input.salonId), inArray(paymentMethods.id, methodIds))),
    tx
      .select({ name: customers.name })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.salonId, input.salonId)))
      .limit(1),
  ])

  const accountByMethod = new Map(methodRows.map((m) => [m.id, m.accountId]))

  const rows = planSaleTransactions({
    saleNumber: input.saleNumber,
    customerId: input.customerId,
    customerName: customer?.name ?? "Cliente",
    payments: input.payments.map((payment) => ({
      ...payment,
      accountId: accountByMethod.get(payment.paymentMethodId) ?? null,
    })),
    now: input.now,
  })

  await tx.insert(financialTransactions).values(
    rows.map((row) => ({
      ...row,
      salonId: input.salonId,
      saleId: input.saleId,
      createdBy: input.userId,
    }))
  )
}

// ============================================================================
// Leitura
// ============================================================================

export type FinanceTransactionRow = {
  id: string
  direction: FinancialDirection
  kind: FinancialTransactionKind
  status: FinancialTransactionStatus
  description: string
  amount: string
  feeAmount: string
  netAmount: string
  dueDate: string
  competenceDate: string
  paidAt: Date | null
  accountId: string | null
  accountName: string | null
  categoryName: string | null
  customerName: string | null
  professionalName: string | null
  counterparty: string | null
  saleId: string | null
  notes: string | null
}

export type FinanceTotals = {
  /** Centavos líquidos. Transferências não entram — não são receita nem despesa. */
  inOpen: number
  inPaid: number
  outOpen: number
  outPaid: number
}

export type ListTransactionsFilters = {
  salonId: string
  direction?: FinancialDirection
  status?: FinancialTransactionStatus
  /** Intervalo de VENCIMENTO, "YYYY-MM-DD". */
  from?: string
  to?: string
  accountId?: string
  categoryId?: string
  limit: number
  offset: number
}

export async function listTransactionsService(
  filters: ListTransactionsFilters
): Promise<{ rows: FinanceTransactionRow[]; total: number; totals: FinanceTotals }> {
  const conditions = [eq(financialTransactions.salonId, filters.salonId)]

  if (filters.direction) conditions.push(eq(financialTransactions.direction, filters.direction))
  if (filters.status) conditions.push(eq(financialTransactions.status, filters.status))
  if (filters.from) conditions.push(gte(financialTransactions.dueDate, filters.from))
  if (filters.to) conditions.push(lte(financialTransactions.dueDate, filters.to))
  if (filters.accountId) conditions.push(eq(financialTransactions.accountId, filters.accountId))
  if (filters.categoryId) conditions.push(eq(financialTransactions.categoryId, filters.categoryId))

  const where = and(...conditions)

  const [rows, [{ total }], totalRows] = await Promise.all([
    db
      .select({
        id: financialTransactions.id,
        direction: financialTransactions.direction,
        kind: financialTransactions.kind,
        status: financialTransactions.status,
        description: financialTransactions.description,
        amount: financialTransactions.amount,
        feeAmount: financialTransactions.feeAmount,
        netAmount: financialTransactions.netAmount,
        dueDate: financialTransactions.dueDate,
        competenceDate: financialTransactions.competenceDate,
        paidAt: financialTransactions.paidAt,
        accountId: financialTransactions.accountId,
        accountName: financialAccounts.name,
        categoryName: financialCategories.name,
        customerName: customers.name,
        professionalName: professionals.name,
        counterparty: financialTransactions.counterparty,
        saleId: financialTransactions.saleId,
        notes: financialTransactions.notes,
      })
      .from(financialTransactions)
      .leftJoin(financialAccounts, eq(financialAccounts.id, financialTransactions.accountId))
      .leftJoin(financialCategories, eq(financialCategories.id, financialTransactions.categoryId))
      .leftJoin(customers, eq(customers.id, financialTransactions.customerId))
      .leftJoin(professionals, eq(professionals.id, financialTransactions.professionalId))
      .where(where)
      .orderBy(desc(financialTransactions.dueDate), desc(financialTransactions.createdAt))
      .limit(filters.limit)
      .offset(filters.offset),
    db.select({ total: sql<number>`count(*)::int` }).from(financialTransactions).where(where),
    // Totais do FILTRO inteiro, não só da página.
    db
      .select({
        direction: financialTransactions.direction,
        status: financialTransactions.status,
        net: sql<string>`coalesce(sum(${financialTransactions.netAmount}), 0)::text`,
      })
      .from(financialTransactions)
      .where(and(where, ne(financialTransactions.kind, "transfer")))
      .groupBy(financialTransactions.direction, financialTransactions.status),
  ])

  const totals: FinanceTotals = { inOpen: 0, inPaid: 0, outOpen: 0, outPaid: 0 }
  for (const row of totalRows) {
    const cents = toCents(row.net) ?? 0
    if (row.direction === "in") {
      if (row.status === "paid") totals.inPaid = cents
      else totals.inOpen = cents
    } else if (row.status === "paid") totals.outPaid = cents
    else totals.outOpen = cents
  }

  return { rows, total, totals }
}

export type FinanceAccountRow = {
  id: string
  name: string
  kind: "bank" | "cash" | "safe" | "other"
  openingBalance: string
  isActive: boolean
  /** Saldo atual em centavos: saldo inicial + entradas pagas − saídas pagas. */
  balanceCents: number
}

/** Contas do salão com o saldo atual. O saldo nunca é gravado — é sempre calculado. */
export async function listAccountsWithBalanceService(salonId: string): Promise<FinanceAccountRow[]> {
  const [accounts, movement] = await Promise.all([
    db
      .select({
        id: financialAccounts.id,
        name: financialAccounts.name,
        kind: financialAccounts.kind,
        openingBalance: financialAccounts.openingBalance,
        isActive: financialAccounts.isActive,
      })
      .from(financialAccounts)
      .where(eq(financialAccounts.salonId, salonId))
      .orderBy(asc(financialAccounts.name)),
    db
      .select({
        accountId: financialTransactions.accountId,
        direction: financialTransactions.direction,
        net: sql<string>`coalesce(sum(${financialTransactions.netAmount}), 0)::text`,
      })
      .from(financialTransactions)
      .where(and(eq(financialTransactions.salonId, salonId), eq(financialTransactions.status, "paid")))
      .groupBy(financialTransactions.accountId, financialTransactions.direction),
  ])

  const paid = new Map<string, { in: string | null; out: string | null }>()
  for (const row of movement) {
    if (!row.accountId) continue
    const entry = paid.get(row.accountId) ?? { in: null, out: null }
    if (row.direction === "in") entry.in = row.net
    else entry.out = row.net
    paid.set(row.accountId, entry)
  }

  return accounts.map((account) => ({
    ...account,
    balanceCents: accountBalanceCents(
      account.openingBalance,
      paid.get(account.id)?.in ?? null,
      paid.get(account.id)?.out ?? null
    ),
  }))
}
