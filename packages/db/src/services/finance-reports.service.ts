import { and, asc, eq, inArray, sql } from "drizzle-orm"

import {
  appointments,
  db,
  financialAccounts,
  financialTransactions,
  products,
  saleItems,
  sales,
  services,
} from "../index"
import {
  buildAccountStatement,
  buildNetResult,
  buildRevenueProjection,
  type AccountStatement,
  type NetResultItem,
  type NetResultReport,
  type ProjectionReport,
  type StatementEntry,
} from "../domain/finance-reports"
import { toCents } from "../domain/sales"

/**
 * Relatórios financeiros (docs/ROADMAP.md, fase 9, fatia 9b).
 *
 * Só leitura: busca as linhas e entrega para a regra pura
 * (domain/finance-reports.ts) somar. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`.
 *
 * Os períodos são em dias de Brasília. `sale_date`, `date` e `paid_at` são
 * timestamp sem fuso, gravados em UTC — o mesmo tratamento dos outros relatórios.
 */

/** Teto de linhas lidas. Acima disso a tela pede um período menor. */
export const FINANCE_REPORT_ROWS = 5000

const brazilDay = (column: unknown) =>
  sql<string>`(${column} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date`

// ============================================================================
// Resultado líquido de serviços e de produtos
// ============================================================================

export type NetResultReports = {
  services: NetResultReport
  products: NetResultReport
  /** Bateu no teto de linhas: os totais são só do que foi lido. */
  truncated: boolean
}

/**
 * O resultado líquido do período `from`–`to` ("YYYY-MM-DD", já validado), pelo
 * dia da comanda. Só comandas FATURADAS: aberta, reaberta e excluída não contam.
 */
export async function getNetResultReportsService(input: {
  salonId: string
  from: string
  to: string
}): Promise<NetResultReports> {
  const rows = await db
    .select({
      saleId: saleItems.saleId,
      kind: saleItems.kind,
      serviceId: saleItems.serviceId,
      productId: saleItems.productId,
      description: saleItems.description,
      quantity: saleItems.quantity,
      total: saleItems.total,
      serviceName: services.name,
      serviceCost: services.additionalCost,
      productName: products.name,
      productCost: products.costPrice,
      commission: sql<string>`(
        select coalesce(sum(ce.amount), 0)::text from commission_entries ce
        where ce.sale_item_id = "sale_items"."id"
      )`,
      saleFee: sql<string>`(
        select coalesce(sum(sp.fee_amount), 0)::text from sale_payments sp
        where sp.sale_id = "sale_items"."sale_id"
      )`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .leftJoin(services, eq(services.id, saleItems.serviceId))
    .leftJoin(products, eq(products.id, saleItems.productId))
    .where(
      and(
        eq(saleItems.salonId, input.salonId),
        eq(sales.salonId, input.salonId),
        eq(sales.status, "invoiced"),
        sql`${brazilDay(sales.saleDate)} BETWEEN ${input.from}::date AND ${input.to}::date`
      )
    )
    .orderBy(asc(sales.saleDate), asc(saleItems.position))
    .limit(FINANCE_REPORT_ROWS + 1)

  const truncated = rows.length > FINANCE_REPORT_ROWS
  const items: NetResultItem[] = rows.slice(0, FINANCE_REPORT_ROWS).map((row) => {
    const isService = row.kind === "service"
    return {
      saleId: row.saleId,
      kind: row.kind,
      refId: isService ? row.serviceId : row.productId,
      name: (isService ? row.serviceName : row.productName) ?? row.description,
      quantity: Number(row.quantity),
      totalCents: toCents(row.total) ?? 0,
      commissionCents: toCents(row.commission) ?? 0,
      // Serviço: o custo fixo por atendimento (zero quando não há). Produto: o
      // custo de compra — sem ele, o relatório avisa em vez de inventar zero.
      unitCostCents: isService ? (toCents(row.serviceCost) ?? 0) : toCents(row.productCost),
      saleFeeCents: toCents(row.saleFee) ?? 0,
    }
  })

  return {
    services: buildNetResult(items, "service"),
    products: buildNetResult(items, "product"),
    truncated,
  }
}

// ============================================================================
// Projeção de faturamento
// ============================================================================

export type RevenueProjection = ProjectionReport & {
  /** Em aberto com vencimento ANTES de hoje: não entram nos dias. */
  overdueReceivableCents: number
  overduePayableCents: number
}

/** A projeção de `from` (hoje) a `to`, dia a dia. */
export async function getRevenueProjectionService(input: {
  salonId: string
  from: string
  to: string
}): Promise<RevenueProjection> {
  const appointmentDay = brazilDay(appointments.date)

  const [appointmentRows, openRows, overdueRows] = await Promise.all([
    // O que está marcado e ainda não virou comanda faturada (essa já está no
    // financeiro, como recebido ou a receber).
    db
      .select({
        day: appointmentDay,
        price: services.price,
        priceType: services.priceType,
        priceMin: services.priceMin,
        priceOnRequest: services.priceOnRequest,
      })
      .from(appointments)
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .where(
        and(
          eq(appointments.salonId, input.salonId),
          inArray(appointments.status, ["pending", "confirmed"]),
          eq(services.isSystem, false),
          sql`${appointmentDay} BETWEEN ${input.from}::date AND ${input.to}::date`,
          sql`not exists (
            select 1 from sale_items si
            join sales s on s.id = si.sale_id
            where si.appointment_id = "appointments"."id" and s.status = 'invoiced'
          )`
        )
      )
      .limit(FINANCE_REPORT_ROWS),
    db
      .select({
        day: financialTransactions.dueDate,
        direction: financialTransactions.direction,
        net: sql<string>`coalesce(sum(${financialTransactions.netAmount}), 0)::text`,
      })
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.salonId, input.salonId),
          eq(financialTransactions.status, "open"),
          sql`${financialTransactions.dueDate} BETWEEN ${input.from}::date AND ${input.to}::date`
        )
      )
      .groupBy(financialTransactions.dueDate, financialTransactions.direction),
    db
      .select({
        direction: financialTransactions.direction,
        net: sql<string>`coalesce(sum(${financialTransactions.netAmount}), 0)::text`,
      })
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.salonId, input.salonId),
          eq(financialTransactions.status, "open"),
          sql`${financialTransactions.dueDate} < ${input.from}::date`
        )
      )
      .groupBy(financialTransactions.direction),
  ])

  const report = buildRevenueProjection({
    appointments: appointmentRows.map((row) => {
      // Sob avaliação: sem valor. Faixa: o menor valor (a projeção não promete o maior).
      const price = row.priceOnRequest ? null : toCents(row.priceType === "range" ? (row.priceMin ?? row.price) : row.price)
      return { day: row.day, priceCents: price !== null && price > 0 ? price : null }
    }),
    receivables: openRows.filter((row) => row.direction === "in").map((row) => ({ day: row.day, cents: toCents(row.net) ?? 0 })),
    payables: openRows.filter((row) => row.direction === "out").map((row) => ({ day: row.day, cents: toCents(row.net) ?? 0 })),
  })

  const overdue = (direction: "in" | "out") =>
    toCents(overdueRows.find((row) => row.direction === direction)?.net ?? "0") ?? 0

  return { ...report, overdueReceivableCents: overdue("in"), overduePayableCents: overdue("out") }
}

