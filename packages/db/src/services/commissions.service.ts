import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm"

import {
  db,
  commissionEntries,
  commissionRules,
  commissionSettings,
  customers,
  products,
  professionals,
  saleItems,
  salePayments,
  sales,
  services,
} from "../index"
import type { CommissionDateBasis, CommissionRateKind, CommissionShareMode } from "../schema"
import {
  isCommissionDateBasis,
  isCommissionShareMode,
  planCommissionRule,
  planSaleCommissions,
} from "../domain/commissions"
import { isCalendarDate } from "../domain/finance"
import { toCents } from "../domain/sales"
import type { ActionResult } from "./appointments"

/**
 * Comissões (docs/ROADMAP.md, fase 3, fatia 3a).
 *
 * Só I/O: carrega o que a regra pura (domain/commissions.ts) precisa, deixa ela
 * decidir e grava. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`. Os ids chegam do cliente;
 * um profissional, serviço ou produto que não aparece na consulta escopada é
 * tratado como inexistente.
 *
 * O extrato é fotografia: `syncSaleCommissions` apaga e regrava as linhas de UMA
 * comanda, dentro da transação de quem mudou a comanda (faturar, receber débito,
 * reabrir). Assim o extrato nunca fica à frente nem atrás da comanda.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

class CommissionRuleError extends Error {}

function fail(message: string): never {
  throw new CommissionRuleError(message)
}

function toFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof CommissionRuleError) return { success: false, error: error.message }
  console.error(fallback, error)
  return { success: false, error: fallback }
}

function unique(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v)))
}

// ============================================================================
// Comanda → extrato
// ============================================================================

/**
 * Regrava as comissões de uma comanda. Roda DENTRO da transação que mudou a
 * comanda, depois de ela já estar no estado final.
 *
 * Sempre apaga antes: comanda que não está faturada (reaberta, excluída) fica sem
 * linha nenhuma, e comanda faturada ganha as linhas recalculadas — a taxa efetiva
 * muda quando um débito é recebido em outra forma de pagamento, e a data de
 * disponibilidade muda quando o valor em aberto é quitado.
 */
export async function syncSaleCommissions(tx: Tx, input: { salonId: string; saleId: string }): Promise<void> {
  await tx
    .delete(commissionEntries)
    .where(and(eq(commissionEntries.saleId, input.saleId), eq(commissionEntries.salonId, input.salonId)))

  const [sale] = await tx
    .select({
      status: sales.status,
      saleDate: sales.saleDate,
      total: sales.total,
      amountDue: sales.amountDue,
    })
    .from(sales)
    .where(and(eq(sales.id, input.saleId), eq(sales.salonId, input.salonId)))

  if (!sale || sale.status !== "invoiced") return

  const items = await tx
    .select({
      id: saleItems.id,
      serviceId: saleItems.serviceId,
      productId: saleItems.productId,
      professionalId: saleItems.professionalId,
      quantity: saleItems.quantity,
      discountAmount: saleItems.discountAmount,
      total: saleItems.total,
    })
    .from(saleItems)
    .where(and(eq(saleItems.saleId, input.saleId), eq(saleItems.salonId, input.salonId)))

  const professionalIds = unique(items.map((item) => item.professionalId))
  if (professionalIds.length === 0) return

  const [payments, professionalRows, settingsRows, ruleRows] = await Promise.all([
    tx
      .select({ feeAmount: salePayments.feeAmount, settlesOn: salePayments.settlesOn })
      .from(salePayments)
      .where(and(eq(salePayments.saleId, input.saleId), eq(salePayments.salonId, input.salonId))),
    tx
      .select({ id: professionals.id, commissionRate: professionals.commissionRate })
      .from(professionals)
      .where(and(eq(professionals.salonId, input.salonId), inArray(professionals.id, professionalIds))),
    tx
      .select({
        professionalId: commissionSettings.professionalId,
        dateBasis: commissionSettings.dateBasis,
        feeMode: commissionSettings.feeMode,
        discountMode: commissionSettings.discountMode,
      })
      .from(commissionSettings)
      .where(
        and(
          eq(commissionSettings.salonId, input.salonId),
          or(isNull(commissionSettings.professionalId), inArray(commissionSettings.professionalId, professionalIds))
        )
      ),
    // Regras do salão e as exceções dos profissionais desta comanda. A regra pura
    // escolhe a que vale para cada item.
    tx
      .select({
        professionalId: commissionRules.professionalId,
        serviceId: commissionRules.serviceId,
        productId: commissionRules.productId,
        kind: commissionRules.kind,
        value: commissionRules.value,
      })
      .from(commissionRules)
      .where(
        and(
          eq(commissionRules.salonId, input.salonId),
          or(isNull(commissionRules.professionalId), inArray(commissionRules.professionalId, professionalIds))
        )
      ),
  ])

  const settingsByProfessional = new Map(
    settingsRows.filter((row) => row.professionalId).map((row) => [row.professionalId as string, row])
  )

  const entries = planSaleCommissions({
    sale,
    items,
    payments,
    salonSettings: settingsRows.find((row) => !row.professionalId) ?? null,
    professionals: new Map(
      professionalRows.map((professional) => [
        professional.id,
        { commissionRate: professional.commissionRate, settings: settingsByProfessional.get(professional.id) ?? null },
      ])
    ),
    rules: ruleRows,
  })

  if (entries.length === 0) return

  await tx.insert(commissionEntries).values(
    entries.map((entry) => ({ ...entry, salonId: input.salonId, saleId: input.saleId }))
  )
}

