/**
 * Tipos da tela de mensagens de cuidados e de retorno (docs/ROADMAP.md, fase 6,
 * fatia 6d).
 *
 * Atravessam a fronteira servidor → cliente: instantes como string ISO.
 */
import type { CareDispatchKind, CareDispatchStatus, CareMessageItemOption, CareMessageKind, CareMessageRuleRow } from "@repo/db"

export type CareMessageRuleDTO = CareMessageRuleRow

export interface CareMessageDispatchDTO {
  id: string
  kind: CareDispatchKind
  status: CareDispatchStatus
  customerId: string
  customerName: string
  itemName: string | null
  /** ISO. */
  scheduledFor: string
  sentAt: string | null
  /** O texto que saiu. */
  body: string | null
  /** Por que falhou ou não foi enviado. */
  detail: string | null
  saleId: string | null
  saleNumber: number | null
}

export interface CareMessagesDTO {
  rules: CareMessageRuleDTO[]
  services: CareMessageItemOption[]
  products: CareMessageItemOption[]
  dispatches: CareMessageDispatchDTO[]
  truncated: boolean
  /** Limites de "quantos dias", por tipo. */
  limits: Record<CareMessageKind, { min: number; max: number }>
  /** Horário em que a fila envia (Brasília). */
  sendHours: { from: number; until: number }
  /** Cortesia de tela — a trava é no servidor. */
  can: { manage: boolean }
}

export interface SaveCareMessageRuleInput {
  salonId: string
  ruleId?: string | null
  kind: CareMessageKind
  serviceId: string | null
  productId: string | null
  offsetDays: number
  message: string
  isActive: boolean
}
