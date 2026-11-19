"use server"

import { revalidatePath } from "next/cache"
import {
  db,
  customers,
  and,
  asc,
  eq,
  ilike,
  or,
  createCustomerSubscriptionService,
  createSaleService,
  deleteCustomerSubscriptionService,
  deleteSubscriptionPlanService,
  getSubscriptionForRenewalService,
  getSubscriptionReminderSettingsService,
  saveSubscriptionReminderSettingsService,
  DEFAULT_SUBSCRIPTION_DUE_TEXT,
  SUBSCRIPTION_REMINDER_DAYS,
  listCustomerSubscriptionsService,
  listSubscriptionPlansService,
  saveSubscriptionPlanService,
  setCustomerSubscriptionActiveService,
  subscriptionDueAlert,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import {
  createCustomerSubscriptionSchema,
  customerSubscriptionRefSchema,
  saveSubscriptionPlanSchema,
  saveSubscriptionReminderSchema,
  setCustomerSubscriptionActiveSchema,
  subscriptionPlanRefSchema,
} from "@/lib/schemas/subscriptions.schema"
import type { ActionResult } from "@/lib/types/common"
import type {
  CustomerSubscriptionsDTO,
  SaveSubscriptionPlanInput,
  SaveSubscriptionReminderInput,
  SubscriptionCustomerOption,
  SubscriptionPlansDTO,
} from "@/lib/types/subscriptions"

/**
 * Assinaturas de cliente (docs/ROADMAP.md, fase 5, fatia 5c).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `packages` ligado no
 * salão (assinaturas andam com ele) → permissão. O `salonId` chega do cliente,
 * então estar logado não basta (ver __tests__/lib/actions-authz.test.ts).
 *
 * COBRAR a assinatura é um item da comanda: "Renovar" só abre a comanda com o
 * item; quem fatura é actions/sales.ts.
 */

/** Assinaturas mostradas na tela. */
const SUBSCRIPTION_ROWS = 300

const UUID = /^[0-9a-f-]{36}$/i

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "packages"))) {
    return { error: "Assinaturas não estão disponíveis neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

function revalidateSubscriptions(salonId: string) {
  revalidatePath(`/${salonId}/packages/subscriptions`)
  revalidatePath(`/${salonId}/packages/subscription-plans`)
}

// ============================================================================
// Planos
// ============================================================================

export async function getSubscriptionPlans(salonId: string): Promise<SubscriptionPlansDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "packages.access")
  if ("error" in auth) return auth

  try {
    const [plans, permissions] = await Promise.all([
      listSubscriptionPlansService(salonId),
      getSalonPermissions(salonId, auth.userId),
    ])
    return { plans, can: { manage: permissions.has("packages.manage") } }
  } catch (error) {
    console.error("Erro ao carregar os planos de assinatura:", error)
    return { error: "Não foi possível carregar os planos de assinatura" }
  }
}

/** Cria (sem `planId`) ou altera um plano de assinatura. */
export async function saveSubscriptionPlan(
  input: SaveSubscriptionPlanInput
): Promise<ActionResult<{ planId: string }>> {
  const auth = await authorizeSalon(input?.salonId, "packages.manage")
  if ("error" in auth) return auth

  const parsed = saveSubscriptionPlanSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, planId, ...draft } = parsed.data
  const result = await saveSubscriptionPlanService({ salonId, planId: planId ?? null, draft })
  if (!result.success) return { error: result.error }

  revalidateSubscriptions(salonId)
  return { success: true, data: result.data }
}

/** Exclui um plano que nunca teve assinatura. */
export async function deleteSubscriptionPlan(input: { salonId: string; planId: string }): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "packages.manage")
  if ("error" in auth) return auth

  const parsed = subscriptionPlanRefSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await deleteSubscriptionPlanService(parsed.data)
  if (!result.success) return { error: result.error }

  revalidateSubscriptions(parsed.data.salonId)
  return { success: true, data: undefined }
}

