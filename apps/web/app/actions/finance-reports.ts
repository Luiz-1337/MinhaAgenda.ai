"use server"

import { z } from "zod"
import {
  getAccountStatementService,
  getNetResultReportsService,
  getRevenueProjectionService,
  parseFinanceReportView,
  planProjectionPeriod,
  planReportPeriod,
  type AccountStatementReport,
  type FinanceReportView,
  type NetResultReport,
  type PermissionKey,
  type RevenueProjection,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"

/**
 * Relatórios financeiros (docs/ROADMAP.md, fase 9, fatia 9b).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulos `reports` E `finance`
 * ligados no salão → permissão. O `salonId` chega do cliente, então estar logado
 * não basta (ver __tests__/lib/actions-authz.test.ts).
 *
 * São números do financeiro: pedem `finance.access`, como as telas do
 * financeiro. `reports.access` só abre a central.
 */

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "reports")) || !(await salonHasModule(salonId, "finance"))) {
    return { error: "Relatórios financeiros não estão disponíveis neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

const filtersSchema = z.object({
  view: z.string().max(20).optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  account: z.string().uuid().optional(),
})

export type FinanceReportFilters = z.infer<typeof filtersSchema>

export type FinanceReportsData = { from: string; to: string } & (
  | { view: "services" | "products"; report: NetResultReport; truncated: boolean }
  | { view: "projection"; report: RevenueProjection }
  | ({ view: "statement" } & AccountStatementReport)
)

/** O relatório pedido em `view` (sem `view`, o resultado líquido de serviços). */
export async function getFinanceReport(
  salonId: string,
  filters: FinanceReportFilters = {}
): Promise<FinanceReportsData | { error: string }> {
  const auth = await authorizeSalon(salonId, "finance.access")
  if ("error" in auth) return auth

  const parsed = filtersSchema.safeParse(filters)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const view: FinanceReportView = parseFinanceReportView(parsed.data.view)
  const now = new Date()

  try {
    if (view === "projection") {
      const period = planProjectionPeriod({ to: parsed.data.to }, now)
      if (!period.ok) return { error: period.error }
      const report = await getRevenueProjectionService({ salonId, from: period.from, to: period.to })
      return { view, from: period.from, to: period.to, report }
    }

    const period = planReportPeriod({ from: parsed.data.from, to: parsed.data.to }, now)
    if (!period.ok) return { error: period.error }

    if (view === "statement") {
      const statement = await getAccountStatementService({
        salonId,
        accountId: parsed.data.account ?? null,
        from: period.from,
        to: period.to,
      })
      return { view, from: period.from, to: period.to, ...statement }
    }

    const reports = await getNetResultReportsService({ salonId, from: period.from, to: period.to })
    return { view, from: period.from, to: period.to, report: reports[view], truncated: reports.truncated }
  } catch (error) {
    console.error("Erro ao carregar o relatório financeiro:", error)
    return { error: "Não foi possível carregar o relatório" }
  }
}
