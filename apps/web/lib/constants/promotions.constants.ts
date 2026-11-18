import type { PromotionAppliesTo, PromotionStatus } from "@repo/db"

/** Situação da promoção (docs/ROADMAP.md, fase 6, §10.3 regra 17). */
export const PROMOTION_STATUS_LABELS: Record<PromotionStatus, string> = {
  active: "Ativa",
  scheduled: "Agendada",
  expired: "Encerrada",
  inactive: "Desativada",
}

export const PROMOTION_STATUS_CLASSES: Record<PromotionStatus, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  scheduled: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  expired: "bg-destructive/10 text-destructive",
  inactive: "bg-muted text-muted-foreground",
}

export const PROMOTION_APPLIES_LABELS: Record<PromotionAppliesTo, string> = {
  all: "Serviços e produtos",
  services: "Só serviços",
  products: "Só produtos",
}

/** 0 = domingo … 6 = sábado. */
export const WEEKDAY_SHORT_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const
