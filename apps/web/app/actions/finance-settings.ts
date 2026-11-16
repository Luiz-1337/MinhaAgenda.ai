"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  db,
  financialAccounts,
  financialCategories,
  financialTransactions,
  paymentMethods,
  and,
  asc,
  eq,
  sql,
  listAccountsWithBalanceService,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import { saveFinancialAccountSchema, saveFinancialCategorySchema } from "@/lib/schemas/finance.schema"
import type { ActionResult } from "@/lib/types/common"
import type {
  FinanceSettings,
  SaveFinancialAccountInput,
  SaveFinancialCategoryInput,
} from "@/lib/types/finance"

/**
 * Financeiro — cadastros: contas e plano de categorias (docs/ROADMAP.md, fase 2).
 *
 * Tudo aqui exige `finance.settings`. Mesmo gate das transações: sessão → módulo
 * `finance` → permissão.
 *
 * Conta e categoria com lançamento NÃO são excluídas — são desativadas. Excluir
 * deixaria o lançamento "sem conta" (a FK é SET NULL) e o saldo perderia o
 * histórico sem que ninguém tivesse pedido isso.
 */

async function authorizeSalon(salonId: string): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "finance"))) {
    return { error: "O financeiro não está disponível neste salão" }
  }
  if (!(await can(salonId, userId, "finance.settings"))) {
    return { error: "Você não tem permissão para gerenciar contas e categorias" }
  }
  return { userId }
}

function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined
  const direct = (error as { code?: string }).code
  const cause = (error as { cause?: { code?: string } }).cause?.code
  return direct ?? cause
}

function revalidate(salonId: string) {
  revalidatePath(`/${salonId}/finance`)
  revalidatePath(`/${salonId}/finance/settings`)
}

/** Todas as contas (com saldo) e categorias, ativas e inativas. */
export async function getFinanceSettings(salonId: string): Promise<FinanceSettings | { error: string }> {
  const auth = await authorizeSalon(salonId)
  if ("error" in auth) return auth

  try {
    const [accounts, categories] = await Promise.all([
      listAccountsWithBalanceService(salonId),
      db
        .select({
          id: financialCategories.id,
          name: financialCategories.name,
          kind: financialCategories.kind,
          isActive: financialCategories.isActive,
        })
        .from(financialCategories)
        .where(eq(financialCategories.salonId, salonId))
        .orderBy(asc(financialCategories.kind), asc(financialCategories.name)),
    ])

    return { accounts, categories }
  } catch (error) {
    console.error("Erro ao carregar cadastros do financeiro:", error)
    return { error: "Não foi possível carregar contas e categorias" }
  }
}

// ============================================================================
// Contas
// ============================================================================

export async function saveFinancialAccount(input: SaveFinancialAccountInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeSalon(input?.salonId)
  if ("error" in auth) return auth

  const parsed = saveFinancialAccountSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, id, name, kind, openingBalance, isActive } = parsed.data
  const values = { name, kind, openingBalance: openingBalance.toFixed(2), isActive }

  try {
    if (id) {
      const [updated] = await db
        .update(financialAccounts)
        .set({ ...values, updatedAt: new Date() })
        // salon_id no WHERE: o id chega do cliente e não pode alcançar outro salão.
        .where(and(eq(financialAccounts.id, id), eq(financialAccounts.salonId, salonId)))
        .returning({ id: financialAccounts.id })

      if (!updated) return { error: "Conta não encontrada" }

      revalidate(salonId)
      return { success: true, data: { id: updated.id } }
    }

    const [created] = await db
      .insert(financialAccounts)
      .values({ salonId, ...values })
      .returning({ id: financialAccounts.id })

    revalidate(salonId)
    return { success: true, data: { id: created.id } }
  } catch (error) {
    if (pgCode(error) === "23505") return { error: "Já existe uma conta com este nome" }
    console.error("Erro ao salvar conta:", error)
    return { error: "Não foi possível salvar a conta" }
  }
}

