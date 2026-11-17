import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm"

import {
  db,
  financialAccounts,
  financialCategories,
  financialTransactions,
  productBrands,
  productCategories,
  products,
  profiles,
  purchaseItems,
  purchases,
  stockMovements,
  suppliers,
} from "../index"
import {
  planCatalogName,
  planCostRestore,
  planPurchase,
  planPurchasePayables,
  planSupplier,
  purchaseDeleteBlocker,
  purchasePaymentStatus,
  type PurchaseDraft,
  type PurchaseFinanceDraft,
  type PurchasePaymentStatus,
} from "../domain/purchases"
import { toCents } from "../domain/sales"
import type { ActionResult } from "./appointments"
import { insertMovementBatch } from "./batches.service"

/**
 * Compras, fornecedores e marcas/categorias de produto (docs/ROADMAP.md, fase 4,
 * fatia 4b).
 *
 * Só I/O: carrega o que a regra pura (domain/purchases.ts) precisa, deixa ela
 * decidir e grava. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`. Os ids chegam do cliente; o
 * que não aparece na consulta escopada é tratado como inexistente.
 *
 * A compra grava tudo numa transação só: cabeçalho, itens, entrada no estoque,
 * custo dos produtos e parcelas no financeiro. Ou entra tudo, ou nada.
 */

class PurchaseRuleError extends Error {}

function fail(message: string): never {
  throw new PurchaseRuleError(message)
}

function toFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof PurchaseRuleError) return { success: false, error: error.message }
  console.error(fallback, error)
  return { success: false, error: fallback }
}

// ============================================================================
// Fornecedores
// ============================================================================

export type SupplierRow = {
  id: string
  name: string
  document: string | null
  phone: string | null
  email: string | null
  notes: string | null
  isActive: boolean
  /** Quantas compras o salão já fez dele. */
  purchaseCount: number
}

export async function listSuppliersService(salonId: string): Promise<SupplierRow[]> {
  const counts = db
    .select({
      supplierId: purchases.supplierId,
      total: sql<number>`count(*)::int`.as("total"),
    })
    .from(purchases)
    .where(eq(purchases.salonId, salonId))
    .groupBy(purchases.supplierId)
    .as("counts")

  return db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      document: suppliers.document,
      phone: suppliers.phone,
      email: suppliers.email,
      notes: suppliers.notes,
      isActive: suppliers.isActive,
      purchaseCount: sql<number>`coalesce(${counts.total}, 0)::int`,
    })
    .from(suppliers)
    .leftJoin(counts, eq(counts.supplierId, suppliers.id))
    .where(eq(suppliers.salonId, salonId))
    .orderBy(asc(sql`lower(${suppliers.name})`))
}

/** Cria (sem `supplierId`) ou edita um fornecedor. O nome é único no salão. */
export async function saveSupplierService(input: {
  salonId: string
  supplierId?: string | null
  draft: { name: unknown; document?: unknown; phone?: unknown; email?: unknown; notes?: unknown }
}): Promise<ActionResult<{ supplierId: string }>> {
  try {
    const plan = planSupplier(input.draft)
    if (!plan.ok) fail(plan.error)

    const [clash] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(
        and(
          eq(suppliers.salonId, input.salonId),
          sql`lower(${suppliers.name}) = lower(${plan.name})`,
          input.supplierId ? ne(suppliers.id, input.supplierId) : undefined
        )
      )
      .limit(1)
    if (clash) fail("Já existe um fornecedor com este nome")

    const values = {
      name: plan.name,
      document: plan.document,
      phone: plan.phone,
      email: plan.email,
      notes: plan.notes,
    }

    if (input.supplierId) {
      const updated = await db
        .update(suppliers)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.salonId, input.salonId)))
        .returning({ id: suppliers.id })
      if (updated.length === 0) fail("Fornecedor não encontrado")
      return { success: true, data: { supplierId: updated[0].id } }
    }

    const [created] = await db
      .insert(suppliers)
      .values({ ...values, salonId: input.salonId })
      .returning({ id: suppliers.id })
    return { success: true, data: { supplierId: created.id } }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar o fornecedor")
  }
}

