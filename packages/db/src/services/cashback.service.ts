import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import {
  db,
  cashbackEntries,
  cashbackRules,
  cashbackSettings,
  customers,
  products,
  saleItems,
  sales,
  services,
} from "../index"
import type { CashbackEntryKind } from "../schema"
import {
  cashbackReopenBlocker,
  cashbackStatus,
  planCashbackAdjustment,
  planCashbackRedeem,
  planCashbackRule,
  planCashbackSettings,
  planSaleCashbackEarn,
  summarizeCashbackHistory,
  type CashbackHistorySummary,
  type CashbackRateKind,
  type CashbackRuleForItem,
  type CashbackSettingsDraft,
  type CashbackStatus,
} from "../domain/cashback"
import { centsToNumeric, toCents } from "../domain/sales"
import type { ActionResult } from "./appointments"

/**
 * Cashback (docs/ROADMAP.md, fase 6, fatia 6a).
 *
 * Só I/O: carrega o que a regra pura (domain/cashback.ts) precisa, deixa ela
 * decidir e grava. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`. Os ids chegam do cliente;
 * uma referência que não aparece na consulta escopada é tratada como inexistente.
 *
 * Concorrência: quem mexe no saldo (resgate, ajuste, reabertura) trava antes a
 * linha do CLIENTE (FOR UPDATE). O saldo é uma soma — sem a trava, dois resgates
 * ao mesmo tempo leriam o mesmo saldo e gastariam o crédito duas vezes.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Executor = typeof db | Tx

class CashbackRuleError extends Error {}

function fail(message: string): never {
  throw new CashbackRuleError(message)
}

function toFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof CashbackRuleError) return { success: false, error: error.message }
  console.error(fallback, error)
  return { success: false, error: fallback }
}

// ============================================================================
// Configuração
// ============================================================================

export type CashbackSettingsRow = {
  isEnabled: boolean
  defaultKind: CashbackRateKind
  defaultValue: string
  minRedeem: string
}

const DEFAULT_SETTINGS: CashbackSettingsRow = {
  isEnabled: false,
  defaultKind: "percent",
  defaultValue: "0.00",
  minRedeem: "0.00",
}

/** A configuração do salão. Sem linha gravada, o cashback está desligado. */
export async function getCashbackSettingsService(
  salonId: string,
  executor: Executor = db
): Promise<CashbackSettingsRow> {
  const [row] = await executor
    .select({
      isEnabled: cashbackSettings.isEnabled,
      defaultKind: cashbackSettings.defaultKind,
      defaultValue: cashbackSettings.defaultValue,
      minRedeem: cashbackSettings.minRedeem,
    })
    .from(cashbackSettings)
    .where(eq(cashbackSettings.salonId, salonId))
    .limit(1)
  return row ?? DEFAULT_SETTINGS
}

export async function saveCashbackSettingsService(input: {
  salonId: string
  draft: CashbackSettingsDraft
}): Promise<ActionResult<void>> {
  try {
    const plan = planCashbackSettings(input.draft)
    if (!plan.ok) return { success: false, error: plan.error }

    await db
      .insert(cashbackSettings)
      .values({ ...plan.settings, salonId: input.salonId })
      .onConflictDoUpdate({ target: cashbackSettings.salonId, set: { ...plan.settings, updatedAt: new Date() } })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar as configurações de cashback")
  }
}

// ============================================================================
// Regras por item
// ============================================================================

export type CashbackItemRow = {
  itemKind: "service" | "product"
  id: string
  name: string
  /** A regra do item. NULL = nunca foi configurado: usa o padrão do salão. */
  rule: CashbackRuleForItem | null
}

/** Serviços e produtos ativos do salão, com a regra de cashback de cada um. */
export async function listCashbackItemsService(salonId: string): Promise<CashbackItemRow[]> {
  const [serviceRows, productRows] = await Promise.all([
    db
      .select({
        id: services.id,
        name: services.name,
        kind: cashbackRules.kind,
        value: cashbackRules.value,
        isActive: cashbackRules.isActive,
      })
      .from(services)
      .leftJoin(cashbackRules, and(eq(cashbackRules.serviceId, services.id), eq(cashbackRules.salonId, salonId)))
      .where(and(eq(services.salonId, salonId), eq(services.isActive, true), eq(services.isSystem, false)))
      .orderBy(asc(services.name)),
    db
      .select({
        id: products.id,
        name: products.name,
        kind: cashbackRules.kind,
        value: cashbackRules.value,
        isActive: cashbackRules.isActive,
      })
      .from(products)
      .leftJoin(cashbackRules, and(eq(cashbackRules.productId, products.id), eq(cashbackRules.salonId, salonId)))
      .where(and(eq(products.salonId, salonId), eq(products.isActive, true)))
      .orderBy(asc(products.name)),
  ])

  const toRow = (itemKind: "service" | "product") =>
    (row: (typeof serviceRows)[number]): CashbackItemRow => ({
      itemKind,
      id: row.id,
      name: row.name,
      rule:
        row.kind !== null && row.value !== null && row.isActive !== null
          ? { kind: row.kind, value: row.value, isActive: row.isActive }
          : null,
    })

  return [...serviceRows.map(toRow("service")), ...productRows.map(toRow("product"))]
}

