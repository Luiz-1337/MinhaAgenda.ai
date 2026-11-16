import { cache } from "react"
import { db, salons, eq, parseSalonModules, type SalonModule } from "@repo/db"

/**
 * Módulos ligados no salão (`salons.settings.modules`).
 *
 * É a chave de piloto dos módulos de gestão (docs/ROADMAP.md §4.2): entram
 * desligados para todos e são ligados salão a salão. A lista de módulos e o
 * parser vivem em `@repo/db` (domain/permissions.ts).
 *
 * Divisão com `plan-features.service.ts`: lá é o que o PLANO inclui; aqui é o que
 * foi LIGADO neste salão. Um módulo só aparece quando as duas camadas deixam —
 * hoje nenhum módulo é gateado por plano.
 *
 * Memoizada por request: o gate roda em toda action do módulo.
 */
export const getSalonModules = cache(async (salonId: string): Promise<SalonModule[]> => {
  if (!salonId) return []

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { settings: true }
  })

  return parseSalonModules(salon?.settings)
})

/**
 * O módulo está ligado neste salão?
 *
 * Use no SERVIDOR, antes de consultar qualquer coisa do módulo.
 */
export async function salonHasModule(salonId: string, module: SalonModule): Promise<boolean> {
  return (await getSalonModules(salonId)).includes(module)
}