const MAX_RECALCULATE_SALES = 2000

/**
 * Recalcula as comissões das comandas faturadas de um período, com as regras de
 * AGORA. É o caminho para aplicar uma regra corrigida ao que já foi faturado e para
 * calcular o que foi vendido antes de o módulo ser ligado.
 *
 * Uma transação por comanda, travando a linha dela: um faturamento ou uma
 * reabertura simultânea espera, em vez de cruzar com o recálculo.
 */
export async function recalculateCommissionsService(input: {
  salonId: string
  from: Date
  to: Date
}): Promise<ActionResult<{ sales: number }>> {
  try {
    const targets = await db
      .select({ id: sales.id })
      .from(sales)
      .where(
        and(
          eq(sales.salonId, input.salonId),
          eq(sales.status, "invoiced"),
          gte(sales.saleDate, input.from),
          lte(sales.saleDate, input.to)
        )
      )
      .limit(MAX_RECALCULATE_SALES + 1)

    if (targets.length > MAX_RECALCULATE_SALES) {
      return {
        success: false,
        error: `O período tem mais de ${MAX_RECALCULATE_SALES} comandas. Recalcule em períodos menores.`,
      }
    }

    for (const target of targets) {
      await db.transaction(async (tx) => {
        await tx
          .select({ id: sales.id })
          .from(sales)
          .where(and(eq(sales.id, target.id), eq(sales.salonId, input.salonId)))
          .for("update")

        await syncSaleCommissions(tx, { salonId: input.salonId, saleId: target.id })
      })
    }

    return { success: true, data: { sales: targets.length } }
  } catch (error) {
    return toFailure(error, "Não foi possível recalcular as comissões")
  }
}

// ============================================================================
// Configuração
// ============================================================================

export type CommissionSettingsValues = {
  /** NULL = não define (segue o salão, ou o padrão do sistema). */
  dateBasis: CommissionDateBasis | null
  feeMode: CommissionShareMode | null
  discountMode: CommissionShareMode | null
}

export type CommissionRuleValues = {
  professionalId: string | null
  serviceId: string | null
  productId: string | null
  kind: CommissionRateKind
  value: string
}

export type CommissionConfig = {
  salonSettings: CommissionSettingsValues
  professionals: {
    id: string
    name: string
    isActive: boolean
    /** Percentual geral do cadastro do profissional. */
    commissionRate: string
    /** NULL = sem exceção: segue o salão em tudo. */
    settings: CommissionSettingsValues | null
  }[]
  services: { id: string; name: string }[]
  products: { id: string; name: string }[]
  rules: CommissionRuleValues[]
}

function toSettingsValues(row: { dateBasis: unknown; feeMode: unknown; discountMode: unknown }): CommissionSettingsValues {
  return {
    dateBasis: isCommissionDateBasis(row.dateBasis) ? row.dateBasis : null,
    feeMode: isCommissionShareMode(row.feeMode) ? row.feeMode : null,
    discountMode: isCommissionShareMode(row.discountMode) ? row.discountMode : null,
  }
}

