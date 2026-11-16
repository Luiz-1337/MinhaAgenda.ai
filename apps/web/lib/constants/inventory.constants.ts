/**
 * Textos de tela do estoque (docs/ROADMAP.md, fase 4).
 *
 * Os valores possíveis são de `@repo/db`; aqui fica só o português. Os `Record`
 * são tipados pelos tipos de lá: um valor novo sem rótulo não compila.
 */
import type { StockMovementKind, StockStatus } from "@repo/db"

export const STOCK_MOVEMENT_KIND_LABELS: Record<StockMovementKind, string> = {
  in: "Entrada",
  out: "Saída",
  adjustment: "Acerto",
  sale: "Venda",
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  untracked: "Sem controle",
  negative: "Negativo",
  out: "Zerado",
  low: "Abaixo do mínimo",
  ok: "Em dia",
}

/** O que cada tipo de lançamento faz, mostrado embaixo do formulário. */
export const STOCK_MOVEMENT_HINTS: Record<"in" | "out" | "adjustment", string> = {
  in: "Soma ao estoque. Com o custo informado, o custo de compra do produto é atualizado.",
  out: "Tira do estoque: perda, vencimento, uso interno. Venda em comanda baixa sozinha.",
  adjustment: "Informe quanto foi CONTADO na prateleira. O sistema lança a diferença.",
}
