import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import { db, cashMovements, cashSessions, customers, paymentMethods, profiles, salePayments, sales } from "../index"
import type { CashMovementKind } from "../schema"
import {
  cashTotals,
  expectedCashCents,
  planCashMovement,
  planCloseCash,
  planOpenCash,
  type CashTotals,
} from "../domain/cash"
import type { ActionResult } from "./appointments"

/**
 * Caixa (docs/ROADMAP.md, fase 2, fatia 2e).
 *
 * Só I/O: carrega o que a regra pura (domain/cash.ts) precisa, deixa ela decidir e
 * grava. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`.
 *
 * Concorrência: suprimento, sangria, fechamento e a entrada de venda em dinheiro
 * travam a linha do caixa (SELECT ... FOR UPDATE). Sem a trava, uma sangria e um
 * fechamento simultâneos calculariam o esperado sobre números diferentes.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Nome de quem operou o caixa. `profiles.full_name` costuma estar vazio (o nome que
 * aparece no topo do painel vem do cadastro de login, não desta tabela), então cai
 * para nome + sobrenome e, por fim, para o e-mail. Sem isso o histórico mostrava
 * "—" na coluna Operador — visto no teste em uso de 15/nov/2026.
 */
const operatorName = sql<string | null>`coalesce(
  nullif(trim(${profiles.fullName}), ''),
  nullif(trim(concat_ws(' ', ${profiles.firstName}, ${profiles.lastName})), ''),
  ${profiles.email}
)`

class CashRuleError extends Error {}

function fail(message: string): never {
  throw new CashRuleError(message)
}

function pgErrorCode(error: unknown): { code?: string; constraint?: string } {
  if (typeof error !== "object" || error === null) return {}
  const direct = error as { code?: string; constraint_name?: string; constraint?: string; cause?: unknown }
  const cause = (typeof direct.cause === "object" && direct.cause !== null ? direct.cause : {}) as {
    code?: string
    constraint_name?: string
    constraint?: string
  }
  return {
    code: direct.code ?? cause.code,
    constraint: direct.constraint_name ?? direct.constraint ?? cause.constraint_name ?? cause.constraint,
  }
}

function toFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof CashRuleError) return { success: false, error: error.message }

  const pg = pgErrorCode(error)
  // Duas abas abrindo o caixa ao mesmo tempo: o índice único parcial barra a segunda.
  if (pg.code === "23505" && pg.constraint === "cash_sessions_one_open_per_salon") {
    return { success: false, error: "Já existe um caixa aberto neste salão" }
  }

  console.error(fallback, error)
  return { success: false, error: fallback }
}

/** Trava o caixa ABERTO do salão. NULL = não há caixa aberto. */
async function lockOpenSession(tx: Tx, salonId: string) {
  const [session] = await tx
    .select({ id: cashSessions.id, openingAmount: cashSessions.openingAmount })
    .from(cashSessions)
    .where(and(eq(cashSessions.salonId, salonId), eq(cashSessions.status, "open")))
    .for("update")

  return session ?? null
}

async function loadTotals(tx: Tx, salonId: string, session: { id: string; openingAmount: string }): Promise<CashTotals> {
  const movements = await tx
    .select({ kind: cashMovements.kind, amount: cashMovements.amount })
    .from(cashMovements)
    .where(and(eq(cashMovements.cashSessionId, session.id), eq(cashMovements.salonId, salonId)))

  return cashTotals(session.openingAmount, movements)
}

// ============================================================================
// Abrir, movimentar, fechar
// ============================================================================

export async function openCashSessionService(input: {
  salonId: string
  userId: string
  openingAmount: number
  notes?: string | null
}): Promise<ActionResult<{ cashSessionId: string }>> {
  try {
    const plan = planOpenCash(input.openingAmount)
    if (!plan.ok) return { success: false, error: plan.error }

    const [created] = await db
      .insert(cashSessions)
      .values({
        salonId: input.salonId,
        status: "open",
        openedBy: input.userId,
        openingAmount: plan.openingAmount,
        notes: (input.notes ?? "").trim().slice(0, 500) || null,
      })
      .returning({ id: cashSessions.id })

    return { success: true, data: { cashSessionId: created.id } }
  } catch (error) {
    return toFailure(error, "Não foi possível abrir o caixa")
  }
}