/** Grava a regra de cashback de um serviço ou produto do salão. */
export async function saveCashbackRuleService(input: {
  salonId: string
  itemKind: "service" | "product"
  itemId: string
  draft: { kind: unknown; value: unknown; isActive: unknown }
}): Promise<ActionResult<void>> {
  try {
    const plan = planCashbackRule(input.draft)
    if (!plan.ok) return { success: false, error: plan.error }

    await db.transaction(async (tx) => {
      // O item tem de ser deste salão — o id chega do cliente.
      const [item] =
        input.itemKind === "service"
          ? await tx
              .select({ id: services.id })
              .from(services)
              .where(and(eq(services.id, input.itemId), eq(services.salonId, input.salonId), eq(services.isSystem, false)))
              .limit(1)
          : await tx
              .select({ id: products.id })
              .from(products)
              .where(and(eq(products.id, input.itemId), eq(products.salonId, input.salonId)))
              .limit(1)
      if (!item) fail(input.itemKind === "service" ? "Serviço não encontrado" : "Produto não encontrado")

      const column = input.itemKind === "service" ? cashbackRules.serviceId : cashbackRules.productId
      const [existing] = await tx
        .select({ id: cashbackRules.id })
        .from(cashbackRules)
        .where(and(eq(cashbackRules.salonId, input.salonId), eq(column, item.id)))
        .limit(1)

      if (existing) {
        await tx
          .update(cashbackRules)
          .set({ ...plan.rule, updatedAt: new Date() })
          .where(and(eq(cashbackRules.id, existing.id), eq(cashbackRules.salonId, input.salonId)))
      } else {
        await tx.insert(cashbackRules).values({
          ...plan.rule,
          salonId: input.salonId,
          serviceId: input.itemKind === "service" ? item.id : null,
          productId: input.itemKind === "product" ? item.id : null,
        })
      }
    })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar o cashback do item")
  }
}

// ============================================================================
// Saldo e extrato
// ============================================================================

/** Saldo de cashback de um cliente, em centavos: a soma do extrato. */
export async function getCashbackBalanceCents(
  executor: Executor,
  input: { salonId: string; customerId: string }
): Promise<number> {
  const [row] = await executor
    .select({ balance: sql<string>`coalesce(sum(${cashbackEntries.amount}), 0)::text` })
    .from(cashbackEntries)
    .where(and(eq(cashbackEntries.salonId, input.salonId), eq(cashbackEntries.customerId, input.customerId)))
  return toCents(row?.balance ?? "0") ?? 0
}

/**
 * Trava o cliente (FOR UPDATE) e devolve o saldo. Quem vai gastar ou tirar saldo
 * chama isto ANTES de decidir. FALSE = o cliente não é deste salão.
 */
async function lockCustomerBalance(
  tx: Tx,
  input: { salonId: string; customerId: string }
): Promise<{ found: boolean; balanceCents: number }> {
  const [customer] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, input.customerId), eq(customers.salonId, input.salonId)))
    .for("update")
  if (!customer) return { found: false, balanceCents: 0 }
  return { found: true, balanceCents: await getCashbackBalanceCents(tx, input) }
}

export type CashbackCustomerRow = {
  customerId: string
  customerName: string
  balance: string
  earned: string
  redeemed: string
  status: CashbackStatus
}

