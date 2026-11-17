"use server"

import { revalidatePath } from "next/cache"
import {
  EXPIRY_WARNING_DAYS,
  brazilToday,
  createBatchService,
  createStockMovementService,
  deleteBatchService,
  listBatchesService,
  listInventoryService,
  listProductCatalogService,
  listServiceConsumptionService,
  listStockMovementsService,
  milliToNumeric,
  purchaseSuggestionMilli,
  saveProductStockSettingsService,
  saveServiceConsumptionService,
  stockStatus,
  stockValueCents,
  toMilli,
  updateBatchService,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import {
  createStockMovementSchema,
  deleteBatchSchema,
  inventoryFiltersSchema,
  saveBatchSchema,
  saveProductStockSettingsSchema,
  saveServiceConsumptionSchema,
} from "@/lib/schemas/inventory.schema"
import type { ActionResult } from "@/lib/types/common"
import type {
  BatchesDTO,
  CreateStockMovementInput,
  InventoryDTO,
  InventoryFilters,
  InventoryProductDTO,
  SaveBatchInput,
  SaveProductStockSettingsInput,
  SaveServiceConsumptionInput,
  ServiceConsumptionDTO,
} from "@/lib/types/inventory"

/**
 * Estoque (docs/ROADMAP.md, fase 4, fatia 4a).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `inventory` ligado no
 * salão → permissão `inventory.*`. O `salonId` chega do cliente, então estar logado
 * não basta (ver __tests__/lib/actions-authz.test.ts).
 *
 * A regra não mora aqui: `@repo/db` (domain/inventory.ts decide,
 * services/inventory.service.ts grava).
 */

/** Movimentações mostradas na tela. */
const MOVEMENT_ROWS = 100

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "inventory"))) {
    return { error: "O estoque não está disponível neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

function revalidateInventory(salonId: string) {
  revalidatePath(`/${salonId}/inventory`)
  // A contagem de produtos por marca e por categoria.
  revalidatePath(`/${salonId}/inventory/catalog`)
  // O que resta em cada lote sai do saldo.
  revalidatePath(`/${salonId}/inventory/batches`)
  // O custo estimado do consumo sai do custo e do fracionamento do produto.
  revalidatePath(`/${salonId}/inventory/consumption`)
}

/** Os produtos com saldo, situação e sugestão de compra, e a movimentação recente. */
export async function getInventory(
  salonId: string,
  filters: InventoryFilters = {}
): Promise<InventoryDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "inventory.access")
  if ("error" in auth) return auth

  const parsed = inventoryFiltersSchema.safeParse(filters)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  try {
    const [rows, permissions, catalog, batches] = await Promise.all([
      listInventoryService(salonId),
      getSalonPermissions(salonId, auth.userId),
      listProductCatalogService(salonId),
      listBatchesService(salonId),
    ])

    // Produto pedido que não é do salão é ignorado, não um erro: a movimentação
    // cai para todos os produtos.
    const productId =
      parsed.data.productId && rows.some((row) => row.id === parsed.data.productId) ? parsed.data.productId : null

    const movements = await listStockMovementsService({
      salonId,
      productId: productId ?? undefined,
      limit: MOVEMENT_ROWS,
    })

    const products: InventoryProductDTO[] = rows.map((row) => {
      const quantityMilli = toMilli(row.quantity) ?? 0
      const minMilli = toMilli(row.minStock) ?? 0
      const state = { trackStock: row.trackStock, quantityMilli, minMilli }

      return {
        ...row,
        status: stockStatus(state),
        suggestion: milliToNumeric(purchaseSuggestionMilli(state)),
        valueCents: row.trackStock ? stockValueCents({ quantityMilli, costPrice: row.costPrice }) : 0,
      }
    })

    return {
      products,
      totals: {
        tracked: products.filter((product) => product.trackStock).length,
        toBuy: products.filter(
          (product) => product.status === "low" || product.status === "out" || product.status === "negative"
        ).length,
        valueCents: products.reduce((sum, product) => sum + product.valueCents, 0),
      },
      movements: movements.rows,
      movementsTruncated: movements.truncated,
      productId,
      brands: catalog.brands.map((brand) => ({ id: brand.id, name: brand.name })),
      categories: catalog.categories.map((category) => ({ id: category.id, name: category.name })),
      batchAlerts: { expired: batches.expired, expiring: batches.expiring },
      can: {
        move: permissions.has("inventory.move"),
        manage: permissions.has("inventory.manage"),
      },
    }
  } catch (error) {
    console.error("Erro ao carregar o estoque:", error)
    return { error: "Não foi possível carregar o estoque" }
  }
}

