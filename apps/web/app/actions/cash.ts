"use server"

import { revalidatePath } from "next/cache"
import {
  addCashMovementService,
  closeCashSessionService,
  getOpenCashSessionService,
  listClosedCashSessionsService,
  openCashSessionService,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import { cashMovementSchema, closeCashSchema, openCashSchema } from "@/lib/schemas/cash.schema"
import type { ActionResult } from "@/lib/types/common"
import type { CashMovementInput, CashOverview, CloseCashInput, OpenCashInput } from "@/lib/types/cash"

/**
 * Caixa (docs/ROADMAP.md, fase 2, fatia 2e).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `finance` ligado no salão
 * → permissão `cash.*`. O `salonId` chega do cliente, então estar logado não basta
 * (ver __tests__/lib/actions-authz.test.ts).
 *
 * A regra não mora aqui: `@repo/db` (domain/cash.ts decide, services/cash.service.ts
 * grava).
 */

const HISTORY_SIZE = 30

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "finance"))) {
    return { error: "O caixa não está disponível neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

function revalidateCash(salonId: string) {
  revalidatePath(`/${salonId}/finance/cash`)
}

/** O caixa aberto (se houver) com seus movimentos, e o histórico de fechados. */
export async function getCashOverview(salonId: string): Promise<CashOverview | { error: string }> {
  const auth = await authorizeSalon(salonId, "cash.access")
  if ("error" in auth) return auth

  try {
    const permissions = await getSalonPermissions(salonId, auth.userId)

    const [open, history] = await Promise.all([
      getOpenCashSessionService(salonId),
      listClosedCashSessionsService({
        salonId,
        // Sem `view_all`, só o histórico dos caixas que a própria pessoa abriu.
        openedBy: permissions.has("cash.view_all") ? undefined : auth.userId,
        limit: HISTORY_SIZE,
        offset: 0,
      }),
    ])

    return {
      open: open
        ? {
            id: open.id,
            openedAt: open.openedAt.toISOString(),
            openedByName: open.openedByName,
            notes: open.notes,
            openingCents: open.totals.openingCents,
            supplyCents: open.totals.supplyCents,
            saleCents: open.totals.saleCents,
            withdrawalCents: open.totals.withdrawalCents,
            expectedCents: open.expectedCents,
            movements: open.movements.map((movement) => ({
              ...movement,
              createdAt: movement.createdAt.toISOString(),
            })),
          }
        : null,
      history: history.rows.map((row) => ({
        ...row,
        openedAt: row.openedAt.toISOString(),
        closedAt: row.closedAt ? row.closedAt.toISOString() : null,
      })),
      historyTotal: history.total,
      canOperate: permissions.has("cash.operate"),
    }
  } catch (error) {
    console.error("Erro ao carregar o caixa:", error)
    return { error: "Não foi possível carregar o caixa" }
  }
}

/** Abre o caixa com o troco que já está na gaveta. Só um caixa aberto por salão. */
export async function openCashSession(input: OpenCashInput): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "cash.operate")
  if ("error" in auth) return auth

  const parsed = openCashSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await openCashSessionService({ ...parsed.data, userId: auth.userId })
  if (!result.success) return { error: result.error }

  revalidateCash(parsed.data.salonId)
  return { success: true }
}

/** Suprimento (entra dinheiro) ou sangria (sai dinheiro) no caixa aberto. */
export async function addCashMovement(input: CashMovementInput): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "cash.operate")
  if ("error" in auth) return auth

  const parsed = cashMovementSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await addCashMovementService({ ...parsed.data, userId: auth.userId })
  if (!result.success) return { error: result.error }

  revalidateCash(parsed.data.salonId)
  return { success: true }
}

/** Fecha o caixa: grava o esperado, o contado e a diferença. */
export async function closeCashSession(input: CloseCashInput): Promise<ActionResult<{ difference: string }>> {
  const auth = await authorizeSalon(input?.salonId, "cash.operate")
  if ("error" in auth) return auth

  const parsed = closeCashSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await closeCashSessionService({ ...parsed.data, userId: auth.userId })
  if (!result.success) return { error: result.error }

  revalidateCash(parsed.data.salonId)
  return { success: true, data: result.data }
}
