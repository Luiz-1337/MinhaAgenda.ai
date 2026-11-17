/**
 * Tipos das telas de estoque (docs/ROADMAP.md, fase 4, fatia 4a).
 *
 * Atravessam a fronteira servidor → cliente: quantidade como string de coluna
 * numeric(12,3) (pode ser negativa), dinheiro como string de coluna numeric ou em
 * centavos inteiros (o que o servidor já somou).
 */
import type {
  BatchRow,
  InventoryProductRow,
  ManualStockMovementKind,
  StockMovementRow,
  StockStatus,
} from "@repo/db"

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
  /** Marcas e categorias do salão, para classificar o produto (fatia 4b). */
  brands: { id: string; name: string }[]
  categories: { id: string; name: string }[]
  /** Lotes com produto na prateleira vencidos e vencendo (fatia 4c). */
  batchAlerts: { expired: number; expiring: number }
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
  /** Lote que veio com a entrada (fatia 4c). Só em entrada; todos opcionais. */
  batchCode?: string | null
  manufacturedOn?: string | null
  expiresOn?: string | null
}

export interface SaveProductStockSettingsInput {
  salonId: string
  productId: string
  trackStock: boolean
  minStock: number
  costPrice?: number | null
  sku?: string | null
  barcode?: string | null
  brandId?: string | null
  categoryId?: string | null
}

// ---------------------------------------------------------------------------
// Lotes e validades (fatia 4c)
// ---------------------------------------------------------------------------

export type BatchDTO = BatchRow

export interface BatchesDTO {
  batches: BatchDTO[]
  /** Lotes com produto na prateleira e validade vencida. */
  expired: number
  /** Lotes com produto na prateleira vencendo dentro do aviso. */
  expiring: number
  /** Com quantos dias de antecedência um lote passa a "vencendo". */
  warningDays: number
  /** Produtos com controle de estoque: os que aceitam lote. */
  products: { id: string; name: string }[]
  /** Hoje em Brasília, "YYYY-MM-DD". */
  today: string
  /** Cortesia de tela — a trava é no servidor. */
  can: { move: boolean }
}

export interface SaveBatchInput {
  salonId: string
  /** Ausente = lote novo (aí `productId` é obrigatório). */
  batchId?: string | null
  productId?: string | null
  code?: string | null
  manufacturedOn?: string | null
  expiresOn?: string | null
  /** O que entrou com o lote. */
  quantity: number
  notes?: string | null
}
