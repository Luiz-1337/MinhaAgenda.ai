"use server"

import { revalidatePath } from "next/cache"
import {
  DEFAULT_REVIEW_TEXTS,
  DEFAULT_REVIEW_WHATSAPP_TEXT,
  REVIEW_WHATSAPP_DELAY,
  deleteReviewService,
  getReviewSettingsService,
  listReviewsService,
  planReportPeriod,
  saveReviewSettingsService,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import { reviewFiltersSchema, reviewRefSchema, saveReviewSettingsSchema } from "@/lib/schemas/reviews.schema"
import type { ActionResult } from "@/lib/types/common"
import type { ReviewFilters, ReviewsDTO, SaveReviewSettingsInput } from "@/lib/types/reviews"

/**
 * Avaliações pós-atendimento — telas do salão (docs/ROADMAP.md, fase 6, fatia 6c).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `reviews` ligado no
 * salão → permissão `reviews.*`. O `salonId` chega do cliente, então estar logado
 * não basta (ver __tests__/lib/actions-authz.test.ts).
 *
 * O FORMULÁRIO PÚBLICO não passa por aqui: mora em actions/public-reviews.ts, sem
 * sessão, com o token do pedido como credencial.
 */

/** Pedidos de avaliação mostrados na tela. */
const REVIEW_ROWS = 500

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "reviews"))) {
    return { error: "Avaliações não estão disponíveis neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

/** O painel e a lista do período (pelo dia do atendimento), com a configuração. */
export async function getReviews(salonId: string, filters: ReviewFilters = {}): Promise<ReviewsDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "reviews.access")
  if ("error" in auth) return auth

  const parsed = reviewFiltersSchema.safeParse(filters)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const period = planReportPeriod(parsed.data, new Date())
  if (!period.ok) return { error: period.error }

  try {
    const [list, settings, permissions] = await Promise.all([
      listReviewsService({ salonId, from: period.from, to: period.to, limit: REVIEW_ROWS }),
      getReviewSettingsService(salonId),
      getSalonPermissions(salonId, auth.userId),
    ])

    return {
      from: period.from,
      to: period.to,
      settings,
      defaults: { ...DEFAULT_REVIEW_TEXTS, whatsapp: DEFAULT_REVIEW_WHATSAPP_TEXT },
      whatsappDelay: { min: REVIEW_WHATSAPP_DELAY.min, max: REVIEW_WHATSAPP_DELAY.max },
      dashboard: list.dashboard,
      reviews: list.rows.map((row) => ({
        ...row,
        requestedAt: row.requestedAt.toISOString(),
        respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
      })),
      truncated: list.truncated,
      can: { manage: permissions.has("reviews.manage") },
    }
  } catch (error) {
    console.error("Erro ao carregar as avaliações:", error)
    return { error: "Não foi possível carregar as avaliações" }
  }
}

/** Liga ou desliga os pedidos de avaliação e personaliza os textos do formulário. */
export async function saveReviewSettings(input: SaveReviewSettingsInput): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "reviews.manage")
  if ("error" in auth) return auth

  const parsed = saveReviewSettingsSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, ...draft } = parsed.data
  const result = await saveReviewSettingsService({ salonId, draft })
  if (!result.success) return { error: result.error }

  revalidatePath(`/${salonId}/reviews`)
  return { success: true, data: undefined }
}

/** Exclui uma avaliação (ou um pedido pendente). */
export async function deleteReview(input: { salonId: string; reviewId: string }): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "reviews.manage")
  if ("error" in auth) return auth

  const parsed = reviewRefSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await deleteReviewService(parsed.data)
  if (!result.success) return { error: result.error }

  revalidatePath(`/${parsed.data.salonId}/reviews`)
  return { success: true, data: undefined }
}
