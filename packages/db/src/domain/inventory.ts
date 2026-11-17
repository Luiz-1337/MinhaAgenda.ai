/**
 * Regra do estoque — pura, sem I/O (docs/ROADMAP.md, fase 4, fatia 4a).
 *
 * Mesmo desenho dos outros módulos: o serviço busca os dados, estas funções
 * decidem, o serviço grava.
 *
 * Quantidade em MILÉSIMOS inteiros (a coluna é numeric(12,3)), pelo mesmo motivo
 * do dinheiro em centavos: 0,1 + 0,2 não pode virar 0,30000000000000004 frascos.
 *
 * O saldo de um produto não é gravado em lugar nenhum: é a soma dos movimentos.
 * Por isso todo movimento tem SINAL — positivo entra, negativo sai.
 */
import { centsToNumeric, toCents } from './sales'

// ============================================================================
// Quantidade
// ============================================================================

/** Teto de uma quantidade digitada: pega erro de digitação e cabe em numeric(12,3). */
const MAX_QUANTITY_MILLI = 1_000_000_000 // 1.000.000 unidades

/** Quantidade (número ou string de coluna numeric) → milésimos inteiros. NULL se não for número. */
export function toMilli(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return null
  return Math.round(number * 1000)
}

/** Milésimos → string para coluna numeric(12,3). Aceita negativo. */
export function milliToNumeric(milli: number): string {
  const sign = milli < 0 ? '-' : ''
  const abs = Math.abs(milli)
  return `${sign}${Math.floor(abs / 1000)}.${String(abs % 1000).padStart(3, '0')}`
}

// ============================================================================
// Situação do produto
// ============================================================================

/**
 * untracked = o salão não controla o estoque deste produto
 * negative  = saiu mais do que entrou (venda sem saldo, entrada não lançada)
 * out       = zerado
 * low       = abaixo do mínimo
 * ok        = no mínimo ou acima
 */
export type StockStatus = 'untracked' | 'negative' | 'out' | 'low' | 'ok'

export function stockStatus(input: { trackStock: boolean; quantityMilli: number; minMilli: number }): StockStatus {
  if (!input.trackStock) return 'untracked'
  if (input.quantityMilli < 0) return 'negative'
  if (input.quantityMilli === 0) return 'out'
  // "Abaixo do mínimo" é abaixo: ter exatamente o mínimo ainda não pede compra.
  if (input.quantityMilli < input.minMilli) return 'low'
  return 'ok'
}

/**
 * Sugestão de compra: quanto falta para voltar ao mínimo. Zero quando o produto
 * não é controlado, não tem mínimo ou já está nele.
 */
export function purchaseSuggestionMilli(input: {
  trackStock: boolean
  quantityMilli: number
  minMilli: number
}): number {
  if (!input.trackStock || input.minMilli <= 0) return 0
  return Math.max(0, input.minMilli - input.quantityMilli)
}

/** Valor do estoque a custo, em centavos. Saldo negativo ou sem custo não vale nada. */
export function stockValueCents(input: { quantityMilli: number; costPrice: string | number | null }): number {
  const costCents = toCents(input.costPrice)
  if (costCents === null || input.quantityMilli <= 0) return 0
  return Math.round((input.quantityMilli * costCents) / 1000)
}

// ============================================================================
// Movimento lançado na tela
// ============================================================================

/** O que a tela lança. A venda ('sale') nasce só do faturamento da comanda. */
export const MANUAL_STOCK_MOVEMENT_KINDS = ['in', 'out', 'adjustment'] as const
export type ManualStockMovementKind = (typeof MANUAL_STOCK_MOVEMENT_KINDS)[number]

const MAX_MOVEMENT_NOTES = 500
const MAX_UNIT_COST_CENTS = 100_000_000 // R$ 1.000.000,00

export type StockMovementPlan =
  | {
      ok: true
      kind: ManualStockMovementKind
      /** Com sinal: positivo entra, negativo sai. */
      quantity: string
      unitCost: string | null
      notes: string | null
      /** O saldo depois do movimento, em milésimos. */
      balanceMilli: number
    }
  | { ok: false; error: string }

/**
 * Valida uma entrada, uma saída ou um acerto e devolve o movimento a gravar.
 *
 *   - Entrada e saída: a quantidade digitada é sempre positiva; o tipo dá o sinal.
 *   - Acerto: a quantidade digitada é o que FOI CONTADO. Grava-se a diferença para
 *     o saldo atual — assim a soma dos movimentos continua sendo o saldo. Contar o
 *     que o sistema já mostra não é movimento.
 *   - Saída maior que o saldo é aceita (o produto já saiu); o saldo fica negativo e
 *     a tela avisa. Barrar aqui deixaria o estoque do sistema ainda mais longe do
 *     da prateleira.
 *   - Custo unitário só faz sentido na entrada.
 */
