import { and, asc, eq, inArray, sql } from "drizzle-orm"

import { db, productBatches, products, stockMovements } from "../index"
import type { StockMovementKind } from "../schema"
import {
  batchStatus,
  daysBetween,
  distributeBalance,
  planBatch,
  type BatchDraft,
  type BatchPlan,
  type BatchStatus,
} from "../domain/batches"
import { brazilToday } from "../domain/finance"
import { milliToNumeric, toMilli } from "../domain/inventory"
import type { ActionResult } from "./appointments"

/**
 * Lotes e validades (docs/ROADMAP.md, fase 4, fatia 4c).
 *
 * Só I/O: carrega o que a regra pura (domain/batches.ts) precisa, deixa ela decidir
 * e grava. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`. Os ids chegam do cliente; o
 * que não aparece na consulta escopada é tratado como inexistente.
 *
 * O que resta de cada lote não é gravado: a leitura soma o saldo do produto e
 * distribui pelos lotes (sai primeiro o que vence primeiro).
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

class BatchRuleError extends Error {}

function fail(message: string): never {
  throw new BatchRuleError(message)
}

function toFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof BatchRuleError) return { success: false, error: error.message }
  console.error(fallback, error)
  return { success: false, error: fallback }
}

// ============================================================================
// Leitura
// ============================================================================

export type BatchRow = {
  id: string
  productId: string
  productName: string
  code: string | null
  /** "YYYY-MM-DD". */
  manufacturedOn: string | null
  expiresOn: string | null
  /** O que entrou com o lote (numeric como string). */
  quantity: string
  /** O que ainda resta, pela regra "vence primeiro, sai primeiro". */
  remaining: string
  status: BatchStatus
  /** Dias até vencer (negativo = vencido há tantos dias). NULL = sem validade. */
  daysToExpire: number | null
  notes: string | null
  /** De onde o lote veio: entrada manual, compra, ou NULL = registrado solto. */
  origin: Extract<StockMovementKind, "in" | "purchase"> | null
  createdAt: Date
}

export type BatchesOverview = {
  rows: BatchRow[]
  /** Lotes com produto na prateleira e validade vencida. */
  expired: number
  /** Lotes com produto na prateleira vencendo dentro do aviso. */
  expiring: number
}

/**
 * Os lotes do salão, do que vence primeiro para o que vence por último, com o que
 * resta em cada um e a situação.
 */