export async function setSupplierActiveService(input: {
  salonId: string
  supplierId: string
  isActive: boolean
}): Promise<ActionResult<void>> {
  try {
    const updated = await db
      .update(suppliers)
      .set({ isActive: input.isActive, updatedAt: new Date() })
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.salonId, input.salonId)))
      .returning({ id: suppliers.id })
    if (updated.length === 0) fail("Fornecedor não encontrado")
    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível alterar o fornecedor")
  }
}

/** Exclui um fornecedor sem compras. Com compra, o caminho é desativar. */
export async function deleteSupplierService(input: {
  salonId: string
  supplierId: string
}): Promise<ActionResult<void>> {
  try {
    await db.transaction(async (tx) => {
      const [supplier] = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.salonId, input.salonId)))
        .for("update")
      if (!supplier) fail("Fornecedor não encontrado")

      const [used] = await tx
        .select({ id: purchases.id })
        .from(purchases)
        .where(and(eq(purchases.salonId, input.salonId), eq(purchases.supplierId, supplier.id)))
        .limit(1)
      if (used) fail("Este fornecedor tem compras lançadas. Desative em vez de excluir")

      await tx.delete(suppliers).where(and(eq(suppliers.id, supplier.id), eq(suppliers.salonId, input.salonId)))
    })
    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir o fornecedor")
  }
}

// ============================================================================
// Marcas e categorias de produto
// ============================================================================

export type ProductCatalogKind = "brand" | "category"

export type ProductCatalogRow = {
  id: string
  name: string
  /** Quantos produtos do salão usam esta marca ou categoria. */
  productCount: number
}

/**
 * Marca e categoria têm exatamente as mesmas colunas (id, salon_id, name,
 * created_at). O cast deixa o mesmo código servir às duas tabelas sem o TypeScript
 * tentar resolver a união de dois tipos de tabela em cada consulta.
 */
function catalogTable(kind: ProductCatalogKind): typeof productBrands {
  return kind === "brand" ? productBrands : (productCategories as unknown as typeof productBrands)
}

async function listCatalogRows(salonId: string, kind: ProductCatalogKind): Promise<ProductCatalogRow[]> {
  const table = catalogTable(kind)
  const productColumn = kind === "brand" ? products.brandId : products.categoryId

  const counts = db
    .select({ refId: productColumn, total: sql<number>`count(*)::int`.as("total") })
    .from(products)
    .where(eq(products.salonId, salonId))
    .groupBy(productColumn)
    .as("counts")

  return db
    .select({
      id: table.id,
      name: table.name,
      productCount: sql<number>`coalesce(${counts.total}, 0)::int`,
    })
    .from(table)
    .leftJoin(counts, eq(counts.refId, table.id))
    .where(eq(table.salonId, salonId))
    .orderBy(asc(sql`lower(${table.name})`))
}

export async function listProductCatalogService(
  salonId: string
): Promise<{ brands: ProductCatalogRow[]; categories: ProductCatalogRow[] }> {
  const [brands, categories] = await Promise.all([listCatalogRows(salonId, "brand"), listCatalogRows(salonId, "category")])
  return { brands, categories }
}

/** Cria (sem `id`) ou renomeia uma marca ou uma categoria. O nome é único no salão. */
export async function saveProductCatalogEntryService(input: {
  salonId: string
  kind: ProductCatalogKind
  id?: string | null
  name: unknown
}): Promise<ActionResult<{ id: string }>> {
  try {
    const table = catalogTable(input.kind)
    const label = input.kind === "brand" ? "marca" : "categoria"

    const plan = planCatalogName(input.name)
    if (!plan.ok) fail(plan.error)

    const [clash] = await db
      .select({ id: table.id })
      .from(table)
      .where(
        and(
          eq(table.salonId, input.salonId),
          sql`lower(${table.name}) = lower(${plan.name})`,
          input.id ? ne(table.id, input.id) : undefined
        )
      )
      .limit(1)
    if (clash) fail(`Já existe uma ${label} com este nome`)

    if (input.id) {
      const updated = await db
        .update(table)
        .set({ name: plan.name })
        .where(and(eq(table.id, input.id), eq(table.salonId, input.salonId)))
        .returning({ id: table.id })
      if (updated.length === 0) fail(input.kind === "brand" ? "Marca não encontrada" : "Categoria não encontrada")
      return { success: true, data: { id: updated[0].id } }
    }

    const [created] = await db
      .insert(table)
      .values({ salonId: input.salonId, name: plan.name })
      .returning({ id: table.id })
    return { success: true, data: { id: created.id } }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar")
  }
}