/** Suprimento (entra dinheiro) ou sangria (sai dinheiro) no caixa aberto. */
export async function addCashMovementService(input: {
  salonId: string
  userId: string
  kind: "supply" | "withdrawal"
  amount: number
  description?: string | null
}): Promise<ActionResult<void>> {
  try {
    await db.transaction(async (tx) => {
      const session = await lockOpenSession(tx, input.salonId)
      if (!session) fail("Não há caixa aberto")

      const totals = await loadTotals(tx, input.salonId, session)
      const plan = planCashMovement(input, totals)
      if (!plan.ok) fail(plan.error)

      await tx.insert(cashMovements).values({
        salonId: input.salonId,
        cashSessionId: session.id,
        kind: plan.kind,
        amount: plan.amount,
        description: plan.description,
        createdBy: input.userId,
      })
    })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível registrar o movimento")
  }
}

/** Fecha o caixa aberto: grava o esperado, o contado e a diferença. */
export async function closeCashSessionService(input: {
  salonId: string
  userId: string
  countedAmount: number
  notes?: string | null
}): Promise<ActionResult<{ difference: string }>> {
  try {
    const difference = await db.transaction(async (tx) => {
      const session = await lockOpenSession(tx, input.salonId)
      if (!session) fail("Não há caixa aberto")

      const totals = await loadTotals(tx, input.salonId, session)
      const plan = planCloseCash(input.countedAmount, totals)
      if (!plan.ok) fail(plan.error)

      const now = new Date()
      const notes = (input.notes ?? "").trim().slice(0, 500)

      await tx
        .update(cashSessions)
        .set({
          status: "closed",
          closedBy: input.userId,
          closedAt: now,
          expectedAmount: plan.expectedAmount,
          countedAmount: plan.countedAmount,
          difference: plan.difference,
          // Observação do fechamento substitui a da abertura só se informada.
          ...(notes ? { notes } : {}),
          updatedAt: now,
        })
        .where(and(eq(cashSessions.id, session.id), eq(cashSessions.salonId, input.salonId)))

      return plan.difference
    })

    return { success: true, data: { difference } }
  } catch (error) {
    return toFailure(error, "Não foi possível fechar o caixa")
  }
}

// ============================================================================
// Comanda → caixa
// ============================================================================

/**
 * Pagamentos em DINHEIRO de uma comanda que acabou de ser faturada entram no caixa
 * aberto. Roda DENTRO da transação do faturamento (services/sales.service.ts).
 *
 * Sem caixa aberto não registra nada e não impede o faturamento: o caixa é um
 * controle que o salão pode ou não usar, e a venda não pode depender dele.
 *
 * O caminho de volta não precisa de código: reabrir a comanda apaga os pagamentos,
 * e a FK sale_payment_id é ON DELETE CASCADE.
 */
export async function recordSaleCashMovements(
  tx: Tx,
  input: {
    salonId: string
    userId: string
    payments: { id: string; paymentMethodId: string; amount: string }[]
  }
): Promise<void> {
  if (input.payments.length === 0) return

  const methodIds = Array.from(new Set(input.payments.map((p) => p.paymentMethodId)))
  const cashMethods = await tx
    .select({ id: paymentMethods.id })
    .from(paymentMethods)
    .where(
      and(
        eq(paymentMethods.salonId, input.salonId),
        eq(paymentMethods.kind, "cash"),
        inArray(paymentMethods.id, methodIds)
      )
    )

  const cashMethodIds = new Set(cashMethods.map((m) => m.id))
  const cashPayments = input.payments.filter((payment) => cashMethodIds.has(payment.paymentMethodId))
  if (cashPayments.length === 0) return

  // Trava o caixa: um fechamento simultâneo espera esta venda entrar (ou entra
  // antes, e aí a venda não acha caixa aberto).
  const session = await lockOpenSession(tx, input.salonId)
  if (!session) return

  await tx.insert(cashMovements).values(
    cashPayments.map((payment) => ({
      salonId: input.salonId,
      cashSessionId: session.id,
      kind: "sale" as const,
      amount: payment.amount,
      salePaymentId: payment.id,
      createdBy: input.userId,
    }))
  )
}

