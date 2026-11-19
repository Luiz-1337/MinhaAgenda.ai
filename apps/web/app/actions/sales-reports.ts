"use server"

import { z } from "zod"
import {
  getCatalogListService,
  getReferralReportService,
  getSalesPeriodReportService,
  parseSalesReportView,
  planReportPeriod,
  type CatalogProduct,
  type CatalogService,
  type PermissionKey,
  type ReferralReport,
  type SalesPeriodReport,
  type SalesReportView,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"

/**
 * Relatórios de vendas e rankings (docs/ROADMAP.md, fase 9, fatia 9d).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `reports` ligado no
 * salão → permissão. O `salonId` chega do cliente, então estar logado não basta
 * (ver __tests__/lib/actions-authz.test.ts).
 *
 * A permissão depende do relatório, porque o dado é de telas diferentes:
 *   - vendidos e os dois rankings leem TODAS as comandas: `sales.view_all`, e o
 *     módulo `sales` ligado;
 *   - a lista de produtos e serviços: `products.access` (os serviços só entram
 *     para quem tem também `services.access`);
 *   - indicação de clientes: `customers.access`.
 */

const VIEW_PERMISSION: Record<SalesReportView, PermissionKey> = {
  items: "sales.view_all",
  customers: "sales.view_all",
  professionals: "sales.view_all",
  catalog: "products.access",
  referrals: "customers.access",
}

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

const filtersSchema = z.object({
  view: z.string().max(20).optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
})

export type SalesReportData =
  | ({ from: string; to: string } & SalesPeriodReport)
  | { view: "referrals"; from: string; to: string; report: ReferralReport }
  | { view: "catalog"; services: CatalogService[] | null; products: CatalogProduct[] | null }

/** O relatório pedido em `view` (sem `view`, produtos e serviços vendidos). */
export async function getSalesReport(
  salonId: string,
  filters: z.infer<typeof filtersSchema> = {}
): Promise<SalesReportData | { error: string }> {
  const view = parseSalesReportView(filters?.view)
  const auth = await authorizeSalon(salonId, VIEW_PERMISSION[view])
  if ("error" in auth) return auth

  const parsed = filtersSchema.safeParse(filters)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  try {
    if (view === "catalog") {
      const includeServices = await can(salonId, auth.userId, "services.access")
      const catalog = await getCatalogListService({ salonId, includeServices, includeProducts: true })
      return { view, ...catalog }
    }

    const period = planReportPeriod({ from: parsed.data.from, to: parsed.data.to }, new Date())
    if (!period.ok) return { error: period.error }

    if (view === "referrals") {
      const report = await getReferralReportService({ salonId, from: period.from, to: period.to })
      return { view, from: period.from, to: period.to, report }
    }

    if (!(await salonHasModule(salonId, "sales"))) {
      return { error: "As comandas não estão disponíveis neste salão" }
    }
    const report = await getSalesPeriodReportService({ salonId, view, from: period.from, to: period.to })
    return { from: period.from, to: period.to, ...report }
  } catch (error) {
    console.error("Erro ao carregar o relatório de vendas:", error)
    return { error: "Não foi possível carregar o relatório" }
  }
}
