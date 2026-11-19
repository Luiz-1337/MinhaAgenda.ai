/**
 * Relatórios de vendas e rankings — regra pura, sem I/O (docs/ROADMAP.md, fase 9,
 * fatia 9d).
 *
 * Cinco relatórios: produtos e serviços vendidos, lista de produtos e serviços,
 * ranking de clientes, ranking de vendas (por profissional) e indicação de
 * clientes. O serviço busca as linhas; aqui se soma, agrupa e ordena.
 */

export const SALES_REPORT_VIEWS = ['items', 'customers', 'professionals', 'catalog', 'referrals'] as const

export type SalesReportView = (typeof SALES_REPORT_VIEWS)[number]

export const SALES_REPORT_VIEW_LABELS: Record<SalesReportView, string> = {
  items: 'Produtos e serviços vendidos',
  customers: 'Ranking de clientes',
  professionals: 'Ranking de vendas',
  catalog: 'Lista de produtos e serviços',
  referrals: 'Indicação de clientes',
}

export function parseSalesReportView(value: unknown): SalesReportView {
  return (SALES_REPORT_VIEWS as readonly string[]).includes(value as string) ? (value as SalesReportView) : 'items'
}

export const SOLD_ITEM_KINDS = ['service', 'product', 'package', 'subscription'] as const

export type SoldItemKind = (typeof SOLD_ITEM_KINDS)[number]

export const SOLD_ITEM_KIND_LABELS: Record<SoldItemKind, string> = {
  service: 'Serviço',
  product: 'Produto',
  package: 'Pacote',
  subscription: 'Assinatura',
}

/** Um item de comanda faturada, do período. */
export type SoldItem = {
  saleId: string
  kind: string
  /** O serviço, produto, pacote ou plano do catálogo. NULL = sem vínculo. */
  refId: string | null
  name: string
  quantity: number
  totalCents: number
  customerId: string
  customerName: string
  /** O dia da comanda, "AAAA-MM-DD". */
  day: string
  /** Quem executou o serviço ou vendeu o produto. NULL = ninguém marcado. */
  professionalId: string | null
  professionalName: string | null
}

function isKind(kind: string): kind is SoldItemKind {
  return (SOLD_ITEM_KINDS as readonly string[]).includes(kind)
}

// ============================================================================
// Produtos e serviços vendidos
// ============================================================================

export type SoldItemRow = {
  key: string
  kind: SoldItemKind
  name: string
  quantity: number
  /** Em quantas comandas apareceu. */
  sales: number
  revenueCents: number
  /** Parte do total vendido, em %. NULL quando o total é zero. */
  sharePercent: number | null
}

export type SoldItemsReport = {
  rows: SoldItemRow[]
  totalCents: number
  byKind: Record<SoldItemKind, number>
}

/** O que foi vendido, item a item. O que mais rendeu vem primeiro. */
export function buildSoldItemsReport(items: readonly SoldItem[]): SoldItemsReport {
  const rows = new Map<string, SoldItemRow & { saleIds: Set<string> }>()
  const byKind: Record<SoldItemKind, number> = { service: 0, product: 0, package: 0, subscription: 0 }
  let totalCents = 0

  for (const item of items) {
    if (!isKind(item.kind)) continue
    const key = `${item.kind}:${item.refId ?? `name:${item.name}`}`
    let row = rows.get(key)
    if (!row) {
      row = { key, kind: item.kind, name: item.name, quantity: 0, sales: 0, revenueCents: 0, sharePercent: null, saleIds: new Set() }
      rows.set(key, row)
    }
    row.quantity += item.quantity
    row.revenueCents += item.totalCents
    row.saleIds.add(item.saleId)
    byKind[item.kind] += item.totalCents
    totalCents += item.totalCents
  }

  const list = [...rows.values()].map(({ saleIds, ...row }) => ({
    ...row,
    sales: saleIds.size,
    sharePercent: totalCents > 0 ? Math.round((row.revenueCents / totalCents) * 1000) / 10 : null,
  }))
  list.sort((a, b) => b.revenueCents - a.revenueCents || a.name.localeCompare(b.name, 'pt-BR'))
  return { rows: list, totalCents, byKind }
}

// ============================================================================
// Ranking de clientes
// ============================================================================

export const RANKING_ROWS = 100

export type CustomerRankingRow = {
  customerId: string
  name: string
  /** Comandas faturadas no período. */
  sales: number
  totalCents: number
  /** Total ÷ comandas. */
  averageCents: number
  /** O dia da comanda mais recente do período. */
  lastDay: string
}

