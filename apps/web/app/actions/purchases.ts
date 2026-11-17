"use server"

import { revalidatePath } from "next/cache"
import {
  brazilToday,
  createPurchaseService,
  deleteProductCatalogEntryService,
  deletePurchaseService,
  deleteSupplierService,
  listCommissionFinanceOptionsService,
  listProductCatalogService,
  listPurchaseFormOptionsService,
  listPurchasesService,
  listSuppliersService,
  saveProductCatalogEntryService,
  saveSupplierService,
  setSupplierActiveService,
  toCents,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import {
  createPurchaseSchema,
  deleteCatalogEntrySchema,
  deletePurchaseSchema,
  purchasesFiltersSchema,
  saveCatalogEntrySchema,
  saveSupplierSchema,
  setSupplierActiveSchema,
  supplierRefSchema,
} from "@/lib/schemas/purchases.schema"
import type { ActionResult } from "@/lib/types/common"
import type {
  CreatePurchaseInput,
  ProductCatalogDTO,
  PurchaseFormDTO,
  PurchasesDTO,
  PurchasesFilters,
  SaveCatalogEntryInput,
  SaveSupplierInput,
  SuppliersDTO,
} from "@/lib/types/purchase"

/**
 * Compras, fornecedores e marcas/categorias de produto (docs/ROADMAP.md, fase 4,
 * fatia 4b).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `inventory` ligado no
 * salão → permissão `inventory.*`. O `salonId` chega do cliente, então estar logado
 * não basta (ver __tests__/lib/actions-authz.test.ts).
 *
 * A regra não mora aqui: `@repo/db` (domain/purchases.ts decide,
 * services/purchases.service.ts grava).
 */

/** Compras mostradas na lista. */
const PURCHASE_ROWS = 100

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

/** A compra mexe no saldo e no custo: as telas de estoque e de compras mudam juntas. */
function revalidateInventory(salonId: string) {
  revalidatePath(`/${salonId}/inventory`)
  revalidatePath(`/${salonId}/inventory/purchases`)
  revalidatePath(`/${salonId}/inventory/suppliers`)
  revalidatePath(`/${salonId}/inventory/catalog`)
  revalidatePath(`/${salonId}/inventory/batches`)
}

function revalidateFinance(salonId: string) {
  revalidatePath(`/${salonId}/finance`)
  revalidatePath(`/${salonId}/finance/summary`)
}

/**
 * A pessoa pode gerar conta a pagar a partir de uma compra? Só com o módulo
 * `finance` ligado no salão E a permissão de lançar nele: lançar compra não dá, por
 * tabela, o direito de criar despesa.
 */
async function canRecordFinance(salonId: string, permissions: ReadonlySet<PermissionKey>): Promise<boolean> {
  return permissions.has("finance.create") && (await salonHasModule(salonId, "finance"))
}

// ============================================================================
// Fornecedores
// ============================================================================

export async function getSuppliers(salonId: string): Promise<SuppliersDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "inventory.access")
  if ("error" in auth) return auth

  try {
    const [suppliers, permissions] = await Promise.all([
      listSuppliersService(salonId),
      getSalonPermissions(salonId, auth.userId),
    ])
    return { suppliers, can: { manage: permissions.has("inventory.manage") } }
  } catch (error) {
    console.error("Erro ao carregar os fornecedores:", error)
    return { error: "Não foi possível carregar os fornecedores" }
  }
}

export async function saveSupplier(input: SaveSupplierInput): Promise<ActionResult<{ supplierId: string }>> {
  const auth = await authorizeSalon(input?.salonId, "inventory.manage")
  if ("error" in auth) return auth

  const parsed = saveSupplierSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, supplierId, ...draft } = parsed.data

  const result = await saveSupplierService({ salonId, supplierId, draft })
  if (!result.success) return { error: result.error }

  revalidateInventory(salonId)
  return { success: true, data: result.data }
}

export async function setSupplierActive(input: {
  salonId: string
  supplierId: string
  isActive: boolean
}): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "inventory.manage")
  if ("error" in auth) return auth

  const parsed = setSupplierActiveSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await setSupplierActiveService(parsed.data)
  if (!result.success) return { error: result.error }

  revalidateInventory(parsed.data.salonId)
  return { success: true }
}

export async function deleteSupplier(input: { salonId: string; supplierId: string }): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "inventory.manage")
  if ("error" in auth) return auth

  const parsed = supplierRefSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await deleteSupplierService(parsed.data)
  if (!result.success) return { error: result.error }

  revalidateInventory(parsed.data.salonId)
  return { success: true }
}

