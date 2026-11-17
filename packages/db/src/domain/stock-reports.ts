/**
 * Relatórios de estoque — regra pura, sem I/O (docs/ROADMAP.md, fase 4, fatia 4f).
 *
 * Dois relatórios, os dois por período:
 *
 *   - movimentação: por produto, com quanto começou, o que entrou, o que saiu por
 *     cada motivo e com quanto terminou;
 *   - produtos consumidos: o que os atendimentos gastaram de cada produto, e em
 *     quais serviços.
 *
 * O serviço soma no banco (por produto e tipo); estas funções montam as linhas.
 * Quantidade em milésimos inteiros e dinheiro em centavos, como no resto do estoque.
 *
 * VALOR: o movimento de venda, de consumo e de retirada não guarda o custo da hora.
 * Todo valor daqui é quantidade × custo de compra ATUAL do produto — uma estimativa,
 * e a tela diz isso.
 */
import type { ProductContentUnit, StockMovementKind } from '../schema'
import { brazilToday, isCalendarDate } from './finance'
import { stockValueCents, toMilli } from './inventory'

// ============================================================================
// Período
// ============================================================================

/** Teto do período: um ano. Acima disso a consulta varre movimento demais. */
export const MAX_REPORT_DAYS = 366

export type ReportPeriodPlan = { ok: true; from: string; to: string } | { ok: false; error: string }

