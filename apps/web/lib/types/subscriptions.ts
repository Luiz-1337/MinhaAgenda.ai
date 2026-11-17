/**
 * Tipos das telas de assinaturas de cliente (docs/ROADMAP.md, fase 5, fatia 5c).
 *
 * Atravessam a fronteira servidor → cliente: dinheiro como string de coluna
 * numeric, datas de calendário como "YYYY-MM-DD".
 */
import type { CustomerSubscriptionRow, CustomerSubscriptionStatus, SubscriptionPlanRow } from "@repo/db"

export type SubscriptionPlanDTO = SubscriptionPlanRow

export interface SubscriptionPlansDTO {
  plans: SubscriptionPlanDTO[]
  /** Cortesia de tela — a trava é no servidor. */
  can: { manage: boolean }
}

export interface SaveSubscriptionPlanInput {
  salonId: string
  /** Ausente = criar. */
  planId?: string
  name: string
  description?: string | null
  price: number
  /** De quanto em quanto tempo se cobra, em meses. */
  intervalMonths: number
  isActive: boolean
  isVisible: boolean
}

export type CustomerSubscriptionDTO = CustomerSubscriptionRow

export interface CustomerSubscriptionsDTO {
  subscriptions: CustomerSubscriptionDTO[]
  truncated: boolean
  totals: Record<CustomerSubscriptionStatus, number>
  /** Planos ativos, para criar uma assinatura. */
  plans: { id: string; name: string; price: string; intervalMonths: number }[]
  can: {
    manage: boolean
    /** Renovar abre uma comanda: precisa do módulo de comandas e de `sales.create`. */
    charge: boolean
  }
}

export interface SubscriptionCustomerOption {
  id: string
  name: string
  phone: string
}

/** Uma assinatura em vigor do cliente da comanda — o botão "+ Assinatura". */
export interface SaleSubscriptionOptionDTO {
  id: string
  name: string
  price: string
  /** Vencimento do último período pago. NULL = nunca foi paga. */
  paidUntil: string | null
  status: CustomerSubscriptionStatus
}
