"use server"

import { z } from "zod"
import {
  getProfessionalPanelService,
  planReportPeriod,
  type PermissionKey,
  type ProfessionalPanelReport,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"

/**
 * Painel de profissionais (docs/ROADMAP.md, fase 9, fatia 9e).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulos `reports` E `sales`
 * ligados no salão → permissão. O `salonId` chega do cliente, então estar logado
 * não basta (ver __tests__/lib/actions-authz.test.ts).
 *
 * O painel mostra o que TODOS os profissionais venderam e a agenda de todos:
 * pede `sales.view_all` E `schedule.view_all`.
 */

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "reports")) || !(await salonHasModule(salonId, "sales"))) {
    return { error: "O painel de profissionais não está disponível neste salão" }
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

export type ProfessionalPanelData = { from: string; to: string } & ProfessionalPanelReport

/** O painel do período (sem datas, o mês corrente até hoje). */
export async function getProfessionalPanel(
  salonId: string,
  filters: z.infer<typeof filtersSchema> = {}
): Promise<ProfessionalPanelData | { error: string }> {
  const auth = await authorizeSalon(salonId, "sales.view_all")
  if ("error" in auth) return auth

  if (!(await can(salonId, auth.userId, "schedule.view_all"))) {
    return { error: "Você não tem permissão para ver a agenda de todos os profissionais" }
  }

  const parsed = filtersSchema.safeParse(filters)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const period = planReportPeriod(parsed.data, new Date())
  if (!period.ok) return { error: period.error }

  try {
    const panel = await getProfessionalPanelService({ salonId, from: period.from, to: period.to })
    return { from: period.from, to: period.to, ...panel }
  } catch (error) {
    console.error("Erro ao carregar o painel de profissionais:", error)
    return { error: "Não foi possível carregar o painel" }
  }
}