/** Lança uma entrada, uma saída ou um acerto de inventário. */
export async function createStockMovement(
  input: CreateStockMovementInput
): Promise<ActionResult<{ movementId: string; balance: string }>> {
  const auth = await authorizeSalon(input?.salonId, "inventory.move")
  if ("error" in auth) return auth

  const parsed = createStockMovementSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, productId, batchCode, manufacturedOn, expiresOn, ...draft } = parsed.data

  const result = await createStockMovementService({
    salonId,
    userId: auth.userId,
    productId,
    draft,
    batch: { code: batchCode, manufacturedOn, expiresOn },
  })
  if (!result.success) return { error: result.error }

  revalidateInventory(salonId)
  return { success: true, data: result.data }
}

/** Liga ou desliga o controle de estoque de um produto e grava mínimo, custo e códigos. */
export async function saveProductStockSettings(input: SaveProductStockSettingsInput): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "inventory.manage")
  if ("error" in auth) return auth

  const parsed = saveProductStockSettingsSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, productId, brandId, categoryId, contentAmount, contentUnit, ...settings } = parsed.data

  const result = await saveProductStockSettingsService({
    salonId,
    productId,
    settings,
    classification: { brandId: brandId ?? null, categoryId: categoryId ?? null },
    content: { contentAmount: contentAmount ?? null, contentUnit: contentUnit ?? null },
  })
  if (!result.success) return { error: result.error }

  revalidateInventory(salonId)
  return { success: true }
}

// ============================================================================
// Lotes e validades (fatia 4c)
// ============================================================================

/** Os lotes do salão, com o que resta em cada um e a situação. */
export async function getBatches(salonId: string): Promise<BatchesDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "inventory.access")
  if ("error" in auth) return auth

  try {
    const [overview, products, permissions] = await Promise.all([
      listBatchesService(salonId),
      listInventoryService(salonId),
      getSalonPermissions(salonId, auth.userId),
    ])

    return {
      batches: overview.rows,
      expired: overview.expired,
      expiring: overview.expiring,
      warningDays: EXPIRY_WARNING_DAYS,
      products: products
        .filter((product) => product.trackStock && product.isActive)
        .map((product) => ({ id: product.id, name: product.name })),
      today: brazilToday(new Date()),
      can: { move: permissions.has("inventory.move") },
    }
  } catch (error) {
    console.error("Erro ao carregar os lotes:", error)
    return { error: "Não foi possível carregar os lotes" }
  }
}

/**
 * Registra um lote solto (sem `batchId`) ou corrige um lote. Não mexe no saldo: a
 * entrada com lote é feita no estoque ou na compra.
 */
export async function saveBatch(input: SaveBatchInput): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "inventory.move")
  if ("error" in auth) return auth

  const parsed = saveBatchSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, batchId, productId, ...draft } = parsed.data

  if (batchId) {
    const result = await updateBatchService({ salonId, batchId, draft })
    if (!result.success) return { error: result.error }
  } else {
    if (!productId) return { error: "Escolha o produto" }
    const result = await createBatchService({ salonId, userId: auth.userId, productId, draft })
    if (!result.success) return { error: result.error }
  }

  revalidateInventory(salonId)
  return { success: true }
}

/** Exclui o registro de um lote. O saldo do produto não muda. */
export async function deleteBatch(input: { salonId: string; batchId: string }): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "inventory.move")
  if ("error" in auth) return auth

  const parsed = deleteBatchSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await deleteBatchService(parsed.data)
  if (!result.success) return { error: result.error }

  revalidateInventory(parsed.data.salonId)
  return { success: true }
}

// ============================================================================
// Produtos consumidos por serviço (fatia 4d)
// ============================================================================

/** Os serviços do salão com o que cada um consome por atendimento. */
export async function getServiceConsumption(salonId: string): Promise<ServiceConsumptionDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "inventory.access")
  if ("error" in auth) return auth

  try {
    const [consumption, permissions] = await Promise.all([
      listServiceConsumptionService(salonId),
      getSalonPermissions(salonId, auth.userId),
    ])

    return { ...consumption, can: { manage: permissions.has("inventory.manage") } }
  } catch (error) {
    console.error("Erro ao carregar o consumo por serviço:", error)
    return { error: "Não foi possível carregar o consumo por serviço" }
  }
}

/** Grava o que um serviço consome por atendimento (a lista substitui a anterior). */
export async function saveServiceConsumption(input: SaveServiceConsumptionInput): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "inventory.manage")
  if ("error" in auth) return auth

  const parsed = saveServiceConsumptionSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { additionalCost, ...consumption } = parsed.data
  const result = await saveServiceConsumptionService({ ...consumption, additionalCost: additionalCost ?? null })
  if (!result.success) return { error: result.error }

  revalidateInventory(parsed.data.salonId)
  // O custo do atendimento entra na comissão das próximas comandas.
  revalidatePath(`/${parsed.data.salonId}/commissions`)
  return { success: true }
}
