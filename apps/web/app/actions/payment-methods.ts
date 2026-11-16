"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db, paymentMethods, and, asc, eq, type PermissionKey } from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import { savePaymentMethodSchema } from "@/lib/schemas/sales.schema"
import type { ActionResult } from "@/lib/types/common"
import type { PaymentMethodDTO, SavePaymentMethodInput } from "@/lib/types/sale"

/**
 * Formas de pagamento do salão (docs/ROADMAP.md, fase 1).
 *
 * Taxa e prazo de recebimento são COPIADOS para o pagamento no faturamento da
 * comanda — alterar uma forma aqui vale para as próximas vendas, não reescreve as
 * que já foram faturadas.
 *
 * Mesmo gate das comandas: sessão → módulo `sales` → permissão.
 */

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "sales"))) {
    return { error: "Comandas não estão disponíveis neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined
  const direct = (error as { code?: string }).code
  const cause = (error as { cause?: { code?: string } }).cause?.code
  return direct ?? cause
}

/** Todas as formas do salão, ativas e inativas — a tela de configuração. */
export async function listPaymentMethods(salonId: string): Promise<PaymentMethodDTO[] | { error: string }> {
  const auth = await authorizeSalon(salonId, "payment_methods.access")
  if ("error" in auth) return auth

  try {
    return await db
      .select({
        id: paymentMethods.id,
        name: paymentMethods.name,
        kind: paymentMethods.kind,
        feePercent: paymentMethods.feePercent,
        settlementDays: paymentMethods.settlementDays,
        isActive: paymentMethods.isActive,
      })
      .from(paymentMethods)
      .where(eq(paymentMethods.salonId, salonId))
      .orderBy(asc(paymentMethods.name))
  } catch (error) {
    console.error("Erro ao listar formas de pagamento:", error)
    return { error: "Não foi possível carregar as formas de pagamento" }
  }
}

export async function savePaymentMethod(input: SavePaymentMethodInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeSalon(input?.salonId, "payment_methods.manage")
  if ("error" in auth) return auth

  const parsed = savePaymentMethodSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, id, name, kind, feePercent, settlementDays, isActive } = parsed.data
  const values = {
    name,
    kind,
    feePercent: feePercent.toFixed(2),
    settlementDays,
    isActive,
  }

  try {
    if (id) {
      const [updated] = await db
        .update(paymentMethods)
        .set({ ...values, updatedAt: new Date() })
        // salon_id no WHERE: o id chega do cliente e não pode alcançar outro salão.
        .where(and(eq(paymentMethods.id, id), eq(paymentMethods.salonId, salonId)))
        .returning({ id: paymentMethods.id })

      if (!updated) return { error: "Forma de pagamento não encontrada" }

      revalidatePath(`/${salonId}/salon-settings/payment-methods`)
      return { success: true, data: { id: updated.id } }
    }

    const [created] = await db
      .insert(paymentMethods)
      .values({ salonId, ...values })
      .returning({ id: paymentMethods.id })

    revalidatePath(`/${salonId}/salon-settings/payment-methods`)
    return { success: true, data: { id: created.id } }
  } catch (error) {
    if (pgCode(error) === "23505") return { error: "Já existe uma forma de pagamento com este nome" }
    console.error("Erro ao salvar forma de pagamento:", error)
    return { error: "Não foi possível salvar a forma de pagamento" }
  }
}

/**
 * Exclui uma forma de pagamento que NUNCA foi usada. Com venda registrada o banco
 * recusa (FK de sale_payments) — o caminho é desativar, que tira a forma do
 * faturamento e preserva o histórico.
 */
export async function deletePaymentMethod(salonId: string, id: string): Promise<ActionResult> {
  const auth = await authorizeSalon(salonId, "payment_methods.manage")
  if ("error" in auth) return auth

  if (!z.string().uuid().safeParse(id).success) return { error: "Forma de pagamento inválida" }

  try {
    const deleted = await db
      .delete(paymentMethods)
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.salonId, salonId)))
      .returning({ id: paymentMethods.id })

    if (deleted.length === 0) return { error: "Forma de pagamento não encontrada" }

    revalidatePath(`/${salonId}/salon-settings/payment-methods`)
    return { success: true }
  } catch (error) {
    if (pgCode(error) === "23503") {
      return { error: "Esta forma de pagamento já foi usada em comandas. Desative em vez de excluir" }
    }
    console.error("Erro ao excluir forma de pagamento:", error)
    return { error: "Não foi possível excluir a forma de pagamento" }
  }
}