export type CustomerRanking = {
  rows: CustomerRankingRow[]
  /** Quantos clientes compraram no período (a lista mostra só os primeiros). */
  customers: number
  totalCents: number
}

/** Quem mais gastou no período. Empate: quem veio mais vezes, depois o nome. */
export function buildCustomerRanking(items: readonly SoldItem[]): CustomerRanking {
  const rows = new Map<string, CustomerRankingRow & { saleIds: Set<string> }>()
  let totalCents = 0

  for (const item of items) {
    let row = rows.get(item.customerId)
    if (!row) {
      row = { customerId: item.customerId, name: item.customerName, sales: 0, totalCents: 0, averageCents: 0, lastDay: item.day, saleIds: new Set() }
      rows.set(item.customerId, row)
    }
    row.totalCents += item.totalCents
    row.saleIds.add(item.saleId)
    if (item.day > row.lastDay) row.lastDay = item.day
    totalCents += item.totalCents
  }

  const list = [...rows.values()].map(({ saleIds, ...row }) => ({
    ...row,
    sales: saleIds.size,
    averageCents: saleIds.size > 0 ? Math.round(row.totalCents / saleIds.size) : 0,
  }))
  list.sort((a, b) => b.totalCents - a.totalCents || b.sales - a.sales || a.name.localeCompare(b.name, 'pt-BR'))
  return { rows: list.slice(0, RANKING_ROWS), customers: list.length, totalCents }
}

// ============================================================================
// Ranking de vendas (por profissional)
// ============================================================================

export type ProfessionalRankingRow = {
  /** NULL = itens sem profissional marcado. */
  professionalId: string | null
  name: string
  /** Serviços realizados. */
  serviceQuantity: number
  serviceCents: number
  /** Produtos vendidos. */
  productQuantity: number
  productCents: number
  totalCents: number
}

/**
 * Quem mais realizou serviços e quem mais vendeu produtos. Só serviço e produto:
 * pacote e assinatura não têm executor. Itens sem profissional ficam numa linha
 * própria, no fim.
 */
export function buildProfessionalRanking(items: readonly SoldItem[]): ProfessionalRankingRow[] {
  const rows = new Map<string, ProfessionalRankingRow>()

  for (const item of items) {
    if (item.kind !== 'service' && item.kind !== 'product') continue
    const key = item.professionalId ?? ''
    let row = rows.get(key)
    if (!row) {
      row = {
        professionalId: item.professionalId,
        name: item.professionalName ?? 'Sem profissional',
        serviceQuantity: 0,
        serviceCents: 0,
        productQuantity: 0,
        productCents: 0,
        totalCents: 0,
      }
      rows.set(key, row)
    }
    if (item.kind === 'service') {
      row.serviceQuantity += item.quantity
      row.serviceCents += item.totalCents
    } else {
      row.productQuantity += item.quantity
      row.productCents += item.totalCents
    }
    row.totalCents += item.totalCents
  }

  return [...rows.values()].sort(
    (a, b) =>
      Number(a.professionalId === null) - Number(b.professionalId === null) ||
      b.totalCents - a.totalCents ||
      a.name.localeCompare(b.name, 'pt-BR')
  )
}

// ============================================================================
// Indicação de clientes
// ============================================================================

export type ReferralRow = { source: string; customers: number; sharePercent: number }

export type ReferralReport = {
  rows: ReferralRow[]
  /** Clientes cadastrados no período. */
  total: number
  /** Quantos têm "como conheceu" preenchido. */
  informed: number
}

/**
 * Como os clientes conheceram o salão. O campo é texto livre: junta o que só
 * difere por maiúscula, acento ou espaço ("Instagram", "instagram ") e mostra a
 * grafia mais usada. A parte é sobre quem informou.
 */
export function buildReferralReport(sources: readonly (string | null)[]): ReferralReport {
  const groups = new Map<string, Map<string, number>>()
  let informed = 0

  for (const raw of sources) {
    const label = (raw ?? '').trim().replace(/\s+/g, ' ')
    if (!label) continue
    informed += 1
    const key = label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
    const spellings = groups.get(key) ?? new Map<string, number>()
    spellings.set(label, (spellings.get(label) ?? 0) + 1)
    groups.set(key, spellings)
  }

  const rows = [...groups.values()].map((spellings) => {
    const customers = [...spellings.values()].reduce((sum, count) => sum + count, 0)
    const [source] = [...spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))[0]
    return { source, customers, sharePercent: Math.round((customers / informed) * 1000) / 10 }
  })
  rows.sort((a, b) => b.customers - a.customers || a.source.localeCompare(b.source, 'pt-BR'))
  return { rows, total: sources.length, informed }
}
