/**
 * Tipos das telas de avaliações (docs/ROADMAP.md, fase 6, fatia 6c).
 *
 * Atravessam a fronteira servidor → cliente: instantes como string ISO, datas de
 * calendário como "YYYY-MM-DD".
 */
import type { ReviewDashboard, ReviewSettingsRow } from "@repo/db"

export type ReviewSettingsDTO = ReviewSettingsRow

export interface ReviewDTO {
  id: string
  /** O token do link público — só chega a quem tem acesso às avaliações. */
  token: string
  serviceDate: string
  rating: number | null
  comment: string | null
  /** ISO. */
  requestedAt: string
  respondedAt: string | null
  customerId: string
  customerName: string
  saleId: string
  saleNumber: number
  professionals: { id: string; name: string }[]
}

export interface ReviewFilters {
  /** "YYYY-MM-DD". Sem datas, o mês corrente até hoje. */
  from?: string
  to?: string
}

export interface ReviewsDTO {
  from: string
  to: string
  settings: ReviewSettingsDTO
  /** Os textos que o formulário usa quando o salão não escreveu os seus. */
  defaults: { title: string; welcome: string; thanks: string }
  dashboard: ReviewDashboard
  reviews: ReviewDTO[]
  truncated: boolean
  /** Cortesia de tela — a trava é no servidor. */
  can: { manage: boolean }
}

export interface SaveReviewSettingsInput {
  salonId: string
  isEnabled: boolean
  title: string | null
  welcomeText: string | null
  thanksText: string | null
}

/** O pedido de avaliação de uma comanda, para a tela da comanda mostrar o link. */
export interface SaleReviewDTO {
  token: string
  rating: number | null
  respondedAt: string | null
}