// ============================================================================
// Marcas e categorias
// ============================================================================

export async function getProductCatalog(salonId: string): Promise<ProductCatalogDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "inventory.access")
  if ("error" in auth) return auth

  try {
    const [catalog, permissions] = await Promise.all([
      listProductCatalogService(salonId),
      getSalonPermissions(salonId, auth.userId),
    ])
    return { ...catalog, can: { manage: permissions.has("inventory.manage") } }
  } catch (error) {
    console.error("Erro ao carregar marcas e categorias:", error)
    return { error: "Não foi possível carregar marcas e categorias" }
  }
}

export async function saveCatalogEntry(input: SaveCatalogEntryInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeSalon(input?.salonId, "inventory.manage")
  if ("error" in auth) return auth

  const parsed = saveCatalogEntrySchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await saveProductCatalogEntryService(parsed.data)
  if (!result.success) return { error: result.error }

  revalidateInventory(parsed.data.salonId)
  return { success: true, data: result.data }
}

export async function deleteCatalogEntry(input: {
  salonId: string
  kind: "brand" | "category"
  id: string
}): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "inventory.manage")
  if ("error" in auth) return auth

  const parsed = deleteCatalogEntrySchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await deleteProductCatalogEntryService(parsed.data)
  if (!result.success) return { error: result.error }

  revalidateInventory(parsed.data.salonId)
  return { success: true }
}

// ============================================================================
// Compras
// ============================================================================

export async function getPurchases(
  salonId: string,
  filters: PurchasesFilters = {}
): Promise<PurchasesDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "inventory.access")
  if ("error" in auth) return auth

  const parsed = purchasesFiltersSchema.safeParse(filters)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  try {
    const [list, permissions] = await Promise.all([
      listPurchasesService({ salonId, from: parsed.data.from, to: parsed.data.to, limit: PURCHASE_ROWS }),
      getSalonPermissions(salonId, auth.userId),
    ])

    return {
      purchases: list.rows,
      truncated: list.truncated,
      from: parsed.data.from ?? null,
      to: parsed.data.to ?? null,
      totalCents: list.rows.reduce((sum, row) => sum + (toCents(row.totalAmount) ?? 0), 0),
      can: { purchase: permissions.has("inventory.purchase") },
    }
  } catch (error) {
    console.error("Erro ao carregar as compras:", error)
    return { error: "Não foi possível carregar as compras" }
  }
}

/** O que a tela de nova compra oferece: fornecedores, produtos e, se puder, o financeiro. */
export async function getPurchaseForm(salonId: string): Promise<PurchaseFormDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "inventory.purchase")
  if ("error" in auth) return auth

  try {
    const [options, permissions] = await Promise.all([
      listPurchaseFormOptionsService(salonId),
      getSalonPermissions(salonId, auth.userId),
    ])

    const finance = (await canRecordFinance(salonId, permissions))
      ? await listCommissionFinanceOptionsService(salonId)
      : null

    return { ...options, finance, today: brazilToday(new Date()) }
  } catch (error) {
    console.error("Erro ao carregar a nova compra:", error)
    return { error: "Não foi possível carregar a nova compra" }
  }
}

/** Lança uma compra: entra no estoque, atualiza o custo e, se pedido, vai para o financeiro. */
export async function createPurchase(
  input: CreatePurchaseInput
): Promise<ActionResult<{ purchaseId: string; installments: number }>> {
  const auth = await authorizeSalon(input?.salonId, "inventory.purchase")
  if ("error" in auth) return auth

  const parsed = createPurchaseSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, finance, ...draft } = parsed.data

  if (finance) {
    const permissions = await getSalonPermissions(salonId, auth.userId)
    if (!(await canRecordFinance(salonId, permissions))) {
      return { error: "Você não tem permissão para lançar no financeiro" }
    }
  }

  const result = await createPurchaseService({ salonId, userId: auth.userId, draft, finance: finance ?? null })
  if (!result.success) return { error: result.error }

  revalidateInventory(salonId)
  if (result.data.installments > 0) revalidateFinance(salonId)
  return { success: true, data: result.data }
}

/** Exclui uma compra sem parcela paga: desfaz a entrada no estoque e as parcelas abertas. */
export async function deletePurchase(input: { salonId: string; purchaseId: string }): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "inventory.purchase")
  if ("error" in auth) return auth

  const parsed = deletePurchaseSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await deletePurchaseService(parsed.data)
  if (!result.success) return { error: result.error }

  revalidateInventory(parsed.data.salonId)
  if (result.data.hadFinance) revalidateFinance(parsed.data.salonId)
  return { success: true }
}
