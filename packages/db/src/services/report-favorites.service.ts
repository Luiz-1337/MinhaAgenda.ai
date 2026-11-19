import { and, asc, count, eq } from "drizzle-orm"

import { db, reportFavorites } from "../index"
import { isReportKey, REPORT_FAVORITES_LIMIT, sanitizeReportFavorites } from "../domain/report-catalog"
import type { ActionResult } from "./appointments"

/**
 * Favoritos da central de relatórios (docs/ROADMAP.md, fase 9, fatia 9a).
 *
 * Só I/O. O favorito é de UMA pessoa num salão: toda consulta leva `salon_id` E
 * `user_id`. Quem autoriza é a Server Action.
 */

/** As chaves que a pessoa marcou, na ordem em que marcou. Chave fora do catálogo é ignorada. */
export async function listReportFavoritesService(input: { salonId: string; userId: string }): Promise<string[]> {
  const rows = await db
    .select({ reportKey: reportFavorites.reportKey })
    .from(reportFavorites)
    .where(and(eq(reportFavorites.salonId, input.salonId), eq(reportFavorites.userId, input.userId)))
    .orderBy(asc(reportFavorites.createdAt))

  return sanitizeReportFavorites(rows.map((row) => row.reportKey))
}

/** Marca ou desmarca um relatório. Marcar o que já está marcado não é erro. */
export async function setReportFavoriteService(input: {
  salonId: string
  userId: string
  reportKey: unknown
  favorite: boolean
}): Promise<ActionResult<void>> {
  if (!isReportKey(input.reportKey)) return { success: false, error: "Relatório desconhecido" }
  const scope = and(
    eq(reportFavorites.salonId, input.salonId),
    eq(reportFavorites.userId, input.userId),
    eq(reportFavorites.reportKey, input.reportKey)
  )

  try {
    if (!input.favorite) {
      await db.delete(reportFavorites).where(scope)
      return { success: true, data: undefined }
    }

    const [total] = await db
      .select({ value: count() })
      .from(reportFavorites)
      .where(and(eq(reportFavorites.salonId, input.salonId), eq(reportFavorites.userId, input.userId)))
    if (Number(total?.value ?? 0) >= REPORT_FAVORITES_LIMIT) {
      return { success: false, error: `Você já tem ${REPORT_FAVORITES_LIMIT} favoritos. Desmarque um para marcar outro` }
    }

    await db
      .insert(reportFavorites)
      .values({ salonId: input.salonId, userId: input.userId, reportKey: input.reportKey })
      .onConflictDoNothing()
    return { success: true, data: undefined }
  } catch (error) {
    console.error("Não foi possível salvar o favorito", error)
    return { success: false, error: "Não foi possível salvar o favorito" }
  }
}
