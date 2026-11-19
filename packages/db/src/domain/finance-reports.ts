/**
 * Relatórios financeiros — regra pura, sem I/O (docs/ROADMAP.md, fase 9, fatia 9b).
 *
 * Três contas:
 *
 *  - Resultado líquido (de serviços e de produtos): o que cada item rendeu depois
 *    de tirar a taxa da forma de pagamento, a comissão e o custo.
 *  - Projeção de faturamento: o que está agendado e o que há a receber e a pagar,
 *    dia a dia, daqui para a frente.
 *  - Extrato de conta: o que entrou e saiu de uma conta, com o saldo corrido.
 *
 * Tudo em centavos inteiros. Quem busca as linhas é o serviço.
 */
import { addDaysToDate, brazilToday, isCalendarDate } from './finance'

// ============================================================================
// Resultado líquido
// ============================================================================

export type NetResultKind = 'service' | 'product'

/** Um item de comanda faturada, do período. Vêm os itens de TODOS os tipos. */
export type NetResultItem = {
  saleId: string
  kind: string
  /** O serviço ou o produto do catálogo. NULL = item sem vínculo (some do catálogo). */
  refId: string | null
  name: string
  quantity: number
  totalCents: number
  /** A comissão do item, somando profissional e auxiliar. */
  commissionCents: number
  /** O custo de UMA unidade, como está hoje no cadastro. NULL = sem custo cadastrado. */
  unitCostCents: number | null
  /** A soma das taxas das formas de pagamento da comanda inteira. */
  saleFeeCents: number
}

export type NetResultRow = {
  /** `refId`, ou o nome quando o item não tem vínculo com o catálogo. */
  key: string
  name: string
  quantity: number
  revenueCents: number
  feeCents: number
  commissionCents: number
  costCents: number
  netCents: number
  /** Resultado ÷ receita, em %. NULL quando a receita é zero. */
  marginPercent: number | null
  /** Sem custo no cadastro: o custo entrou como zero. */
  costMissing: boolean
}

export type NetResultTotals = Omit<NetResultRow, 'key' | 'name' | 'costMissing'>

export type NetResultReport = { rows: NetResultRow[]; totals: NetResultTotals }

/**
 * Reparte um valor entre pesos, sem perder centavo: cada um leva a parte inteira
 * da sua proporção, e os centavos que sobram vão um a um para quem teve a maior
 * sobra (empate: o primeiro).
 */
export function allocateByWeight(amountCents: number, weights: readonly number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0)
  if (!(total > 0) || amountCents === 0) return weights.map(() => 0)

  const exact = weights.map((weight) => (amountCents * Math.max(0, weight)) / total)
  const shares = exact.map((value) => Math.floor(value))
  let left = amountCents - shares.reduce((sum, share) => sum + share, 0)

  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index)
  for (const { index } of order) {
    if (left <= 0) break
    shares[index] += 1
    left -= 1
  }
  return shares
}

function margin(netCents: number, revenueCents: number): number | null {
  if (revenueCents === 0) return null
  return Math.round((netCents / revenueCents) * 1000) / 10
}

/**
 * O resultado líquido por serviço (ou por produto).
 *
 * - Receita: o total dos itens, já com desconto e cupom.
 * - Taxa: a taxa das formas de pagamento da comanda, repartida entre TODOS os
 *   itens dela (inclusive pacote e assinatura) na proporção do total de cada um.
 * - Comissão: a que o item gerou.
 * - Custo: o custo de uma unidade, hoje, × a quantidade.
 *
 * Quem mais rendeu vem primeiro.
 */
export function buildNetResult(items: readonly NetResultItem[], kind: NetResultKind): NetResultReport {
  // A taxa de cada item, comanda a comanda.
  const feeByItem = new Map<NetResultItem, number>()
  const bySale = new Map<string, NetResultItem[]>()
  for (const item of items) {
    const list = bySale.get(item.saleId)
    if (list) list.push(item)
    else bySale.set(item.saleId, [item])
  }
  for (const saleItems of bySale.values()) {
    const shares = allocateByWeight(
      saleItems[0].saleFeeCents,
      saleItems.map((item) => item.totalCents)
    )
    saleItems.forEach((item, index) => feeByItem.set(item, shares[index]))
  }

  const rows = new Map<string, NetResultRow>()
  for (const item of items) {
    if (item.kind !== kind) continue
    const key = item.refId ?? `name:${item.name}`
    let row = rows.get(key)
    if (!row) {
      row = {
        key,
        name: item.name,
        quantity: 0,
        revenueCents: 0,
        feeCents: 0,
        commissionCents: 0,
        costCents: 0,
        netCents: 0,
        marginPercent: null,
        costMissing: false,
      }
      rows.set(key, row)
    }
    row.quantity += item.quantity
    row.revenueCents += item.totalCents
    row.feeCents += feeByItem.get(item) ?? 0
    row.commissionCents += item.commissionCents
    if (item.unitCostCents === null) row.costMissing = true
    else row.costCents += Math.round(item.unitCostCents * item.quantity)
  }

  const totals: NetResultTotals = {
    quantity: 0,
    revenueCents: 0,
    feeCents: 0,
    commissionCents: 0,
    costCents: 0,
    netCents: 0,
    marginPercent: null,
  }
  const list = [...rows.values()]
  for (const row of list) {
    row.netCents = row.revenueCents - row.feeCents - row.commissionCents - row.costCents
    row.marginPercent = margin(row.netCents, row.revenueCents)
    totals.quantity += row.quantity
    totals.revenueCents += row.revenueCents
    totals.feeCents += row.feeCents
    totals.commissionCents += row.commissionCents
    totals.costCents += row.costCents
    totals.netCents += row.netCents
  }
  totals.marginPercent = margin(totals.netCents, totals.revenueCents)

  list.sort((a, b) => b.netCents - a.netCents || a.name.localeCompare(b.name, 'pt-BR'))
  return { rows: list, totals }
}