/** Clientes com movimento de cashback, do maior saldo para o menor. */
export async function listCashbackCustomersService(input: {
  salonId: string
  limit: number
}): Promise<{ rows: CashbackCustomerRow[]; truncated: boolean; minRedeem: string }> {
  const balance = sql<string>`sum(${cashbackEntries.amount})`

  const [settings, rows] = await Promise.all([
    getCashbackSettingsService(input.salonId),
    db
      .select({
        customerId: customers.id,
        customerName: customers.name,
        balance: sql<string>`${balance}::text`,
        earned: sql<string>`coalesce(sum(${cashbackEntries.amount}) filter (where ${cashbackEntries.amount} > 0), 0)::text`,
        redeemed: sql<string>`coalesce(-sum(${cashbackEntries.amount}) filter (where ${cashbackEntries.amount} < 0), 0)::text`,
      })
      .from(cashbackEntries)
      .innerJoin(customers, eq(customers.id, cashbackEntries.customerId))
      .where(eq(cashbackEntries.salonId, input.salonId))
      .groupBy(customers.id, customers.name)
      .orderBy(desc(balance), asc(customers.name))
      .limit(input.limit + 1),
  ])

  const minRedeemCents = toCents(settings.minRedeem) ?? 0

  return {
    rows: rows.slice(0, input.limit).map((row) => ({
      ...row,
      status: cashbackStatus({ balanceCents: toCents(row.balance) ?? 0, minRedeemCents }),
    })),
    truncated: rows.length > input.limit,
    minRedeem: settings.minRedeem,
  }
}

export type CashbackEntryRow = {
  id: string
  kind: CashbackEntryKind
  amount: string
  reason: string | null
  createdAt: Date
  saleId: string | null
  saleNumber: number | null
  /** O item que gerou o ganho. */
  itemDescription: string | null
}

/** O extrato de um cliente, do mais recente para o mais antigo, com o saldo. */
export async function getCustomerCashbackService(input: {
  salonId: string
  customerId: string
  limit: number
}): Promise<{ balance: string; minRedeem: string; isEnabled: boolean; status: CashbackStatus; entries: CashbackEntryRow[] }> {
  const [settings, balanceCents, entries] = await Promise.all([
    getCashbackSettingsService(input.salonId),
    getCashbackBalanceCents(db, input),
    db
      .select({
        id: cashbackEntries.id,
        kind: cashbackEntries.kind,
        amount: cashbackEntries.amount,
        reason: cashbackEntries.reason,
        createdAt: cashbackEntries.createdAt,
        saleId: cashbackEntries.saleId,
        saleNumber: sales.number,
        itemDescription: saleItems.description,
      })
      .from(cashbackEntries)
      .leftJoin(sales, and(eq(sales.id, cashbackEntries.saleId), eq(sales.salonId, input.salonId)))
      .leftJoin(saleItems, and(eq(saleItems.id, cashbackEntries.saleItemId), eq(saleItems.salonId, input.salonId)))
      .where(and(eq(cashbackEntries.salonId, input.salonId), eq(cashbackEntries.customerId, input.customerId)))
      .orderBy(desc(cashbackEntries.createdAt), desc(cashbackEntries.id))
      .limit(input.limit),
  ])

  return {
    balance: centsToNumeric(balanceCents),
    minRedeem: settings.minRedeem,
    isEnabled: settings.isEnabled,
    status: cashbackStatus({ balanceCents, minRedeemCents: toCents(settings.minRedeem) ?? 0 }),
    entries,
  }
}

/** Lança um crédito (positivo) ou um débito (negativo) à mão, com motivo. */
export async function adjustCashbackService(input: {
  salonId: string
  customerId: string
  amount: number
  reason: string
  userId: string
}): Promise<ActionResult<{ balance: string }>> {
  try {
    const balance = await db.transaction(async (tx) => {
      const locked = await lockCustomerBalance(tx, input)
      if (!locked.found) fail("Cliente não encontrado")

      const plan = planCashbackAdjustment({
        amount: input.amount,
        reason: input.reason,
        balanceCents: locked.balanceCents,
      })
      if (!plan.ok) fail(plan.error)

      await tx.insert(cashbackEntries).values({
        salonId: input.salonId,
        customerId: input.customerId,
        kind: "adjustment",
        amount: plan.amount,
        reason: plan.reason,
        createdBy: input.userId,
      })

      return centsToNumeric(locked.balanceCents + (toCents(plan.amount) ?? 0))
    })

    return { success: true, data: { balance } }
  } catch (error) {
    return toFailure(error, "Não foi possível lançar o ajuste de cashback")
  }
}

// ============================================================================
// Comanda → cashback
// ============================================================================

/**
 * Confere o cashback que a comanda quer usar, com o cliente TRAVADO até o fim da
 * transação do faturamento. Devolve quanto usar, em centavos, ou a mensagem de
 * erro. Sem pedido de uso não trava nem consulta nada.
 */
