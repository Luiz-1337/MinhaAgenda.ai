import { and, asc, eq, sql } from "drizzle-orm"

import { customers, db, products, professionals, saleItems, sales, services } from "../index"
import {
  buildCustomerRanking,
  buildProfessionalRanking,
  buildReferralReport,
  buildSoldItemsReport,
  type CustomerRanking,
  type ProfessionalRankingRow,
  type ReferralReport,
  type SoldItem,
  type SoldItemsReport,
} from "../domain/sales-reports"
import { toCents } from "../domain/sales"

/**
 * Relatórios de vendas e rankings (docs/ROADMAP.md, fase 9, fatia 9d).
 *
 * Só leitura: busca as linhas e entrega para a regra pura
 * (domain/sales-reports.ts). Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`.
 *
 * Os dias são de Brasília. `sale_date` e `created_at` são timestamp sem fuso,
 * gravados em UTC.
 */

/** Teto de itens de comanda lidos. Acima disso a tela pede um período menor. */
export const SALES_REPORT_ROWS = 5000

const brazilDay = (column: unknown) =>
  sql<string>`(${column} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date`

/**
 * Os itens das comandas FATURADAS do período `from`–`to` ("YYYY-MM-DD", já
 * validado), pelo dia da comanda. Aberta, reaberta e excluída não contam.
 */
export async function listSoldItemsService(input: {
  salonId: string
  from: string
  to: string
}): Promise<{ items: SoldItem[]; truncated: boolean }> {
  const saleDay = brazilDay(sales.saleDate)

  const rows = await db
    .select({
      saleId: saleItems.saleId,
      kind: saleItems.kind,
      serviceId: saleItems.serviceId,
      productId: saleItems.productId,
      packageTemplateId: saleItems.packageTemplateId,
      description: saleItems.description,
      quantity: saleItems.quantity,
      total: saleItems.total,
      serviceName: services.name,
      productName: products.name,
      customerId: sales.customerId,
      customerName: customers.name,
      day: saleDay,
      professionalId: saleItems.professionalId,
      professionalName: professionals.name,
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(customers, eq(customers.id, sales.customerId))
    .leftJoin(services, eq(services.id, saleItems.serviceId))
    .leftJoin(products, eq(products.id, saleItems.productId))
    .leftJoin(professionals, eq(professionals.id, saleItems.professionalId))
    .where(
      and(
        eq(saleItems.salonId, input.salonId),
        eq(sales.salonId, input.salonId),
        eq(sales.status, "invoiced"),
        sql`${saleDay} BETWEEN ${input.from}::date AND ${input.to}::date`
      )
    )
    .orderBy(asc(sales.saleDate), asc(saleItems.position))
    .limit(SALES_REPORT_ROWS + 1)

  return {
    truncated: rows.length > SALES_REPORT_ROWS,
    items: rows.slice(0, SALES_REPORT_ROWS).map((row) => ({
      saleId: row.saleId,
      kind: row.kind,
      // Assinatura agrupa pelo nome gravado no item (o do plano no dia).
      refId: row.kind === "service" ? row.serviceId : row.kind === "product" ? row.productId : row.packageTemplateId,
      name: (row.kind === "service" ? row.serviceName : row.kind === "product" ? row.productName : null) ?? row.description,
      quantity: Number(row.quantity),
      totalCents: toCents(row.total) ?? 0,
      customerId: row.customerId,
      customerName: row.customerName,
      day: row.day,
      professionalId: row.professionalId,
      professionalName: row.professionalName,
    })),
  }
}

export type SalesPeriodReport =
  | { view: "items"; report: SoldItemsReport; truncated: boolean }
  | { view: "customers"; report: CustomerRanking; truncated: boolean }
  | { view: "professionals"; rows: ProfessionalRankingRow[]; truncated: boolean }

/** Um dos três relatórios que saem dos itens vendidos no período. */
export async function getSalesPeriodReportService(input: {
  salonId: string
  view: "items" | "customers" | "professionals"
  from: string
  to: string
}): Promise<SalesPeriodReport> {
  const { items, truncated } = await listSoldItemsService(input)
  if (input.view === "items") return { view: "items", report: buildSoldItemsReport(items), truncated }
  if (input.view === "customers") return { view: "customers", report: buildCustomerRanking(items), truncated }
  return { view: "professionals", rows: buildProfessionalRanking(items), truncated }
}

// ============================================================================
// Lista de produtos e serviços
// ============================================================================

export type CatalogService = {
  id: string
  name: string
  /** Minutos. `durationMax` preenchido = faixa de duração. */
  duration: number
  durationMax: number | null
  price: string
  priceType: string
  priceMin: string | null
  priceMax: string | null
  priceOnRequest: boolean
  /** Custo fixo por atendimento. */
  additionalCost: string
  isActive: boolean
}

export type CatalogProduct = {
  id: string
  name: string
  sku: string | null
  price: string
  costPrice: string | null
  professionalPrice: string | null
  trackStock: boolean
  isActive: boolean
}

/** O catálogo inteiro do salão, como está hoje. `null` = a pessoa não vê essa parte. */
export async function getCatalogListService(input: {
  salonId: string
  includeServices: boolean
  includeProducts: boolean
}): Promise<{ services: CatalogService[] | null; products: CatalogProduct[] | null }> {
  const [serviceRows, productRows] = await Promise.all([
    input.includeServices
      ? db
          .select({
            id: services.id,
            name: services.name,
            duration: services.duration,
            durationMax: services.durationMax,
            price: services.price,
            priceType: services.priceType,
            priceMin: services.priceMin,
            priceMax: services.priceMax,
            priceOnRequest: services.priceOnRequest,
            additionalCost: services.additionalCost,
            isActive: services.isActive,
          })
          .from(services)
          .where(and(eq(services.salonId, input.salonId), eq(services.isSystem, false)))
          .orderBy(asc(sql`lower(${services.name})`))
      : null,
    input.includeProducts
      ? db
          .select({
            id: products.id,
            name: products.name,
            sku: products.sku,
            price: products.price,
            costPrice: products.costPrice,
            professionalPrice: products.professionalPrice,
            trackStock: products.trackStock,
            isActive: products.isActive,
          })
          .from(products)
          .where(eq(products.salonId, input.salonId))
          .orderBy(asc(sql`lower(${products.name})`))
      : null,
  ])

  return { services: serviceRows, products: productRows }
}

// ============================================================================
// Indicação de clientes
// ============================================================================

/** "Como conheceu" dos clientes CADASTRADOS no período. */
export async function getReferralReportService(input: {
  salonId: string
  from: string
  to: string
}): Promise<ReferralReport> {
  const rows = await db
    .select({ source: customers.referralSource })
    .from(customers)
    .where(
      and(
        eq(customers.salonId, input.salonId),
        eq(customers.isSystem, false),
        sql`${brazilDay(customers.createdAt)} BETWEEN ${input.from}::date AND ${input.to}::date`
      )
    )

  return buildReferralReport(rows.map((row) => row.source))
}
