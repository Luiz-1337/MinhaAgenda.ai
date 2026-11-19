import { and, asc, count, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm"

import {
  db,
  customerSubscriptionPeriods,
  customerSubscriptions,
  customers,
  saleItems,
  sales,
  salons,
  subscriptionPlans,
} from "../index"
import { brazilToday } from "../domain/finance"
import { parseSalonModules } from "../domain/permissions"
import { toWhatsAppNumber } from "../domain/care-messages"
import {
  customerSubscriptionDeleteBlocker,
  customerSubscriptionStatus,
  planCustomerSubscription,
  planSubscriptionPeriods,
  planSubscriptionPlan,
  subscriptionDueInDays,
  subscriptionPlanDeleteBlocker,
  type CustomerSubscriptionStatus,
  type SubscriptionForRenewal,
  type SubscriptionPlanDraft,
} from "../domain/subscriptions"
import type { ActionResult } from "./appointments"

/**
 * Assinaturas de cliente (docs/ROADMAP.md, fase 5, fatia 5c).
 *
 * Só I/O: carrega o que a regra pura (domain/subscriptions.ts) precisa, deixa ela
 * decidir e grava. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`. Os ids chegam do cliente;
 * uma referência que não aparece na consulta escopada é tratada como inexistente.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

class SubscriptionRuleError extends Error {}

function fail(message: string): never {
  throw new SubscriptionRuleError(message)
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

function toFailure<T>(error: unknown, fallback: string, inUse: string): ActionResult<T> {
  if (error instanceof SubscriptionRuleError) return { success: false, error: error.message }

  const pg = pgErrorCode(error)
  if (pg.code === "23505" && pg.constraint === "subscription_plans_salon_name_unique") {
    return { success: false, error: "Já existe um plano com esse nome" }
  }
  // Corrida: duas assinaturas do mesmo plano para o mesmo cliente ao mesmo tempo.
  if (pg.code === "23505" && pg.constraint === "customer_subscriptions_customer_plan_unique") {
    return { success: false, error: "O cliente já tem uma assinatura deste plano" }
  }
  // Corrida: entrou uma assinatura (ou uma cobrança) entre a conferência e o DELETE.
  if (pg.code === "23503") return { success: false, error: inUse }

  console.error(fallback, error)
  return { success: false, error: fallback }
}

function unique(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => !!value)))
}

// ============================================================================
// Planos
// ============================================================================

export type SubscriptionPlanRow = {
  id: string
  name: string
  description: string | null
  price: string
  intervalMonths: number
  isActive: boolean
  isVisible: boolean
  /** Assinaturas em vigor (não desativadas) deste plano. */
  subscribers: number
  /** Todas as assinaturas que o plano já teve — com alguma, não se apaga. */
  subscriptions: number
}

export async function listSubscriptionPlansService(salonId: string): Promise<SubscriptionPlanRow[]> {
  const [planRows, countRows] = await Promise.all([
    db
      .select({
        id: subscriptionPlans.id,
        name: subscriptionPlans.name,
        description: subscriptionPlans.description,
        price: subscriptionPlans.price,
        intervalMonths: subscriptionPlans.intervalMonths,
        isActive: subscriptionPlans.isActive,
        isVisible: subscriptionPlans.isVisible,
      })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.salonId, salonId))
      .orderBy(asc(subscriptionPlans.name)),
    db
      .select({
        planId: customerSubscriptions.planId,
        subscriptions: count(),
        subscribers: sql<number>`count(*) filter (where ${customerSubscriptions.deactivatedAt} is null)::int`,
      })
      .from(customerSubscriptions)
      .where(eq(customerSubscriptions.salonId, salonId))
      .groupBy(customerSubscriptions.planId),
  ])

  const counts = new Map(countRows.map((row) => [row.planId, row]))

  return planRows.map((plan) => ({
    ...plan,
    subscribers: counts.get(plan.id)?.subscribers ?? 0,
    subscriptions: counts.get(plan.id)?.subscriptions ?? 0,
  }))
}

/**
 * Cria (sem `planId`) ou altera um plano. Alterar não mexe nas assinaturas que já
 * existem — elas têm a cópia.
 */
