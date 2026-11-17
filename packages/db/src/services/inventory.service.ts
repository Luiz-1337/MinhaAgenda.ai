import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import {
  db,
  serviceProducts,
  productBrands,
  productCategories,
  products,
  profiles,
  saleItems,
  sales,
  stockMovements,
} from "../index"
import type { ProductContentUnit, StockMovementKind } from "../schema"
import {
  milliToNumeric,
  planProductStockSettings,
  planSaleStockMovements,
  planStockMovement,
  toMilli,
} from "../domain/inventory"
import { hasBatchData, planBatch } from "../domain/batches"
import { planProductContent, planSaleConsumptionMovements } from "../domain/consumption"
import type { ActionResult } from "./appointments"
import { insertMovementBatch } from "./batches.service"

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
  brandId: string | null
  brandName: string | null
  categoryId: string | null
  categoryName: string | null
  /** Fracionamento: quanto cabe em uma unidade e em que medida. NULL = não fracionado. */
  contentAmount: string | null
  contentUnit: ProductContentUnit | null
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
      brandId: products.brandId,
      brandName: productBrands.name,
      categoryId: products.categoryId,
      categoryName: productCategories.name,
      contentAmount: products.contentAmount,
      contentUnit: products.contentUnit,
      quantity: sql<string>`coalesce(${balances.total}, 0)::numeric(12,3)::text`,
    })
    .from(products)
    .leftJoin(balances, eq(balances.productId, products.id))
    .leftJoin(productBrands, eq(productBrands.id, products.brandId))
    .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
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
  /** Só em compra: a compra que deu a entrada. */
  purchaseId: string | null
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
      purchaseId: stockMovements.purchaseId,
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
 *
 * Com `batch`, a ENTRADA registra também o lote que veio com ela (fatia 4c), com a
 * mesma quantidade do movimento.
 */
export async function createStockMovementService(input: {
  salonId: string
  userId: string
  productId: string
  draft: { kind: unknown; quantity: unknown; unitCost?: unknown; notes?: unknown }
  batch?: { code?: unknown; manufacturedOn?: unknown; expiresOn?: unknown } | null
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

      // O lote é validado ANTES de gravar o movimento: data errada não pode deixar
      // a entrada lançada sem o lote que veio com ela.
      let batchPlan: ReturnType<typeof planBatch> | null = null
      if (hasBatchData(input.batch)) {
        if (plan.kind !== "in") fail("Lote só se informa em entrada")
        batchPlan = planBatch({ ...input.batch, quantity: Number(plan.quantity) }, new Date())
        if (!batchPlan.ok) fail(batchPlan.error)
      }

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

      if (batchPlan?.ok) {
        await insertMovementBatch(tx, {
          salonId: input.salonId,
          userId: input.userId,
          productId: product.id,
          stockMovementId: created.id,
          plan: batchPlan,
        })
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

/**
 * Grava o controle de estoque de um produto: controlar ou não, mínimo, custo e
 * códigos. Com `classification`, grava também a marca e a categoria (fatia 4b) —
 * as duas têm que ser do salão. Com `content`, grava o fracionamento (fatia 4d).
 */
export async function saveProductStockSettingsService(input: {
  salonId: string
  productId: string
  settings: { trackStock: unknown; minStock?: unknown; costPrice?: unknown; sku?: unknown; barcode?: unknown }
  classification?: { brandId: string | null; categoryId: string | null }
  content?: { contentAmount?: unknown; contentUnit?: unknown }
}): Promise<ActionResult<void>> {
  try {
    const plan = planProductStockSettings(input.settings)
    if (!plan.ok) fail(plan.error)

    const contentPlan = input.content ? planProductContent(input.content) : null
    if (contentPlan && !contentPlan.ok) fail(contentPlan.error)

    if (input.classification?.brandId) {
      const [brand] = await db
        .select({ id: productBrands.id })
        .from(productBrands)
        .where(and(eq(productBrands.id, input.classification.brandId), eq(productBrands.salonId, input.salonId)))
        .limit(1)
      if (!brand) fail("Marca não encontrada")
    }

    if (input.classification?.categoryId) {
      const [category] = await db
        .select({ id: productCategories.id })
        .from(productCategories)
        .where(
          and(eq(productCategories.id, input.classification.categoryId), eq(productCategories.salonId, input.salonId))
        )
        .limit(1)
      if (!category) fail("Categoria não encontrada")
    }

    const updated = await db
      .update(products)
      .set({
        trackStock: plan.trackStock,
        minStock: plan.minStock,
        costPrice: plan.costPrice,
        sku: plan.sku,
        barcode: plan.barcode,
        ...(input.classification
          ? { brandId: input.classification.brandId, categoryId: input.classification.categoryId }
          : {}),
        ...(contentPlan?.ok
          ? { contentAmount: contentPlan.contentAmount, contentUnit: contentPlan.contentUnit }
          : {}),
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
 * Duas baixas: o produto VENDIDO (um movimento 'sale' por item de produto) e o
 * insumo CONSUMIDO pelos serviços (um movimento 'consumption' por item de serviço
 * × produto que o serviço gasta — fatia 4d).
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
    .select({
      id: saleItems.id,
      productId: saleItems.productId,
      serviceId: saleItems.serviceId,
      quantity: saleItems.quantity,
    })
    .from(saleItems)
    .where(and(eq(saleItems.saleId, input.saleId), eq(saleItems.salonId, input.salonId)))

  // O que os serviços desta comanda consomem.
  const serviceIds = Array.from(new Set(items.map((item) => item.serviceId).filter((id): id is string => !!id)))
  const recipeRows =
    serviceIds.length === 0
      ? []
      : await tx
          .select({
            serviceId: serviceProducts.serviceId,
            productId: serviceProducts.productId,
            quantity: serviceProducts.quantity,
          })
          .from(serviceProducts)
          .where(and(eq(serviceProducts.salonId, input.salonId), inArray(serviceProducts.serviceId, serviceIds)))

  const recipes = new Map<string, { productId: string; quantity: string }[]>()
  for (const row of recipeRows) {
    const lines = recipes.get(row.serviceId) ?? []
    lines.push({ productId: row.productId, quantity: row.quantity })
    recipes.set(row.serviceId, lines)
  }

  const productIds = Array.from(
    new Set([
      ...items.map((item) => item.productId).filter((id): id is string => !!id),
      ...recipeRows.map((row) => row.productId),
    ])
  )
  if (productIds.length === 0) return

  const productRows = await tx
    .select({ id: products.id, trackStock: products.trackStock, contentAmount: products.contentAmount })
    .from(products)
    .where(and(eq(products.salonId, input.salonId), inArray(products.id, productIds)))

  const sold = planSaleStockMovements(
    items,
    new Set(productRows.filter((product) => product.trackStock).map((product) => product.id))
  )
  const consumed = planSaleConsumptionMovements(
    items,
    recipes,
    new Map(
      productRows.map((product) => [
        product.id,
        { trackStock: product.trackStock, contentAmount: product.contentAmount },
      ])
    )
  )

  const rows = [
    ...sold.map((movement) => ({ ...movement, kind: "sale" as const })),
    ...consumed.map((movement) => ({ ...movement, kind: "consumption" as const })),
  ]
  if (rows.length === 0) return

  await tx.insert(stockMovements).values(
    rows.map((movement) => ({
      salonId: input.salonId,
      productId: movement.productId,
      kind: movement.kind,
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
