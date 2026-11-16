"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  db,
  financialCategories,
  and,
  asc,
  eq,
  createManualTransactionService,
  createTransferService,
  deleteTransactionService,
  listAccountsWithBalanceService,
  listTransactionsService,
  settleTransactionService,
  unsettleTransactionService,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import {
  createFinanceTransactionSchema,
  createFinanceTransferSchema,
  financeListFiltersSchema,
  settleFinanceTransactionSchema,
} from "@/lib/schemas/finance.schema"
import type { ActionResult } from "@/lib/types/common"
import type {
  CreateFinanceTransactionInput,
  CreateFinanceTransferInput,
  FinanceFormOptions,
  FinanceListFilters,
  FinanceListPage,
  SettleFinanceTransactionInput,
} from "@/lib/types/finance"

/**
 * Financeiro — transações (docs/ROADMAP.md, fase 2).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `finance` ligado no salão
 * → permissão. O `salonId` chega do cliente, então estar logado não basta (ver
 * __tests__/lib/actions-authz.test.ts).
 *
 * A regra não mora aqui: `@repo/db` (domain/finance.ts decide,
 * services/finance.service.ts grava).
 */

const PAGE_SIZE = 40

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "finance"))) {
    return { error: "O financeiro não está disponível neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

function revalidateFinance(salonId: string) {
  revalidatePath(`/${salonId}/finance`)
  revalidatePath(`/${salonId}/finance/settings`)
}

// ============================================================================
// Leitura
// ============================================================================

export async function listFinanceTransactions(
  salonId: string,
  filters: FinanceListFilters = {}
): Promise<FinanceListPage | { error: string }> {
  const auth = await authorizeSalon(salonId, "finance.access")
  if ("error" in auth) return auth

  const parsed = financeListFiltersSchema.safeParse(filters)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  try {
    const page = parsed.data.page ?? 1
    const result = await listTransactionsService({
      salonId,
      direction: parsed.data.direction,
      status: parsed.data.status,
      from: parsed.data.from,
      to: parsed.data.to,
      accountId: parsed.data.accountId,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    })

    return {
      rows: result.rows.map((row) => ({ ...row, paidAt: row.paidAt ? row.paidAt.toISOString() : null })),
      total: result.total,
      totals: result.totals,
      page,
      pageSize: PAGE_SIZE,
    }
  } catch (error) {
    console.error("Erro ao listar transações:", error)
    return { error: "Não foi possível carregar as transações" }
  }
}

/** Contas (com saldo) e categorias ativas, para os formulários e os filtros. */
export async function getFinanceFormOptions(salonId: string): Promise<FinanceFormOptions | { error: string }> {
  const auth = await authorizeSalon(salonId, "finance.access")
  if ("error" in auth) return auth

  try {
    const [accounts, categories, permissions] = await Promise.all([
      listAccountsWithBalanceService(salonId),
      db
        .select({
          id: financialCategories.id,
          name: financialCategories.name,
          kind: financialCategories.kind,
          isActive: financialCategories.isActive,
        })
        .from(financialCategories)
        .where(and(eq(financialCategories.salonId, salonId), eq(financialCategories.isActive, true)))
        .orderBy(asc(financialCategories.name)),
      getSalonPermissions(salonId, auth.userId),
    ])

    return {
      accounts,
      categories,
      can: {
        create: permissions.has("finance.create"),
        delete: permissions.has("finance.delete"),
        settle: permissions.has("finance.settle"),
        settings: permissions.has("finance.settings"),
      },
    }
  } catch (error) {
    console.error("Erro ao carregar opções do financeiro:", error)
    return { error: "Não foi possível carregar os dados do financeiro" }
  }
}

// ============================================================================
// Mutações
// ============================================================================

/** Novo recebimento (`in`) ou nova despesa (`out`). */
export async function createFinanceTransaction(
  input: CreateFinanceTransactionInput
): Promise<ActionResult<{ transactionId: string }>> {
  const auth = await authorizeSalon(input?.salonId, "finance.create")
  if ("error" in auth) return auth

  const parsed = createFinanceTransactionSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, ...draft } = parsed.data
  const result = await createManualTransactionService({ salonId, userId: auth.userId, draft })
  if (!result.success) return { error: result.error }

  revalidateFinance(salonId)
  return { success: true, data: result.data }
}

/** Transferência entre duas contas do salão. */
export async function createFinanceTransfer(input: CreateFinanceTransferInput): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "finance.create")
  if ("error" in auth) return auth

  const parsed = createFinanceTransferSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, ...draft } = parsed.data
  const result = await createTransferService({ salonId, userId: auth.userId, draft })
  if (!result.success) return { error: result.error }

  revalidateFinance(salonId)
  return { success: true }
}

/** Dá baixa: o lançamento aberto passa a recebido/pago, numa conta e num dia. */
export async function settleFinanceTransaction(input: SettleFinanceTransactionInput): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "finance.settle")
  if ("error" in auth) return auth

  const parsed = settleFinanceTransactionSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await settleTransactionService(parsed.data)
  if (!result.success) return { error: result.error }

  revalidateFinance(parsed.data.salonId)
  return { success: true }
}

/** Estorna a baixa: o lançamento volta a "a receber / a pagar". */
export async function unsettleFinanceTransaction(salonId: string, transactionId: string): Promise<ActionResult> {
  const auth = await authorizeSalon(salonId, "finance.settle")
  if ("error" in auth) return auth

  if (!z.string().uuid().safeParse(transactionId).success) return { error: "Lançamento inválido" }

  const result = await unsettleTransactionService({ salonId, transactionId })
  if (!result.success) return { error: result.error }

  revalidateFinance(salonId)
  return { success: true }
}

/** Exclui um lançamento manual aberto, ou uma transferência (as duas pernas). */
export async function deleteFinanceTransaction(salonId: string, transactionId: string): Promise<ActionResult> {
  const auth = await authorizeSalon(salonId, "finance.delete")
  if ("error" in auth) return auth

  if (!z.string().uuid().safeParse(transactionId).success) return { error: "Lançamento inválido" }

  const result = await deleteTransactionService({ salonId, transactionId })
  if (!result.success) return { error: result.error }

  revalidateFinance(salonId)
  return { success: true }
}
