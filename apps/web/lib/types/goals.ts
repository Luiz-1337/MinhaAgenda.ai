/**
 * Tipos da tela de metas (docs/ROADMAP.md, fase 6, fatia 6e).
 *
 * Dinheiro atravessa em CENTAVOS inteiros (faturamento, serviços, produtos);
 * comandas, em contagem.
 */
import type { GoalBoardRow, GoalMetric } from "@repo/db"

export type GoalRowDTO = GoalBoardRow

export interface GoalsDTO {
  /** "YYYY-MM". */
  month: string
  previousMonth: string
  nextMonth: string
  /** O mês corrente em Brasília. */
  currentMonth: string
  rows: GoalRowDTO[]
  /** O mês tem alguma meta gravada. */
  hasGoals: boolean
  /** Cortesia de tela — a trava é no servidor. */
  can: { manage: boolean }
}

export interface SaveGoalTargetsInput {
  salonId: string
  /** "YYYY-MM". */
  month: string
  /** NULL = o salão. */
  professionalId: string | null
  /** Em reais (ou contagem, em `sales_count`). NULL = sem meta. */
  targets: Record<GoalMetric, number | null>
}

export interface CopyGoalsInput {
  salonId: string
  fromMonth: string
  toMonth: string
}
