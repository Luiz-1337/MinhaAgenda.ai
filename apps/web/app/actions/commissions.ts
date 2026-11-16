"use server"

import { revalidatePath } from "next/cache"
import {
  brazilToday,
  commissionTotals,
  createCommissionAdjustmentService,
  deleteCommissionAdjustmentService,
  getCommissionConfigService,
  listCommissionEntriesService,
  listCommissionProfessionalsService,
  monthRange,
  recalculateCommissionsService,
  saveCommissionAssistantRulesService,
  saveCommissionRulesService,
  saveCommissionSettingsService,
  centsToNumeric,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import {
  commissionStatementFiltersSchema,
  createCommissionAdjustmentSchema,
  deleteCommissionAdjustmentSchema,
  recalculateCommissionsSchema,
  saveCommissionAssistantRulesSchema,
  saveCommissionRulesSchema,
  saveCommissionSettingsSchema,
} from "@/lib/schemas/commissions.schema"
import type { ActionResult } from "@/lib/types/common"
import type {
  CommissionConfigDTO,
  CreateCommissionAdjustmentInput,
  CommissionStatementDTO,
  CommissionStatementFilters,
  RecalculateCommissionsInput,
  SaveCommissionAssistantRulesInput,
  SaveCommissionRulesInput,
  SaveCommissionSettingsInput,
} from "@/lib/types/commission"

/**
 * Comissões (docs/ROADMAP.md, fase 3, fatias 3a a 3c).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `commissions` ligado no
 * salão → permissão `commissions.*`. O `salonId` chega do cliente, então estar
 * logado não basta (ver __tests__/lib/actions-authz.test.ts).
 *
 * A regra não mora aqui: `@repo/db` (domain/commissions.ts decide,
 * services/commissions.service.ts grava).
 */

/** Linhas mostradas no extrato. Os totais são sempre do período inteiro. */
const STATEMENT_ROWS = 500
/** Maior período aceito no recálculo. */
const MAX_RECALCULATE_DAYS = 366

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "commissions"))) {
    return { error: "Comissões não estão disponíveis neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

function revalidateCommissions(salonId: string) {
  revalidatePath(`/${salonId}/commissions`)
  revalidatePath(`/${salonId}/commissions/settings`)
}

/**
 * Profissionais cujo extrato o usuário pode ver: todos, com `commissions.view_all`;
 * senão, só os vínculos de profissional do próprio usuário.
 */
async function visibleProfessionals(salonId: string, userId: string) {
  const [permissions, allProfessionals] = await Promise.all([
    getSalonPermissions(salonId, userId),
    listCommissionProfessionalsService(salonId),
  ])

  const canViewAll = permissions.has("commissions.view_all")
  const visible = canViewAll
    ? allProfessionals
    : allProfessionals.filter((professional) => professional.userId === userId)

  return { permissions, canViewAll, visible }
}

// ============================================================================
// Extrato
// ============================================================================

/**
 * Extrato de comissões disponíveis no período. Sem `commissions.view_all`, só as
 * do próprio usuário — o filtro de profissional que chega do cliente não amplia
 * isso.
 */
export async function getCommissionStatement(
  salonId: string,
  filters: CommissionStatementFilters = {}
): Promise<CommissionStatementDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "commissions.access")
  if ("error" in auth) return auth

  const parsed = commissionStatementFiltersSchema.safeParse(filters)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  try {
    // Sem período válido, o mês corrente em Brasília.
    const currentMonth = monthRange(brazilToday(new Date()).slice(0, 7))
    let from = parsed.data.from ?? currentMonth?.from ?? brazilToday(new Date())
    let to = parsed.data.to ?? currentMonth?.to ?? from
    if (from > to) [from, to] = [to, from]

    const { permissions, canViewAll, visible } = await visibleProfessionals(salonId, auth.userId)
    const visibleIds = new Set(visible.map((professional) => professional.id))

    // Profissional pedido que a pessoa não pode ver é ignorado, não um erro: o
    // extrato cai para tudo o que ela pode ver.
    const requested =
      parsed.data.professionalId && visibleIds.has(parsed.data.professionalId) ? parsed.data.professionalId : null

    const statement = await listCommissionEntriesService({
      salonId,
      from,
      to,
      professionalIds: requested ? [requested] : canViewAll ? undefined : Array.from(visibleIds),
      limit: STATEMENT_ROWS,
    })

    return {
      from,
      to,
      professionalId: requested,
      rows: statement.rows,
      truncated: statement.truncated,
      byProfessional: statement.byProfessional,
      totals: {
        ...commissionTotals(
          statement.byProfessional.map((row) => ({
            baseAmount: centsToNumeric(row.baseCents),
            grossAmount: centsToNumeric(row.grossCents),
            feeAmount: centsToNumeric(row.feeCents),
            assistantDeduction: centsToNumeric(row.assistantCents),
            amount: centsToNumeric(row.amountCents),
          }))
        ),
        // `commissionTotals` conta linhas — aqui, profissionais. O número de itens
        // é a soma dos itens que cada um executou.
        count: statement.byProfessional.reduce((sum, row) => sum + row.count, 0),
      },
      pending: statement.pending,
      adjustments: statement.adjustments,
      adjustmentsTruncated: statement.adjustmentsTruncated,
      advanceCents: statement.byProfessional.reduce((sum, row) => sum + row.advanceCents, 0),
      bonusCents: statement.byProfessional.reduce((sum, row) => sum + row.bonusCents, 0),
      netCents: statement.byProfessional.reduce((sum, row) => sum + row.netCents, 0),
      professionals: visible.map((professional) => ({ id: professional.id, name: professional.name })),
      today: brazilToday(new Date()),
      canViewAll,
      canConfigure: permissions.has("commissions.configure"),
      canAdjust: permissions.has("commissions.adjust"),
    }
  } catch (error) {
    console.error("Erro ao carregar o extrato de comissões:", error)
    return { error: "Não foi possível carregar as comissões" }
  }
}