/** Exclui uma conta que nunca foi usada. Com lançamento ou forma de pagamento, desative. */
export async function deleteFinancialAccount(salonId: string, accountId: string): Promise<ActionResult> {
  const auth = await authorizeSalon(salonId)
  if ("error" in auth) return auth

  if (!z.string().uuid().safeParse(accountId).success) return { error: "Conta inválida" }

  try {
    const [[usage], [methods]] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(financialTransactions)
        .where(and(eq(financialTransactions.salonId, salonId), eq(financialTransactions.accountId, accountId))),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(paymentMethods)
        .where(and(eq(paymentMethods.salonId, salonId), eq(paymentMethods.accountId, accountId))),
    ])

    if (usage.n > 0) return { error: "Esta conta tem lançamentos. Desative em vez de excluir" }
    if (methods.n > 0) {
      return { error: "Esta conta é o destino de uma forma de pagamento. Troque o destino ou desative a conta" }
    }

    const deleted = await db
      .delete(financialAccounts)
      .where(and(eq(financialAccounts.id, accountId), eq(financialAccounts.salonId, salonId)))
      .returning({ id: financialAccounts.id })

    if (deleted.length === 0) return { error: "Conta não encontrada" }

    revalidate(salonId)
    return { success: true }
  } catch (error) {
    console.error("Erro ao excluir conta:", error)
    return { error: "Não foi possível excluir a conta" }
  }
}

// ============================================================================
// Categorias
// ============================================================================

export async function saveFinancialCategory(
  input: SaveFinancialCategoryInput
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeSalon(input?.salonId)
  if ("error" in auth) return auth

  const parsed = saveFinancialCategorySchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, id, name, kind, isActive } = parsed.data

  try {
    if (id) {
      // O tipo (receita/despesa) NÃO muda na edição: os lançamentos já feitos com a
      // categoria passariam a ter uma categoria do tipo errado.
      const [updated] = await db
        .update(financialCategories)
        .set({ name, isActive, updatedAt: new Date() })
        .where(and(eq(financialCategories.id, id), eq(financialCategories.salonId, salonId)))
        .returning({ id: financialCategories.id })

      if (!updated) return { error: "Categoria não encontrada" }

      revalidate(salonId)
      return { success: true, data: { id: updated.id } }
    }

    const [created] = await db
      .insert(financialCategories)
      .values({ salonId, name, kind, isActive })
      .returning({ id: financialCategories.id })

    revalidate(salonId)
    return { success: true, data: { id: created.id } }
  } catch (error) {
    if (pgCode(error) === "23505") return { error: "Já existe uma categoria com este nome" }
    console.error("Erro ao salvar categoria:", error)
    return { error: "Não foi possível salvar a categoria" }
  }
}

/** Exclui uma categoria que nunca foi usada. Com lançamento, desative. */
export async function deleteFinancialCategory(salonId: string, categoryId: string): Promise<ActionResult> {
  const auth = await authorizeSalon(salonId)
  if ("error" in auth) return auth

  if (!z.string().uuid().safeParse(categoryId).success) return { error: "Categoria inválida" }

  try {
    const [usage] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(financialTransactions)
      .where(and(eq(financialTransactions.salonId, salonId), eq(financialTransactions.categoryId, categoryId)))

    if (usage.n > 0) return { error: "Esta categoria tem lançamentos. Desative em vez de excluir" }

    const deleted = await db
      .delete(financialCategories)
      .where(and(eq(financialCategories.id, categoryId), eq(financialCategories.salonId, salonId)))
      .returning({ id: financialCategories.id })

    if (deleted.length === 0) return { error: "Categoria não encontrada" }

    revalidate(salonId)
    return { success: true }
  } catch (error) {
    console.error("Erro ao excluir categoria:", error)
    return { error: "Não foi possível excluir a categoria" }
  }
}
