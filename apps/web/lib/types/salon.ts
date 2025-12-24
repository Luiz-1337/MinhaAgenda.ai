/**
 * Tipos relacionados a salões
 */

import type { ProfessionalRole } from "./professional"

export type PlanTier = 'SOLO' | 'PRO' | 'ENTERPRISE'
export type SubscriptionStatus = 'ACTIVE' | 'PAID' | 'PAST_DUE' | 'CANCELED' | 'TRIAL'

export interface SalonOwnerContext {
  salonId: string
  userId: string
}

export interface SalonOwnerError {
  error: "Não autenticado" | "Salão não encontrado"
}

export type SalonOwnerResult = SalonOwnerContext | SalonOwnerError

export interface SalonListItem {
  id: string
  name: string
  slug: string
  whatsapp?: string | null
  planTier: PlanTier
  role: ProfessionalRole
}
