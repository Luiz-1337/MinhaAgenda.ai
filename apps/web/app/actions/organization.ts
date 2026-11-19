"use server"

import { z } from "zod"
import {
  getOrganizationReportService,
  planReportPeriod,
  type OrganizationReport,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"

/**
 * Organização (multiunidade) — docs/ROADMAP.md, fase 9, fatia 9g, caminho A.
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `reports` ligado no
 * salão em que a tela foi aberta → permissão. O `salonId` chega do cliente,
 * então estar logado não basta (ver __tests__/lib/actions-authz.test.ts).
 *
 * Esta é a única tela que mostra MAIS DE UM salão. Quais salões entram NÃO vem
 * do cliente: o serviço lê os salões de que o usuário da sessão é dono
 * (`salons.owner_id`). Gerente e profissional não viram dono por ter permissão.
 */

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "reports"))) {
    return { error: "A organização não está disponível neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

const filtersSchema = z.object({
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
})

export type OrganizationData = { from: string; to: string } & OrganizationReport

/** As unidades de quem está logado, lado a lado, e a equipe de todas. */
export async function getOrganization(
  salonId: string,
  filters: z.infer<typeof filtersSchema> = {}
): Promise<OrganizationData | { error: string }> {
  const auth = await authorizeSalon(salonId, "reports.access")
  if ("error" in auth) return auth

  const parsed = filtersSchema.safeParse(filters)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const period = planReportPeriod(parsed.data, new Date())
  if (!period.ok) return { error: period.error }

  try {
    const report = await getOrganizationReportService({ ownerId: auth.userId, from: period.from, to: period.to })
    // Só o dono tem organização. E a tela tem que ser aberta de um salão DELE:
    // sem isso, o módulo ligado no salão de outra pessoa abriria a tela.
    if (!report || !report.units.rows.some((unit) => unit.salonId === salonId)) {
      return { error: "A organização é só para o dono do salão" }
    }
    return { from: period.from, to: period.to, ...report }
  } catch (error) {
    console.error("Erro ao carregar a organização:", error)
    return { error: "Não foi possível carregar a organização" }
  }
}