function daysBetweenDates(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/**
 * O período de um relatório. Sem datas, do primeiro dia do mês corrente até hoje
 * (em Brasília). Datas invertidas são trocadas, como no extrato de comissões.
 */
export function planReportPeriod(draft: { from?: string | null; to?: string | null }, now: Date): ReportPeriodPlan {
  const today = brazilToday(now)
  let from = draft.from || `${today.slice(0, 7)}-01`
  let to = draft.to || today

  if (!isCalendarDate(from) || !isCalendarDate(to)) return { ok: false, error: 'Data inválida' }
  if (from > to) [from, to] = [to, from]
  if (daysBetweenDates(from, to) + 1 > MAX_REPORT_DAYS) {
    return { ok: false, error: 'O período do relatório é de no máximo um ano' }
  }
  return { ok: true, from, to }
}

// ============================================================================
// Movimentação por período
// ============================================================================

export type ReportProduct = {
  id: string
  name: string
  trackStock: boolean
  costPrice: string | null
  contentAmount: string | null
  contentUnit: ProductContentUnit | null
}

/** Soma (com sinal) dos movimentos de um produto, de um tipo, dentro do período. */
export type MovementAggregate = { productId: string; kind: StockMovementKind; quantity: string }

export type MovementReportRow = {
  productId: string
  name: string
  /** Saldo antes do primeiro dia do período. Pode ser negativo. */
  openingMilli: number
  /** Entradas manuais + compras. */
  inMilli: number
  /** As saídas, em números positivos. */
  soldMilli: number
  consumedMilli: number
  requestedMilli: number
  outMilli: number
  /** Acertos de inventário, com sinal. */
  adjustmentMilli: number
  closingMilli: number
  /** Entradas × custo atual. */
  inValueCents: number
  /** Venda + consumo + retirada + saída × custo atual. */
  outValueCents: number
}

export type MovementReport = {
  rows: MovementReportRow[]
  totals: { products: number; inValueCents: number; outValueCents: number }
}

/**
 * Monta o relatório de movimentação. Entra no relatório o produto que teve
 * movimento no período ou que começou o período com saldo; produto parado e
 * zerado não aparece.
 */
export function buildMovementReport(input: {
  products: readonly ReportProduct[]
  /** Saldo de cada produto ANTES do período (soma dos movimentos anteriores). */
  openings: ReadonlyMap<string, string>
  aggregates: readonly MovementAggregate[]
}): MovementReport {
  const byProduct = new Map<string, Map<StockMovementKind, number>>()
  for (const aggregate of input.aggregates) {
    const kinds = byProduct.get(aggregate.productId) ?? new Map<StockMovementKind, number>()
    kinds.set(aggregate.kind, (kinds.get(aggregate.kind) ?? 0) + (toMilli(aggregate.quantity) ?? 0))
    byProduct.set(aggregate.productId, kinds)
  }

  const rows: MovementReportRow[] = []
  for (const product of input.products) {
    const kinds = byProduct.get(product.id)
    const openingMilli = toMilli(input.openings.get(product.id)) ?? 0
    if (!kinds && openingMilli === 0) continue

    const sum = (kind: StockMovementKind) => kinds?.get(kind) ?? 0
    const inMilli = sum('in') + sum('purchase')
    // Saída é gravada negativa; o relatório mostra positivo.
    const soldMilli = -sum('sale')
    const consumedMilli = -sum('consumption')
    const requestedMilli = -sum('request')
    const outMilli = -sum('out')
    const adjustmentMilli = sum('adjustment')
    const leftMilli = soldMilli + consumedMilli + requestedMilli + outMilli

    rows.push({
      productId: product.id,
      name: product.name,
      openingMilli,
      inMilli,
      soldMilli,
      consumedMilli,
      requestedMilli,
      outMilli,
      adjustmentMilli,
      closingMilli: openingMilli + inMilli - leftMilli + adjustmentMilli,
      inValueCents: stockValueCents({ quantityMilli: inMilli, costPrice: product.costPrice }),
      outValueCents: stockValueCents({ quantityMilli: leftMilli, costPrice: product.costPrice }),
    })
  }

  return {
    rows,
    totals: {
      products: rows.length,
      inValueCents: rows.reduce((total, row) => total + row.inValueCents, 0),
      outValueCents: rows.reduce((total, row) => total + row.outValueCents, 0),
    },
  }
}

// ============================================================================
// Produtos consumidos
// ============================================================================

/** Consumo (soma negativa) de um produto por um serviço, dentro do período. */
export type ConsumptionAggregate = {
  productId: string
  /** NULL quando o item ou o serviço não existe mais. */
  serviceId: string | null
  serviceName: string | null
  quantity: string
  /** Quantos itens de comanda consumiram. */
  items: number
}

export type ConsumptionReportService = {
  serviceId: string | null
  serviceName: string | null
  items: number
  unitsMilli: number
  costCents: number
}

export type ConsumptionReportRow = {
  productId: string
  name: string
  contentUnit: ProductContentUnit | null
  /** Unidades de estoque consumidas. */
  unitsMilli: number
  /** O mesmo consumo na medida do produto (ml, g…), em milésimos. NULL se não é fracionado. */
  measureMilli: number | null
  costCents: number
  services: ConsumptionReportService[]
}

export type ConsumptionReport = { rows: ConsumptionReportRow[]; totalCostCents: number }

/** Unidades de estoque → a medida do produto fracionado. NULL se não é fracionado. */
export function unitsToMeasureMilli(unitsMilli: number, contentAmount: string | number | null): number | null {
  const contentMilli = toMilli(contentAmount)
  if (contentMilli === null || contentMilli <= 0) return null
  return Math.round((unitsMilli * contentMilli) / 1000)
}

/** Monta o relatório de consumo: o produto que mais custou vem primeiro. */
export function buildConsumptionReport(input: {
  products: readonly ReportProduct[]
  aggregates: readonly ConsumptionAggregate[]
}): ConsumptionReport {
  const productById = new Map(input.products.map((product) => [product.id, product]))
  const rowsByProduct = new Map<string, ConsumptionReportRow>()

  for (const aggregate of input.aggregates) {
    const product = productById.get(aggregate.productId)
    if (!product) continue
    const unitsMilli = -(toMilli(aggregate.quantity) ?? 0)
    if (unitsMilli <= 0) continue

    const row = rowsByProduct.get(product.id) ?? {
      productId: product.id,
      name: product.name,
      contentUnit: product.contentAmount === null ? null : product.contentUnit,
      unitsMilli: 0,
      measureMilli: null,
      costCents: 0,
      services: [],
    }
    row.unitsMilli += unitsMilli
    row.services.push({
      serviceId: aggregate.serviceId,
      serviceName: aggregate.serviceName,
      items: aggregate.items,
      unitsMilli,
      costCents: stockValueCents({ quantityMilli: unitsMilli, costPrice: product.costPrice }),
    })
    rowsByProduct.set(product.id, row)
  }

  const rows = Array.from(rowsByProduct.values()).map((row) => {
    const product = productById.get(row.productId)
    return {
      ...row,
      measureMilli: unitsToMeasureMilli(row.unitsMilli, product?.contentAmount ?? null),
      // Do total, não da soma das linhas: arredondar linha a linha perderia centavos.
      costCents: stockValueCents({ quantityMilli: row.unitsMilli, costPrice: product?.costPrice ?? null }),
      services: [...row.services].sort(
        (a, b) => b.unitsMilli - a.unitsMilli || (a.serviceName ?? '').localeCompare(b.serviceName ?? '', 'pt-BR')
      ),
    }
  })
  rows.sort((a, b) => b.costCents - a.costCents || a.name.localeCompare(b.name, 'pt-BR'))

  return { rows, totalCostCents: rows.reduce((total, row) => total + row.costCents, 0) }
}
