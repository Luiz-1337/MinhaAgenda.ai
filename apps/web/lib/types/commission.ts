/**
 * Tipos das telas de comissão (docs/ROADMAP.md, fase 3, fatias 3a e 3b).
 *
 * Atravessam a fronteira servidor → cliente: datas de calendário como
 * "YYYY-MM-DD", dinheiro como string de coluna numeric ou em centavos inteiros (o
 * que o servidor já somou).
 */
import type {
  CommissionAssistantBase,
  CommissionAssistantDeduct,
  CommissionConfig,
  CommissionDateBasis,
  CommissionEntryRow,
  CommissionProfessionalTotals,
  CommissionRateKind,
  CommissionShareMode,
  CommissionTotals,
} from "@repo/db"

export type CommissionEntryDTO = CommissionEntryRow
export type CommissionConfigDTO = CommissionConfig

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
  /** Opções do filtro: todos, ou só os vínculos da própria pessoa. */
  professionals: { id: string; name: string }[]
  /** Cortesias de tela — a trava é no servidor. */
  canViewAll: boolean
  canConfigure: boolean
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
