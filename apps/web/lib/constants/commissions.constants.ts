/**
 * Textos de tela das regras de comissão (docs/ROADMAP.md, fase 3).
 *
 * Os valores possíveis são de `@repo/db` (schema.ts); aqui fica só o português. Os
 * `Record` são tipados pelos tipos de lá: um valor novo sem rótulo não compila.
 */
import type {
  CommissionAdjustmentKind,
  CommissionAssistantBase,
  CommissionAssistantDeduct,
  CommissionDateBasis,
  CommissionRateKind,
  CommissionShareMode,
} from "@repo/db"

export const COMMISSION_DATE_BASIS_LABELS: Record<CommissionDateBasis, string> = {
  competence: "Competência — no dia da comanda",
  availability: "Disponibilidade — quando o salão recebe",
}

export const COMMISSION_FEE_MODE_LABELS: Record<CommissionShareMode, string> = {
  proportional: "Proporcional à comissão",
  salon: "O salão paga tudo",
  professional: "O profissional paga tudo",
  split: "Meio a meio",
}

export const COMMISSION_DISCOUNT_MODE_LABELS: Record<CommissionShareMode, string> = {
  salon: "O salão arca com tudo",
  proportional: "Proporcional à comissão",
  professional: "O profissional arca com tudo",
  split: "Meio a meio",
}

export const COMMISSION_RATE_KIND_LABELS: Record<CommissionRateKind, string> = {
  percent: "%",
  fixed: "R$",
}

export const COMMISSION_ASSISTANT_BASE_LABELS: Record<CommissionAssistantBase, string> = {
  gross: "Valor do serviço",
  commission: "Comissão do profissional",
}

export const COMMISSION_ASSISTANT_DEDUCT_LABELS: Record<CommissionAssistantDeduct, string> = {
  professional: "Do profissional",
  salon: "Do salão",
}

export const COMMISSION_ADJUSTMENT_KIND_LABELS: Record<CommissionAdjustmentKind, string> = {
  advance: "Vale",
  bonus: "Bonificação",
}

export const COMMISSION_SETTINGS_HINTS = {
  dateBasis:
    "Competência: a comissão fica disponível no dia da comanda. Disponibilidade: só quando o salão recebe, respeitando o prazo da forma de pagamento e o valor que o cliente ainda deve.",
  feeMode: "Quem paga a taxa do cartão e das outras formas de pagamento.",
  discountMode: "Quem arca com o desconto dado na venda.",
} as const
