/**
 * Tipos das telas do financeiro (docs/ROADMAP.md, fase 2).
 *
 * Tudo aqui atravessa a fronteira servidor → cliente: datas de calendário vão como
 * "YYYY-MM-DD", instantes como ISO, dinheiro como string de coluna numeric ou em
 * centavos inteiros (totais e saldos, que o servidor já somou).
 */
import type {
  FinancialAccountKind,
  FinancialCategoryKind,
  FinancialDirection,
  FinancialTransactionKind,
  FinancialTransactionStatus,
} from "@repo/db"

export interface FinanceAccountDTO {
  id: string
  name: string
  kind: FinancialAccountKind
  openingBalance: string
  isActive: boolean
  balanceCents: number
}

export interface FinanceCategoryDTO {
  id: string
  name: string
  kind: FinancialCategoryKind
  isActive: boolean
}

export interface FinanceTransactionDTO {
  id: string
  direction: FinancialDirection
  kind: FinancialTransactionKind
  status: FinancialTransactionStatus
  description: string
  amount: string
  feeAmount: string
  netAmount: string
  dueDate: string
  competenceDate: string
  paidAt: string | null
  accountId: string | null
  accountName: string | null
  categoryId: string | null
  categoryName: string | null
  customerName: string | null
  professionalName: string | null
  counterparty: string | null
  saleId: string | null
  notes: string | null
}

export interface FinanceTotalsDTO {
  inOpen: number
  inPaid: number
  outOpen: number
  outPaid: number
}

export interface FinanceListFilters {
  direction?: FinancialDirection
  status?: FinancialTransactionStatus
  /** Intervalo de vencimento, "YYYY-MM-DD". */
  from?: string
  to?: string
  accountId?: string
  page?: number
}

export interface FinanceListPage {
  rows: FinanceTransactionDTO[]
  total: number
  totals: FinanceTotalsDTO
  page: number
  pageSize: number
}

/** O que a tela de transações precisa para montar os formulários. */
export interface FinanceFormOptions {
  accounts: FinanceAccountDTO[]
  categories: FinanceCategoryDTO[]
  /** Cortesia de tela — a trava é no servidor. */
  can: { create: boolean; delete: boolean; settle: boolean; settings: boolean; cash: boolean }
}

export interface CreateFinanceTransactionInput {
  salonId: string
  direction: FinancialDirection
  description: string
  amount: number
  dueDate: string
  categoryId?: string | null
  accountId?: string | null
  counterparty?: string | null
  notes?: string | null
  paid: boolean
  paidDate?: string | null
  /** Repete todo mês por N meses (1 = não repete). "Já pago" vale só para o primeiro. */
  installments?: number
}

/** Edição de um lançamento manual em aberto. O tipo (entrada/saída) não muda. */
export interface UpdateFinanceTransactionInput {
  salonId: string
  transactionId: string
  description: string
  amount: number
  dueDate: string
  categoryId?: string | null
  accountId?: string | null
  counterparty?: string | null
  notes?: string | null
}

export interface FinanceSummaryDTO {
  /** "YYYY-MM" do período mostrado. */
  month: string
  from: string
  to: string
  receivedCents: number
  paidCents: number
  toReceiveCents: number
  toPayCents: number
  overdueInCents: number
  overdueOutCents: number
  incomeByCategory: { name: string; cents: number }[]
  expenseByCategory: { name: string; cents: number }[]
  receivedByPaymentMethod: { name: string; cents: number }[]
  dailyFlow: { date: string; inCents: number; outCents: number }[]
}

export interface CreateFinanceTransferInput {
  salonId: string
  fromAccountId: string
  toAccountId: string
  amount: number
  date?: string | null
  notes?: string | null
}

export interface SettleFinanceTransactionInput {
  salonId: string
  transactionId: string
  accountId?: string | null
  paidDate?: string | null
}

export interface FinanceSettings {
  accounts: FinanceAccountDTO[]
  categories: FinanceCategoryDTO[]
}

export interface SaveFinancialAccountInput {
  salonId: string
  id?: string
  name: string
  kind: FinancialAccountKind
  openingBalance: number
  isActive: boolean
}

export interface SaveFinancialCategoryInput {
  salonId: string
  id?: string
  name: string
  kind: FinancialCategoryKind
  isActive: boolean
}