export async function saveSubscriptionPlanService(input: {
  salonId: string
  planId?: string | null
  draft: SubscriptionPlanDraft
}): Promise<ActionResult<{ planId: string }>> {
  try {
    const plan = planSubscriptionPlan(input.draft)
    if (!plan.ok) return { success: false, error: plan.error }

    if (input.planId) {
      const [updated] = await db
        .update(subscriptionPlans)
        .set({ ...plan.plan, updatedAt: new Date() })
        .where(and(eq(subscriptionPlans.id, input.planId), eq(subscriptionPlans.salonId, input.salonId)))
        .returning({ id: subscriptionPlans.id })
      if (!updated) return { success: false, error: "Plano não encontrado" }
      return { success: true, data: { planId: updated.id } }
    }

    const [created] = await db
      .insert(subscriptionPlans)
      .values({ ...plan.plan, salonId: input.salonId })
      .returning({ id: subscriptionPlans.id })
    return { success: true, data: { planId: created.id } }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar o plano", "Plano em uso")
  }
}

/** Apaga um plano que nunca teve assinatura. */
export async function deleteSubscriptionPlanService(input: {
  salonId: string
  planId: string
}): Promise<ActionResult<void>> {
  const inUse = "Este plano já tem assinatura. Desative-o em vez de excluir"
  try {
    await db.transaction(async (tx) => {
      const [plan] = await tx
        .select({ id: subscriptionPlans.id })
        .from(subscriptionPlans)
        .where(and(eq(subscriptionPlans.id, input.planId), eq(subscriptionPlans.salonId, input.salonId)))
        .for("update")
      if (!plan) fail("Plano não encontrado")

      const [used] = await tx
        .select({ total: count() })
        .from(customerSubscriptions)
        .where(and(eq(customerSubscriptions.salonId, input.salonId), eq(customerSubscriptions.planId, plan.id)))

      const blocker = subscriptionPlanDeleteBlocker({ subscriptions: used?.total ?? 0 })
      if (blocker) fail(blocker)

      await tx
        .delete(subscriptionPlans)
        .where(and(eq(subscriptionPlans.id, plan.id), eq(subscriptionPlans.salonId, input.salonId)))
    })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir o plano", inUse)
  }
}

// ============================================================================
// Assinaturas
// ============================================================================

/** O vencimento do último período pago de cada assinatura, e a comanda que o pagou. */
async function lastPeriods(
  executor: typeof db | Tx,
  salonId: string,
  subscriptionIds: string[],
  excludeSaleId?: string
): Promise<Map<string, { paidUntil: string; periods: number; saleId: string; saleNumber: number }>> {
  const result = new Map<string, { paidUntil: string; periods: number; saleId: string; saleNumber: number }>()
  if (subscriptionIds.length === 0) return result

  const rows = await executor
    .select({
      subscriptionId: customerSubscriptionPeriods.subscriptionId,
      periodEnd: customerSubscriptionPeriods.periodEnd,
      saleId: sales.id,
      saleNumber: sales.number,
    })
    .from(customerSubscriptionPeriods)
    .innerJoin(sales, eq(sales.id, customerSubscriptionPeriods.saleId))
    .where(
      and(
        eq(customerSubscriptionPeriods.salonId, salonId),
        eq(sales.salonId, salonId),
        inArray(customerSubscriptionPeriods.subscriptionId, subscriptionIds),
        excludeSaleId ? ne(customerSubscriptionPeriods.saleId, excludeSaleId) : undefined
      )
    )
    // O primeiro de cada assinatura é o último período.
    .orderBy(desc(customerSubscriptionPeriods.periodEnd))

  for (const row of rows) {
    const entry = result.get(row.subscriptionId)
    if (entry) {
      entry.periods += 1
      continue
    }
    result.set(row.subscriptionId, {
      paidUntil: row.periodEnd,
      periods: 1,
      saleId: row.saleId,
      saleNumber: row.saleNumber,
    })
  }
  return result
}

/** A comanda ABERTA que já tem a cobrança de cada assinatura, se houver. */
async function openChargeSales(
  executor: typeof db | Tx,
  salonId: string,
  subscriptionIds: string[]
): Promise<Map<string, { saleId: string; number: number }>> {
  const result = new Map<string, { saleId: string; number: number }>()
  if (subscriptionIds.length === 0) return result

  const rows = await executor
    .select({ subscriptionId: saleItems.customerSubscriptionId, saleId: sales.id, number: sales.number })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(
      and(
        eq(saleItems.salonId, salonId),
        eq(sales.salonId, salonId),
        eq(sales.status, "open"),
        inArray(saleItems.customerSubscriptionId, subscriptionIds)
      )
    )
    .orderBy(asc(sales.number))

  for (const row of rows) {
    if (row.subscriptionId && !result.has(row.subscriptionId)) {
      result.set(row.subscriptionId, { saleId: row.saleId, number: row.number })
    }
  }
  return result
}