// ============================================================================
// Leitura
// ============================================================================

export type CashMovementRow = {
  id: string
  kind: CashMovementKind
  amount: string
  description: string | null
  createdAt: Date
  createdByName: string | null
  /** Só em movimento de venda. */
  saleId: string | null
  saleNumber: number | null
  customerName: string | null
}

export type OpenCashSession = {
  id: string
  openedAt: Date
  openedByName: string | null
  openingAmount: string
  notes: string | null
  totals: CashTotals
  expectedCents: number
  movements: CashMovementRow[]
}

/** O caixa aberto do salão, com totais e movimentos. NULL = caixa fechado. */
export async function getOpenCashSessionService(salonId: string): Promise<OpenCashSession | null> {
  const [session] = await db
    .select({
      id: cashSessions.id,
      openedAt: cashSessions.openedAt,
      openedByName: operatorName,
      openingAmount: cashSessions.openingAmount,
      notes: cashSessions.notes,
    })
    .from(cashSessions)
    .leftJoin(profiles, eq(profiles.id, cashSessions.openedBy))
    .where(and(eq(cashSessions.salonId, salonId), eq(cashSessions.status, "open")))
    .limit(1)

  if (!session) return null

  const movements = await db
    .select({
      id: cashMovements.id,
      kind: cashMovements.kind,
      amount: cashMovements.amount,
      description: cashMovements.description,
      createdAt: cashMovements.createdAt,
      createdByName: operatorName,
      saleId: sales.id,
      saleNumber: sales.number,
      customerName: customers.name,
    })
    .from(cashMovements)
    .leftJoin(profiles, eq(profiles.id, cashMovements.createdBy))
    .leftJoin(salePayments, eq(salePayments.id, cashMovements.salePaymentId))
    .leftJoin(sales, eq(sales.id, salePayments.saleId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(and(eq(cashMovements.cashSessionId, session.id), eq(cashMovements.salonId, salonId)))
    .orderBy(asc(cashMovements.createdAt))

  const totals = cashTotals(session.openingAmount, movements)

  return { ...session, totals, expectedCents: expectedCashCents(totals), movements }
}

export type ClosedCashSessionRow = {
  id: string
  openedAt: Date
  closedAt: Date | null
  openedByName: string | null
  closedByName: string | null
  openingAmount: string
  expectedAmount: string | null
  countedAmount: string | null
  difference: string | null
  notes: string | null
}

/**
 * Histórico de caixas fechados, do mais recente para o mais antigo. Com
 * `openedBy`, só os que aquele usuário abriu — quem não tem `cash.view_all` vê só
 * os próprios.
 */
export async function listClosedCashSessionsService(input: {
  salonId: string
  openedBy?: string
  limit: number
  offset: number
}): Promise<{ rows: ClosedCashSessionRow[]; total: number }> {
  const where = and(
    eq(cashSessions.salonId, input.salonId),
    eq(cashSessions.status, "closed"),
    input.openedBy ? eq(cashSessions.openedBy, input.openedBy) : undefined
  )

  // Dois joins na mesma tabela (quem abriu, quem fechou): o segundo por subconsulta.
  const closedByName = sql<string | null>`(
    select coalesce(
      nullif(trim(p.full_name), ''),
      nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
      p.email
    )
    from profiles p where p.id = ${cashSessions.closedBy}
  )`

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: cashSessions.id,
        openedAt: cashSessions.openedAt,
        closedAt: cashSessions.closedAt,
        openedByName: operatorName,
        closedByName,
        openingAmount: cashSessions.openingAmount,
        expectedAmount: cashSessions.expectedAmount,
        countedAmount: cashSessions.countedAmount,
        difference: cashSessions.difference,
        notes: cashSessions.notes,
      })
      .from(cashSessions)
      .leftJoin(profiles, eq(profiles.id, cashSessions.openedBy))
      .where(where)
      .orderBy(desc(cashSessions.openedAt))
      .limit(input.limit)
      .offset(input.offset),
    db.select({ total: sql<number>`count(*)::int` }).from(cashSessions).where(where),
  ])

  return { rows, total }
}
