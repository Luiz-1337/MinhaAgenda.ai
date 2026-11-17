import { and, asc, eq, sql } from "drizzle-orm"

import { db, products, saleItems, services, stockMovements } from "../index"
import {
  buildConsumptionReport,
  buildMovementReport,
  type ConsumptionReport,
  type MovementReport,
} from "../domain/stock-reports"

/**
 * Relatórios de estoque (docs/ROADMAP.md, fase 4, fatia 4f).
 *
 * Só leitura: soma os movimentos no banco e entrega para a regra pura
 * (domain/stock-reports.ts) montar as linhas. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`.
 *
 * O período é em dias de Brasília. `created_at` é timestamp sem fuso, gravado em
 * UTC — o mesmo tratamento do financeiro.
 */

/** O dia de Brasília em que o movimento aconteceu. */
const movementDay = sql<string>`(${stockMovements.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date`

export type StockReports = { movements: MovementReport; consumption: ConsumptionReport }

/** Os dois relatórios do período `from`–`to` ("YYYY-MM-DD", já validado). */
export async function getStockReportsService(input: {
  salonId: string
  from: string
  to: string
}): Promise<StockReports> {
  const inSalon = eq(stockMovements.salonId, input.salonId)
  const inPeriod = sql`${movementDay} BETWEEN ${input.from}::date AND ${input.to}::date`

  const [productRows, openingRows, periodRows, consumptionRows] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        trackStock: products.trackStock,
        costPrice: products.costPrice,
        contentAmount: products.contentAmount,
        contentUnit: products.contentUnit,
      })
      .from(products)
      .where(eq(products.salonId, input.salonId))
      .orderBy(asc(products.name)),

    // Saldo antes do período: tudo o que aconteceu até a véspera.
    db
      .select({
        productId: stockMovements.productId,
        quantity: sql<string>`sum(${stockMovements.quantity})::numeric(14,3)::text`,
      })
      .from(stockMovements)
      .where(and(inSalon, sql`${movementDay} < ${input.from}::date`))
      .groupBy(stockMovements.productId),

    db
      .select({
        productId: stockMovements.productId,
        kind: stockMovements.kind,
        quantity: sql<string>`sum(${stockMovements.quantity})::numeric(14,3)::text`,
      })
      .from(stockMovements)
      .where(and(inSalon, inPeriod))
      .groupBy(stockMovements.productId, stockMovements.kind),

    // Consumo por serviço. LEFT JOIN: o movimento conta mesmo que o serviço tenha
    // sido apagado depois.
    db
      .select({
        productId: stockMovements.productId,
        serviceId: services.id,
        serviceName: services.name,
        quantity: sql<string>`sum(${stockMovements.quantity})::numeric(14,3)::text`,
        items: sql<number>`count(*)::int`,
      })
      .from(stockMovements)
      .leftJoin(
        saleItems,
        and(eq(saleItems.id, stockMovements.saleItemId), eq(saleItems.salonId, input.salonId))
      )
      .leftJoin(services, and(eq(services.id, saleItems.serviceId), eq(services.salonId, input.salonId)))
      .where(and(inSalon, inPeriod, eq(stockMovements.kind, "consumption")))
      .groupBy(stockMovements.productId, services.id, services.name),
  ])

  return {
    movements: buildMovementReport({
      products: productRows,
      openings: new Map(openingRows.map((row) => [row.productId, row.quantity])),
      aggregates: periodRows,
    }),
    consumption: buildConsumptionReport({ products: productRows, aggregates: consumptionRows }),
  }
}
