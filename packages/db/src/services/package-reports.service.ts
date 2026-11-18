import { and, desc, eq, sql } from "drizzle-orm"

import {
  db,
  customerPackageItems,
  customerPackages,
  customerSubscriptionPeriods,
  customerSubscriptions,
  customers,
  professionals,
  saleItems,
  sales,
  subscriptionPlans,
} from "../index"
import {
  buildPackageStatement,
  buildSubscriptionSalesReport,
  type PackageStatement,
  type SubscriptionSalesReport,
} from "../domain/package-reports"

/**
 * Relatórios de pacotes e assinaturas (docs/ROADMAP.md, fase 5, fatia 5d).
 *
 * Só leitura: busca as linhas do período e entrega para a regra pura
 * (domain/package-reports.ts) ordenar e somar. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`.
 *
 * O período é em dias de Brasília. `sale_date` é timestamp sem fuso, gravado em
 * UTC — o mesmo tratamento dos relatórios de estoque.
 */

/** Teto de linhas de cada lista. Acima disso a tela pede um período menor. */
export const PACKAGE_REPORT_ROWS = 1000

/** O dia de Brasília da comanda. */
const saleDay = sql<string>`(${sales.saleDate} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date`

export type PackageReports = {
  statement: PackageStatement
  subscriptions: SubscriptionSalesReport
  /** Alguma das listas bateu no teto: os totais são só do que foi lido. */
  truncated: boolean
}

/** Os relatórios do período `from`–`to` ("YYYY-MM-DD", já validado). */
export async function getPackageReportsService(input: {
  salonId: string
  from: string
  to: string
}): Promise<PackageReports> {
  const saleInPeriod = sql`${saleDay} BETWEEN ${input.from}::date AND ${input.to}::date`
  const limit = PACKAGE_REPORT_ROWS + 1

  const [saleRows, useRows, chargeRows] = await Promise.all([
    // Pacotes vendidos: só existem com a comanda faturada.
    db
      .select({
        customerPackageId: customerPackages.id,
        day: customerPackages.soldOn,
        customerId: customers.id,
        customerName: customers.name,
        packageName: customerPackages.name,
        saleId: sales.id,
        saleNumber: sales.number,
        price: customerPackages.price,
      })
      .from(customerPackages)
      .innerJoin(customers, eq(customers.id, customerPackages.customerId))
      .innerJoin(sales, eq(sales.id, customerPackages.saleId))
      .where(
        and(
          eq(customerPackages.salonId, input.salonId),
          sql`${customerPackages.soldOn} BETWEEN ${input.from}::date AND ${input.to}::date`
        )
      )
      .orderBy(desc(customerPackages.soldOn), desc(sales.number))
      .limit(limit),

    // Usos: itens "do pacote" de comandas FATURADAS — é o faturamento que baixa o saldo.
    db
      .select({
        saleItemId: saleItems.id,
        day: saleDay,
        customerId: customers.id,
        customerName: customers.name,
        packageName: customerPackages.name,
        description: saleItems.description,
        professionalName: professionals.name,
        saleId: sales.id,
        saleNumber: sales.number,
        quantity: saleItems.quantity,
        lineValue: customerPackageItems.value,
        lineQuantity: customerPackageItems.quantity,
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .innerJoin(customerPackageItems, eq(customerPackageItems.id, saleItems.customerPackageItemId))
      .innerJoin(customerPackages, eq(customerPackages.id, customerPackageItems.customerPackageId))
      .innerJoin(customers, eq(customers.id, customerPackages.customerId))
      .leftJoin(professionals, eq(professionals.id, saleItems.professionalId))
      .where(
        and(
          eq(saleItems.salonId, input.salonId),
          eq(sales.salonId, input.salonId),
          eq(customerPackages.salonId, input.salonId),
          eq(sales.status, "invoiced"),
          saleInPeriod
        )
      )
      .orderBy(desc(saleDay), desc(sales.number))
      .limit(limit),

    // Cobranças de assinatura: os períodos pagos, pela data da comanda.
    db
      .select({
        periodId: customerSubscriptionPeriods.id,
        day: saleDay,
        customerId: customers.id,
        customerName: customers.name,
        planId: subscriptionPlans.id,
        planName: subscriptionPlans.name,
        subscriptionName: customerSubscriptions.name,
        periodStart: customerSubscriptionPeriods.periodStart,
        periodEnd: customerSubscriptionPeriods.periodEnd,
        saleId: sales.id,
        saleNumber: sales.number,
        amount: customerSubscriptionPeriods.amount,
      })
      .from(customerSubscriptionPeriods)
      .innerJoin(sales, eq(sales.id, customerSubscriptionPeriods.saleId))
      .innerJoin(customerSubscriptions, eq(customerSubscriptions.id, customerSubscriptionPeriods.subscriptionId))
      .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, customerSubscriptions.planId))
      .innerJoin(customers, eq(customers.id, customerSubscriptions.customerId))
      .where(
        and(
          eq(customerSubscriptionPeriods.salonId, input.salonId),
          eq(sales.salonId, input.salonId),
          eq(customerSubscriptions.salonId, input.salonId),
          saleInPeriod
        )
      )
      .orderBy(desc(saleDay), desc(sales.number))
      .limit(limit),
  ])

  return {
    statement: buildPackageStatement({
      sales: saleRows.slice(0, PACKAGE_REPORT_ROWS),
      uses: useRows.slice(0, PACKAGE_REPORT_ROWS),
    }),
    subscriptions: buildSubscriptionSalesReport(chargeRows.slice(0, PACKAGE_REPORT_ROWS)),
    truncated:
      saleRows.length > PACKAGE_REPORT_ROWS ||
      useRows.length > PACKAGE_REPORT_ROWS ||
      chargeRows.length > PACKAGE_REPORT_ROWS,
  }
}