export type CustomerSubscriptionRow = {
  id: string
  planId: string
  name: string
  price: string
  intervalMonths: number
  startedOn: string
  customerId: string
  customerName: string
  /** Vencimento do último período pago. NULL = nunca foi paga. */
  paidUntil: string | null
  /** Quantas vezes foi cobrada (períodos pagos). */
  periods: number
  /** A comanda que pagou o último período. */
  lastSale: { saleId: string; number: number } | null
  /** Comanda aberta com a cobrança desta assinatura, esperando faturar. */
  openSale: { saleId: string; number: number } | null
  status: CustomerSubscriptionStatus
  /**
   * Dias até o vencimento (fase 8, fatia 8c): 0 = hoje, negativo = já venceu.
   * NULL = nunca foi paga ou está desativada.
   */
  dueInDays: number | null
}

/**
 * Assinaturas do salão, da mais recente para a mais antiga. `customerId` filtra
 * por cliente.
 */
export async function listCustomerSubscriptionsService(input: {
  salonId: string
  customerId?: string
  limit: number
  now: Date
}): Promise<{ rows: CustomerSubscriptionRow[]; truncated: boolean }> {
  const rows = await db
    .select({
      id: customerSubscriptions.id,
      planId: customerSubscriptions.planId,
      name: customerSubscriptions.name,
      price: customerSubscriptions.price,
      intervalMonths: customerSubscriptions.intervalMonths,
      startedOn: customerSubscriptions.startedOn,
      deactivatedAt: customerSubscriptions.deactivatedAt,
      customerId: customerSubscriptions.customerId,
      customerName: customers.name,
    })
    .from(customerSubscriptions)
    .innerJoin(customers, eq(customers.id, customerSubscriptions.customerId))
    .where(
      and(
        eq(customerSubscriptions.salonId, input.salonId),
        input.customerId ? eq(customerSubscriptions.customerId, input.customerId) : undefined
      )
    )
    .orderBy(desc(customerSubscriptions.createdAt))
    .limit(input.limit + 1)

  const visible = rows.slice(0, input.limit)
  const ids = visible.map((row) => row.id)

  const [periods, openSales] = await Promise.all([
    lastPeriods(db, input.salonId, ids),
    openChargeSales(db, input.salonId, ids),
  ])

  const today = brazilToday(input.now)

  return {
    rows: visible.map(({ deactivatedAt, ...row }) => {
      const last = periods.get(row.id)
      const paidUntil = last?.paidUntil ?? null
      const status = customerSubscriptionStatus({ deactivated: deactivatedAt !== null, paidUntil, today })
      return {
        ...row,
        paidUntil,
        periods: last?.periods ?? 0,
        lastSale: last ? { saleId: last.saleId, number: last.saleNumber } : null,
        openSale: openSales.get(row.id) ?? null,
        status,
        dueInDays: subscriptionDueInDays({ status, paidUntil, today }),
      }
    }),
    truncated: rows.length > input.limit,
  }
}

/** Cria a assinatura de um cliente num plano ativo. Nasce pendente: sem cobrança. */
export async function createCustomerSubscriptionService(input: {
  salonId: string
  customerId: string
  planId: string
  now: Date
}): Promise<ActionResult<{ subscriptionId: string }>> {
  try {
    const subscriptionId = await db.transaction(async (tx) => {
      const [customer] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(eq(customers.id, input.customerId), eq(customers.salonId, input.salonId), eq(customers.isSystem, false))
        )
        .limit(1)
      if (!customer) fail("Cliente não encontrado")

      const [plan] = await tx
        .select({
          name: subscriptionPlans.name,
          price: subscriptionPlans.price,
          intervalMonths: subscriptionPlans.intervalMonths,
          isActive: subscriptionPlans.isActive,
        })
        .from(subscriptionPlans)
        .where(and(eq(subscriptionPlans.id, input.planId), eq(subscriptionPlans.salonId, input.salonId)))
        .limit(1)

      const [existing] = await tx
        .select({ id: customerSubscriptions.id })
        .from(customerSubscriptions)
        .where(
          and(
            eq(customerSubscriptions.salonId, input.salonId),
            eq(customerSubscriptions.customerId, input.customerId),
            eq(customerSubscriptions.planId, input.planId),
            isNull(customerSubscriptions.deactivatedAt)
          )
        )
        .limit(1)

      const planned = planCustomerSubscription({ plan: plan ?? null, alreadySubscribed: !!existing, now: input.now })
      if (!planned.ok) fail(planned.error)

      const [created] = await tx
        .insert(customerSubscriptions)
        .values({
          ...planned.subscription,
          salonId: input.salonId,
          customerId: input.customerId,
          planId: input.planId,
        })
        .returning({ id: customerSubscriptions.id })
      return created.id
    })

    return { success: true, data: { subscriptionId } }
  } catch (error) {
    return toFailure(error, "Não foi possível criar a assinatura", "Não foi possível criar a assinatura")
  }
}

