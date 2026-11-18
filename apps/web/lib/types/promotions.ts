/**
 * Tipos das telas de promoções e cupons (docs/ROADMAP.md, fase 6, fatia 6b).
 *
 * Atravessam a fronteira servidor → cliente: dinheiro como string de coluna
 * numeric, datas de calendário como "YYYY-MM-DD".
 */
import type { PromotionAppliesTo, PromotionDiscountKind, PromotionRow } from "@repo/db"

export type PromotionDTO = PromotionRow

export interface PromotionsDTO {
  promotions: PromotionDTO[]
  /** Cortesia de tela — a trava é no servidor. */
  can: { manage: boolean }
}

export interface SavePromotionInput {
  salonId: string
  /** Ausente = criar. */
  promotionId?: string
  name: string
  code: string
  discountKind: PromotionDiscountKind
  discountValue: number
  appliesTo: PromotionAppliesTo
  /** "YYYY-MM-DD" ou null. */
  startsOn: string | null
  endsOn: string | null
  /** 0 = domingo … 6 = sábado. Vazio = todos os dias. */
  weekdays: number[]
  isActive: boolean
}

/** O cupom aplicado numa comanda, com a regra para a tela refazer a conta. */
export interface SaleCouponDTO {
  code: string
  name: string
  discountKind: PromotionDiscountKind
  discountValue: string
  appliesTo: PromotionAppliesTo
}