// ============================================================================
// Assinaturas
// ============================================================================

/** As assinaturas do salão, com a situação de cada uma. `customerId` filtra por cliente. */
export async function getCustomerSubscriptions(
  salonId: string,
  customerId?: string
): Promise<CustomerSubscriptionsDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "packages.access")
  if ("error" in auth) return auth

  if (customerId !== undefined && !UUID.test(customerId)) return { error: "Cliente inválido" }

  try {
    const [list, plans, permissions, salesEnabled, reminder] = await Promise.all([
      listCustomerSubscriptionsService({ salonId, customerId, limit: SUBSCRIPTION_ROWS, now: new Date() }),
      listSubscriptionPlansService(salonId),
      getSalonPermissions(salonId, auth.userId),
      salonHasModule(salonId, "sales"),
      getSubscriptionReminderSettingsService(salonId),
    ])

    const totals = { pending: 0, active: 0, expired: 0, inactive: 0, dueSoon: 0 }
    for (const row of list.rows) {
      totals[row.status] += 1
      if (subscriptionDueAlert(row.dueInDays) === "due_soon") totals.dueSoon += 1
    }

    return {
      subscriptions: list.rows,
      truncated: list.truncated,
      totals,
      plans: plans
        .filter((plan) => plan.isActive)
        .map((plan) => ({ id: plan.id, name: plan.name, price: plan.price, intervalMonths: plan.intervalMonths })),
      reminder: {
        ...reminder,
        defaultMessage: DEFAULT_SUBSCRIPTION_DUE_TEXT,
        limits: { min: SUBSCRIPTION_REMINDER_DAYS.min, max: SUBSCRIPTION_REMINDER_DAYS.max },
      },
      can: {
        manage: permissions.has("packages.manage"),
        charge: salesEnabled && permissions.has("sales.create"),
      },
    }
  } catch (error) {
    console.error("Erro ao carregar as assinaturas:", error)
    return { error: "Não foi possível carregar as assinaturas" }
  }
}

/**
 * Liga, desliga e ajusta o aviso de vencimento por WhatsApp (fase 8, fatia 8d).
 * Quem manda é a fila de mensagens ao cliente; aqui só se grava a configuração.
 */
export async function saveSubscriptionReminder(input: SaveSubscriptionReminderInput): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "packages.manage")
  if ("error" in auth) return auth

  const parsed = saveSubscriptionReminderSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, ...draft } = parsed.data
  const result = await saveSubscriptionReminderSettingsService({ salonId, draft })
  if (!result.success) return { error: result.error }

  revalidateSubscriptions(salonId)
  return { success: true, data: undefined }
}

