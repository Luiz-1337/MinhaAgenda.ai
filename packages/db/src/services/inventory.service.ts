import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import { db, products, profiles, saleItems, sales, stockMovements } from "../index"
import type { StockMovementKind } from "../schema"
import {
  milliToNumeric,
  planProductStockSettings,
  planSaleStockMovements,
  planStockMovement,
  toMilli,
} from "../domain/inventory"
import type { ActionResult } from "./appointments"

/**
 * Estoque (docs/ROADMAP.md, fase 4, fatia 4a).
 *
 * Só I/O: carrega o que a regra pura (domain/inventory.ts) precisa, deixa ela
 * decidir e grava. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`. O id do produto chega do
 * cliente; um produto que não aparece na consulta escopada é tratado como
 * inexistente.
 *
 * O saldo é a soma dos movimentos — nunca é gravado. Quem lança um movimento trava
 * a linha do produto (FOR UPDATE) antes de somar: dois acertos ao mesmo tempo não
 * podem partir do mesmo saldo.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

class InventoryRuleError extends Error {}

function fail(message: string): never {
  throw new InventoryRuleError(message)
}

function toFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof InventoryRuleError) return { success: false, error: error.message }
  console.error(fallback, error)
  return { success: false, error: fallback }
}

/** Soma dos movimentos de um produto, em milésimos. Roda dentro da transação que travou o produto. */
async function productBalanceMilli(tx: Tx, salonId: string, productId: string): Promise<number> {
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)` })
    .from(stockMovements)
    .where(and(eq(stockMovements.salonId, salonId), eq(stockMovements.productId, productId)))

  return toMilli(row?.total) ?? 0
}

// ============================================================================
// Leitura
// ============================================================================

export type InventoryProductRow = {
  id: string
  name: string
  isActive: boolean
  /** Preço de venda. */
  price: string
  trackStock: boolean
  minStock: string
  costPrice: string | null
  sku: string | null
  barcode: string | null
  /** Saldo: a soma dos movimentos (numeric como string, pode ser negativo). */
  quantity: string
}

/** Todos os produtos do salão com o saldo de cada um. */
export async function listInventoryService(salonId: string): Promise<InventoryProductRow[]> {
  const balances = db
    .select({
      productId: stockMovements.productId,
      total: sql<string>`sum(${stockMovements.quantity})`.as("total"),
    })
    .from(stockMovements)
    .where(eq(stockMovements.salonId, salonId))
    .groupBy(stockMovements.productId)
    .as("balances")

  return db
    .select({
      id: products.id,
      name: products.name,
      isActive: products.isActive,
      price: products.price,
      trackStock: products.trackStock,
      minStock: products.minStock,
      costPrice: products.costPrice,
      sku: products.sku,
      barcode: products.barcode,
      quantity: sql<string>`coalesce(${balances.total}, 0)::numeric(12,3)::text`,
    })
    .from(products)
    .leftJoin(balances, eq(balances.productId, products.id))
    .where(eq(products.salonId, salonId))
    .orderBy(asc(products.name))
}

export type StockMovementRow = {
  id: string
  createdAt: Date
  productId: string
  productName: string
  kind: StockMovementKind
  /** Com sinal: positivo entrou, negativo saiu. */
  quantity: string
  unitCost: string | null
  notes: string | null
  /** Só em venda: a comanda que baixou. */
  saleId: string | null
  saleNumber: number | null
  /** Quem lançou. */
  userName: string | null
}

/**
 * Movimentações do salão, da mais recente para a mais antiga. `productId` filtra
 * por um produto.
 */
export async function listStockMovementsService(input: {
  salonId: string
  productId?: string
  limit: number
}): Promise<{ rows: StockMovementRow[]; truncated: boolean }> {
  const rows = await db
    .select({
      id: stockMovements.id,
      createdAt: stockMovements.createdAt,
      productId: stockMovements.productId,
      productName: products.name,
      kind: stockMovements.kind,
      quantity: stockMovements.quantity,
      unitCost: stockMovements.unitCost,
      notes: stockMovements.notes,
      saleId: stockMovements.saleId,
      saleNumber: sales.number,
      // Cadastro antigo pode ter só nome e sobrenome, sem o nome completo.
      userName: sql<
        string | null
      >`coalesce(${profiles.fullName}, nullif(trim(concat_ws(' ', ${profiles.firstName}, ${profiles.lastName})), ''))`,
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .leftJoin(sales, eq(sales.id, stockMovements.saleId))
    .leftJoin(profiles, eq(profiles.id, stockMovements.createdBy))
    .where(
      and(
        eq(stockMovements.salonId, input.salonId),
        input.productId ? eq(stockMovements.productId, input.productId) : undefined
      )
    )
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(input.limit + 1)

  return { rows: rows.slice(0, input.limit), truncated: rows.length > input.limit }
}

// ============================================================================
// Escrita
// ============================================================================

/**
 * Lança uma entrada, uma saída ou um acerto de inventário num produto controlado.
 * Devolve o saldo depois do movimento.
 */
export async function createStockMovementService(input: {
  salonId: string
  userId: string
  productId: string
  draft: { kind: unknown; quantity: unknown; unitCost?: unknown; notes?: unknown }
}): Promise<ActionResult<{ movementId: string; balance: string }>> {
  try {
    const result = await db.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: products.id, trackStock: products.trackStock })
        .from(products)
        .where(and(eq(products.id, input.productId), eq(products.salonId, input.salonId)))
        .for("update")

      if (!product) fail("Produto não encontrado")
      if (!product.trackStock) fail("Ligue o controle de estoque deste produto antes de movimentar")

      const currentMilli = await productBalanceMilli(tx, input.salonId, product.id)
      const plan = planStockMovement(input.draft, currentMilli)
      if (!plan.ok) fail(plan.error)

      const [created] = await tx
        .insert(stockMovements)
        .values({
          salonId: input.salonId,
          productId: product.id,
          kind: plan.kind,
          quantity: plan.quantity,
          unitCost: plan.unitCost,
          notes: plan.notes,
          createdBy: input.userId,
        })
        .returning({ id: stockMovements.id })

      // Entrada com custo informado atualiza o custo de compra do produto: é o
      // último preço pago, o que vale para a próxima compra.
      if (plan.unitCost !== null) {
        await tx
          .update(products)
          .set({ costPrice: plan.unitCost })
          .where(and(eq(products.id, product.id), eq(products.salonId, input.salonId)))
      }

      return { movementId: created.id, balanceMilli: plan.balanceMilli }
    })

    return {
      success: true,
      data: { movementId: result.movementId, balance: milliToNumeric(result.balanceMilli) },
    }
  } catch (error) {
    return toFailure(error, "Não foi possível lançar a movimentação")
  }
}

/** Grava o controle de estoque de um produto: controlar ou não, mínimo, custo e códigos. */
export async function saveProductStockSettingsService(input: {
  salonId: string
  productId: string
  settings: { trackStock: unknown; minStock?: unknown; costPrice?: unknown; sku?: unknown; barcode?: unknown }
}): Promise<ActionResult<void>> {
  try {
    const plan = planProductStockSettings(input.settings)
    if (!plan.ok) fail(plan.error)

    const updated = await db
      .update(products)
      .set({
        trackStock: plan.trackStock,
        minStock: plan.minStock,
        costPrice: plan.costPrice,
        sku: plan.sku,
        barcode: plan.barcode,
      })
      .where(and(eq(products.id, input.productId), eq(products.salonId, input.salonId)))
      .returning({ id: products.id })

    if (updated.length === 0) fail("Produto não encontrado")

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar o controle de estoque")
  }
}

// ============================================================================
// Comanda → estoque
// ============================================================================

/**
 * Baixa o estoque dos produtos controlados de uma comanda que acabou de ser
 * faturada. Roda DENTRO da transação do faturamento.
 *
 * Quem decide chamar é a action (módulo `inventory` ligado no salão). Não trava o
 * produto nem confere saldo: a baixa é uma linha a mais na soma, e vender sem saldo
 * não é barrado — o produto já saiu da prateleira.
 */
export async function recordSaleStock(
  tx: Tx,
  input: { salonId: string; saleId: string; userId: string }
): Promise<void> {
  const items = await tx
    .select({ id: saleItems.id, productId: saleItems.productId, quantity: saleItems.quantity })
    .from(saleItems)
    .where(and(eq(saleItems.saleId, input.saleId), eq(saleItems.salonId, input.salonId)))

  const productIds = Array.from(new Set(items.map((item) => item.productId).filter((id): id is string => !!id)))
  if (productIds.length === 0) return

  const tracked = await tx
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.salonId, input.salonId), eq(products.trackStock, true), inArray(products.id, productIds)))

  const movements = planSaleStockMovements(items, new Set(tracked.map((product) => product.id)))
  if (movements.length === 0) return

  await tx.insert(stockMovements).values(
    movements.map((movement) => ({
      salonId: input.salonId,
      productId: movement.productId,
      kind: "sale" as const,
      quantity: movement.quantity,
      saleId: input.saleId,
      saleItemId: movement.saleItemId,
      createdBy: input.userId,
    }))
  )
}

/**
 * Desfaz as baixas de uma comanda que está sendo reaberta: os produtos voltam para
 * o estoque. Roda DENTRO da transação da reabertura.
 *
 * Sem olhar o módulo de propósito: se ele foi desligado depois do faturamento, a
 * baixa que a comanda fez ainda tem que ser desfeita — senão o produto volta para
 * a prateleira e o saldo não.
 */
export async function revertSaleStock(tx: Tx, input: { salonId: string; saleId: string }): Promise<void> {
  await tx
    .delete(stockMovements)
    .where(and(eq(stockMovements.saleId, input.saleId), eq(stockMovements.salonId, input.salonId)))
}