/** Exclui uma marca ou categoria. Os produtos ficam, sem ela (FK SET NULL). */
export async function deleteProductCatalogEntryService(input: {
  salonId: string
  kind: ProductCatalogKind
  id: string
}): Promise<ActionResult<void>> {
  try {
    const table = catalogTable(input.kind)
    const deleted = await db
      .delete(table)
      .where(and(eq(table.id, input.id), eq(table.salonId, input.salonId)))
      .returning({ id: table.id })
    if (deleted.length === 0) fail(input.kind === "brand" ? "Marca não encontrada" : "Categoria não encontrada")
    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir")
  }
}

// ============================================================================
// Compras — leitura
// ============================================================================

export type PurchaseItemRow = {
  id: string
  productId: string
  description: string
  quantity: string
  unitCost: string
  totalAmount: string
}

export type PurchaseRow = {
  id: string
  /** "YYYY-MM-DD". */
  purchasedOn: string
  supplierId: string | null
  supplierName: string | null
  invoiceNumber: string | null
  notes: string | null
  itemsAmount: string
  freightAmount: string
  discountAmount: string
  totalAmount: string
  createdAt: Date
  /** Quem lançou. */
  userName: string | null
  items: PurchaseItemRow[]
  /** Parcelas que a compra gerou no financeiro. Zero = não gerou. */
  installments: number
  paidInstallments: number
  paidCents: number
  paymentStatus: PurchasePaymentStatus
}

/** Compras do salão, da mais recente para a mais antiga, com itens e situação no financeiro. */
export async function listPurchasesService(input: {
  salonId: string
  from?: string
  to?: string
  limit: number
}): Promise<{ rows: PurchaseRow[]; truncated: boolean }> {
  const headers = await db
    .select({
      id: purchases.id,
      purchasedOn: purchases.purchasedOn,
      supplierId: purchases.supplierId,
      supplierName: suppliers.name,
      invoiceNumber: purchases.invoiceNumber,
      notes: purchases.notes,
      itemsAmount: purchases.itemsAmount,
      freightAmount: purchases.freightAmount,
      discountAmount: purchases.discountAmount,
      totalAmount: purchases.totalAmount,
      createdAt: purchases.createdAt,
      // Cadastro antigo pode ter só nome e sobrenome, sem o nome completo.
      userName: sql<
        string | null
      >`coalesce(${profiles.fullName}, nullif(trim(concat_ws(' ', ${profiles.firstName}, ${profiles.lastName})), ''))`,
    })
    .from(purchases)
    .leftJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .leftJoin(profiles, eq(profiles.id, purchases.createdBy))
    .where(
      and(
        eq(purchases.salonId, input.salonId),
        input.from ? gte(purchases.purchasedOn, input.from) : undefined,
        input.to ? lte(purchases.purchasedOn, input.to) : undefined
      )
    )
    .orderBy(desc(purchases.purchasedOn), desc(purchases.createdAt))
    .limit(input.limit + 1)

  const page = headers.slice(0, input.limit)
  if (page.length === 0) return { rows: [], truncated: false }

  const ids = page.map((row) => row.id)

  const [itemRows, financeRows] = await Promise.all([
    db
      .select({
        id: purchaseItems.id,
        purchaseId: purchaseItems.purchaseId,
        productId: purchaseItems.productId,
        description: purchaseItems.description,
        quantity: purchaseItems.quantity,
        unitCost: purchaseItems.unitCost,
        totalAmount: purchaseItems.totalAmount,
      })
      .from(purchaseItems)
      .where(and(eq(purchaseItems.salonId, input.salonId), inArray(purchaseItems.purchaseId, ids)))
      .orderBy(asc(purchaseItems.position)),
    db
      .select({
        purchaseId: financialTransactions.purchaseId,
        installments: sql<number>`count(*)::int`,
        paidInstallments: sql<number>`count(*) filter (where ${financialTransactions.status} = 'paid')::int`,
        paidAmount: sql<string>`coalesce(sum(${financialTransactions.amount}) filter (where ${financialTransactions.status} = 'paid'), 0)`,
      })
      .from(financialTransactions)
      .where(and(eq(financialTransactions.salonId, input.salonId), inArray(financialTransactions.purchaseId, ids)))
      .groupBy(financialTransactions.purchaseId),
  ])

  const itemsByPurchase = new Map<string, PurchaseItemRow[]>()
  for (const { purchaseId, ...item } of itemRows) {
    const list = itemsByPurchase.get(purchaseId) ?? []
    list.push(item)
    itemsByPurchase.set(purchaseId, list)
  }

  const financeByPurchase = new Map(financeRows.map((row) => [row.purchaseId, row]))

  return {
    rows: page.map((row) => {
      const finance = financeByPurchase.get(row.id)
      const installments = finance?.installments ?? 0
      const paidInstallments = finance?.paidInstallments ?? 0
      return {
        ...row,
        items: itemsByPurchase.get(row.id) ?? [],
        installments,
        paidInstallments,
        paidCents: toCents(finance?.paidAmount) ?? 0,
        paymentStatus: purchasePaymentStatus({ installments, paidInstallments }),
      }
    }),
    truncated: headers.length > input.limit,
  }
}

