import type { CustomerPackageStatus } from "@repo/db"

/** Situação do pacote vendido (docs/ROADMAP.md, fase 5, §9.3 regra 11). */
export const PACKAGE_STATUS_LABELS: Record<CustomerPackageStatus, string> = {
  active: "Disponível",
  expired: "Vencido",
  used: "Utilizado",
}

export const PACKAGE_STATUS_CLASSES: Record<CustomerPackageStatus, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  expired: "bg-destructive/10 text-destructive",
  used: "bg-muted text-muted-foreground",
}
