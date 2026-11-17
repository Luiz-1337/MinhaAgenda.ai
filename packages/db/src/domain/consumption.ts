/**
 * Regra do consumo de produtos por serviço e do fracionamento — pura, sem I/O
 * (docs/ROADMAP.md, fase 4, fatia 4d).
 *
 * Um serviço pode gastar produto a cada atendimento: o shampoo do lavatório, a
 * tinta da coloração. O salão diz quanto; faturar a comanda baixa o estoque.
 *
 * O estoque é contado em UNIDADES (frascos, tubos). O serviço gasta em unidade de
 * consumo (ml, g). O fracionamento do produto — "uma unidade equivale a 1000 ml" —
 * é a ponte: a baixa grava a FRAÇÃO de unidade que o atendimento gastou.
 *
 * Tudo em milésimos inteiros, como o resto do estoque.
 */
import { milliToNumeric, toMilli } from './inventory'
import { centsToNumeric, toCents } from './sales'

const MAX_QUANTITY_MILLI = 1_000_000_000 // 1.000.000

// ============================================================================
// Fracionamento do produto
// ============================================================================

export const PRODUCT_CONTENT_UNITS = ['ml', 'g', 'un'] as const
export type ProductContentUnitValue = (typeof PRODUCT_CONTENT_UNITS)[number]

export type ProductContentPlan =
  | { ok: true; contentAmount: string | null; contentUnit: ProductContentUnitValue | null }
  | { ok: false; error: string }

/**
 * Valida o fracionamento: quanto cabe em uma unidade e em que medida. Os dois
 * andam juntos — sem quantidade, o produto não é fracionado e a unidade é ignorada.
 */
export function planProductContent(draft: { contentAmount?: unknown; contentUnit?: unknown }): ProductContentPlan {
  if (draft.contentAmount === null || draft.contentAmount === undefined || draft.contentAmount === '') {
    return { ok: true, contentAmount: null, contentUnit: null }
  }

  const amountMilli = typeof draft.contentAmount === 'number' ? toMilli(draft.contentAmount) : null
  if (amountMilli === null || amountMilli <= 0 || amountMilli > MAX_QUANTITY_MILLI) {
    return { ok: false, error: 'Informe quanto cabe em uma unidade' }
  }

  const unit = PRODUCT_CONTENT_UNITS.find((value) => value === draft.contentUnit)
  if (!unit) return { ok: false, error: 'Escolha a unidade de consumo (ml, g ou un)' }

  return { ok: true, contentAmount: milliToNumeric(amountMilli), contentUnit: unit }
}

// ============================================================================
// O que um serviço consome
// ============================================================================

export const MAX_SERVICE_PRODUCTS = 30

export type ServiceConsumptionPlan =
  | { ok: true; items: { productId: string; quantity: string }[] }
  | { ok: false; error: string }

/**
 * Valida a lista de produtos que um serviço consome por atendimento.
 *
 * Lista vazia é válida: é como se tira o consumo de um serviço. Cada produto entra
 * uma vez; a quantidade é maior que zero, na unidade de consumo do produto (ou em
 * unidades, se ele não é fracionado).
 */
export function planServiceConsumption(items: unknown, productIds: ReadonlySet<string>): ServiceConsumptionPlan {
  if (!Array.isArray(items)) return { ok: false, error: 'Lista de produtos inválida' }
  if (items.length > MAX_SERVICE_PRODUCTS) {
    return { ok: false, error: `Um serviço aceita no máximo ${MAX_SERVICE_PRODUCTS} produtos` }
  }

  const seen = new Set<string>()
  const planned: { productId: string; quantity: string }[] = []

  for (const [index, raw] of items.entries()) {
    const line = index + 1
    const item = (raw ?? {}) as { productId?: unknown; quantity?: unknown }

    if (typeof item.productId !== 'string' || !productIds.has(item.productId)) {
      return { ok: false, error: `Produto ${line}: escolha o produto` }
    }
    if (seen.has(item.productId)) return { ok: false, error: `Produto ${line}: já está na lista` }
    seen.add(item.productId)

    const quantityMilli = typeof item.quantity === 'number' ? toMilli(item.quantity) : null
    if (quantityMilli === null || quantityMilli <= 0 || quantityMilli > MAX_QUANTITY_MILLI) {
      return { ok: false, error: `Produto ${line}: informe uma quantidade maior que zero` }
    }

    planned.push({ productId: item.productId, quantity: milliToNumeric(quantityMilli) })
  }

  return { ok: true, items: planned }
}

// ============================================================================
// Conversão: consumo → fração de unidade
// ============================================================================

/**
 * Quantas UNIDADES de estoque (em milésimos) um consumo representa.
 *
 *   - `perServiceMilli`: quanto um atendimento gasta (ml, g, ou unidades);
 *   - `timesMilli`: a quantidade do item da comanda (2 cortes = 2000);
 *   - `contentMilli`: quanto cabe em uma unidade; NULL = produto não fracionado, o
 *     consumo já está em unidades.
 *
 * Arredonda para o milésimo de unidade. Um consumo tão pequeno que arredonda para
 * zero devolve zero — quem chama não gera movimento.
 */