/** Tudo o que a tela de configuração mostra, de uma vez. */
export async function getCommissionConfigService(salonId: string): Promise<CommissionConfig> {
  const [settingsRows, professionalRows, serviceRows, productRows, ruleRows] = await Promise.all([
    db
      .select({
        professionalId: commissionSettings.professionalId,
        dateBasis: commissionSettings.dateBasis,
        feeMode: commissionSettings.feeMode,
        discountMode: commissionSettings.discountMode,
      })
      .from(commissionSettings)
      .where(eq(commissionSettings.salonId, salonId)),
    db
      .select({
        id: professionals.id,
        name: professionals.name,
        isActive: professionals.isActive,
        commissionRate: professionals.commissionRate,
      })
      .from(professionals)
      .where(eq(professionals.salonId, salonId))
      .orderBy(asc(professionals.name)),
    db
      .select({ id: services.id, name: services.name })
      .from(services)
      .where(and(eq(services.salonId, salonId), eq(services.isActive, true), eq(services.isSystem, false)))
      .orderBy(asc(services.name)),
    db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(and(eq(products.salonId, salonId), eq(products.isActive, true)))
      .orderBy(asc(products.name)),
    db
      .select({
        professionalId: commissionRules.professionalId,
        serviceId: commissionRules.serviceId,
        productId: commissionRules.productId,
        kind: commissionRules.kind,
        value: commissionRules.value,
      })
      .from(commissionRules)
      .where(eq(commissionRules.salonId, salonId)),
  ])

  const salonRow = settingsRows.find((row) => !row.professionalId)
  const settingsByProfessional = new Map(
    settingsRows.filter((row) => row.professionalId).map((row) => [row.professionalId as string, toSettingsValues(row)])
  )

  return {
    salonSettings: salonRow ? toSettingsValues(salonRow) : { dateBasis: null, feeMode: null, discountMode: null },
    professionals: professionalRows
      // Inativo só aparece se ainda tiver exceção gravada, para poder ser limpa.
      .filter((professional) => professional.isActive || settingsByProfessional.has(professional.id))
      .map((professional) => ({
        ...professional,
        settings: settingsByProfessional.get(professional.id) ?? null,
      })),
    services: serviceRows,
    products: productRows,
    rules: ruleRows,
  }
}

async function assertProfessionalInSalon(tx: Tx, salonId: string, professionalId: string): Promise<void> {
  const [professional] = await tx
    .select({ id: professionals.id })
    .from(professionals)
    .where(and(eq(professionals.id, professionalId), eq(professionals.salonId, salonId)))
    .limit(1)

  if (!professional) fail("Profissional não encontrado")
}

/**
 * Grava as regras gerais do salão (`professionalId` NULL) ou a exceção de um
 * profissional. Exceção com os três campos vazios é o mesmo que não ter exceção: a
 * linha é apagada.
 */
export async function saveCommissionSettingsService(input: {
  salonId: string
  professionalId: string | null
  settings: CommissionSettingsValues
}): Promise<ActionResult<void>> {
  try {
    const { settings } = input
    if (settings.dateBasis !== null && !isCommissionDateBasis(settings.dateBasis)) fail("Regra de data inválida")
    if (settings.feeMode !== null && !isCommissionShareMode(settings.feeMode)) fail("Regra de taxas inválida")
    if (settings.discountMode !== null && !isCommissionShareMode(settings.discountMode)) {
      fail("Regra de descontos inválida")
    }

    await db.transaction(async (tx) => {
      if (input.professionalId) await assertProfessionalInSalon(tx, input.salonId, input.professionalId)

      const scope = and(
        eq(commissionSettings.salonId, input.salonId),
        input.professionalId
          ? eq(commissionSettings.professionalId, input.professionalId)
          : isNull(commissionSettings.professionalId)
      )

      const [existing] = await tx.select({ id: commissionSettings.id }).from(commissionSettings).where(scope).for("update")

      const empty = settings.dateBasis === null && settings.feeMode === null && settings.discountMode === null

      if (input.professionalId && empty) {
        if (existing) await tx.delete(commissionSettings).where(scope)
        return
      }

      if (existing) {
        await tx
          .update(commissionSettings)
          .set({ ...settings, updatedAt: new Date() })
          .where(scope)
        return
      }

      await tx.insert(commissionSettings).values({
        salonId: input.salonId,
        professionalId: input.professionalId,
        ...settings,
      })
    })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar as regras de comissão")
  }
}

