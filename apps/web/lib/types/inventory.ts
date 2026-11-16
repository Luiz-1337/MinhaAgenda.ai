/**
 * Tipos das telas de estoque (docs/ROADMAP.md, fase 4, fatia 4a).
 *
 * Atravessam a fronteira servidor → cliente: quantidade como string de coluna
 * numeric(12,3) (pode ser negativa), dinheiro como string de coluna numeric ou em
 * centavos inteiros (o que o servidor já somou).
 */
import type { InventoryProductRow, ManualStockMovementKind, StockMovementRow, StockStatus } from "@repo/db"

export interface InventoryProductDTO extends InventoryProductRow {
  status: StockStatus
  /** Sugestão de compra: quanto falta para voltar ao mínimo (numeric como string). */
  suggestion: string
  /** Valor do saldo a custo, em centavos. */
  valueCents: number
}

export type StockMovementDTO = StockMovementRow

export interface InventoryFilters {
  /** Mostra só a movimentação deste produto. */
  productId?: string
}

export interface InventoryDTO {
  products: InventoryProductDTO[]
  totals: {
    /** Produtos com o controle ligado. */
    tracked: number
    /** Controlados que estão abaixo do mínimo, zerados ou negativos. */
    toBuy: number
    /** Valor de tudo o que há em estoque, a custo, em centavos. */
    valueCents: number
  }
  movements: StockMovementDTO[]
  movementsTruncated: boolean
  /** Produto filtrado na movimentação. NULL = todos. */
  productId: string | null
  /** Cortesias de tela — a trava é no servidor. */
  can: { move: boolean; manage: boolean }
}

export interface CreateStockMovementInput {
  salonId: string
  productId: string
  kind: ManualStockMovementKind
  /** Entrada e saída: quanto entrou ou saiu. Acerto: quanto FOI CONTADO. */
  quantity: number
  /** Só em entrada. */
  unitCost?: number | null
  notes?: string | null
}

export interface SaveProductStockSettingsInput {
  salonId: string
  productId: string
  trackStock: boolean
  minStock: number
  costPrice?: number | null
  sku?: string | null
  barcode?: string | null
}