// ============================================================================
// Vales e bonificações
// ============================================================================

/**
 * Lança um vale (abate) ou uma bonificação (soma) no extrato de um profissional.
 * Sem `commissions.view_all`, só para os vínculos da própria pessoa — a permissão
 * de lançar não amplia o que ela enxerga.
 */
export async function createCommissionAdjustment(
  input: CreateCommissionAdjustmentInput
): Promise<ActionResult<{ adjustmentId: string }>> {
  const auth = await authorizeSalon(input?.salonId, "commissions.adjust")
  if ("error" in auth) return auth

  const parsed = createCommissionAdjustmentSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, professionalId, ...draft } = parsed.data

  const { visible } = await visibleProfessionals(salonId, auth.userId)
  if (!visible.some((professional) => professional.id === professionalId)) {
    return { error: "Profissional não encontrado" }
  }

  const result = await createCommissionAdjustmentService({ salonId, userId: auth.userId, professionalId, draft })
  if (!result.success) return { error: result.error }

  revalidateCommissions(salonId)
  return { success: true, data: result.data }
}

/** Exclui um vale ou uma bonificação. Corrigir é excluir e lançar de novo. */
export async function deleteCommissionAdjustment(input: {
  salonId: string
  adjustmentId: string
}): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "commissions.adjust")
  if ("error" in auth) return auth

  const parsed = deleteCommissionAdjustmentSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, adjustmentId } = parsed.data

  const { canViewAll, visible } = await visibleProfessionals(salonId, auth.userId)
  const result = await deleteCommissionAdjustmentService({
    salonId,
    adjustmentId,
    professionalIds: canViewAll ? undefined : visible.map((professional) => professional.id),
  })
  if (!result.success) return { error: result.error }

  revalidateCommissions(salonId)
  return { success: true }
}

// ============================================================================
// Configuração
// ============================================================================

/** Regras do salão, exceções por profissional e comissões por item. */
export async function getCommissionConfig(salonId: string): Promise<CommissionConfigDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "commissions.configure")
  if ("error" in auth) return auth

  try {
    return await getCommissionConfigService(salonId)
  } catch (error) {
    console.error("Erro ao carregar a configuração de comissões:", error)
    return { error: "Não foi possível carregar a configuração de comissões" }
  }
}

/** Grava as regras gerais do salão, ou a exceção de um profissional. */
export async function saveCommissionSettings(input: SaveCommissionSettingsInput): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "commissions.configure")
  if ("error" in auth) return auth

  const parsed = saveCommissionSettingsSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, professionalId, ...settings } = parsed.data
  const result = await saveCommissionSettingsService({ salonId, professionalId, settings })
  if (!result.success) return { error: result.error }

  revalidateCommissions(salonId)
  return { success: true }
}

/** Troca as comissões por item do salão, ou as exceções de um profissional. */
export async function saveCommissionRules(input: SaveCommissionRulesInput): Promise<ActionResult<{ rules: number }>> {
  const auth = await authorizeSalon(input?.salonId, "commissions.configure")
  if ("error" in auth) return auth

  const parsed = saveCommissionRulesSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await saveCommissionRulesService(parsed.data)
  if (!result.success) return { error: result.error }

  revalidateCommissions(parsed.data.salonId)
  return { success: true, data: result.data }
}

/** Troca as comissões de auxiliar do salão, ou as de um profissional quando ele auxilia. */
export async function saveCommissionAssistantRules(
  input: SaveCommissionAssistantRulesInput
): Promise<ActionResult<{ rules: number }>> {
  const auth = await authorizeSalon(input?.salonId, "commissions.configure")
  if ("error" in auth) return auth

  const parsed = saveCommissionAssistantRulesSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await saveCommissionAssistantRulesService(parsed.data)
  if (!result.success) return { error: result.error }

  revalidateCommissions(parsed.data.salonId)
  return { success: true, data: result.data }
}

/**
 * Recalcula as comissões das comandas faturadas do período com as regras de agora.
 * Regra nova não muda o que já foi calculado — este é o caminho explícito.
 */
export async function recalculateCommissions(
  input: RecalculateCommissionsInput
): Promise<ActionResult<{ sales: number }>> {
  const auth = await authorizeSalon(input?.salonId, "commissions.configure")
  if ("error" in auth) return auth

  const parsed = recalculateCommissionsSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, from, to } = parsed.data
  if (from > to) return { error: "A data inicial é depois da final" }

  // O período é pelo DIA DE BRASÍLIA (UTC−3, sem horário de verão desde 2019).
  const start = new Date(`${from}T00:00:00-03:00`)
  const end = new Date(`${to}T23:59:59.999-03:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { error: "Data inválida" }
  if (end.getTime() - start.getTime() > MAX_RECALCULATE_DAYS * 86_400_000) {
    return { error: "Recalcule no máximo um ano por vez" }
  }

  const result = await recalculateCommissionsService({ salonId, from: start, to: end })
  if (!result.success) return { error: result.error }

  revalidateCommissions(salonId)
  return { success: true, data: result.data }
}