export const MAX_COMMISSION_RULES = 1000

/**
 * Troca TODAS as regras por item de um alvo: o padrão do salão (`professionalId`
 * NULL) ou as exceções de um profissional. A tela manda a tabela inteira; item que
 * não vem na lista fica sem regra.
 */
export async function saveCommissionRulesService(input: {
  salonId: string
  professionalId: string | null
  rules: { serviceId?: string | null; productId?: string | null; kind: unknown; value: unknown }[]
}): Promise<ActionResult<{ rules: number }>> {
  try {
    if (input.rules.length > MAX_COMMISSION_RULES) fail(`No máximo ${MAX_COMMISSION_RULES} regras por vez`)

    const planned: { serviceId: string | null; productId: string | null; kind: CommissionRateKind; value: string }[] = []
    const seen = new Set<string>()

    for (const rule of input.rules) {
      const serviceId = rule.serviceId ?? null
      const productId = rule.productId ?? null
      if ((serviceId === null) === (productId === null)) fail("Cada regra é de um serviço ou de um produto")

      const key = serviceId ? `s:${serviceId}` : `p:${productId}`
      if (seen.has(key)) fail("Há mais de uma regra para o mesmo item")
      seen.add(key)

      const plan = planCommissionRule(rule)
      if (!plan.ok) fail(plan.error)

      planned.push({ serviceId, productId, kind: plan.kind, value: plan.value })
    }

    await db.transaction(async (tx) => {
      if (input.professionalId) await assertProfessionalInSalon(tx, input.salonId, input.professionalId)

      const serviceIds = unique(planned.map((rule) => rule.serviceId))
      const productIds = unique(planned.map((rule) => rule.productId))

      const [serviceRows, productRows] = await Promise.all([
        serviceIds.length
          ? tx
              .select({ id: services.id })
              .from(services)
              .where(and(eq(services.salonId, input.salonId), inArray(services.id, serviceIds)))
          : [],
        productIds.length
          ? tx
              .select({ id: products.id })
              .from(products)
              .where(and(eq(products.salonId, input.salonId), inArray(products.id, productIds)))
          : [],
      ])

      if (serviceRows.length !== serviceIds.length) fail("Serviço não encontrado")
      if (productRows.length !== productIds.length) fail("Produto não encontrado")

      await tx
        .delete(commissionRules)
        .where(
          and(
            eq(commissionRules.salonId, input.salonId),
            input.professionalId
              ? eq(commissionRules.professionalId, input.professionalId)
              : isNull(commissionRules.professionalId)
          )
        )

      if (planned.length > 0) {
        await tx.insert(commissionRules).values(
          planned.map((rule) => ({
            ...rule,
            salonId: input.salonId,
            professionalId: input.professionalId,
          }))
        )
      }
    })

    return { success: true, data: { rules: planned.length } }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar as comissões por item")
  }
}

// ============================================================================
// Extrato
// ============================================================================

export type CommissionEntryRow = {
  id: string
  releaseDate: string | null
  competenceDate: string
  saleId: string
  saleNumber: number
  customerName: string | null
  description: string
  quantity: string
  professionalId: string
  professionalName: string
  baseAmount: string
  rateKind: CommissionRateKind
  rateValue: string
  grossAmount: string
  feeAmount: string
  amount: string
}

export type CommissionProfessionalTotals = {
  professionalId: string
  professionalName: string
  baseCents: number
  grossCents: number
  feeCents: number
  amountCents: number
  count: number
}

export type CommissionStatement = {
  rows: CommissionEntryRow[]
  /** As linhas foram cortadas em `limit`; os totais continuam sendo do período todo. */
  truncated: boolean
  byProfessional: CommissionProfessionalTotals[]
  /** Comissões sem data: aguardando o cliente pagar o que ficou em aberto. */
  pending: { count: number; amountCents: number }
}

/**
 * Extrato de comissões disponíveis num período ("YYYY-MM-DD", inclusive).
 *
 * `professionalIds`: indefinido = todos; lista = só aqueles (lista vazia = nada) —
 * é como quem não tem `commissions.view_all` vê só o próprio extrato.
 *
 * Só conta comanda FATURADA: o join com `sales` deixa de fora qualquer linha que
 * tenha sobrado de uma comanda reaberta com o módulo desligado.
 */