export type PurchaseFormOptions = {
  suppliers: { id: string; name: string }[]
  products: { id: string; name: string; trackStock: boolean; costPrice: string | null }[]
}

/** Fornecedores ativos e produtos ativos: o que a tela de nova compra oferece. */
export async function listPurchaseFormOptionsService(salonId: string): Promise<PurchaseFormOptions> {
  const [supplierRows, productRows] = await Promise.all([
    db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(and(eq(suppliers.salonId, salonId), eq(suppliers.isActive, true)))
      .orderBy(asc(sql`lower(${suppliers.name})`)),
    db
      .select({
        id: products.id,
        name: products.name,
        trackStock: products.trackStock,
        costPrice: products.costPrice,
      })
      .from(products)
      .where(and(eq(products.salonId, salonId), eq(products.isActive, true)))
      .orderBy(asc(products.name)),
  ])

  return { suppliers: supplierRows, products: productRows }
}

// ============================================================================
// Compras — escrita
// ============================================================================

/**
 * Lança uma compra: cabeçalho, itens, entrada no estoque dos produtos controlados,
 * custo de compra dos produtos e, com `finance`, as parcelas no financeiro.
 *
 * Quem decide passar `finance` é a action (módulo `finance` ligado no salão e
 * permissão de lançar nele).
 */
