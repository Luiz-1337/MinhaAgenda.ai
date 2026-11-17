import { and, asc, eq, inArray } from "drizzle-orm"

import { db, products, serviceProducts, services } from "../index"
import type { ProductContentUnit } from "../schema"
import {
  consumptionCostCents,
  planAdditionalCost,
  planServiceConsumption,
  serviceCostCents,
} from "../domain/consumption"
import { toMilli } from "../domain/inventory"
import { toCents } from "../domain/sales"
import type { ActionResult } from "./appointments"

/**
 * Produtos consumidos por serviço (docs/ROADMAP.md, fase 4, fatia 4d).
 *
 * Só I/O: carrega o que a regra pura (domain/consumption.ts) precisa, deixa ela
 * decidir e grava. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`. Os ids chegam do cliente; o
 * que não aparece na consulta escopada é tratado como inexistente.
 *
 * A baixa em si acontece no faturamento da comanda (recordSaleStock, em
 * inventory.service.ts).
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Executor = typeof db | Tx

class ConsumptionRuleError extends Error {}

function fail(message: string): never {
  throw new ConsumptionRuleError(message)
}

function toFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof ConsumptionRuleError) return { success: false, error: error.message }
  console.error(fallback, error)
  return { success: false, error: fallback }
}

export type ServiceConsumptionLine = {
  productId: string
  productName: string
  /** Por atendimento, na unidade de consumo do produto (numeric como string). */
  quantity: string
  /** NULL = produto não fracionado: a quantidade é em unidades. */
  contentUnit: ProductContentUnit | null
  /** Produto sem controle de estoque não baixa: a linha fica só no cadastro. */
  trackStock: boolean
  /** Custo estimado desta linha por atendimento, em centavos. */
  costCents: number
}

export type ServiceConsumptionRow = {
  serviceId: string
  serviceName: string
  isActive: boolean
  lines: ServiceConsumptionLine[]
  /** Custo fixo do serviço por atendimento (numeric como string). */
  additionalCost: string
  /** Custo de um atendimento, em centavos: custo adicional + produtos consumidos. */
  costCents: number
}

export type ConsumptionProductOption = {
  id: string
  name: string
  trackStock: boolean
  contentAmount: string | null
  contentUnit: ProductContentUnit | null
  costPrice: string | null
}

/** Os serviços do salão com o que cada um consome, e os produtos que podem ser consumidos. */
export async function listServiceConsumptionService(
  salonId: string
): Promise<{ services: ServiceConsumptionRow[]; products: ConsumptionProductOption[] }> {
  const [serviceRows, productRows, lineRows] = await Promise.all([
    db
      .select({
        id: services.id,
        name: services.name,
        isActive: services.isActive,
        additionalCost: services.additionalCost,
      })
      .from(services)
      .where(and(eq(services.salonId, salonId), eq(services.isSystem, false)))
      .orderBy(asc(services.name)),
    db
      .select({
        id: products.id,
        name: products.name,
        isActive: products.isActive,
        trackStock: products.trackStock,
        contentAmount: products.contentAmount,
        contentUnit: products.contentUnit,
        costPrice: products.costPrice,
      })
      .from(products)
      .where(eq(products.salonId, salonId))
      .orderBy(asc(products.name)),
    db
      .select({
        serviceId: serviceProducts.serviceId,
        productId: serviceProducts.productId,
        quantity: serviceProducts.quantity,
      })
      .from(serviceProducts)
      .where(eq(serviceProducts.salonId, salonId))
      .orderBy(asc(serviceProducts.createdAt)),
  ])

  const productById = new Map(productRows.map((product) => [product.id, product]))

  const linesByService = new Map<string, ServiceConsumptionLine[]>()
  for (const row of lineRows) {
    const product = productById.get(row.productId)
    if (!product) continue

    const lines = linesByService.get(row.serviceId) ?? []
    lines.push({
      productId: row.productId,
      productName: product.name,
      quantity: row.quantity,
      contentUnit: product.contentUnit,
      trackStock: product.trackStock,
      costCents: consumptionCostCents({
        perServiceMilli: toMilli(row.quantity) ?? 0,
        contentMilli: product.contentAmount === null ? null : toMilli(product.contentAmount),
        costPrice: product.costPrice,
      }),
    })
    linesByService.set(row.serviceId, lines)
  }

  return {
    services: serviceRows.map((service) => {
      const lines = linesByService.get(service.id) ?? []
      return {
        serviceId: service.id,
        serviceName: service.name,
        isActive: service.isActive,
        lines,
        additionalCost: service.additionalCost,
        costCents: lines.reduce((sum, line) => sum + line.costCents, toCents(service.additionalCost) ?? 0),
      }
    }),
    // Produto inativo não entra em consumo novo; o que já está cadastrado continua.
    products: productRows
      .filter((product) => product.isActive)
      .map(({ isActive: _isActive, ...product }) => product),
  }
}

