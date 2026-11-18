"use server"

import { revalidatePath } from "next/cache"
import {
  adjustCashbackService,
  getCashbackSettingsService,
  getCustomerCashbackService,
  listCashbackHistoryService,
  planReportPeriod,
  listCashbackCustomersService,
  listCashbackItemsService,
  saveCashbackRuleService,
  saveCashbackSettingsService,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import {
  adjustCashbackSchema,
  cashbackHistoryFiltersSchema,
  saveCashbackRuleSchema,
  saveCashbackSettingsSchema,
} from "@/lib/schemas/cashback.schema"
import type { ActionResult } from "@/lib/types/common"
import type {
  AdjustCashbackInput,
  CashbackHistoryDTO,
  CashbackHistoryFilters,
  CashbackOverviewDTO,
  CustomerCashbackDTO,
  SaveCashbackRuleInput,
  SaveCashbackSettingsInput,
} from "@/lib/types/cashback"

/**
 * Cashback (docs/ROADMAP.md, fase 6, fatia 6a).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `cashback` ligado no
 * salão → permissão `cashback.*`. O `salonId` chega do cliente, então estar logado
 * não basta (ver __tests__/lib/actions-authz.test.ts).
 *
 * GANHAR e USAR cashback não passam por aqui: acontecem no faturamento da comanda
 * (actions/sales.ts).
 */

/** Clientes mostrados na tela e linhas do extrato na ficha. */
const CUSTOMER_ROWS = 300
const ENTRY_ROWS = 100
/** Lançamentos mostrados no relatório de histórico. */
const HISTORY_ROWS = 500

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "cashback"))) {
    return { error: "Cashback não está disponível neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

function revalidateCashback(salonId: string) {
  revalidatePath(`/${salonId}/cashback`)
  // A comanda oferece o uso do cashback conforme a configuração.
  revalidatePath(`/${salonId}/sales`)
}

/** A tela de Cashback: configuração, itens e clientes com saldo. */
export async function getCashbackOverview(salonId: string): Promise<CashbackOverviewDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "cashback.access")
  if ("error" in auth) return auth

  try {
    const [settings, items, customers, permissions] = await Promise.all([
      getCashbackSettingsService(salonId),
      listCashbackItemsService(salonId),
      listCashbackCustomersService({ salonId, limit: CUSTOMER_ROWS }),
      getSalonPermissions(salonId, auth.userId),
    ])

    return {
      settings,
      items,
      customers: customers.rows,
      truncated: customers.truncated,
      can: { manage: permissions.has("cashback.manage") },
    }
  } catch (error) {
    console.error("Erro ao carregar o cashback:", error)
    return { error: "Não foi possível carregar o cashback" }
  }
}

/** Liga ou desliga o cashback e define o valor padrão e o mínimo para resgate. */
export async function saveCashbackSettings(input: SaveCashbackSettingsInput): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "cashback.manage")
  if ("error" in auth) return auth

  const parsed = saveCashbackSettingsSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, ...draft } = parsed.data
  const result = await saveCashbackSettingsService({ salonId, draft })
  if (!result.success) return { error: result.error }

  revalidateCashback(salonId)
  return { success: true, data: undefined }
}

/** Define o cashback de um serviço ou produto (0 = usa o padrão do salão). */
export async function saveCashbackRule(input: SaveCashbackRuleInput): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "cashback.manage")
  if ("error" in auth) return auth

  const parsed = saveCashbackRuleSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, itemKind, itemId, ...draft } = parsed.data
  const result = await saveCashbackRuleService({ salonId, itemKind, itemId, draft })
  if (!result.success) return { error: result.error }

  revalidateCashback(salonId)
  return { success: true, data: undefined }
}

/** Lança um crédito ou um débito de cashback à mão, com motivo. */
export async function adjustCashback(input: AdjustCashbackInput): Promise<ActionResult<{ balance: string }>> {
  const auth = await authorizeSalon(input?.salonId, "cashback.manage")
  if ("error" in auth) return auth

  const parsed = adjustCashbackSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await adjustCashbackService({ ...parsed.data, userId: auth.userId })
  if (!result.success) return { error: result.error }

  revalidateCashback(parsed.data.salonId)
  return { success: true, data: result.data }
}

/** O saldo e o extrato de cashback de um cliente — o cartão da ficha. */
export async function getCustomerCashback(
  salonId: string,
  customerId: string
): Promise<CustomerCashbackDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "cashback.access")
  if ("error" in auth) return auth

  if (!/^[0-9a-f-]{36}$/i.test(customerId ?? "")) return { error: "Cliente inválido" }

  try {
    const [cashback, permissions] = await Promise.all([
      getCustomerCashbackService({ salonId, customerId, limit: ENTRY_ROWS }),
      getSalonPermissions(salonId, auth.userId),
    ])

    return {
      ...cashback,
      entries: cashback.entries.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
      can: { manage: permissions.has("cashback.manage") },
    }
  } catch (error) {
    console.error("Erro ao carregar o cashback do cliente:", error)
    return { error: "Não foi possível carregar o cashback do cliente" }
  }
}

/**
 * O relatório "Histórico de cashback" (fatia 6f): os lançamentos do período, de
 * todos os clientes, com os totais.
 */
export async function getCashbackHistory(
  salonId: string,
  filters: CashbackHistoryFilters = {}
): Promise<CashbackHistoryDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "cashback.access")
  if ("error" in auth) return auth

  const parsed = cashbackHistoryFiltersSchema.safeParse(filters)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const period = planReportPeriod(parsed.data, new Date())
  if (!period.ok) return { error: period.error }

  try {
    const history = await listCashbackHistoryService({ salonId, from: period.from, to: period.to, limit: HISTORY_ROWS })

    return {
      from: period.from,
      to: period.to,
      summary: history.summary,
      entries: history.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      truncated: history.truncated,
    }
  } catch (error) {
    console.error("Erro ao carregar o histórico de cashback:", error)
    return { error: "Não foi possível carregar o histórico de cashback" }
  }
}
