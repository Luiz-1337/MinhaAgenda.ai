/**
 * Tipos da tela do caixa (docs/ROADMAP.md, fase 2, fatia 2e).
 *
 * Atravessam a fronteira servidor → cliente: instantes como ISO, dinheiro como
 * string de coluna numeric ou em centavos inteiros (o que o servidor já somou).
 */
import type { CashMovementKind } from "@repo/db"

export interface CashMovementDTO {
  id: string
  kind: CashMovementKind
  amount: string
  description: string | null
  createdAt: string
  createdByName: string | null
  saleId: string | null
  saleNumber: number | null
  customerName: string | null
}

export interface OpenCashSessionDTO {
  id: string
  openedAt: string
  openedByName: string | null
  notes: string | null
  openingCents: number
  supplyCents: number
  saleCents: number
  withdrawalCents: number
  /** Inicial + suprimentos + vendas em dinheiro − sangrias. */
  expectedCents: number
  movements: CashMovementDTO[]
}

export interface ClosedCashSessionDTO {
  id: string
  openedAt: string
  closedAt: string | null
  openedByName: string | null
  closedByName: string | null
  openingAmount: string
  expectedAmount: string | null
  countedAmount: string | null
  difference: string | null
  notes: string | null
}

export interface CashOverview {
  /** NULL = caixa fechado. */
  open: OpenCashSessionDTO | null
  history: ClosedCashSessionDTO[]
  historyTotal: number
  /** Cortesia de tela — a trava é no servidor. */
  canOperate: boolean
}

export interface OpenCashInput {
  salonId: string
  openingAmount: number
  notes?: string | null
}

export interface CashMovementInput {
  salonId: string
  kind: "supply" | "withdrawal"
  amount: number
  description?: string | null
}

export interface CloseCashInput {
  salonId: string
  countedAmount: number
  notes?: string | null
}
