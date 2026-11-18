"use server"

import { revalidatePath } from "next/cache"
import {
  deletePackageTemplateService,
  getPackageReportsService,
  listCustomerPackagesService,
  listPackageCatalogService,
  listPackageTemplatesService,
  planReportPeriod,
  savePackageTemplateService,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import {
  deletePackageTemplateSchema,
  packageReportFiltersSchema,
  savePackageTemplateSchema,
} from "@/lib/schemas/packages.schema"
import type { ActionResult } from "@/lib/types/common"
import type {
  CustomerPackagesDTO,
  PackageReportFilters,
  PackageReportsDTO,
  PackageTemplatesDTO,
  SavePackageTemplateInput,
} from "@/lib/types/packages"

/**
 * Pacotes (docs/ROADMAP.md, fase 5, fatias 5a e 5b).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `packages` ligado no
 * salão → permissão `packages.*`. O `salonId` chega do cliente, então estar logado
 * não basta (ver __tests__/lib/actions-authz.test.ts).
 *
 * VENDER pacote não passa por aqui: é um item da comanda (actions/sales.ts).
 */

/** Pacotes vendidos mostrados na tela. */
const PACKAGE_ROWS = 200

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "packages"))) {
    return { error: "Pacotes não estão disponíveis neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

function revalidatePackages(salonId: string) {
  revalidatePath(`/${salonId}/packages`)
  revalidatePath(`/${salonId}/packages/templates`)
  // A comanda oferece os pacotes ativos.
  revalidatePath(`/${salonId}/sales`)
}

/** Pacotes predefinidos, com o catálogo para montar um. */
export async function getPackageTemplates(salonId: string): Promise<PackageTemplatesDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "packages.access")
  if ("error" in auth) return auth

  try {
    const [templates, catalog, permissions] = await Promise.all([
      listPackageTemplatesService(salonId),
      listPackageCatalogService(salonId),
      getSalonPermissions(salonId, auth.userId),
    ])
    return { templates, catalog, can: { manage: permissions.has("packages.manage") } }
  } catch (error) {
    console.error("Erro ao carregar os pacotes predefinidos:", error)
    return { error: "Não foi possível carregar os pacotes predefinidos" }
  }
}

/** Cria (sem `templateId`) ou altera um pacote predefinido. */
export async function savePackageTemplate(
  input: SavePackageTemplateInput
): Promise<ActionResult<{ templateId: string }>> {
  const auth = await authorizeSalon(input?.salonId, "packages.manage")
  if ("error" in auth) return auth

  const parsed = savePackageTemplateSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, templateId, ...draft } = parsed.data
  const result = await savePackageTemplateService({ salonId, templateId: templateId ?? null, draft })
  if (!result.success) return { error: result.error }

  revalidatePackages(salonId)
  return { success: true, data: result.data }
}

/** Exclui um pacote predefinido que nunca entrou em comanda. */
export async function deletePackageTemplate(input: { salonId: string; templateId: string }): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "packages.manage")
  if ("error" in auth) return auth

  const parsed = deletePackageTemplateSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await deletePackageTemplateService(parsed.data)
  if (!result.success) return { error: result.error }

  revalidatePackages(parsed.data.salonId)
  return { success: true, data: undefined }
}

/**
 * Pacotes vendidos, com o que resta de cada um. `customerId` filtra por cliente — a
 * aba Pacotes da ficha do cliente.
 */
export async function getCustomerPackages(
  salonId: string,
  customerId?: string
): Promise<CustomerPackagesDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "packages.access")
  if ("error" in auth) return auth

  if (customerId !== undefined && !/^[0-9a-f-]{36}$/i.test(customerId)) return { error: "Cliente inválido" }

  try {
    const [list, permissions, salesEnabled] = await Promise.all([
      listCustomerPackagesService({ salonId, customerId, limit: PACKAGE_ROWS, now: new Date() }),
      getSalonPermissions(salonId, auth.userId),
      salonHasModule(salonId, "sales"),
    ])

    return {
      packages: list.rows,
      truncated: list.truncated,
      totals: {
        active: list.rows.filter((row) => row.status === "active").length,
        expired: list.rows.filter((row) => row.status === "expired").length,
        used: list.rows.filter((row) => row.status === "used").length,
      },
      canSell: salesEnabled && permissions.has("sales.create"),
    }
  } catch (error) {
    console.error("Erro ao carregar os pacotes vendidos:", error)
    return { error: "Não foi possível carregar os pacotes vendidos" }
  }
}

/**
 * Relatórios do período (fatia 5d): o extrato de pacotes (vendas e usos) e as
 * vendas por assinatura. Só leitura.
 */
export async function getPackageReports(
  salonId: string,
  filters: PackageReportFilters = {}
): Promise<PackageReportsDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "packages.access")
  if ("error" in auth) return auth

  const parsed = packageReportFiltersSchema.safeParse(filters)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const period = planReportPeriod(parsed.data, new Date())
  if (!period.ok) return { error: period.error }

  try {
    const reports = await getPackageReportsService({ salonId, from: period.from, to: period.to })
    return { from: period.from, to: period.to, ...reports }
  } catch (error) {
    console.error("Erro ao carregar os relatórios de pacotes:", error)
    return { error: "Não foi possível carregar os relatórios de pacotes" }
  }
}
