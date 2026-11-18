import type { CashbackEntryKind, CashbackStatus } from "@repo/db"

/** Situação do saldo do cliente (docs/ROADMAP.md, fase 6, §10.3 regra 6). */
export const CASHBACK_STATUS_LABELS: Record<CashbackStatus, string> = {
  available: "Disponível para resgate",
  below_minimum: "Abaixo do mínimo",
  empty: "Sem saldo",
}

export const CASHBACK_STATUS_CLASSES: Record<CashbackStatus, string> = {
  available: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  below_minimum: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  empty: "bg-muted text-muted-foreground",
}

/** A coluna "Movimentação" do extrato. */
export const CASHBACK_ENTRY_LABELS: Record<CashbackEntryKind, string> = {
  earn: "Ganho",
  redeem: "Resgate",
  adjustment: "Ajuste",
}