export async function planSaleCashbackRedeem(
  tx: Tx,
  input: {
    salonId: string
    customerId: string
    /** Em reais, como veio da tela. */
    requested: number
    totalCents: number
    /** Módulo `cashback` ligado no salão. */
    moduleEnabled: boolean
  }
): Promise<{ ok: true; redeemCents: number } | { ok: false; error: string }> {
  if (!input.requested) return { ok: true, redeemCents: 0 }

  const settings = await getCashbackSettingsService(input.salonId, tx)
  const locked = await lockCustomerBalance(tx, input)
  if (!locked.found) return { ok: false, error: "Cliente não encontrado" }

  return planCashbackRedeem({
    enabled: input.moduleEnabled && settings.isEnabled,
    requested: input.requested,
    balanceCents: locked.balanceCents,
    minRedeemCents: toCents(settings.minRedeem) ?? 0,
    totalCents: input.totalCents,
  })
}

/**
 * Grava o que uma comanda recém-faturada faz no cashback do cliente: o resgate
 * (se usou) e os ganhos dos itens. Roda DENTRO da transação do faturamento.
 *
 * O ganho só acontece com o módulo ligado E o cashback ativado no salão. O resgate
 * já foi conferido por planSaleCashbackRedeem.
 */
export async function recordSaleCashback(
  tx: Tx,
  input: {
    salonId: string
    saleId: string
    customerId: string
    totalCents: number
    redeemCents: number
    moduleEnabled: boolean
    userId: string
  }
): Promise<void> {
  if (input.redeemCents > 0) {
    await tx.insert(cashbackEntries).values({
      salonId: input.salonId,
      customerId: input.customerId,
      kind: "redeem",
      amount: centsToNumeric(-input.redeemCents),
      saleId: input.saleId,
      createdBy: input.userId,
    })
  }

  if (!input.moduleEnabled) return
  const settings = await getCashbackSettingsService(input.salonId, tx)
  if (!settings.isEnabled) return

  const items = await tx
    .select({
      id: saleItems.id,
      kind: saleItems.kind,
      serviceId: saleItems.serviceId,
      productId: saleItems.productId,
      total: saleItems.total,
      quantity: saleItems.quantity,
    })
    .from(saleItems)
    .where(and(eq(saleItems.saleId, input.saleId), eq(saleItems.salonId, input.salonId)))
    .orderBy(asc(saleItems.position))

  const serviceIds = items.flatMap((item) => (item.serviceId ? [item.serviceId] : []))
  const productIds = items.flatMap((item) => (item.productId ? [item.productId] : []))

  const [serviceRuleRows, productRuleRows] = await Promise.all([
    serviceIds.length
      ? tx
          .select({
            itemId: cashbackRules.serviceId,
            kind: cashbackRules.kind,
            value: cashbackRules.value,
            isActive: cashbackRules.isActive,
          })
          .from(cashbackRules)
          .where(and(eq(cashbackRules.salonId, input.salonId), inArray(cashbackRules.serviceId, serviceIds)))
      : [],
    productIds.length
      ? tx
          .select({
            itemId: cashbackRules.productId,
            kind: cashbackRules.kind,
            value: cashbackRules.value,
            isActive: cashbackRules.isActive,
          })
          .from(cashbackRules)
          .where(and(eq(cashbackRules.salonId, input.salonId), inArray(cashbackRules.productId, productIds)))
      : [],
  ])

  const toMap = (rows: typeof serviceRuleRows) =>
    new Map<string, CashbackRuleForItem>(
      rows.flatMap(({ itemId, ...rule }) => (itemId ? [[itemId, rule] as const] : []))
    )

  const earned = planSaleCashbackEarn({
    defaults: { kind: settings.defaultKind, value: settings.defaultValue },
    items,
    serviceRules: toMap(serviceRuleRows),
    productRules: toMap(productRuleRows),
    totalCents: input.totalCents,
    redeemedCents: input.redeemCents,
  })

  if (earned.length > 0) {
    await tx.insert(cashbackEntries).values(
      earned.map((entry) => ({
        salonId: input.salonId,
        customerId: input.customerId,
        kind: "earn" as const,
        amount: entry.amount,
        saleId: input.saleId,
        saleItemId: entry.saleItemId,
        createdBy: input.userId,
      }))
    )
  }
}

