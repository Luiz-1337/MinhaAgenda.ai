/**
 * Rótulos de tela das comandas. Os valores (status, tipo de forma de pagamento)
 * são do schema em `@repo/db`; aqui fica só o texto em português.
 *
 * Só `import type` de `@repo/db`: este módulo é usado em componente client e o
 * barrel arrasta o cliente Postgres.
 */
import type { PaymentMethodKind, SaleStatus } from "@repo/db"

export const PAYMENT_METHOD_KIND_LABELS: Record<PaymentMethodKind, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  other: "Outro",
}

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  open: "Pendente",
  invoiced: "Finalizada",
  void: "Excluída",
}

/** Classes do selo de status — claro e escuro. */
export const SALE_STATUS_BADGE: Record<SaleStatus, string> = {
  open: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300",
  invoiced:
    "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300",
  void: "bg-muted border-border text-muted-foreground",
}
