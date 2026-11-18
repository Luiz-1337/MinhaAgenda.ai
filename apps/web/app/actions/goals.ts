"use server"

import { revalidatePath } from "next/cache"
import {
  brazilToday,
  copyGoalsService,
  currentGoalMonth,
  getGoalBoardService,
  isGoalMonth,
  saveGoalTargetsService,
  shiftGoalMonth,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import { copyGoalsSchema, saveGoalTargetsSchema } from "@/lib/schemas/goals.schema"
import type { ActionResult } from "@/lib/types/common"
import type { CopyGoalsInput, GoalsDTO, SaveGoalTargetsInput } from "@/lib/types/goals"

/**
 * Metas por mês (docs/ROADMAP.md, fase 6, fatia 6e).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `goals` ligado no salão
 * → permissão `goals.*`. O `salonId` chega do cliente, então estar logado não
 * basta (ver __tests__/lib/actions-authz.test.ts).
 */

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "goals"))) {
    return { error: "Metas não estão disponíveis neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

/** O quadro de metas de um mês ("YYYY-MM"; sem mês, o corrente). */
export async function getGoals(salonId: string, month?: string): Promise<GoalsDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "goals.access")
  if ("error" in auth) return auth

  const now = new Date()
  const currentMonth = currentGoalMonth(now)
  const wanted = month || currentMonth
  if (!isGoalMonth(wanted)) return { error: "Mês inválido" }

  try {
    const [board, permissions] = await Promise.all([
      getGoalBoardService({ salonId, month: wanted, today: brazilToday(now) }),
      getSalonPermissions(salonId, auth.userId),
    ])

    return {
      month: board.month,
      previousMonth: shiftGoalMonth(board.month, -1),
      nextMonth: shiftGoalMonth(board.month, 1),
      currentMonth,
      rows: board.rows,
      hasGoals: board.hasGoals,
      can: { manage: permissions.has("goals.manage") },
    }
  } catch (error) {
    console.error("Erro ao carregar as metas:", error)
    return { error: "Não foi possível carregar as metas" }
  }
}

/** Define as metas do salão ou de um profissional num mês. */
export async function saveGoalTargets(input: SaveGoalTargetsInput): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "goals.manage")
  if ("error" in auth) return auth

  const parsed = saveGoalTargetsSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, month, professionalId, targets } = parsed.data
  const result = await saveGoalTargetsService({ salonId, month, professionalId, draft: targets })
  if (!result.success) return { error: result.error }

  revalidatePath(`/${salonId}/goals`)
  return { success: true, data: undefined }
}

/** Copia as metas de um mês para outro, sem passar por cima do que já existe. */
export async function copyGoals(input: CopyGoalsInput): Promise<ActionResult<{ copied: number; skipped: number }>> {
  const auth = await authorizeSalon(input?.salonId, "goals.manage")
  if ("error" in auth) return auth

  const parsed = copyGoalsSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await copyGoalsService(parsed.data)
  if (!result.success) return { error: result.error }

  revalidatePath(`/${parsed.data.salonId}/goals`)
  return { success: true, data: result.data }
}
