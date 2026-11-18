/**
 * Assinaturas de cliente — regra pura, sem I/O (docs/ROADMAP.md, fase 5, fatia 5c).
 *
 * Um plano é um modelo: nome, valor e de quanto em quanto tempo se cobra. A
 * assinatura é o plano de UM cliente, com a cópia do plano daquele dia. Renovar é
 * cobrar: um item de assinatura numa comanda; quando a comanda é faturada, nasce
 * um PERÍODO pago, e a assinatura fica ativa até o vencimento dele.
 *
 * Não há coluna de situação: ela sai dos períodos. Reabrir a comanda apaga o
 * período e a situação volta sozinha.
 *
 * Mesmo desenho dos outros módulos: o serviço busca os dados, estas funções
 * decidem, o serviço grava. Dinheiro em centavos inteiros.
 */
import { addMonthsToDate, brazilToday } from './finance'
import { centsToNumeric, toCents } from './sales'

// ============================================================================
// Plano
// ============================================================================

export const MAX_SUBSCRIPTION_INTERVAL_MONTHS = 36
const MAX_SUBSCRIPTION_PRICE_CENTS = 100_000_000 // R$ 1.000.000,00
const MAX_NAME_LENGTH = 120
const MAX_DESCRIPTION_LENGTH = 500

export type SubscriptionPlanDraft = {
  name: string
  description?: string | null
  price: number
  /** De quanto em quanto tempo se cobra, em meses (1 = mensal). */
  intervalMonths: number
  isActive: boolean
  /** Aparece na página pública de planos (fase 8). */
  isVisible: boolean
}

export type SubscriptionPlanPlan =
  | {
      ok: true
      plan: {
        name: string
        description: string | null
        price: string
        intervalMonths: number
        isActive: boolean
        isVisible: boolean
      }
    }
  | { ok: false; error: string }

export function planSubscriptionPlan(draft: SubscriptionPlanDraft): SubscriptionPlanPlan {
  const name = (draft.name ?? '').trim()
  if (!name) return { ok: false, error: 'Informe o nome do plano' }
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: 'Nome do plano muito longo' }

  const description = (draft.description ?? '').trim() || null
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, error: 'Descrição muito longa' }
  }

  const priceCents = toCents(draft.price)
  if (priceCents === null || priceCents < 0 || priceCents > MAX_SUBSCRIPTION_PRICE_CENTS) {
    return { ok: false, error: 'Valor do plano inválido' }
  }
  // Plano de graça não gera cobrança — e renovar é cobrar.
  if (priceCents === 0) return { ok: false, error: 'Informe o valor do plano' }

  if (
    !Number.isInteger(draft.intervalMonths) ||
    draft.intervalMonths < 1 ||
    draft.intervalMonths > MAX_SUBSCRIPTION_INTERVAL_MONTHS
  ) {
    return { ok: false, error: `A periodicidade vai de 1 a ${MAX_SUBSCRIPTION_INTERVAL_MONTHS} meses` }
  }

  return {
    ok: true,
    plan: {
      name,
      description,
      price: centsToNumeric(priceCents),
      intervalMonths: draft.intervalMonths,
      isActive: draft.isActive,
      isVisible: draft.isVisible,
    },
  }
}

/** Por que um plano não pode ser apagado: quem já teve assinatura fica, inativo. */
export function subscriptionPlanDeleteBlocker(input: { subscriptions: number }): string | null {
  if (input.subscriptions > 0) {
    return 'Este plano já tem assinatura. Desative-o em vez de excluir'
  }
  return null
}

// ============================================================================
// Assinatura do cliente
// ============================================================================

export type PlannedCustomerSubscription = {
  name: string
  price: string
  intervalMonths: number
  startedOn: string
}

/**
 * Cria a assinatura de um cliente a partir de um plano. COPIA nome, valor e
 * periodicidade: mudar o plano depois não muda quem já assina.
 */
export function planCustomerSubscription(input: {
  /** O plano, já filtrado pelo salão. NULL = não existe. */
  plan: { name: string; price: string; intervalMonths: number; isActive: boolean } | null
  /** O cliente já tem uma assinatura em vigor deste plano. */
  alreadySubscribed: boolean
  now: Date
}): { ok: true; subscription: PlannedCustomerSubscription } | { ok: false; error: string } {
  if (!input.plan) return { ok: false, error: 'Plano não encontrado' }
  if (!input.plan.isActive) return { ok: false, error: 'Este plano está inativo' }
  if (input.alreadySubscribed) return { ok: false, error: 'O cliente já tem uma assinatura deste plano' }

  return {
    ok: true,
    subscription: {
      name: input.plan.name,
      price: input.plan.price,
      intervalMonths: input.plan.intervalMonths,
      startedOn: brazilToday(input.now),
    },
  }
}

