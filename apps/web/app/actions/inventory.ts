"use server"

import { revalidatePath } from "next/cache"
import {
  EXPIRY_WARNING_DAYS,
  brazilToday,
  createBatchService,
  createStockMovementService,
  createStockRequestService,
  decideStockRequestService,
  deleteStockRequestService,
  listStockRequestOptionsService,
  listStockRequestsService,
  deleteBatchService,
  getStockReportsService,
  listBatchesService,
  listInventoryService,
  listProductCatalogService,
  listServiceConsumptionService,
  listStockMovementsService,
  milliToNumeric,
  planReportPeriod,
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
  createStockRequestSchema,
  decideStockRequestSchema,
  deleteBatchSchema,
  deleteStockRequestSchema,
  inventoryFiltersSchema,
  saveBatchSchema,
  saveProductStockSettingsSchema,
  saveServiceConsumptionSchema,
  stockReportFiltersSchema,
} from "@/lib/schemas/inventory.schema"
import type { ActionResult } from "@/lib/types/common"
import type {
  BatchesDTO,
  CreateStockMovementInput,
  CreateStockRequestInput,
  StockRequestsDTO,
  InventoryDTO,
  InventoryFilters,
  InventoryProductDTO,
  SaveBatchInput,
  SaveProductStockSettingsInput,
  SaveServiceConsumptionInput,
  ServiceConsumptionDTO,
  StockReportFilters,
  StockReportsDTO,
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

/**
 * `permission` pode ser uma lista: basta UMA. É o caso das solicitações, que servem
 * tanto a quem só pede (`inventory.request`) quanto a quem movimenta o estoque.
 */
async function authorizeSalon(
  salonId: string,
  permission: PermissionKey | readonly PermissionKey[]
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "inventory"))) {
    return { error: "O estoque não está disponível neste salão" }
  }

  const wanted = typeof permission === "string" ? [permission] : permission
  const granted = await Promise.all(wanted.map((key) => can(salonId, userId, key)))
  if (!granted.some(Boolean)) {
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
  // Os produtos disponíveis para solicitação e o preço para profissional.
  revalidatePath(`/${salonId}/inventory/requests`)
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
    const [rows, permissions, catalog, batches, requests] = await Promise.all([
      listInventoryService(salonId),
      getSalonPermissions(salonId, auth.userId),
      listProductCatalogService(salonId),
      listBatchesService(salonId),
      // Só a contagem das pendentes interessa aqui.
      listStockRequestsService({ salonId, limit: 1 }),
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
      pendingRequests: requests.pending,
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

/**
 * Relatórios do período (fatia 4f): movimentação por produto e produtos consumidos
 * pelos atendimentos. Só leitura.
 */
export async function getStockReports(
  salonId: string,
  filters: StockReportFilters = {}
): Promise<StockReportsDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "inventory.access")
  if ("error" in auth) return auth

  const parsed = stockReportFiltersSchema.safeParse(filters)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const period = planReportPeriod(parsed.data, new Date())
  if (!period.ok) return { error: period.error }

  try {
    const reports = await getStockReportsService({ salonId, from: period.from, to: period.to })
    return { from: period.from, to: period.to, ...reports }
  } catch (error) {
    console.error("Erro ao carregar os relatórios de estoque:", error)
    return { error: "Não foi possível carregar os relatórios de estoque" }
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

  const {
    salonId,
    productId,
    brandId,
    categoryId,
    contentAmount,
    contentUnit,
    requestable,
    professionalPrice,
    ...settings
  } = parsed.data

  const result = await saveProductStockSettingsService({
    salonId,
    productId,
    settings,
    classification: { brandId: brandId ?? null, categoryId: categoryId ?? null },
    content: { contentAmount: contentAmount ?? null, contentUnit: contentUnit ?? null },
    // Ausente = a tela não mandou os campos: não mexe.
    request: requestable === undefined ? undefined : { requestable, professionalPrice: professionalPrice ?? null },
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

// ============================================================================
// Solicitações de saída (fatia 4e)
// ============================================================================

/** Solicitações mostradas na lista. */
const REQUEST_ROWS = 100

/** Quem pode ver ou pedir: quem acessa o estoque, quem movimenta e quem só solicita. */
const REQUEST_VIEWERS = ["inventory.access", "inventory.move", "inventory.request"] as const

/** O débito da retirada aparece no extrato de comissões. */
function revalidateRequests(salonId: string) {
  revalidateInventory(salonId)
  revalidatePath(`/${salonId}/commissions`)
  revalidatePath(`/${salonId}/commissions/payments`)
}

/**
 * As solicitações de saída. Quem movimenta o estoque vê todas; quem só solicita vê
 * as dos próprios vínculos de profissional — e só pode pedir para eles.
 */
export async function getStockRequests(salonId: string): Promise<StockRequestsDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, REQUEST_VIEWERS)
  if ("error" in auth) return auth

  try {
    const [permissions, options, commissionsEnabled] = await Promise.all([
      getSalonPermissions(salonId, auth.userId),
      listStockRequestOptionsService(salonId),
      salonHasModule(salonId, "commissions"),
    ])

    const canMove = permissions.has("inventory.move")
    const canSeeAll = canMove || permissions.has("inventory.access")
    const own = options.professionals.filter((professional) => professional.userId === auth.userId)

    const list = await listStockRequestsService({
      salonId,
      professionalIds: canSeeAll ? undefined : own.map((professional) => professional.id),
      limit: REQUEST_ROWS,
    })

    return {
      requests: list.rows,
      truncated: list.truncated,
      pending: list.pending,
      products: options.products.map(({ id, name, professionalPrice }) => ({ id, name, professionalPrice })),
      professionals: (canMove ? options.professionals : own).map(({ id, name }) => ({ id, name })),
      commissionsEnabled,
      can: {
        access: permissions.has("inventory.access"),
        move: canMove,
        request: canMove || permissions.has("inventory.request"),
      },
    }
  } catch (error) {
    console.error("Erro ao carregar as solicitações:", error)
    return { error: "Não foi possível carregar as solicitações" }
  }
}

/** Registra uma solicitação, pendente. Quem não movimenta o estoque só pede para si. */
export async function createStockRequest(input: CreateStockRequestInput): Promise<ActionResult<{ requestId: string }>> {
  const auth = await authorizeSalon(input?.salonId, ["inventory.request", "inventory.move"])
  if ("error" in auth) return auth

  const parsed = createStockRequestSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, ...draft } = parsed.data

  let allowedProfessionalIds: string[] | null = null
  if (!(await can(salonId, auth.userId, "inventory.move"))) {
    const options = await listStockRequestOptionsService(salonId)
    allowedProfessionalIds = options.professionals
      .filter((professional) => professional.userId === auth.userId)
      .map((professional) => professional.id)
  }

  const result = await createStockRequestService({ salonId, userId: auth.userId, draft, allowedProfessionalIds })
  if (!result.success) return { error: result.error }

  revalidateRequests(salonId)
  return { success: true, data: result.data }
}

/** Aprova (o produto sai e o valor é debitado) ou recusa uma solicitação pendente. */
export async function decideStockRequest(input: {
  salonId: string
  requestId: string
  approve: boolean
}): Promise<ActionResult<{ debited: boolean; moved: boolean }>> {
  const auth = await authorizeSalon(input?.salonId, "inventory.move")
  if ("error" in auth) return auth

  const parsed = decideStockRequestSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await decideStockRequestService({
    ...parsed.data,
    userId: auth.userId,
    commissionsEnabled: await salonHasModule(parsed.data.salonId, "commissions"),
  })
  if (!result.success) return { error: result.error }

  revalidateRequests(parsed.data.salonId)
  return { success: true, data: result.data }
}

/**
 * Exclui uma solicitação. Quem movimenta o estoque exclui qualquer uma (a aprovada
 * devolve o produto e tira o débito); quem só solicita exclui as próprias pendentes.
 */
export async function deleteStockRequest(input: { salonId: string; requestId: string }): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, ["inventory.request", "inventory.move"])
  if ("error" in auth) return auth

  const parsed = deleteStockRequestSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  let ownPendingOf: string[] | undefined
  if (!(await can(parsed.data.salonId, auth.userId, "inventory.move"))) {
    const options = await listStockRequestOptionsService(parsed.data.salonId)
    ownPendingOf = options.professionals
      .filter((professional) => professional.userId === auth.userId)
      .map((professional) => professional.id)
  }

  const result = await deleteStockRequestService({ ...parsed.data, ownPendingOf })
  if (!result.success) return { error: result.error }

  revalidateRequests(parsed.data.salonId)
  return { success: true }
}