/**
 * Quanto custa um atendimento de cada serviço, em centavos (custo adicional +
 * produtos consumidos). É o número que a comissão usa (fatia 3e). Serviço sem custo
 * nenhum não entra no mapa.
 */
export async function loadServiceCosts(
  executor: Executor,
  salonId: string,
  serviceIds: readonly string[]
): Promise<Map<string, number>> {
  const costs = new Map<string, number>()
  if (serviceIds.length === 0) return costs

  const ids = Array.from(new Set(serviceIds))
  const [serviceRows, lineRows] = await Promise.all([
    executor
      .select({ id: services.id, additionalCost: services.additionalCost })
      .from(services)
      .where(and(eq(services.salonId, salonId), inArray(services.id, ids))),
    executor
      .select({
        serviceId: serviceProducts.serviceId,
        quantity: serviceProducts.quantity,
        contentAmount: products.contentAmount,
        costPrice: products.costPrice,
      })
      .from(serviceProducts)
      .innerJoin(products, eq(products.id, serviceProducts.productId))
      .where(and(eq(serviceProducts.salonId, salonId), inArray(serviceProducts.serviceId, ids))),
  ])

  for (const service of serviceRows) {
    const cents = serviceCostCents({
      additionalCost: service.additionalCost,
      lines: lineRows
        .filter((line) => line.serviceId === service.id)
        .map((line) => ({
          perServiceMilli: toMilli(line.quantity) ?? 0,
          contentMilli: line.contentAmount === null ? null : toMilli(line.contentAmount),
          costPrice: line.costPrice,
        })),
    })
    if (cents > 0) costs.set(service.id, cents)
  }

  return costs
}

/**
 * Grava o que um serviço consome por atendimento e, com `additionalCost`, o custo
 * fixo dele. A lista substitui a anterior inteira; lista vazia tira o consumo do
 * serviço.
 */
export async function saveServiceConsumptionService(input: {
  salonId: string
  serviceId: string
  items: unknown
  /** Ausente = não mexe no custo adicional. */
  additionalCost?: unknown
}): Promise<ActionResult<{ count: number }>> {
  try {
    const costPlan = input.additionalCost === undefined ? null : planAdditionalCost(input.additionalCost)
    if (costPlan && !costPlan.ok) return { success: false, error: costPlan.error }

    const count = await db.transaction(async (tx) => {
      const [service] = await tx
        .select({ id: services.id })
        .from(services)
        .where(and(eq(services.id, input.serviceId), eq(services.salonId, input.salonId), eq(services.isSystem, false)))
        .for("update")
      if (!service) fail("Serviço não encontrado")

      const wanted = Array.isArray(input.items)
        ? Array.from(
            new Set(
              input.items
                .map((item) => (item as { productId?: unknown } | null)?.productId)
                .filter((id): id is string => typeof id === "string" && id.length > 0)
            )
          )
        : []

      const productRows =
        wanted.length === 0
          ? []
          : await tx
              .select({ id: products.id })
              .from(products)
              .where(and(eq(products.salonId, input.salonId), inArray(products.id, wanted)))

      const plan = planServiceConsumption(input.items, new Set(productRows.map((product) => product.id)))
      if (!plan.ok) fail(plan.error)

      await tx
        .delete(serviceProducts)
        .where(and(eq(serviceProducts.serviceId, service.id), eq(serviceProducts.salonId, input.salonId)))

      if (costPlan?.ok) {
        await tx
          .update(services)
          .set({ additionalCost: costPlan.additionalCost })
          .where(and(eq(services.id, service.id), eq(services.salonId, input.salonId)))
      }

      if (plan.items.length > 0) {
        await tx.insert(serviceProducts).values(
          plan.items.map((item) => ({
            salonId: input.salonId,
            serviceId: service.id,
            productId: item.productId,
            quantity: item.quantity,
          }))
        )
      }

      return plan.items.length
    })

    return { success: true, data: { count } }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar o consumo do serviço")
  }
}
