/**
 * Rótulos de tela do financeiro. Os valores são do schema em `@repo/db`; aqui fica
 * só o texto em português.
 *
 * Só `import type` de `@repo/db`: este módulo é usado em componente client e o
 * barrel arrasta o cliente Postgres.
 */
import type { FinancialAccountKind, FinancialCategoryKind } from "@repo/db"

export const FINANCIAL_ACCOUNT_KIND_LABELS: Record<FinancialAccountKind, string> = {
  bank: "Banco",
  cash: "Caixa",
  safe: "Cofre",
  other: "Outra",
}

export const FINANCIAL_CATEGORY_KIND_LABELS: Record<FinancialCategoryKind, string> = {
  income: "Receita",
  expense: "Despesa",
}