/**
 * Desativa ou reativa uma assinatura. Desativar não apaga os períodos pagos: o
 * histórico fica. Reativar não é possível se o cliente já tem outra em vigor do
 * mesmo plano (índice único).
 */
export async function setCustomerSubscriptionActiveService(input: {
  salonId: string
  subscriptionId: string
  active: boolean
  now: Date
}): Promise<ActionResult<void>> {
  try {
    const [updated] = await db
      .update(customerSubscriptions)
      .set({ deactivatedAt: input.active ? null : input.now, updatedAt: input.now })
      .where(
        and(eq(customerSubscriptions.id, input.subscriptionId), eq(customerSubscriptions.salonId, input.salonId))
      )
      .returning({ id: customerSubscriptions.id })
    if (!updated) return { success: false, error: "Assinatura não encontrada" }
    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível alterar a assinatura", "Não foi possível alterar a assinatura")
  }
}

/** Apaga uma assinatura que nunca foi cobrada e não está em nenhuma comanda. */
export async function deleteCustomerSubscriptionService(input: {
  salonId: string
  subscriptionId: string
}): Promise<ActionResult<void>> {
  const inUse = "Esta assinatura está em uma comanda ou já foi cobrada. Desative-a em vez de excluir"
  try {
    await db.transaction(async (tx) => {
      const [subscription] = await tx
        .select({ id: customerSubscriptions.id })
        .from(customerSubscriptions)
        .where(
          and(eq(customerSubscriptions.id, input.subscriptionId), eq(customerSubscriptions.salonId, input.salonId))
        )
        .for("update")
      if (!subscription) fail("Assinatura não encontrada")

      const [[periods], [items]] = await Promise.all([
        tx
          .select({ total: count() })
          .from(customerSubscriptionPeriods)
          .where(
            and(
              eq(customerSubscriptionPeriods.salonId, input.salonId),
              eq(customerSubscriptionPeriods.subscriptionId, subscription.id)
            )
          ),
        tx
          .select({ total: count() })
          .from(saleItems)
          .where(and(eq(saleItems.salonId, input.salonId), eq(saleItems.customerSubscriptionId, subscription.id))),
      ])

      const blocker = customerSubscriptionDeleteBlocker({
        periods: periods?.total ?? 0,
        saleItems: items?.total ?? 0,
      })
      if (blocker) fail(blocker)

      await tx
        .delete(customerSubscriptions)
        .where(and(eq(customerSubscriptions.id, subscription.id), eq(customerSubscriptions.salonId, input.salonId)))
    })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir a assinatura", inUse)
  }
}

/**
 * O que "Renovar" precisa para abrir a comanda da cobrança: o cliente, o valor e,
 * se já houver uma comanda aberta com a cobrança, qual é.
 */
export async function getSubscriptionForRenewalService(input: {
  salonId: string
  subscriptionId: string
}): Promise<{
  customerId: string
  name: string
  price: string
  deactivated: boolean
  openSale: { saleId: string; number: number } | null
} | null> {
  const [subscription] = await db
    .select({
      id: customerSubscriptions.id,
      customerId: customerSubscriptions.customerId,
      name: customerSubscriptions.name,
      price: customerSubscriptions.price,
      deactivatedAt: customerSubscriptions.deactivatedAt,
    })
    .from(customerSubscriptions)
    .where(and(eq(customerSubscriptions.id, input.subscriptionId), eq(customerSubscriptions.salonId, input.salonId)))
    .limit(1)
  if (!subscription) return null

  const openSales = await openChargeSales(db, input.salonId, [subscription.id])

  return {
    customerId: subscription.customerId,
    name: subscription.name,
    price: subscription.price,
    deactivated: subscription.deactivatedAt !== null,
    openSale: openSales.get(subscription.id) ?? null,
  }
}

// ============================================================================
// Comanda → período
// ============================================================================