export function planStockMovement(
  draft: { kind: unknown; quantity: unknown; unitCost?: unknown; notes?: unknown },
  currentMilli: number
): StockMovementPlan {
  if (draft.kind !== 'in' && draft.kind !== 'out' && draft.kind !== 'adjustment') {
    return { ok: false, error: 'Escolha entrada, saída ou acerto' }
  }

  const typedMilli = typeof draft.quantity === 'number' ? toMilli(draft.quantity) : null
  if (typedMilli === null || typedMilli < 0 || typedMilli > MAX_QUANTITY_MILLI) {
    return { ok: false, error: 'Informe a quantidade' }
  }

  let deltaMilli: number
  if (draft.kind === 'adjustment') {
    deltaMilli = typedMilli - currentMilli
    if (deltaMilli === 0) return { ok: false, error: 'O estoque já está nesta quantidade' }
  } else {
    if (typedMilli === 0) return { ok: false, error: 'Informe uma quantidade maior que zero' }
    deltaMilli = draft.kind === 'in' ? typedMilli : -typedMilli
  }

  let unitCost: string | null = null
  if (draft.kind === 'in' && draft.unitCost !== null && draft.unitCost !== undefined && draft.unitCost !== '') {
    const costCents = typeof draft.unitCost === 'number' ? toCents(draft.unitCost) : null
    if (costCents === null || costCents < 0 || costCents > MAX_UNIT_COST_CENTS) {
      return { ok: false, error: 'Custo unitário inválido' }
    }
    unitCost = centsToNumeric(costCents)
  }

  const notes = typeof draft.notes === 'string' ? draft.notes.trim() : ''
  if (notes.length > MAX_MOVEMENT_NOTES) {
    return { ok: false, error: `A observação aceita no máximo ${MAX_MOVEMENT_NOTES} caracteres` }
  }

  return {
    ok: true,
    kind: draft.kind,
    quantity: milliToNumeric(deltaMilli),
    unitCost,
    notes: notes || null,
    balanceMilli: currentMilli + deltaMilli,
  }
}

// ============================================================================
// Controle de estoque do produto
// ============================================================================

const MAX_CODE_LENGTH = 60

export type ProductStockSettingsPlan =
  | {
      ok: true
      trackStock: boolean
      minStock: string
      costPrice: string | null
      sku: string | null
      barcode: string | null
    }
  | { ok: false; error: string }

/** Valida o controle de estoque de um produto: controlar ou não, mínimo, custo e códigos. */
export function planProductStockSettings(draft: {
  trackStock: unknown
  minStock?: unknown
  costPrice?: unknown
  sku?: unknown
  barcode?: unknown
}): ProductStockSettingsPlan {
  if (typeof draft.trackStock !== 'boolean') return { ok: false, error: 'Informe se o estoque é controlado' }

  const minMilli =
    draft.minStock === null || draft.minStock === undefined || draft.minStock === ''
      ? 0
      : typeof draft.minStock === 'number'
        ? toMilli(draft.minStock)
        : null
  if (minMilli === null || minMilli < 0 || minMilli > MAX_QUANTITY_MILLI) {
    return { ok: false, error: 'Estoque mínimo inválido' }
  }

  let costPrice: string | null = null
  if (draft.costPrice !== null && draft.costPrice !== undefined && draft.costPrice !== '') {
    const costCents = typeof draft.costPrice === 'number' ? toCents(draft.costPrice) : null
    if (costCents === null || costCents < 0 || costCents > MAX_UNIT_COST_CENTS) {
      return { ok: false, error: 'Custo de compra inválido' }
    }
    costPrice = centsToNumeric(costCents)
  }

  const sku = typeof draft.sku === 'string' ? draft.sku.trim() : ''
  const barcode = typeof draft.barcode === 'string' ? draft.barcode.trim() : ''
  if (sku.length > MAX_CODE_LENGTH) return { ok: false, error: 'Código muito longo' }
  if (barcode.length > MAX_CODE_LENGTH) return { ok: false, error: 'Código de barras muito longo' }

  return {
    ok: true,
    trackStock: draft.trackStock,
    minStock: milliToNumeric(minMilli),
    costPrice,
    sku: sku || null,
    barcode: barcode || null,
  }
}

// ============================================================================
// O que o faturamento de uma comanda baixa
// ============================================================================

export type SaleItemForStock = {
  id: string
  productId: string | null
  /** Coluna numeric(10,3). */
  quantity: string
}

export type PlannedSaleStockMovement = {
  saleItemId: string
  productId: string
  /** Sempre negativo: a venda tira do estoque. */
  quantity: string
}

/**
 * Uma baixa por item de PRODUTO CONTROLADO da comanda.
 *
 * Serviço não baixa nada, e produto sem controle de estoque também não — o salão
 * escolhe o que acompanha. O mesmo produto em dois itens gera duas baixas: cada
 * uma aponta para o seu item.
 */
export function planSaleStockMovements(
  items: readonly SaleItemForStock[],
  trackedProductIds: ReadonlySet<string>
): PlannedSaleStockMovement[] {
  const movements: PlannedSaleStockMovement[] = []

  for (const item of items) {
    if (!item.productId || !trackedProductIds.has(item.productId)) continue

    const milli = toMilli(item.quantity)
    if (milli === null || milli <= 0) continue

    movements.push({ saleItemId: item.id, productId: item.productId, quantity: milliToNumeric(-milli) })
  }

  return movements
}