export async function createPurchaseService(input: {
  salonId: string
  userId: string
  draft: PurchaseDraft
  finance?: PurchaseFinanceDraft | null
}): Promise<ActionResult<{ purchaseId: string; installments: number }>> {
  try {
    const result = await db.transaction(async (tx) => {
      const rawItems = Array.isArray(input.draft.items) ? input.draft.items : []
      const productIds = Array.from(
        new Set(
          rawItems
            .map((item) => (item as { productId?: unknown } | null)?.productId)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        )
      )

      // Trava os produtos da compra: o custo "de antes" gravado no item tem que
      // ser o que o produto tinha quando ESTA compra entrou. Ordem fixa por id
      // para duas compras com os mesmos produtos não se travarem em cruz.
      const productRows =
        productIds.length === 0
          ? []
          : await tx
              .select({
                id: products.id,
                name: products.name,
                trackStock: products.trackStock,
                costPrice: products.costPrice,
              })
              .from(products)
              .where(and(eq(products.salonId, input.salonId), inArray(products.id, productIds)))
              .orderBy(asc(products.id))
              .for("update")

      const supplierId = typeof input.draft.supplierId === "string" ? input.draft.supplierId : null
      const supplierRows = supplierId
        ? await tx
            .select({ id: suppliers.id, name: suppliers.name, isActive: suppliers.isActive })
            .from(suppliers)
            .where(and(eq(suppliers.salonId, input.salonId), eq(suppliers.id, supplierId)))
        : []

      const now = new Date()
      const plan = planPurchase(
        input.draft,
        {
          suppliers: new Map(supplierRows.map((row) => [row.id, { name: row.name, isActive: row.isActive }])),
          products: new Map(
            productRows.map((row) => [
              row.id,
              { name: row.name, trackStock: row.trackStock, costPrice: row.costPrice },
            ])
          ),
        },
        now
      )
      if (!plan.ok) fail(plan.error)

      // As parcelas são validadas ANTES de gravar qualquer coisa: conta ou
      // categoria errada não pode deixar a compra pela metade.
      let payables: ReturnType<typeof planPurchasePayables> | null = null
      if (input.finance) {
        const accountId = typeof input.finance.accountId === "string" ? input.finance.accountId : null
        const categoryId = typeof input.finance.categoryId === "string" ? input.finance.categoryId : null

        const [accountRows, categoryRows] = await Promise.all([
          accountId
            ? tx
                .select({ id: financialAccounts.id, isActive: financialAccounts.isActive })
                .from(financialAccounts)
                .where(and(eq(financialAccounts.salonId, input.salonId), eq(financialAccounts.id, accountId)))
            : [],
          categoryId
            ? tx
                .select({
                  id: financialCategories.id,
                  kind: financialCategories.kind,
                  isActive: financialCategories.isActive,
                })
                .from(financialCategories)
                .where(and(eq(financialCategories.salonId, input.salonId), eq(financialCategories.id, categoryId)))
            : [],
        ])

        payables = planPurchasePayables(
          {
            totalCents: plan.totalCents,
            purchasedOn: plan.purchasedOn,
            supplierName: plan.supplierName,
            invoiceNumber: plan.invoiceNumber,
          },
          input.finance,
          {
            accounts: new Map(accountRows.map((row) => [row.id, { isActive: row.isActive }])),
            categories: new Map(categoryRows.map((row) => [row.id, { kind: row.kind, isActive: row.isActive }])),
          },
          now
        )
        if (!payables.ok) fail(payables.error)
      }

      const [purchase] = await tx
        .insert(purchases)
        .values({
          salonId: input.salonId,
          supplierId: plan.supplierId,
          purchasedOn: plan.purchasedOn,
          invoiceNumber: plan.invoiceNumber,
          notes: plan.notes,
          itemsAmount: plan.itemsAmount,
          freightAmount: plan.freightAmount,
          discountAmount: plan.discountAmount,
          totalAmount: plan.totalAmount,
          createdBy: input.userId,
        })
        .returning({ id: purchases.id })

      const createdItems = await tx
        .insert(purchaseItems)
        .values(
          plan.items.map((item) => ({
            salonId: input.salonId,
            purchaseId: purchase.id,
            position: item.position,
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unitCost: item.unitCost,
            totalAmount: item.totalAmount,
            previousCost: item.previousCost,
          }))
        )
        .returning({ id: purchaseItems.id, position: purchaseItems.position })

      const itemIdByPosition = new Map(createdItems.map((row) => [row.position, row.id]))

      const movements = plan.items
        .filter((item) => item.movesStock)
        .map((item) => ({
          salonId: input.salonId,
          productId: item.productId,
          kind: "purchase" as const,
          quantity: item.quantity,
          unitCost: item.unitCost,
          purchaseId: purchase.id,
          purchaseItemId: itemIdByPosition.get(item.position) ?? fail("Item da compra não foi gravado"),
          createdBy: input.userId,
        }))
      if (movements.length > 0) {
        const createdMovements = await tx
          .insert(stockMovements)
          .values(movements)
          .returning({ id: stockMovements.id, purchaseItemId: stockMovements.purchaseItemId })

        // O lote informado no item nasce da entrada que o item deu (fatia 4c).
        const movementIdByItem = new Map(createdMovements.map((row) => [row.purchaseItemId, row.id]))
        for (const item of plan.items) {
          if (!item.batch) continue
          const stockMovementId = movementIdByItem.get(itemIdByPosition.get(item.position) ?? null)
          if (!stockMovementId) fail("A entrada do lote não foi gravada")

          await insertMovementBatch(tx, {
            salonId: input.salonId,
            userId: input.userId,
            productId: item.productId,
            stockMovementId,
            plan: {
              ok: true,
              code: item.batch.code,
              manufacturedOn: null,
              expiresOn: item.batch.expiresOn,
              quantity: item.batch.quantity,
              notes: null,
            },
          })
        }
      }

      for (const update of plan.costUpdates) {
        await tx
          .update(products)
          .set({ costPrice: update.costPrice })
          .where(and(eq(products.id, update.productId), eq(products.salonId, input.salonId)))
      }

      let installments = 0
      if (payables?.ok) {
        await tx.insert(financialTransactions).values(
          payables.rows.map((row) => ({
            ...row,
            salonId: input.salonId,
            purchaseId: purchase.id,
            createdBy: input.userId,
          }))
        )
        installments = payables.rows.length
      }

      return { purchaseId: purchase.id, installments }
    })

    return { success: true, data: result }
  } catch (error) {
    return toFailure(error, "Não foi possível lançar a compra")
  }
}

