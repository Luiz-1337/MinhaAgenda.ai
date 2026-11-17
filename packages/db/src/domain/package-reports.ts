/**
 * Relatórios de pacotes e assinaturas — regra pura, sem I/O (docs/ROADMAP.md,
 * fase 5, fatia 5d).
 *
 *   - extrato de pacotes: o que foi VENDIDO e o que foi USADO no período, em
 *     ordem de data. A venda soma dinheiro que entrou; o uso mostra quanto desse
 *     dinheiro virou serviço prestado (o valor da sessão, fatia 5b).
 *   - vendas por assinatura: as cobranças faturadas no período, por plano.
 *
 * O serviço busca as linhas no banco; estas funções ordenam e somam. Dinheiro em
 * centavos inteiros. O período é o mesmo dos relatórios de estoque
 * (`planReportPeriod`, domain/stock-reports.ts).
 */
import { packageUseValue } from './packages'
import { toCents } from './sales'

// ============================================================================
// Extrato de pacotes
// ============================================================================

export type PackageSaleRow = {
  customerPackageId: string
  /** Dia da venda ("YYYY-MM-DD"). */
  day: string
  customerId: string
  customerName: string
  packageName: string
  saleId: string
  saleNumber: number
  /** O que o cliente pagou pelo pacote — numeric(12,2). */
  price: string
}

export type PackageUseRow = {
  saleItemId: string
  /** Dia da comanda que usou ("YYYY-MM-DD"). */
  day: string
  customerId: string
  customerName: string
  packageName: string
  /** O serviço ou produto usado. */
  description: string
  professionalName: string | null
  saleId: string
  saleNumber: number
  /** numeric(10,3) do item da comanda. */
  quantity: string
  /** Valor e sessões da linha do pacote: de onde sai o valor do que foi usado. */
  lineValue: string
  lineQuantity: number
}

export type PackageStatementEntry = {
  key: string
  kind: 'sale' | 'use'
  day: string
  customerId: string
  customerName: string
  packageName: string
  /** Só no uso: o que foi usado e por quem. */
  description: string | null
  professionalName: string | null
  /** Só no uso: sessões ou unidades. */
  quantity: number | null
  saleId: string
  saleNumber: number
  /** Venda: o preço do pacote. Uso: o valor das sessões usadas. */
  valueCents: number
}

export type PackageStatement = {
  entries: PackageStatementEntry[]
  totals: {
    soldCount: number
    soldCents: number
    /** Sessões e unidades usadas, somadas. */
    usedQuantity: number
    usedCents: number
  }
}

/**
 * Monta o extrato: vendas e usos do período numa lista só, do mais recente para o
 * mais antigo; no mesmo dia, pela comanda (a de número maior primeiro) e a venda
 * antes do uso.
 */
export function buildPackageStatement(input: {
  sales: readonly PackageSaleRow[]
  uses: readonly PackageUseRow[]
}): PackageStatement {
  const entries: PackageStatementEntry[] = []
  let soldCents = 0
  let usedCents = 0
  let usedQuantity = 0

  for (const sale of input.sales) {
    const valueCents = Math.max(0, toCents(sale.price) ?? 0)
    soldCents += valueCents
    entries.push({
      key: `sale:${sale.customerPackageId}`,
      kind: 'sale',
      day: sale.day,
      customerId: sale.customerId,
      customerName: sale.customerName,
      packageName: sale.packageName,
      description: null,
      professionalName: null,
      quantity: null,
      saleId: sale.saleId,
      saleNumber: sale.saleNumber,
      valueCents,
    })
  }

  for (const use of input.uses) {
    const quantity = Number(use.quantity)
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0
    const valueCents =
      toCents(
        packageUseValue({ lineValue: use.lineValue, lineQuantity: use.lineQuantity, usedQuantity: safeQuantity })
      ) ?? 0
    usedCents += valueCents
    usedQuantity += safeQuantity
    entries.push({
      key: `use:${use.saleItemId}`,
      kind: 'use',
      day: use.day,
      customerId: use.customerId,
      customerName: use.customerName,
      packageName: use.packageName,
      description: use.description,
      professionalName: use.professionalName,
      quantity: safeQuantity,
      saleId: use.saleId,
      saleNumber: use.saleNumber,
      valueCents,
    })
  }

  entries.sort(
    (a, b) =>
      b.day.localeCompare(a.day) ||
      b.saleNumber - a.saleNumber ||
      (a.kind === b.kind ? a.key.localeCompare(b.key) : a.kind === 'sale' ? -1 : 1)
  )

  return {
    entries,
    totals: { soldCount: input.sales.length, soldCents, usedQuantity, usedCents },
  }
}

// ============================================================================
// Vendas por assinatura
// ============================================================================

export type SubscriptionChargeRow = {
  periodId: string
  /** Dia da comanda que cobrou ("YYYY-MM-DD"). */
  day: string
  customerId: string
  customerName: string
  planId: string
  /** Nome do plano HOJE — o agrupamento. */
  planName: string
  /** Nome copiado na assinatura (pode ser o nome antigo do plano). */
  subscriptionName: string
  periodStart: string
  periodEnd: string
  saleId: string
  saleNumber: number
  /** O que foi cobrado — numeric(12,2). */
  amount: string
}

export type SubscriptionSalesReport = {
  plans: { planId: string; planName: string; charges: number; customers: number; amountCents: number }[]
  charges: {
    periodId: string
    day: string
    customerId: string
    customerName: string
    subscriptionName: string
    periodStart: string
    periodEnd: string
    saleId: string
    saleNumber: number
    amountCents: number
  }[]
  totals: { charges: number; customers: number; amountCents: number }
}

/**
 * As cobranças de assinatura do período: o total por plano (o que mais rendeu
 * primeiro) e a lista, da mais recente para a mais antiga.
 */
export function buildSubscriptionSalesReport(rows: readonly SubscriptionChargeRow[]): SubscriptionSalesReport {
  const plans = new Map<
    string,
    { planId: string; planName: string; charges: number; customerIds: Set<string>; amountCents: number }
  >()
  const customers = new Set<string>()
  let amountCents = 0

  const charges = rows.map((row) => {
    const cents = Math.max(0, toCents(row.amount) ?? 0)
    amountCents += cents
    customers.add(row.customerId)

    const plan = plans.get(row.planId) ?? {
      planId: row.planId,
      planName: row.planName,
      charges: 0,
      customerIds: new Set<string>(),
      amountCents: 0,
    }
    plan.charges += 1
    plan.customerIds.add(row.customerId)
    plan.amountCents += cents
    plans.set(row.planId, plan)

    return {
      periodId: row.periodId,
      day: row.day,
      customerId: row.customerId,
      customerName: row.customerName,
      subscriptionName: row.subscriptionName,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      saleId: row.saleId,
      saleNumber: row.saleNumber,
      amountCents: cents,
    }
  })

  charges.sort(
    (a, b) => b.day.localeCompare(a.day) || b.saleNumber - a.saleNumber || a.periodId.localeCompare(b.periodId)
  )

  return {
    plans: Array.from(plans.values())
      .map(({ customerIds, ...plan }) => ({ ...plan, customers: customerIds.size }))
      .sort((a, b) => b.amountCents - a.amountCents || a.planName.localeCompare(b.planName, 'pt-BR')),
    charges,
    totals: { charges: rows.length, customers: customers.size, amountCents },
  }
}
