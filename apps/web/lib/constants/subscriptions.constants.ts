import type { CustomerSubscriptionStatus } from "@repo/db"

/** Situação da assinatura do cliente (docs/ROADMAP.md, fase 5, §9.3 regra 26). */
export const SUBSCRIPTION_STATUS_LABELS: Record<CustomerSubscriptionStatus, string> = {
  pending: "Pendente",
  active: "Ativa",
  expired: "Expirada",
  inactive: "Desativada",
}

export const SUBSCRIPTION_STATUS_CLASSES: Record<CustomerSubscriptionStatus, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  expired: "bg-destructive/10 text-destructive",
  inactive: "bg-muted text-muted-foreground",
}

/** Periodicidades oferecidas no cadastro do plano, em meses. */
export const SUBSCRIPTION_INTERVAL_OPTIONS: { months: number; label: string }[] = [
  { months: 1, label: "Mensal" },
  { months: 2, label: "Bimestral" },
  { months: 3, label: "Trimestral" },
  { months: 6, label: "Semestral" },
  { months: 12, label: "Anual" },
]

/** 1 → "Mensal"; 5 → "A cada 5 meses". */
export function subscriptionIntervalLabel(months: number): string {
  return (
    SUBSCRIPTION_INTERVAL_OPTIONS.find((option) => option.months === months)?.label ?? `A cada ${months} meses`
  )
}