/**
 * Exclui uma compra: as entradas no estoque e as parcelas abertas somem com ela
 * (CASCADE), e o custo dos produtos volta ao que era quando ainda é o desta compra.
 * Com parcela paga, não exclui (domain: purchaseDeleteBlocker).
 */
export async function deletePurchaseService(input: {
  salonId: string
  purchaseId: string
}): Promise<ActionResult<{ hadFinance: boolean }>> {
  try {
    const result = await db.transaction(async (tx) => {
      const [purchase] = await tx
        .select({ id: purchases.id })
        .from(purchases)
        .where(and(eq(purchases.id, input.purchaseId), eq(purchases.salonId, input.salonId)))
        .for("update")
      if (!purchase) fail("Compra não encontrada")

      // Trava as parcelas antes de contar as pagas: uma baixa em andamento não
      // pode passar entre a conferência e a exclusão.
      const transactions = await tx
        .select({ id: financialTransactions.id, status: financialTransactions.status })
        .from(financialTransactions)
        .where(and(eq(financialTransactions.salonId, input.salonId), eq(financialTransactions.purchaseId, purchase.id)))
        .for("update")

      const blocker = purchaseDeleteBlocker({
        paidInstallments: transactions.filter((transaction) => transaction.status === "paid").length,
      })
      if (blocker) fail(blocker)

      const items = await tx
        .select({
          productId: purchaseItems.productId,
          unitCost: purchaseItems.unitCost,
          previousCost: purchaseItems.previousCost,
        })
        .from(purchaseItems)
        .where(and(eq(purchaseItems.salonId, input.salonId), eq(purchaseItems.purchaseId, purchase.id)))
        .orderBy(asc(purchaseItems.position))

      const productIds = Array.from(new Set(items.map((item) => item.productId)))
      const productRows =
        productIds.length === 0
          ? []
          : await tx
              .select({ id: products.id, costPrice: products.costPrice })
              .from(products)
              .where(and(eq(products.salonId, input.salonId), inArray(products.id, productIds)))
              .orderBy(asc(products.id))
              .for("update")

      const restores = planCostRestore(items, new Map(productRows.map((row) => [row.id, row.costPrice])))
      for (const restore of restores) {
        await tx
          .update(products)
          .set({ costPrice: restore.costPrice })
          .where(and(eq(products.id, restore.productId), eq(products.salonId, input.salonId)))
      }

      await tx.delete(purchases).where(and(eq(purchases.id, purchase.id), eq(purchases.salonId, input.salonId)))

      return { hadFinance: transactions.length > 0 }
    })

    return { success: true, data: result }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir a compra")
  }
}
