"use server"

import { revalidatePath } from "next/cache"
import {
  deletePromotionService,
  listPromotionsService,
  savePromotionService,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import { promotionRefSchema, savePromotionSchema } from "@/lib/schemas/promotions.schema"
import type { ActionResult } from "@/lib/types/common"
import type { PromotionsDTO, SavePromotionInput } from "@/lib/types/promotions"

/**
 * Promoções e cupons (docs/ROADMAP.md, fase 6, fatia 6b).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `promotions` ligado no
 * salão → permissão `promotions.*`. O `salonId` chega do cliente, então estar
 * logado não basta (ver __tests__/lib/actions-authz.test.ts).
 *
 * APLICAR o cupom não passa por aqui: é ao salvar a comanda (actions/sales.ts).
 */

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "promotions"))) {
    return { error: "Promoções não estão disponíveis neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

function revalidatePromotions(salonId: string) {
  revalidatePath(`/${salonId}/promotions`)
}

/** As promoções do salão, com o uso de cada uma. */
export async function getPromotions(salonId: string): Promise<PromotionsDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "promotions.access")
  if ("error" in auth) return auth

  try {
    const [promotions, permissions] = await Promise.all([
      listPromotionsService({ salonId, now: new Date() }),
      getSalonPermissions(salonId, auth.userId),
    ])
    return { promotions, can: { manage: permissions.has("promotions.manage") } }
  } catch (error) {
    console.error("Erro ao carregar as promoções:", error)
    return { error: "Não foi possível carregar as promoções" }
  }
}

/** Cria (sem `promotionId`) ou altera uma promoção. */
export async function savePromotion(input: SavePromotionInput): Promise<ActionResult<{ promotionId: string }>> {
  const auth = await authorizeSalon(input?.salonId, "promotions.manage")
  if ("error" in auth) return auth

  const parsed = savePromotionSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, promotionId, ...draft } = parsed.data
  const result = await savePromotionService({ salonId, promotionId: promotionId ?? null, draft })
  if (!result.success) return { error: result.error }

  revalidatePromotions(salonId)
  return { success: true, data: result.data }
}

/** Exclui uma promoção que nunca entrou em comanda. */
export async function deletePromotion(input: { salonId: string; promotionId: string }): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "promotions.manage")
  if ("error" in auth) return auth

  const parsed = promotionRefSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await deletePromotionService(parsed.data)
  if (!result.success) return { error: result.error }

  revalidatePromotions(parsed.data.salonId)
  return { success: true, data: undefined }
}