/**
 * Desfaz o cashback de uma comanda que está sendo reaberta: apaga os ganhos e
 * devolve o resgate. Roda DENTRO da transação da reabertura, com o módulo ligado
 * ou não.
 *
 * Devolve a mensagem de bloqueio (o chamador aborta a transação) quando o ganho
 * desta comanda já foi gasto em outra, ou null.
 */
export async function revertSaleCashback(
  tx: Tx,
  input: { salonId: string; saleId: string; customerId: string }
): Promise<string | null> {
  const [own] = await tx
    .select({
      net: sql<string>`coalesce(sum(${cashbackEntries.amount}), 0)::text`,
      entries: sql<number>`count(*)::int`,
    })
    .from(cashbackEntries)
    .where(and(eq(cashbackEntries.saleId, input.saleId), eq(cashbackEntries.salonId, input.salonId)))

  if (!own || own.entries === 0) return null

  const locked = await lockCustomerBalance(tx, input)
  const blocker = cashbackReopenBlocker({
    balanceCents: locked.balanceCents,
    saleNetCents: toCents(own.net) ?? 0,
  })
  if (blocker) return blocker

  await tx
    .delete(cashbackEntries)
    .where(and(eq(cashbackEntries.saleId, input.saleId), eq(cashbackEntries.salonId, input.salonId)))
  return null
}

/** Quanto uma comanda gerou de cashback (soma dos ganhos), como numeric. */
export async function getSaleCashbackEarned(
  executor: Executor,
  input: { salonId: string; saleId: string }
): Promise<string> {
  const [row] = await executor
    .select({ earned: sql<string>`coalesce(sum(${cashbackEntries.amount}), 0)::text` })
    .from(cashbackEntries)
    .where(
      and(
        eq(cashbackEntries.saleId, input.saleId),
        eq(cashbackEntries.salonId, input.salonId),
        eq(cashbackEntries.kind, "earn")
      )
    )
  return centsToNumeric(toCents(row?.earned ?? "0") ?? 0)
}

// ============================================================================
// Histórico (relatório)
// ============================================================================

export type CashbackHistoryRow = {
  id: string
  kind: CashbackEntryKind
  amount: string
  reason: string | null
  createdAt: Date
  customerId: string
  customerName: string
  saleId: string | null
  saleNumber: number | null
  /** O item que gerou o ganho. */
  itemDescription: string | null
}

/**
 * O relatório "Histórico de cashback" (fatia 6f): todos os lançamentos do período
 * (pelo dia do lançamento, em Brasília), do mais recente para o mais antigo, e os
 * totais. Os totais somam o período INTEIRO, mesmo quando a lista é cortada.
 */
export async function listCashbackHistoryService(input: {
  salonId: string
  /** "YYYY-MM-DD". */
  from: string
  to: string
  limit: number
}): Promise<{ rows: CashbackHistoryRow[]; truncated: boolean; summary: CashbackHistorySummary }> {
  const entryDay = sql`(${cashbackEntries.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date`
  const inPeriod = and(
    eq(cashbackEntries.salonId, input.salonId),
    sql`${entryDay} BETWEEN ${input.from}::date AND ${input.to}::date`
  )

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: cashbackEntries.id,
        kind: cashbackEntries.kind,
        amount: cashbackEntries.amount,
        reason: cashbackEntries.reason,
        createdAt: cashbackEntries.createdAt,
        customerId: customers.id,
        customerName: customers.name,
        saleId: cashbackEntries.saleId,
        saleNumber: sales.number,
        itemDescription: saleItems.description,
      })
      .from(cashbackEntries)
      .innerJoin(customers, eq(customers.id, cashbackEntries.customerId))
      .leftJoin(sales, and(eq(sales.id, cashbackEntries.saleId), eq(sales.salonId, input.salonId)))
      .leftJoin(saleItems, and(eq(saleItems.id, cashbackEntries.saleItemId), eq(saleItems.salonId, input.salonId)))
      .where(inPeriod)
      .orderBy(desc(cashbackEntries.createdAt), desc(cashbackEntries.id))
      .limit(input.limit + 1),
    db
      .select({
        kind: cashbackEntries.kind,
        total: sql<string>`sum(${cashbackEntries.amount})::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(cashbackEntries)
      .where(inPeriod)
      .groupBy(cashbackEntries.kind),
  ])

  return {
    rows: rows.slice(0, input.limit),
    truncated: rows.length > input.limit,
    summary: summarizeCashbackHistory(totals),
  }
}