// ============================================================================
// Extrato de contas
// ============================================================================

export type AccountStatementReport = {
  accounts: { id: string; name: string; isActive: boolean }[]
  /** A conta do extrato. NULL = o salão não tem conta (ou a pedida não é dele). */
  accountId: string | null
  statement: AccountStatement | null
  truncated: boolean
}

/**
 * O extrato de UMA conta no período, pelo dia da baixa. Sem `accountId`, a
 * primeira conta ativa em ordem alfabética. Transferências entram: são dinheiro
 * que entrou ou saiu da conta.
 */
export async function getAccountStatementService(input: {
  salonId: string
  accountId?: string | null
  from: string
  to: string
}): Promise<AccountStatementReport> {
  const accounts = await db
    .select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      isActive: financialAccounts.isActive,
      openingBalance: financialAccounts.openingBalance,
    })
    .from(financialAccounts)
    .where(eq(financialAccounts.salonId, input.salonId))
    .orderBy(asc(sql`lower(${financialAccounts.name})`))

  const list = accounts.map(({ id, name, isActive }) => ({ id, name, isActive }))
  const account =
    (input.accountId ? accounts.find((item) => item.id === input.accountId) : undefined) ??
    (input.accountId ? undefined : (accounts.find((item) => item.isActive) ?? accounts[0]))
  if (!account) return { accounts: list, accountId: null, statement: null, truncated: false }

  const paidDay = brazilDay(financialTransactions.paidAt)
  const ofAccount = and(
    eq(financialTransactions.salonId, input.salonId),
    eq(financialTransactions.accountId, account.id),
    eq(financialTransactions.status, "paid")
  )

  const [before, rows] = await Promise.all([
    db
      .select({
        direction: financialTransactions.direction,
        net: sql<string>`coalesce(sum(${financialTransactions.netAmount}), 0)::text`,
      })
      .from(financialTransactions)
      .where(and(ofAccount, sql`${paidDay} < ${input.from}::date`))
      .groupBy(financialTransactions.direction),
    db
      .select({
        id: financialTransactions.id,
        day: paidDay,
        description: financialTransactions.description,
        direction: financialTransactions.direction,
        net: financialTransactions.netAmount,
      })
      .from(financialTransactions)
      .where(and(ofAccount, sql`${paidDay} BETWEEN ${input.from}::date AND ${input.to}::date`))
      .orderBy(asc(financialTransactions.paidAt), asc(financialTransactions.createdAt))
      .limit(FINANCE_REPORT_ROWS + 1),
  ])

  const sumBefore = (direction: "in" | "out") =>
    toCents(before.find((row) => row.direction === direction)?.net ?? "0") ?? 0

  const entries: StatementEntry[] = rows.slice(0, FINANCE_REPORT_ROWS).map((row) => ({
    id: row.id,
    day: row.day,
    description: row.description,
    direction: row.direction,
    netCents: toCents(row.net) ?? 0,
  }))

  return {
    accounts: list,
    accountId: account.id,
    statement: buildAccountStatement({
      openingCents: (toCents(account.openingBalance) ?? 0) + sumBefore("in") - sumBefore("out"),
      entries,
    }),
    truncated: rows.length > FINANCE_REPORT_ROWS,
  }
}