/** Por que uma assinatura não pode ser apagada: a que já foi cobrada fica, desativada. */
export function customerSubscriptionDeleteBlocker(input: { periods: number; saleItems: number }): string | null {
  if (input.periods > 0) return 'Esta assinatura já foi cobrada. Desative-a em vez de excluir'
  if (input.saleItems > 0) return 'Esta assinatura está em uma comanda. Tire o item de lá ou desative a assinatura'
  return null
}

// ============================================================================
// Situação
// ============================================================================

/**
 * pending  = nunca foi paga (não tem período)
 * active   = o último período vence hoje ou depois
 * expired  = o último período já venceu
 * inactive = desativada à mão — vale mais que as outras
 */
export type CustomerSubscriptionStatus = 'pending' | 'active' | 'expired' | 'inactive'

export function customerSubscriptionStatus(input: {
  deactivated: boolean
  /** Vencimento do último período pago. NULL = nenhum. */
  paidUntil: string | null
  today: string
}): CustomerSubscriptionStatus {
  if (input.deactivated) return 'inactive'
  if (input.paidUntil === null) return 'pending'
  // Vale ATÉ o dia do vencimento, inclusive.
  return input.paidUntil >= input.today ? 'active' : 'expired'
}

// ============================================================================
// Renovação: comanda faturada → período pago
// ============================================================================

/**
 * O período que uma cobrança paga.
 *
 * Renovação em dia (a assinatura ainda vale no dia da comanda) emenda: começa no
 * vencimento atual — quem paga adiantado não perde dias. Atrasada ou primeira
 * cobrança: começa no dia da comanda. O vencimento é o mesmo dia do mês,
 * `intervalMonths` meses depois (31/jan + 1 mês = 28 ou 29/fev).
 */
export function nextSubscriptionPeriod(input: {
  /** Dia da comanda em Brasília. */
  saleDay: string
  paidUntil: string | null
  intervalMonths: number
}): { periodStart: string; periodEnd: string } {
  const periodStart =
    input.paidUntil !== null && input.paidUntil >= input.saleDay ? input.paidUntil : input.saleDay
  return { periodStart, periodEnd: addMonthsToDate(periodStart, input.intervalMonths) }
}

export type SubscriptionSaleItem = {
  id: string
  customerSubscriptionId: string | null
  /** Coluna numeric(12,2). */
  total: string
}

export type SubscriptionForRenewal = {
  name: string
  intervalMonths: number
  deactivated: boolean
  /** Vencimento do último período pago por OUTRA comanda. NULL = nenhum. */
  paidUntil: string | null
}

export type PlannedSubscriptionPeriod = {
  saleItemId: string
  subscriptionId: string
  periodStart: string
  periodEnd: string
  amount: string
}

/**
 * Os períodos que uma comanda faturada paga: um por item de assinatura.
 *
 * Assinatura desativada entre salvar e faturar barra o faturamento — cobrar por
 * uma assinatura que o salão encerrou é erro, não detalhe. A mesma assinatura
 * duas vezes na comanda também (a regra da comanda já recusa ao salvar).
 */
export function planSubscriptionPeriods(input: {
  saleDate: Date
  items: readonly SubscriptionSaleItem[]
  subscriptions: ReadonlyMap<string, SubscriptionForRenewal>
}): { ok: true; periods: PlannedSubscriptionPeriod[] } | { ok: false; error: string } {
  const saleDay = brazilToday(input.saleDate)
  const periods: PlannedSubscriptionPeriod[] = []
  const seen = new Set<string>()

  for (const item of input.items) {
    if (!item.customerSubscriptionId) continue

    const subscription = input.subscriptions.get(item.customerSubscriptionId)
    if (!subscription) return { ok: false, error: 'Uma assinatura desta comanda não foi encontrada' }
    if (subscription.deactivated) {
      return {
        ok: false,
        error: `A assinatura "${subscription.name}" foi desativada. Tire o item da comanda para faturar`,
      }
    }
    if (seen.has(item.customerSubscriptionId)) {
      return { ok: false, error: `A assinatura "${subscription.name}" aparece em dois itens da comanda` }
    }
    seen.add(item.customerSubscriptionId)

    const period = nextSubscriptionPeriod({
      saleDay,
      paidUntil: subscription.paidUntil,
      intervalMonths: subscription.intervalMonths,
    })

    periods.push({
      saleItemId: item.id,
      subscriptionId: item.customerSubscriptionId,
      ...period,
      amount: centsToNumeric(Math.max(0, toCents(item.total) ?? 0)),
    })
  }

  return { ok: true, periods }
}

/**
 * Por que a comanda não pode ser reaberta: uma assinatura dela já foi renovada
 * DEPOIS, em outra comanda. Reabrir apagaria o período do meio e deixaria um
 * buraco; desfaz-se da última para a primeira.
 */
export function subscriptionReopenBlocker(
  renewedLater: readonly { name: string; saleNumber: number }[]
): string | null {
  if (renewedLater.length === 0) return null
  const first = renewedLater[0]
  return `A assinatura "${first.name}" já foi renovada depois, na comanda #${first.saleNumber}. Reabra aquela antes desta`
}