/** Busca de cliente para criar uma assinatura, por nome ou telefone. */
export async function searchSubscriptionCustomers(
  salonId: string,
  term: string
): Promise<SubscriptionCustomerOption[] | { error: string }> {
  const auth = await authorizeSalon(salonId, "packages.manage")
  if ("error" in auth) return auth

  const cleaned = (term ?? "").trim().slice(0, 80)
  if (cleaned.length < 2) return []

  try {
    // % e _ são curingas do LIKE: escapados para a busca ser literal.
    const pattern = `%${cleaned.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const digits = cleaned.replace(/\D/g, "")

    return await db
      .select({ id: customers.id, name: customers.name, phone: customers.phone })
      .from(customers)
      .where(
        and(
          eq(customers.salonId, salonId),
          eq(customers.isSystem, false),
          digits.length >= 3
            ? or(ilike(customers.name, pattern), ilike(customers.phone, `%${digits}%`))
            : ilike(customers.name, pattern)
        )
      )
      .orderBy(asc(customers.name))
      .limit(20)
  } catch (error) {
    console.error("Erro ao buscar clientes para a assinatura:", error)
    return { error: "Não foi possível buscar clientes" }
  }
}

/** Cria a assinatura de um cliente. Nasce pendente: a cobrança é em "Renovar". */
export async function createCustomerSubscription(input: {
  salonId: string
  customerId: string
  planId: string
}): Promise<ActionResult<{ subscriptionId: string }>> {
  const auth = await authorizeSalon(input?.salonId, "packages.manage")
  if ("error" in auth) return auth

  const parsed = createCustomerSubscriptionSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await createCustomerSubscriptionService({ ...parsed.data, now: new Date() })
  if (!result.success) return { error: result.error }

  revalidateSubscriptions(parsed.data.salonId)
  return { success: true, data: result.data }
}

/** Desativa ou reativa uma assinatura. */
export async function setCustomerSubscriptionActive(input: {
  salonId: string
  subscriptionId: string
  active: boolean
}): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "packages.manage")
  if ("error" in auth) return auth

  const parsed = setCustomerSubscriptionActiveSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await setCustomerSubscriptionActiveService({ ...parsed.data, now: new Date() })
  if (!result.success) return { error: result.error }

  revalidateSubscriptions(parsed.data.salonId)
  return { success: true, data: undefined }
}

/** Exclui uma assinatura que nunca foi cobrada. */
export async function deleteCustomerSubscription(input: {
  salonId: string
  subscriptionId: string
}): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "packages.manage")
  if ("error" in auth) return auth

  const parsed = customerSubscriptionRefSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await deleteCustomerSubscriptionService(parsed.data)
  if (!result.success) return { error: result.error }

  revalidateSubscriptions(parsed.data.salonId)
  return { success: true, data: undefined }
}

/**
 * Renovar (ou cobrar pela primeira vez): abre uma comanda do cliente com o item da
 * assinatura, no valor dela. Quem fatura a comanda paga o período.
 *
 * Se já existe uma comanda ABERTA com a cobrança, devolve essa — dois cliques em
 * "Renovar" não viram duas cobranças.
 *
 * Abre comanda: além de ver assinaturas, exige o módulo de comandas e
 * `sales.create`.
 */
export async function renewCustomerSubscription(input: {
  salonId: string
  subscriptionId: string
}): Promise<ActionResult<{ saleId: string; existing: boolean }>> {
  const auth = await authorizeSalon(input?.salonId, "packages.access")
  if ("error" in auth) return auth

  const parsed = customerSubscriptionRefSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }
  const { salonId, subscriptionId } = parsed.data

  if (!(await salonHasModule(salonId, "sales"))) return { error: "Comandas não estão disponíveis neste salão" }
  if (!(await can(salonId, auth.userId, "sales.create"))) {
    return { error: "Você não tem permissão para abrir comanda" }
  }

  try {
    const subscription = await getSubscriptionForRenewalService({ salonId, subscriptionId })
    if (!subscription) return { error: "Assinatura não encontrada" }
    if (subscription.deactivated) return { error: "Esta assinatura está desativada. Reative-a para cobrar" }
    if (subscription.openSale) {
      return { success: true, data: { saleId: subscription.openSale.saleId, existing: true } }
    }

    const result = await createSaleService({
      salonId,
      customerId: subscription.customerId,
      saleDate: new Date(),
      notes: null,
      items: [
        {
          kind: "subscription",
          customerSubscriptionId: subscriptionId,
          quantity: 1,
          unitPrice: Number(subscription.price),
          discountAmount: 0,
        },
      ],
      userId: auth.userId,
      packagesEnabled: true,
    })
    if (!result.success) return { error: result.error }

    revalidateSubscriptions(salonId)
    revalidatePath(`/${salonId}/sales`)
    return { success: true, data: { saleId: result.data.saleId, existing: false } }
  } catch (error) {
    console.error("Erro ao abrir a comanda da assinatura:", error)
    return { error: "Não foi possível abrir a comanda da assinatura" }
  }
}