/**
 * Assinaturas citadas pelos itens de uma comanda — o catálogo da cobrança.
 * Escopado pelo salão: assinatura de outro salão não aparece, e a regra trata como
 * inexistente.
 */
export async function loadSaleSubscriptions(
  executor: typeof db | Tx,
  salonId: string,
  subscriptionIds: string[]
): Promise<Map<string, { name: string; customerId: string; deactivated: boolean }>> {
  const ids = unique(subscriptionIds)
  if (ids.length === 0) return new Map()

  const rows = await executor
    .select({
      id: customerSubscriptions.id,
      name: customerSubscriptions.name,
      customerId: customerSubscriptions.customerId,
      deactivatedAt: customerSubscriptions.deactivatedAt,
    })
    .from(customerSubscriptions)
    .where(and(eq(customerSubscriptions.salonId, salonId), inArray(customerSubscriptions.id, ids)))

  return new Map(
    rows.map((row) => [
      row.id,
      { name: row.name, customerId: row.customerId, deactivated: row.deactivatedAt !== null },
    ])
  )
}

export type CustomerSubscriptionOption = {
  id: string
  name: string
  price: string
  paidUntil: string | null
  status: CustomerSubscriptionStatus
}

/** As assinaturas em vigor de um cliente — o botão "+ Assinatura" da comanda. */
export async function listCustomerSubscriptionOptionsService(input: {
  salonId: string
  customerId: string
  now: Date
}): Promise<CustomerSubscriptionOption[]> {
  const rows = await db
    .select({ id: customerSubscriptions.id, name: customerSubscriptions.name, price: customerSubscriptions.price })
    .from(customerSubscriptions)
    .where(
      and(
        eq(customerSubscriptions.salonId, input.salonId),
        eq(customerSubscriptions.customerId, input.customerId),
        isNull(customerSubscriptions.deactivatedAt)
      )
    )
    .orderBy(asc(customerSubscriptions.name))
    .limit(50)

  const periods = await lastPeriods(
    db,
    input.salonId,
    rows.map((row) => row.id)
  )
  const today = brazilToday(input.now)

  return rows.map((row) => {
    const paidUntil = periods.get(row.id)?.paidUntil ?? null
    return { ...row, paidUntil, status: customerSubscriptionStatus({ deactivated: false, paidUntil, today }) }
  })
}

/**
 * Cria os períodos pagos pelos itens de assinatura de uma comanda que acabou de
 * ser faturada. Roda DENTRO da transação do faturamento.
 *
 * As assinaturas ficam travadas (FOR UPDATE) antes de ler o último vencimento:
 * duas comandas da mesma assinatura faturadas ao mesmo tempo viram dois períodos
 * em sequência, não dois iguais.
 *
 * Devolve a mensagem de erro (o chamador aborta a transação), ou null.
 */
export async function recordSaleSubscriptions(
  tx: Tx,
  input: { salonId: string; saleId: string; saleDate: Date }
): Promise<string | null> {
  const items = await tx
    .select({
      id: saleItems.id,
      customerSubscriptionId: saleItems.customerSubscriptionId,
      total: saleItems.total,
    })
    .from(saleItems)
    .where(
      and(eq(saleItems.saleId, input.saleId), eq(saleItems.salonId, input.salonId), eq(saleItems.kind, "subscription"))
    )
    .orderBy(asc(saleItems.position))

  const subscriptionIds = unique(items.map((item) => item.customerSubscriptionId))
  if (subscriptionIds.length === 0) return null

  const subscriptionRows = await tx
    .select({
      id: customerSubscriptions.id,
      name: customerSubscriptions.name,
      intervalMonths: customerSubscriptions.intervalMonths,
      deactivatedAt: customerSubscriptions.deactivatedAt,
    })
    .from(customerSubscriptions)
    .where(and(eq(customerSubscriptions.salonId, input.salonId), inArray(customerSubscriptions.id, subscriptionIds)))
    .orderBy(asc(customerSubscriptions.id))
    .for("update")

  const periods = await lastPeriods(tx, input.salonId, subscriptionIds, input.saleId)

  const subscriptions = new Map<string, SubscriptionForRenewal>(
    subscriptionRows.map((row) => [
      row.id,
      {
        name: row.name,
        intervalMonths: row.intervalMonths,
        deactivated: row.deactivatedAt !== null,
        paidUntil: periods.get(row.id)?.paidUntil ?? null,
      },
    ])
  )

  const planned = planSubscriptionPeriods({ saleDate: input.saleDate, items, subscriptions })
  if (!planned.ok) return planned.error

  if (planned.periods.length > 0) {
    await tx
      .insert(customerSubscriptionPeriods)
      .values(planned.periods.map((period) => ({ ...period, salonId: input.salonId, saleId: input.saleId })))
  }
  return null
}