export function consumptionUnitsMilli(perServiceMilli: number, timesMilli: number, contentMilli: number | null): number {
  if (perServiceMilli <= 0 || timesMilli <= 0) return 0
  // (milésimos de consumo × milésimos de vezes) / 1000 = milésimos de consumo total.
  const totalMilli = (perServiceMilli * timesMilli) / 1000
  if (contentMilli === null) return Math.round(totalMilli)
  if (contentMilli <= 0) return 0
  return Math.round((totalMilli * 1000) / contentMilli)
}

/**
 * Custo estimado do que UM atendimento consome de um produto, em centavos: a fração
 * de unidade gasta × o custo de compra da unidade. Sem custo cadastrado, zero.
 */
export function consumptionCostCents(input: {
  perServiceMilli: number
  contentMilli: number | null
  costPrice: string | number | null
}): number {
  const costCents = toCents(input.costPrice)
  if (costCents === null || input.perServiceMilli <= 0) return 0
  if (input.contentMilli === null) return Math.round((input.perServiceMilli * costCents) / 1000)
  if (input.contentMilli <= 0) return 0
  return Math.round((input.perServiceMilli * costCents) / input.contentMilli)
}

// ============================================================================
// Custo do atendimento (fatia 3e)
// ============================================================================

const MAX_ADDITIONAL_COST_CENTS = 100_000_000 // R$ 1.000.000,00

export type AdditionalCostPlan = { ok: true; additionalCost: string } | { ok: false; error: string }

/** Valida o custo adicional de um serviço. Vazio = zero. */
export function planAdditionalCost(value: unknown): AdditionalCostPlan {
  if (value === null || value === undefined || value === '') return { ok: true, additionalCost: '0.00' }
  const cents = typeof value === 'number' ? toCents(value) : null
  if (cents === null || cents < 0 || cents > MAX_ADDITIONAL_COST_CENTS) {
    return { ok: false, error: 'Custo adicional inválido' }
  }
  return { ok: true, additionalCost: centsToNumeric(cents) }
}

/**
 * Quanto custa UM atendimento de um serviço, em centavos: o custo adicional
 * cadastrado no serviço + o custo estimado de cada produto que ele consome.
 *
 * É este número que a tela de consumo mostra e que a comissão usa (fatia 3e). O
 * produto sem controle de estoque também conta: o custo existe mesmo que o salão
 * não acompanhe o saldo.
 */
export function serviceCostCents(input: {
  additionalCost: string | number | null
  lines: readonly { perServiceMilli: number; contentMilli: number | null; costPrice: string | number | null }[]
}): number {
  const additional = Math.max(0, toCents(input.additionalCost) ?? 0)
  return input.lines.reduce((sum, line) => sum + consumptionCostCents(line), additional)
}

/** Custo de um ITEM de comanda: o custo de um atendimento × a quantidade do item. */
export function itemCostCents(perServiceCents: number, quantity: string | number): number {
  const timesMilli = toMilli(quantity)
  if (timesMilli === null || timesMilli <= 0 || perServiceCents <= 0) return 0
  return Math.round((perServiceCents * timesMilli) / 1000)
}

// ============================================================================
// O que o faturamento de uma comanda consome
// ============================================================================

export type ServiceItemForConsumption = {
  id: string
  serviceId: string | null
  /** Coluna numeric(10,3). */
  quantity: string
}

export type ConsumptionRecipeLine = {
  productId: string
  /** Por atendimento, coluna numeric(12,3). */
  quantity: string
}

export type ProductForConsumption = {
  trackStock: boolean
  /** Coluna numeric(12,3). NULL = não fracionado. */
  contentAmount: string | null
}

export type PlannedConsumptionMovement = {
  saleItemId: string
  productId: string
  /** Sempre negativo, em unidades de estoque. */
  quantity: string
}

/**
 * Uma baixa por (item de serviço × produto consumido).
 *
 * Só produto com controle de estoque baixa — o salão escolhe o que acompanha. Item
 * de serviço sem consumo cadastrado não gera nada. Consumo que arredonda para zero
 * unidades também não: movimento zerado não é movimento.
 */
export function planSaleConsumptionMovements(
  items: readonly ServiceItemForConsumption[],
  recipes: ReadonlyMap<string, readonly ConsumptionRecipeLine[]>,
  products: ReadonlyMap<string, ProductForConsumption>
): PlannedConsumptionMovement[] {
  const movements: PlannedConsumptionMovement[] = []

  for (const item of items) {
    if (!item.serviceId) continue
    const recipe = recipes.get(item.serviceId)
    if (!recipe) continue

    const timesMilli = toMilli(item.quantity)
    if (timesMilli === null || timesMilli <= 0) continue

    for (const line of recipe) {
      const product = products.get(line.productId)
      if (!product || !product.trackStock) continue

      const unitsMilli = consumptionUnitsMilli(
        toMilli(line.quantity) ?? 0,
        timesMilli,
        product.contentAmount === null ? null : toMilli(product.contentAmount)
      )
      if (unitsMilli <= 0) continue

      movements.push({ saleItemId: item.id, productId: line.productId, quantity: milliToNumeric(-unitsMilli) })
    }
  }

  return movements
}