export async function listCommissionEntriesService(input: {
  salonId: string
  from: string
  to: string
  professionalIds?: string[]
  limit: number
}): Promise<CommissionStatement> {
  const empty: CommissionStatement = { rows: [], truncated: false, byProfessional: [], pending: { count: 0, amountCents: 0 } }

  if (!isCalendarDate(input.from) || !isCalendarDate(input.to)) return empty
  if (input.professionalIds && input.professionalIds.length === 0) return empty

  const scope = and(
    eq(commissionEntries.salonId, input.salonId),
    eq(sales.status, "invoiced"),
    input.professionalIds ? inArray(commissionEntries.professionalId, input.professionalIds) : undefined
  )
  const inPeriod = and(scope, gte(commissionEntries.releaseDate, input.from), lte(commissionEntries.releaseDate, input.to))

  const [rows, totals, [pending]] = await Promise.all([
    db
      .select({
        id: commissionEntries.id,
        releaseDate: commissionEntries.releaseDate,
        competenceDate: commissionEntries.competenceDate,
        saleId: sales.id,
        saleNumber: sales.number,
        customerName: customers.name,
        description: saleItems.description,
        quantity: saleItems.quantity,
        professionalId: commissionEntries.professionalId,
        professionalName: professionals.name,
        baseAmount: commissionEntries.baseAmount,
        rateKind: commissionEntries.rateKind,
        rateValue: commissionEntries.rateValue,
        grossAmount: commissionEntries.grossAmount,
        feeAmount: commissionEntries.feeAmount,
        amount: commissionEntries.amount,
      })
      .from(commissionEntries)
      .innerJoin(sales, eq(sales.id, commissionEntries.saleId))
      .innerJoin(saleItems, eq(saleItems.id, commissionEntries.saleItemId))
      .innerJoin(professionals, eq(professionals.id, commissionEntries.professionalId))
      .leftJoin(customers, eq(customers.id, sales.customerId))
      .where(inPeriod)
      .orderBy(asc(commissionEntries.releaseDate), asc(sales.number), asc(saleItems.position))
      .limit(input.limit + 1),
    db
      .select({
        professionalId: commissionEntries.professionalId,
        professionalName: professionals.name,
        base: sql<string>`coalesce(sum(${commissionEntries.baseAmount}), 0)`,
        gross: sql<string>`coalesce(sum(${commissionEntries.grossAmount}), 0)`,
        fee: sql<string>`coalesce(sum(${commissionEntries.feeAmount}), 0)`,
        amount: sql<string>`coalesce(sum(${commissionEntries.amount}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(commissionEntries)
      .innerJoin(sales, eq(sales.id, commissionEntries.saleId))
      .innerJoin(professionals, eq(professionals.id, commissionEntries.professionalId))
      .where(inPeriod)
      .groupBy(commissionEntries.professionalId, professionals.name)
      .orderBy(asc(professionals.name)),
    db
      .select({
        amount: sql<string>`coalesce(sum(${commissionEntries.amount}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(commissionEntries)
      .innerJoin(sales, eq(sales.id, commissionEntries.saleId))
      .where(and(scope, isNull(commissionEntries.releaseDate))),
  ])

  return {
    rows: rows.slice(0, input.limit),
    truncated: rows.length > input.limit,
    byProfessional: totals.map((row) => ({
      professionalId: row.professionalId,
      professionalName: row.professionalName,
      baseCents: toCents(row.base) ?? 0,
      grossCents: toCents(row.gross) ?? 0,
      feeCents: toCents(row.fee) ?? 0,
      amountCents: toCents(row.amount) ?? 0,
      count: row.count,
    })),
    pending: { count: pending?.count ?? 0, amountCents: toCents(pending?.amount) ?? 0 },
  }
}

/** Profissionais do salão para o filtro do extrato (ativos e inativos: o histórico é de todos). */
export async function listCommissionProfessionalsService(
  salonId: string
): Promise<{ id: string; name: string; isActive: boolean; userId: string | null }[]> {
  return db
    .select({
      id: professionals.id,
      name: professionals.name,
      isActive: professionals.isActive,
      userId: professionals.userId,
    })
    .from(professionals)
    .where(eq(professionals.salonId, salonId))
    .orderBy(asc(professionals.name))
}