/**
 * Assinaturas desta comanda que já foram renovadas DEPOIS, em outra comanda.
 * Reabrir esta apagaria um período do meio; quem reabre pergunta antes.
 */
export async function saleSubscriptionsRenewedLater(
  tx: Tx,
  input: { salonId: string; saleId: string }
): Promise<{ name: string; saleNumber: number }[]> {
  const mine = await tx
    .select({
      subscriptionId: customerSubscriptionPeriods.subscriptionId,
      periodStart: customerSubscriptionPeriods.periodStart,
      name: customerSubscriptions.name,
    })
    .from(customerSubscriptionPeriods)
    .innerJoin(customerSubscriptions, eq(customerSubscriptions.id, customerSubscriptionPeriods.subscriptionId))
    .where(
      and(eq(customerSubscriptionPeriods.saleId, input.saleId), eq(customerSubscriptionPeriods.salonId, input.salonId))
    )

  const later: { name: string; saleNumber: number }[] = []
  for (const period of mine) {
    const [next] = await tx
      .select({ saleNumber: sales.number })
      .from(customerSubscriptionPeriods)
      .innerJoin(sales, eq(sales.id, customerSubscriptionPeriods.saleId))
      .where(
        and(
          eq(customerSubscriptionPeriods.salonId, input.salonId),
          eq(customerSubscriptionPeriods.subscriptionId, period.subscriptionId),
          ne(customerSubscriptionPeriods.saleId, input.saleId),
          gt(customerSubscriptionPeriods.periodStart, period.periodStart)
        )
      )
      .orderBy(asc(customerSubscriptionPeriods.periodStart))
      .limit(1)
    if (next) later.push({ name: period.name, saleNumber: next.saleNumber })
  }
  return later
}

/**
 * Desfaz os períodos que uma comanda pagou, quando ela é reaberta. Roda DENTRO da
 * transação da reabertura.
 */
export async function revertSaleSubscriptions(tx: Tx, input: { salonId: string; saleId: string }): Promise<void> {
  await tx
    .delete(customerSubscriptionPeriods)
    .where(
      and(eq(customerSubscriptionPeriods.saleId, input.saleId), eq(customerSubscriptionPeriods.salonId, input.salonId))
    )
}

// ============================================================================
// Página pública de planos (fase 8, fatia 8c)
// ============================================================================

export type PublicSubscriptionPlan = {
  id: string
  name: string
  description: string | null
  price: string
  intervalMonths: number
}

export type PublicSubscriptionPlans = {
  salonName: string
  /** O WhatsApp do salão, só dígitos, para o botão de contato. NULL = não tem. */
  salonWhatsapp: string | null
  plans: PublicSubscriptionPlan[]
}

/**
 * O que a página pública de planos mostra. NULL = salão desconhecido OU sem o
 * módulo de pacotes e assinaturas (mesma resposta para os dois, de propósito).
 *
 * Só entram planos ATIVOS e marcados como visíveis. A página não vende nem
 * cobra: mostra os planos e manda falar com o salão.
 */
export async function getPublicSubscriptionPlansService(salonId: unknown): Promise<PublicSubscriptionPlans | null> {
  if (typeof salonId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(salonId)) {
    return null
  }
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { id: true, name: true, whatsapp: true, settings: true },
  })
  if (!salon || !parseSalonModules(salon.settings).includes("packages")) return null

  const plans = await db
    .select({
      id: subscriptionPlans.id,
      name: subscriptionPlans.name,
      description: subscriptionPlans.description,
      price: subscriptionPlans.price,
      intervalMonths: subscriptionPlans.intervalMonths,
    })
    .from(subscriptionPlans)
    .where(
      and(
        eq(subscriptionPlans.salonId, salon.id),
        eq(subscriptionPlans.isActive, true),
        eq(subscriptionPlans.isVisible, true)
      )
    )
    .orderBy(asc(subscriptionPlans.price), asc(subscriptionPlans.name))

  const whatsapp = toWhatsAppNumber(salon.whatsapp)
  return { salonName: salon.name, salonWhatsapp: whatsapp ? whatsapp.slice(1) : null, plans }
}
