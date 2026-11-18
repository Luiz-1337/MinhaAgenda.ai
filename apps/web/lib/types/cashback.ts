/**
 * Tipos das telas de cashback (docs/ROADMAP.md, fase 6, fatia 6a).
 *
 * Atravessam a fronteira servidor → cliente: dinheiro como string de coluna
 * numeric, instantes como string ISO.
 */
import type {
  CashbackCustomerRow,
  CashbackEntryKind,
  CashbackItemRow,
  CashbackRateKind,
  CashbackSettingsRow,
  CashbackStatus,
} from "@repo/db"

export type CashbackSettingsDTO = CashbackSettingsRow
export type CashbackItemDTO = CashbackItemRow
export type CashbackCustomerDTO = CashbackCustomerRow

/** A tela de Cashback: configuração, itens e clientes com saldo. */
export interface CashbackOverviewDTO {
  settings: CashbackSettingsDTO
  items: CashbackItemDTO[]
  customers: CashbackCustomerDTO[]
  truncated: boolean
  /** Cortesia de tela — a trava é no servidor. */
  can: { manage: boolean }
}

export interface SaveCashbackSettingsInput {
  salonId: string
  isEnabled: boolean
  defaultKind: CashbackRateKind
  defaultValue: number
  minRedeem: number
}

export interface SaveCashbackRuleInput {
  salonId: string
  itemKind: "service" | "product"
  itemId: string
  kind: CashbackRateKind
  /** 0 = usa o padrão do salão. */
  value: number
  isActive: boolean
}

export interface AdjustCashbackInput {
  salonId: string
  customerId: string
  /** Positivo credita, negativo debita. */
  amount: number
  reason: string
}

export interface CashbackEntryDTO {
  id: string
  kind: CashbackEntryKind
  amount: string
  reason: string | null
  /** ISO. */
  createdAt: string
  saleId: string | null
  saleNumber: number | null
  itemDescription: string | null
}

/** O cartão Cashback da ficha do cliente. */
export interface CustomerCashbackDTO {
  balance: string
  minRedeem: string
  isEnabled: boolean
  status: CashbackStatus
  entries: CashbackEntryDTO[]
  can: { manage: boolean }
}

/** O que o faturamento da comanda precisa para oferecer o uso do cashback. */
export interface SaleCashbackDTO {
  /** Módulo ligado e cashback ativado no salão. */
  enabled: boolean
  balance: string
  minRedeem: string
  status: CashbackStatus
}