// ============================================================================
// Projeção de faturamento
// ============================================================================

export const PROJECTION_DEFAULT_DAYS = 30
export const PROJECTION_MAX_DAYS = 120

export type ProjectionPeriodPlan = { ok: true; from: string; to: string } | { ok: false; error: string }

/** A projeção começa sempre HOJE; só o último dia muda. Sem data, 30 dias. */
export function planProjectionPeriod(draft: { to?: string | null }, now: Date): ProjectionPeriodPlan {
  const from = brazilToday(now)
  const to = draft.to || addDaysToDate(from, PROJECTION_DEFAULT_DAYS)
  if (!isCalendarDate(to)) return { ok: false, error: 'Data inválida' }
  if (to < from) return { ok: false, error: 'A projeção é de hoje em diante' }
  if (to > addDaysToDate(from, PROJECTION_MAX_DAYS)) {
    return { ok: false, error: `A projeção vai até ${PROJECTION_MAX_DAYS} dias à frente` }
  }
  return { ok: true, from, to }
}

export type ProjectionInput = {
  /** Um por agendamento pendente ou confirmado, ainda sem comanda faturada. */
  appointments: readonly { day: string; priceCents: number | null }[]
  /** Lançamentos em aberto, pelo vencimento, já somados por dia. */
  receivables: readonly { day: string; cents: number }[]
  payables: readonly { day: string; cents: number }[]
}

export type ProjectionDay = {
  day: string
  appointments: number
  /** Quantos desses agendamentos são de serviço sem preço fechado. */
  unpriced: number
  scheduledCents: number
  receivableCents: number
  payableCents: number
  /** Agendado + a receber − a pagar. */
  netCents: number
}

export type ProjectionReport = { days: ProjectionDay[]; totals: Omit<ProjectionDay, 'day'> }

/** A projeção dia a dia. Só entram os dias em que há alguma coisa. */
export function buildRevenueProjection(input: ProjectionInput): ProjectionReport {
  const days = new Map<string, ProjectionDay>()
  const dayOf = (day: string): ProjectionDay => {
    let entry = days.get(day)
    if (!entry) {
      entry = { day, appointments: 0, unpriced: 0, scheduledCents: 0, receivableCents: 0, payableCents: 0, netCents: 0 }
      days.set(day, entry)
    }
    return entry
  }

  for (const appointment of input.appointments) {
    const entry = dayOf(appointment.day)
    entry.appointments += 1
    if (appointment.priceCents === null) entry.unpriced += 1
    else entry.scheduledCents += appointment.priceCents
  }
  for (const row of input.receivables) dayOf(row.day).receivableCents += row.cents
  for (const row of input.payables) dayOf(row.day).payableCents += row.cents

  const totals = { appointments: 0, unpriced: 0, scheduledCents: 0, receivableCents: 0, payableCents: 0, netCents: 0 }
  const list = [...days.values()].sort((a, b) => a.day.localeCompare(b.day))
  for (const entry of list) {
    entry.netCents = entry.scheduledCents + entry.receivableCents - entry.payableCents
    totals.appointments += entry.appointments
    totals.unpriced += entry.unpriced
    totals.scheduledCents += entry.scheduledCents
    totals.receivableCents += entry.receivableCents
    totals.payableCents += entry.payableCents
    totals.netCents += entry.netCents
  }
  return { days: list, totals }
}

// ============================================================================
// Extrato de conta
// ============================================================================

export type StatementEntry = {
  id: string
  /** O dia da baixa, em Brasília. */
  day: string
  description: string
  direction: 'in' | 'out'
  /** O que mexeu no saldo: o valor líquido, sempre positivo. */
  netCents: number
}

export type StatementRow = StatementEntry & { balanceCents: number }

export type AccountStatement = {
  /** O saldo antes do primeiro dia do período. */
  openingCents: number
  rows: StatementRow[]
  inCents: number
  outCents: number
  closingCents: number
}

/** O extrato: as baixas na ordem em que chegam (a mais antiga primeiro), com o saldo corrido. */
export function buildAccountStatement(input: {
  openingCents: number
  entries: readonly StatementEntry[]
}): AccountStatement {
  let balance = input.openingCents
  let inCents = 0
  let outCents = 0
  const rows = input.entries.map((entry) => {
    if (entry.direction === 'in') {
      balance += entry.netCents
      inCents += entry.netCents
    } else {
      balance -= entry.netCents
      outCents += entry.netCents
    }
    return { ...entry, balanceCents: balance }
  })
  return { openingCents: input.openingCents, rows, inCents, outCents, closingCents: balance }
}

// ============================================================================
// Qual relatório
// ============================================================================

export const FINANCE_REPORT_VIEWS = ['services', 'products', 'projection', 'statement'] as const

export type FinanceReportView = (typeof FINANCE_REPORT_VIEWS)[number]

export const FINANCE_REPORT_VIEW_LABELS: Record<FinanceReportView, string> = {
  services: 'Resultado líquido de serviços',
  products: 'Resultado líquido de produtos',
  projection: 'Projeção de faturamento',
  statement: 'Extrato de contas',
}

export function parseFinanceReportView(value: unknown): FinanceReportView {
  return (FINANCE_REPORT_VIEWS as readonly string[]).includes(value as string) ? (value as FinanceReportView) : 'services'
}
