/**
 * Tipos das telas de comissão (docs/ROADMAP.md, fase 3, fatias 3a a 3d).
 *
 * Atravessam a fronteira servidor → cliente: datas de calendário como
 * "YYYY-MM-DD", dinheiro como string de coluna numeric ou em centavos inteiros (o
 * que o servidor já somou).
 */
import type {
  CommissionAdjustmentKind,
  CommissionAdjustmentRow,
  CommissionAssistantBase,
  CommissionAssistantDeduct,
  CommissionConfig,
  CommissionDateBasis,
  CommissionEntryRow,
  CommissionOpenRow,
  CommissionPaymentRow,
  CommissionProfessionalTotals,
  CommissionRateKind,
  CommissionReceipt,
  CommissionShareMode,
  CommissionTotals,
} from "@repo/db"

export type CommissionEntryDTO = CommissionEntryRow
export type CommissionConfigDTO = CommissionConfig
export type CommissionAdjustmentDTO = CommissionAdjustmentRow
export type CommissionOpenRowDTO = CommissionOpenRow
export type CommissionPaymentDTO = CommissionPaymentRow
export type CommissionReceiptDTO = CommissionReceipt

/**
 * De onde um pagamento (ou um vale) pode sair. Vazio quando o salão não usa o
 * financeiro ou a pessoa não pode lançar nele — aí nada é registrado lá.
 */
export interface CommissionFinanceOptions {
  accounts: { id: string; name: string }[]
  categories: { id: string; name: string }[]
}

export interface CommissionStatementFilters {
  /** "YYYY-MM-DD". Ausentes = mês corrente em Brasília. */
  from?: string
  to?: string
  professionalId?: string
}

export interface CommissionStatementDTO {
  from: string
  to: string
  /** Profissional filtrado. NULL = todos os que a pessoa pode ver. */
  professionalId: string | null
  rows: CommissionEntryDTO[]
  /** A lista foi cortada; os totais continuam sendo do período inteiro. */
  truncated: boolean
  byProfessional: CommissionProfessionalTotals[]
  totals: CommissionTotals
  /** Comissões sem data: aguardando o cliente pagar o valor em aberto. */
  pending: { count: number; amountCents: number }
  /** Vales e bonificações do período. */
  adjustments: CommissionAdjustmentDTO[]
  adjustmentsTruncated: boolean
  /** Somas do período; líquido = a receber − vales + bonificações (pode ser negativo). */
  advanceCents: number
  bonusCents: number
  netCents: number
  /** Opções do filtro: todos, ou só os vínculos da própria pessoa. */
  professionals: { id: string; name: string }[]
  /** Hoje em Brasília ("YYYY-MM-DD") — data sugerida de um lançamento novo. */
  today: string
  /** Contas para registrar a saída de um vale. */
  finance: CommissionFinanceOptions
  /** Cortesias de tela — a trava é no servidor. */
  canViewAll: boolean
  canConfigure: boolean
  canAdjust: boolean
  canPay: boolean
}

export interface CommissionPaymentsFilters {
  /** "Em aberto até" ("YYYY-MM-DD"). Ausente = hoje em Brasília. */
  until?: string
  /** Período da lista de pagamentos, pelo dia do pagamento. Ausente = mês corrente. */
  from?: string
  to?: string
}

export interface CommissionPaymentsDTO {
  until: string
  from: string
  to: string
  /** Hoje em Brasília ("YYYY-MM-DD") — dia sugerido do pagamento. */
  today: string
  /** O que está em aberto até `until`, por profissional. */
  open: CommissionOpenRowDTO[]
  payments: CommissionPaymentDTO[]
  paymentsTruncated: boolean
  /** Soma do que foi pago no período da lista, em centavos. */
  paidCents: number
  finance: CommissionFinanceOptions
  canPay: boolean
  canViewAll: boolean
}

export interface PayCommissionsInput {
  salonId: string
  /** Quita tudo o que está em aberto até este dia. */
  cutoffDate: string
  /** Dia em que o dinheiro foi entregue. */
  paidOn: string
  notes?: string | null
  /** Conta de saída. Ausente = não registrar no financeiro. */
  accountId?: string | null
  categoryId?: string | null
  /** O líquido que a tela mostrou para cada um, em centavos. */
  professionals: { professionalId: string; expectedCents: number }[]
}

export interface CommissionReceiptsDTO {
  salonName: string
  receipts: CommissionReceiptDTO[]
}

export interface CreateCommissionAdjustmentInput {
  salonId: string
  professionalId: string
  kind: CommissionAdjustmentKind
  /** Sempre positivo: o tipo diz se soma ou abate. */
  amount: number
  /** "YYYY-MM-DD": o dia em que entra no extrato. */
  referenceDate: string
  notes?: string | null
  /** Só em vale: a conta de onde o dinheiro saiu. Ausente = não registrar no financeiro. */
  accountId?: string | null
  categoryId?: string | null
}

export interface SaveCommissionSettingsInput {
  salonId: string
  /** NULL = regras do salão. */
  professionalId: string | null
  /** NULL em um campo = não define (segue o salão, ou o padrão do sistema). */
  dateBasis: CommissionDateBasis | null
  feeMode: CommissionShareMode | null
  discountMode: CommissionShareMode | null
}

export interface CommissionRuleInput {
  serviceId?: string | null
  productId?: string | null
  kind: CommissionRateKind
  /** Percentual (0 a 100) ou reais por unidade. */
  value: number
}

export interface SaveCommissionRulesInput {
  salonId: string
  /** NULL = padrão do salão por item. */
  professionalId: string | null
  /** A tabela inteira do alvo: item que não vem fica sem regra. */
  rules: CommissionRuleInput[]
}

export interface CommissionAssistantRuleInput {
  serviceId: string
  kind: CommissionRateKind
  /** Percentual (0 a 100) ou reais por unidade. */
  value: number
  /** Sobre o que o percentual incide. Ignorado em valor fixo. */
  base: CommissionAssistantBase
  /** De quem sai a comissão do auxiliar. */
  deductFrom: CommissionAssistantDeduct
}

export interface SaveCommissionAssistantRulesInput {
  salonId: string
  /** NULL = padrão do salão por serviço. */
  professionalId: string | null
  /** A tabela inteira do alvo: serviço que não vem fica sem regra. */
  rules: CommissionAssistantRuleInput[]
}

export interface RecalculateCommissionsInput {
  salonId: string
  from: string
  to: string
}