export async function listBatchesService(salonId: string, now: Date = new Date()): Promise<BatchesOverview> {
  const batchRows = await db
    .select({
      id: productBatches.id,
      productId: productBatches.productId,
      productName: products.name,
      code: productBatches.code,
      manufacturedOn: productBatches.manufacturedOn,
      expiresOn: productBatches.expiresOn,
      quantity: productBatches.quantity,
      notes: productBatches.notes,
      movementKind: stockMovements.kind,
      createdAt: productBatches.createdAt,
    })
    .from(productBatches)
    .innerJoin(products, eq(products.id, productBatches.productId))
    .leftJoin(stockMovements, eq(stockMovements.id, productBatches.stockMovementId))
    .where(eq(productBatches.salonId, salonId))
    .orderBy(sql`${productBatches.expiresOn} asc nulls last`, asc(productBatches.createdAt))

  if (batchRows.length === 0) return { rows: [], expired: 0, expiring: 0 }

  const productIds = Array.from(new Set(batchRows.map((row) => row.productId)))
  const balanceRows = await db
    .select({
      productId: stockMovements.productId,
      total: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)`,
    })
    .from(stockMovements)
    .where(and(eq(stockMovements.salonId, salonId), inArray(stockMovements.productId, productIds)))
    .groupBy(stockMovements.productId)

  const balanceByProduct = new Map(balanceRows.map((row) => [row.productId, toMilli(row.total) ?? 0]))

  // O saldo de cada produto é distribuído só entre os lotes DELE.
  const remainingByBatch = new Map<string, number>()
  for (const productId of productIds) {
    const { remaining } = distributeBalance(
      balanceByProduct.get(productId) ?? 0,
      batchRows
        .filter((row) => row.productId === productId)
        .map((row) => ({
          id: row.id,
          quantityMilli: toMilli(row.quantity) ?? 0,
          expiresOn: row.expiresOn,
          createdAt: row.createdAt,
        }))
    )
    for (const [batchId, milli] of remaining) remainingByBatch.set(batchId, milli)
  }

  const today = brazilToday(now)
  const rows: BatchRow[] = batchRows.map(({ movementKind, ...row }) => {
    const remainingMilli = remainingByBatch.get(row.id) ?? 0
    return {
      ...row,
      remaining: milliToNumeric(remainingMilli),
      status: batchStatus({ remainingMilli, expiresOn: row.expiresOn }, today),
      daysToExpire: row.expiresOn ? daysBetween(today, row.expiresOn) : null,
      origin: movementKind === "in" || movementKind === "purchase" ? movementKind : null,
    }
  })

  return {
    rows,
    expired: rows.filter((row) => row.status === "expired").length,
    expiring: rows.filter((row) => row.status === "expiring").length,
  }
}

// ============================================================================
// Escrita
// ============================================================================

/**
 * Grava o lote que veio junto de uma entrada (manual ou de compra). Roda DENTRO da
 * transação que criou o movimento: ou entram os dois, ou nenhum.
 */
export async function insertMovementBatch(
  tx: Tx,
  input: {
    salonId: string
    userId: string
    productId: string
    stockMovementId: string
    plan: Extract<BatchPlan, { ok: true }>
  }
): Promise<void> {
  await tx.insert(productBatches).values({
    salonId: input.salonId,
    productId: input.productId,
    code: input.plan.code,
    manufacturedOn: input.plan.manufacturedOn,
    expiresOn: input.plan.expiresOn,
    quantity: input.plan.quantity,
    notes: input.plan.notes,
    stockMovementId: input.stockMovementId,
    createdBy: input.userId,
  })
}

/**
 * Registra um lote solto: produto que já estava na prateleira quando o salão
 * começou a acompanhar validade. NÃO mexe no saldo — para dar entrada com lote, o
 * caminho é a entrada no estoque ou a compra.
 */
export async function createBatchService(input: {
  salonId: string
  userId: string
  productId: string
  draft: BatchDraft
}): Promise<ActionResult<{ batchId: string }>> {
  try {
    const plan = planBatch(input.draft, new Date())
    if (!plan.ok) fail(plan.error)

    const [product] = await db
      .select({ id: products.id, trackStock: products.trackStock })
      .from(products)
      .where(and(eq(products.id, input.productId), eq(products.salonId, input.salonId)))
      .limit(1)

    if (!product) fail("Produto não encontrado")
    if (!product.trackStock) fail("Ligue o controle de estoque deste produto antes de registrar lotes")

    const [created] = await db
      .insert(productBatches)
      .values({
        salonId: input.salonId,
        productId: product.id,
        code: plan.code,
        manufacturedOn: plan.manufacturedOn,
        expiresOn: plan.expiresOn,
        quantity: plan.quantity,
        notes: plan.notes,
        createdBy: input.userId,
      })
      .returning({ id: productBatches.id })

    return { success: true, data: { batchId: created.id } }
  } catch (error) {
    return toFailure(error, "Não foi possível registrar o lote")
  }
}

/** Corrige um lote: código, datas, quantidade que entrou e observação. */
export async function updateBatchService(input: {
  salonId: string
  batchId: string
  draft: BatchDraft
}): Promise<ActionResult<void>> {
  try {
    const plan = planBatch(input.draft, new Date())
    if (!plan.ok) fail(plan.error)

    const updated = await db
      .update(productBatches)
      .set({
        code: plan.code,
        manufacturedOn: plan.manufacturedOn,
        expiresOn: plan.expiresOn,
        quantity: plan.quantity,
        notes: plan.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(productBatches.id, input.batchId), eq(productBatches.salonId, input.salonId)))
      .returning({ id: productBatches.id })

    if (updated.length === 0) fail("Lote não encontrado")

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar o lote")
  }
}

/** Exclui o registro do lote. O saldo do produto não muda. */
export async function deleteBatchService(input: {
  salonId: string
  batchId: string
}): Promise<ActionResult<void>> {
  try {
    const deleted = await db
      .delete(productBatches)
      .where(and(eq(productBatches.id, input.batchId), eq(productBatches.salonId, input.salonId)))
      .returning({ id: productBatches.id })

    if (deleted.length === 0) fail("Lote não encontrado")

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir o lote")
  }
}
