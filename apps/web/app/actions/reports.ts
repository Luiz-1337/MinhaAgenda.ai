"use server"

import { z } from "zod"
import {
  listReportFavoritesService,
  resolveReportCatalog,
  setReportFavoriteService,
  type PermissionKey,
  type ResolvedReportCategory,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { getSalonModules, salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import type { ActionResult } from "@/lib/types/common"

/**
 * Central de relatórios (docs/ROADMAP.md, fase 9, fatia 9a).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `reports` ligado no
 * salão → permissão `reports.access`. O `salonId` chega do cliente, então estar
 * logado não basta (ver __tests__/lib/actions-authz.test.ts).
 *
 * A central não calcula relatório nenhum: lista o catálogo e aponta para a tela
 * que responde. Cada tela de destino confere o próprio módulo e a própria
 * permissão; aqui só deixa de aparecer o que a pessoa não abriria.
 */

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "reports"))) {
    return { error: "Relatórios não estão disponíveis neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

const favoriteSchema = z.object({
  salonId: z.string().uuid(),
  reportKey: z.string().max(90),
  favorite: z.boolean(),
})

export type ReportsHomeData = {
  categories: ResolvedReportCategory[]
  /** As chaves marcadas com estrela por quem está logado, na ordem em que marcou. */
  favorites: string[]
}

/** O catálogo como quem está logado o vê neste salão, e os favoritos dele. */
export async function getReportsHome(salonId: string): Promise<ReportsHomeData | { error: string }> {
  const auth = await authorizeSalon(salonId, "reports.access")
  if ("error" in auth) return auth

  try {
    const [modules, permissions, favorites] = await Promise.all([
      getSalonModules(salonId),
      getSalonPermissions(salonId, auth.userId),
      listReportFavoritesService({ salonId, userId: auth.userId }),
    ])
    return { categories: resolveReportCatalog({ modules, permissions: [...permissions] }), favorites }
  } catch (error) {
    console.error("Erro ao carregar a central de relatórios:", error)
    return { error: "Não foi possível carregar os relatórios" }
  }
}

/** Marca ou desmarca um relatório como favorito de quem está logado. */
export async function setReportFavorite(input: z.infer<typeof favoriteSchema>): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "reports.access")
  if ("error" in auth) return auth

  const parsed = favoriteSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await setReportFavoriteService({ ...parsed.data, userId: auth.userId })
  if (!result.success) return { error: result.error }

  return { success: true, data: undefined }
}
