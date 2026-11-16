"use server"

import { revalidatePath } from "next/cache"
import {
  createStockMovementService,
  listInventoryService,
  listStockMovementsService,
  milliToNumeric,
  purchaseSuggestionMilli,
  saveProductStockSettingsService,
  stockStatus,
  stockValueCents,
  toMilli,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import {
  createStockMovementSchema,
  inventoryFiltersSchema,
  saveProductStockSettingsSchema,
} from "@/lib/schemas/inventory.schema"
import type { ActionResult } from "@/lib/types/common"
import type {
  CreateStockMovementInput,
  InventoryDTO,
  InventoryFilters,
  InventoryProductDTO,
  SaveProductStockSettingsInput,
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
    const [rows, permissions] = await Promise.all([
      listInventoryService(salonId),
      getSalonPermissions(salonId, auth.userId),
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

  const { salonId, productId, ...draft } = parsed.data

  const result = await createStockMovementService({ salonId, userId: auth.userId, productId, draft })
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

  const { salonId, productId, ...settings } = parsed.data

  const result = await saveProductStockSettingsService({ salonId, productId, settings })
  if (!result.success) return { error: result.error }

  revalidateInventory(salonId)
  return { success: true }
}
