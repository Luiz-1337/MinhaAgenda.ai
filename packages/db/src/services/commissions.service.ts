import { randomUUID } from "node:crypto"
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm"

import {
  db,
  commissionAdjustments,
  commissionAssistantRules,
  commissionEntries,
  commissionPayments,
  commissionRules,
  commissionSettings,
  customers,
  financialAccounts,
  financialCategories,
  financialTransactions,
  products,
  professionals,
  profiles,
  saleItems,
  salePayments,
  sales,
  salons,
  services,
} from "../index"
import type {
  CommissionAdjustmentKind,
  CommissionAssistantBase,
  CommissionAssistantDeduct,
  CommissionDateBasis,
  CommissionRateKind,
  CommissionRole,
  CommissionShareMode,
} from "../schema"
import {
  advancePaidDate,
  commissionEntryKey,
  commissionNetCents,
  isCommissionDateBasis,
  isCommissionShareMode,
  planAssistantRule,
  planCommissionAdjustment,
  planCommissionPayment,
  planCommissionPaymentBatch,
  planCommissionRule,
  planSaleCommissions,
  unpaidPlannedEntries,
} from "../domain/commissions"
import { isCalendarDate, paidAtFromDate } from "../domain/finance"
import { toCents } from "../domain/sales"
import type { ActionResult } from "./appointments"

/**
 * Comissões (docs/ROADMAP.md, fase 3, fatias 3a a 3d).
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
 *
 * A exceção é a comissão PAGA (`payment_id` preenchido): ela não é apagada nem
 * recalculada. Para mudar, estorna-se o pagamento.
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
 *
 * O que já foi PAGO fica como está: só as linhas em aberto são apagadas e
 * regravadas (domain: unpaidPlannedEntries).
 */
export async function syncSaleCommissions(tx: Tx, input: { salonId: string; saleId: string }): Promise<void> {
  const ofSale = and(eq(commissionEntries.saleId, input.saleId), eq(commissionEntries.salonId, input.salonId))

  const paidRows = await tx
    .select({
      saleItemId: commissionEntries.saleItemId,
      professionalId: commissionEntries.professionalId,
      role: commissionEntries.role,
    })
    .from(commissionEntries)
    .where(and(ofSale, isNotNull(commissionEntries.paymentId)))

  await tx.delete(commissionEntries).where(and(ofSale, isNull(commissionEntries.paymentId)))

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
      assistantId: saleItems.assistantId,
      quantity: saleItems.quantity,
      discountAmount: saleItems.discountAmount,
      total: saleItems.total,
    })
    .from(saleItems)
    .where(and(eq(saleItems.saleId, input.saleId), eq(saleItems.salonId, input.salonId)))

  // Quem executou e quem auxiliou: os dois recebem, os dois podem ter exceção.
  const professionalIds = unique(items.flatMap((item) => [item.professionalId, item.assistantId]))
  if (professionalIds.length === 0) return

  const assistantIds = unique(items.map((item) => item.assistantId))

  const [payments, professionalRows, settingsRows, ruleRows, assistantRuleRows] = await Promise.all([
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
    // Regras de auxiliar: só quando algum item tem auxiliar.
    assistantIds.length
      ? tx
          .select({
            professionalId: commissionAssistantRules.professionalId,
            serviceId: commissionAssistantRules.serviceId,
            kind: commissionAssistantRules.kind,
            value: commissionAssistantRules.value,
            base: commissionAssistantRules.base,
            deductFrom: commissionAssistantRules.deductFrom,
          })
          .from(commissionAssistantRules)
          .where(
            and(
              eq(commissionAssistantRules.salonId, input.salonId),
              or(
                isNull(commissionAssistantRules.professionalId),
                inArray(commissionAssistantRules.professionalId, assistantIds)
              )
            )
          )
      : [],
  ])

  const settingsByProfessional = new Map(
    settingsRows.filter((row) => row.professionalId).map((row) => [row.professionalId as string, row])
  )

  const planned = planSaleCommissions({
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
    assistantRules: assistantRuleRows,
  })

  const entries = unpaidPlannedEntries(planned, new Set(paidRows.map(commissionEntryKey)))

  if (entries.length === 0) return

  await tx.insert(commissionEntries).values(
    entries.map((entry) => ({ ...entry, salonId: input.salonId, saleId: input.saleId }))
  )
}

/**
 * A comanda tem comissão já paga? Quem reabre a comanda pergunta antes: reabrir
 * apagaria o item de uma comissão que o profissional já recebeu.
 */
export async function saleHasPaidCommissions(
  tx: Tx,
  input: { salonId: string; saleId: string }
): Promise<boolean> {
  const [paid] = await tx
    .select({ id: commissionEntries.id })
    .from(commissionEntries)
    .where(
      and(
        eq(commissionEntries.saleId, input.saleId),
        eq(commissionEntries.salonId, input.salonId),
        isNotNull(commissionEntries.paymentId)
      )
    )
    .limit(1)

  return !!paid
}

const MAX_RECALCULATE_SALES = 2000

/**
 * Recalcula as comissões das comandas faturadas de um período, com as regras de
 * AGORA. É o caminho para aplicar uma regra corrigida ao que já foi faturado e para
 * calcular o que foi vendido antes de o módulo ser ligado.
 *
 * Comissão já paga fica de fora: o recálculo só mexe no que está em aberto.
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

export type CommissionAssistantRuleValues = {
  /** NULL = padrão do salão para o serviço. */
  professionalId: string | null
  serviceId: string
  kind: CommissionRateKind
  value: string
  base: CommissionAssistantBase
  deductFrom: CommissionAssistantDeduct
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
  /** Quanto cada um ganha como auxiliar, por serviço. */
  assistantRules: CommissionAssistantRuleValues[]
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
  const [settingsRows, professionalRows, serviceRows, productRows, ruleRows, assistantRuleRows] = await Promise.all([
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
    db
      .select({
        professionalId: commissionAssistantRules.professionalId,
        serviceId: commissionAssistantRules.serviceId,
        kind: commissionAssistantRules.kind,
        value: commissionAssistantRules.value,
        base: commissionAssistantRules.base,
        deductFrom: commissionAssistantRules.deductFrom,
      })
      .from(commissionAssistantRules)
      .where(eq(commissionAssistantRules.salonId, salonId)),
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
    assistantRules: assistantRuleRows,
  }
}

async function loadProfessionalInSalon(
  tx: Tx,
  salonId: string,
  professionalId: string
): Promise<{ id: string; name: string }> {
  const [professional] = await tx
    .select({ id: professionals.id, name: professionals.name })
    .from(professionals)
    .where(and(eq(professionals.id, professionalId), eq(professionals.salonId, salonId)))
    .limit(1)

  if (!professional) fail("Profissional não encontrado")
  return professional
}

async function assertProfessionalInSalon(tx: Tx, salonId: string, professionalId: string): Promise<void> {
  await loadProfessionalInSalon(tx, salonId, professionalId)
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

/**
 * Troca TODAS as regras de auxiliar de um alvo: o padrão do salão (`professionalId`
 * NULL) ou o que um profissional ganha quando auxilia. Serviço que não vem na lista
 * fica sem regra.
 */
export async function saveCommissionAssistantRulesService(input: {
  salonId: string
  professionalId: string | null
  rules: { serviceId: string; kind: unknown; value: unknown; base: unknown; deductFrom: unknown }[]
}): Promise<ActionResult<{ rules: number }>> {
  try {
    if (input.rules.length > MAX_COMMISSION_RULES) fail(`No máximo ${MAX_COMMISSION_RULES} regras por vez`)

    const planned: Omit<CommissionAssistantRuleValues, "professionalId">[] = []
    const seen = new Set<string>()

    for (const rule of input.rules) {
      if (seen.has(rule.serviceId)) fail("Há mais de uma regra de auxiliar para o mesmo serviço")
      seen.add(rule.serviceId)

      const plan = planAssistantRule(rule)
      if (!plan.ok) fail(plan.error)

      planned.push({
        serviceId: rule.serviceId,
        kind: plan.kind,
        value: plan.value,
        base: plan.base,
        deductFrom: plan.deductFrom,
      })
    }

    await db.transaction(async (tx) => {
      if (input.professionalId) await assertProfessionalInSalon(tx, input.salonId, input.professionalId)

      const serviceIds = planned.map((rule) => rule.serviceId)
      const serviceRows = serviceIds.length
        ? await tx
            .select({ id: services.id })
            .from(services)
            .where(and(eq(services.salonId, input.salonId), inArray(services.id, serviceIds)))
        : []

      if (serviceRows.length !== serviceIds.length) fail("Serviço não encontrado")

      await tx
        .delete(commissionAssistantRules)
        .where(
          and(
            eq(commissionAssistantRules.salonId, input.salonId),
            input.professionalId
              ? eq(commissionAssistantRules.professionalId, input.professionalId)
              : isNull(commissionAssistantRules.professionalId)
          )
        )

      if (planned.length > 0) {
        await tx.insert(commissionAssistantRules).values(
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
    return toFailure(error, "Não foi possível salvar as comissões de auxiliar")
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
  /** Quem recebe: o profissional, ou o auxiliar quando `role` é 'assistant'. */
  professionalId: string
  professionalName: string
  role: CommissionRole
  baseAmount: string
  rateKind: CommissionRateKind
  rateValue: string
  grossAmount: string
  feeAmount: string
  /** Quanto desta comissão foi para o auxiliar. */
  assistantDeduction: string
  amount: string
  /** Dia do pagamento que quitou esta comissão. NULL = em aberto. */
  paidOn: string | null
}

export type CommissionProfessionalTotals = {
  professionalId: string
  professionalName: string
  /** Valor dos itens que ele executou (não soma os que só auxiliou). */
  baseCents: number
  /** Comissões antes da taxa — como profissional e como auxiliar. */
  grossCents: number
  feeCents: number
  /** Quanto das comissões dele foi para auxiliares. */
  assistantCents: number
  /** Comissões a receber: depois da taxa e do auxiliar, antes de vales e bonificações. */
  amountCents: number
  /** Itens que ele executou. */
  count: number
  /** Itens em que ele foi o auxiliar. */
  assistantCount: number
  /** Vales do período (abatem). */
  advanceCents: number
  /** Bonificações do período (somam). */
  bonusCents: number
  /** amountCents − advanceCents + bonusCents. Pode ser negativo. */
  netCents: number
}

export type CommissionAdjustmentRow = {
  id: string
  professionalId: string
  professionalName: string
  kind: CommissionAdjustmentKind
  amount: string
  referenceDate: string
  notes: string | null
  /** Dia do pagamento em que o lançamento entrou. NULL = em aberto. */
  paidOn: string | null
  /** Conta de onde o dinheiro do vale saiu. NULL = sem lançamento no financeiro. */
  accountName: string | null
}

export type CommissionStatement = {
  rows: CommissionEntryRow[]
  /** As linhas foram cortadas em `limit`; os totais continuam sendo do período todo. */
  truncated: boolean
  byProfessional: CommissionProfessionalTotals[]
  /** Comissões sem data: aguardando o cliente pagar o que ficou em aberto. */
  pending: { count: number; amountCents: number }
  /** Vales e bonificações do período, do mais recente para o mais antigo. */
  adjustments: CommissionAdjustmentRow[]
  adjustmentsTruncated: boolean
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
  const empty: CommissionStatement = {
    rows: [],
    truncated: false,
    byProfessional: [],
    pending: { count: 0, amountCents: 0 },
    adjustments: [],
    adjustmentsTruncated: false,
  }

  if (!isCalendarDate(input.from) || !isCalendarDate(input.to)) return empty
  if (input.professionalIds && input.professionalIds.length === 0) return empty

  const scope = and(
    eq(commissionEntries.salonId, input.salonId),
    eq(sales.status, "invoiced"),
    input.professionalIds ? inArray(commissionEntries.professionalId, input.professionalIds) : undefined
  )
  const inPeriod = and(scope, gte(commissionEntries.releaseDate, input.from), lte(commissionEntries.releaseDate, input.to))

  const adjustmentsInPeriod = and(
    eq(commissionAdjustments.salonId, input.salonId),
    gte(commissionAdjustments.referenceDate, input.from),
    lte(commissionAdjustments.referenceDate, input.to),
    input.professionalIds ? inArray(commissionAdjustments.professionalId, input.professionalIds) : undefined
  )

  const [rows, totals, [pending], adjustmentRows, adjustmentTotals] = await Promise.all([
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
        role: commissionEntries.role,
        baseAmount: commissionEntries.baseAmount,
        rateKind: commissionEntries.rateKind,
        rateValue: commissionEntries.rateValue,
        grossAmount: commissionEntries.grossAmount,
        feeAmount: commissionEntries.feeAmount,
        assistantDeduction: commissionEntries.assistantDeduction,
        amount: commissionEntries.amount,
        paidOn: commissionPayments.paidOn,
      })
      .from(commissionEntries)
      .innerJoin(sales, eq(sales.id, commissionEntries.saleId))
      .innerJoin(saleItems, eq(saleItems.id, commissionEntries.saleItemId))
      .innerJoin(professionals, eq(professionals.id, commissionEntries.professionalId))
      .leftJoin(customers, eq(customers.id, sales.customerId))
      .leftJoin(commissionPayments, eq(commissionPayments.id, commissionEntries.paymentId))
      .where(inPeriod)
      // No mesmo item, a linha do profissional vem antes da do auxiliar.
      .orderBy(
        asc(commissionEntries.releaseDate),
        asc(sales.number),
        asc(saleItems.position),
        desc(commissionEntries.role)
      )
      .limit(input.limit + 1),
    db
      .select({
        professionalId: commissionEntries.professionalId,
        professionalName: professionals.name,
        // O valor do item entra uma vez só, na linha de quem executou: a do
        // auxiliar é do MESMO item e dobraria o total.
        base: sql<string>`coalesce(sum(${commissionEntries.baseAmount}) filter (where ${commissionEntries.role} = 'professional'), 0)`,
        gross: sql<string>`coalesce(sum(${commissionEntries.grossAmount}), 0)`,
        fee: sql<string>`coalesce(sum(${commissionEntries.feeAmount}), 0)`,
        assistant: sql<string>`coalesce(sum(${commissionEntries.assistantDeduction}), 0)`,
        amount: sql<string>`coalesce(sum(${commissionEntries.amount}), 0)`,
        count: sql<number>`(count(*) filter (where ${commissionEntries.role} = 'professional'))::int`,
        assistantCount: sql<number>`(count(*) filter (where ${commissionEntries.role} = 'assistant'))::int`,
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
    db
      .select({
        id: commissionAdjustments.id,
        professionalId: commissionAdjustments.professionalId,
        professionalName: professionals.name,
        kind: commissionAdjustments.kind,
        amount: commissionAdjustments.amount,
        referenceDate: commissionAdjustments.referenceDate,
        notes: commissionAdjustments.notes,
        paidOn: commissionPayments.paidOn,
        accountName: financialAccounts.name,
      })
      .from(commissionAdjustments)
      .innerJoin(professionals, eq(professionals.id, commissionAdjustments.professionalId))
      .leftJoin(commissionPayments, eq(commissionPayments.id, commissionAdjustments.paymentId))
      .leftJoin(financialTransactions, eq(financialTransactions.commissionAdjustmentId, commissionAdjustments.id))
      .leftJoin(financialAccounts, eq(financialAccounts.id, financialTransactions.accountId))
      .where(adjustmentsInPeriod)
      .orderBy(desc(commissionAdjustments.referenceDate), desc(commissionAdjustments.createdAt))
      .limit(input.limit + 1),
    db
      .select({
        professionalId: commissionAdjustments.professionalId,
        professionalName: professionals.name,
        advance: sql<string>`coalesce(sum(${commissionAdjustments.amount}) filter (where ${commissionAdjustments.kind} = 'advance'), 0)`,
        bonus: sql<string>`coalesce(sum(${commissionAdjustments.amount}) filter (where ${commissionAdjustments.kind} = 'bonus'), 0)`,
      })
      .from(commissionAdjustments)
      .innerJoin(professionals, eq(professionals.id, commissionAdjustments.professionalId))
      .where(adjustmentsInPeriod)
      .groupBy(commissionAdjustments.professionalId, professionals.name),
  ])

  // Um profissional pode ter só vale no período (sem comissão nenhuma) e ainda
  // assim precisa aparecer: é justamente quando ele fica devendo.
  const byProfessional = new Map<string, CommissionProfessionalTotals>()

  for (const row of totals) {
    const amountCents = toCents(row.amount) ?? 0
    byProfessional.set(row.professionalId, {
      professionalId: row.professionalId,
      professionalName: row.professionalName,
      baseCents: toCents(row.base) ?? 0,
      grossCents: toCents(row.gross) ?? 0,
      feeCents: toCents(row.fee) ?? 0,
      assistantCents: toCents(row.assistant) ?? 0,
      amountCents,
      count: row.count,
      assistantCount: row.assistantCount,
      advanceCents: 0,
      bonusCents: 0,
      netCents: amountCents,
    })
  }

  for (const row of adjustmentTotals) {
    const current = byProfessional.get(row.professionalId) ?? {
      professionalId: row.professionalId,
      professionalName: row.professionalName,
      baseCents: 0,
      grossCents: 0,
      feeCents: 0,
      assistantCents: 0,
      amountCents: 0,
      count: 0,
      assistantCount: 0,
      advanceCents: 0,
      bonusCents: 0,
      netCents: 0,
    }
    const advanceCents = toCents(row.advance) ?? 0
    const bonusCents = toCents(row.bonus) ?? 0
    byProfessional.set(row.professionalId, {
      ...current,
      advanceCents,
      bonusCents,
      netCents: commissionNetCents({ amountCents: current.amountCents, advanceCents, bonusCents }),
    })
  }

  return {
    rows: rows.slice(0, input.limit),
    truncated: rows.length > input.limit,
    byProfessional: Array.from(byProfessional.values()).sort((a, b) =>
      a.professionalName.localeCompare(b.professionalName, "pt-BR")
    ),
    pending: { count: pending?.count ?? 0, amountCents: toCents(pending?.amount) ?? 0 },
    adjustments: adjustmentRows.slice(0, input.limit),
    adjustmentsTruncated: adjustmentRows.length > input.limit,
  }
}

// ============================================================================
// Vales e bonificações
// ============================================================================

/** Conta ativa e categoria de despesa ativa do salão, ou erro. Categoria é opcional. */
async function loadExpenseTarget(
  tx: Tx,
  salonId: string,
  input: { accountId: string; categoryId?: string | null }
): Promise<{ accountId: string; categoryId: string | null }> {
  const [account] = await tx
    .select({ id: financialAccounts.id, isActive: financialAccounts.isActive })
    .from(financialAccounts)
    .where(and(eq(financialAccounts.id, input.accountId), eq(financialAccounts.salonId, salonId)))
    .limit(1)

  if (!account) fail("Conta não encontrada")
  if (!account.isActive) fail("Conta inativa")

  if (!input.categoryId) return { accountId: account.id, categoryId: null }

  const [category] = await tx
    .select({ id: financialCategories.id, kind: financialCategories.kind, isActive: financialCategories.isActive })
    .from(financialCategories)
    .where(and(eq(financialCategories.id, input.categoryId), eq(financialCategories.salonId, salonId)))
    .limit(1)

  if (!category) fail("Categoria não encontrada")
  if (!category.isActive) fail("Categoria inativa")
  if (category.kind !== "expense") fail("Escolha uma categoria de despesa")

  return { accountId: account.id, categoryId: category.id }
}

/**
 * Lança um vale ou uma bonificação para um profissional do salão.
 *
 * `accountId` (só em VALE): a conta de onde o dinheiro saiu. Com ela, o vale gera
 * uma despesa paga no financeiro; sem ela, nada é lançado lá. Bonificação não gera
 * despesa aqui — ela sai junto com o pagamento da comissão.
 */
export async function createCommissionAdjustmentService(input: {
  salonId: string
  userId: string
  professionalId: string
  draft: { kind: unknown; amount: unknown; referenceDate: unknown; notes?: unknown }
  accountId?: string | null
  categoryId?: string | null
}): Promise<ActionResult<{ adjustmentId: string }>> {
  try {
    const plan = planCommissionAdjustment(input.draft)
    if (!plan.ok) fail(plan.error)

    const adjustmentId = await db.transaction(async (tx) => {
      const professional = await loadProfessionalInSalon(tx, input.salonId, input.professionalId)

      const target =
        plan.kind === "advance" && input.accountId
          ? await loadExpenseTarget(tx, input.salonId, { accountId: input.accountId, categoryId: input.categoryId })
          : null

      const [created] = await tx
        .insert(commissionAdjustments)
        .values({
          salonId: input.salonId,
          professionalId: input.professionalId,
          kind: plan.kind,
          amount: plan.amount,
          referenceDate: plan.referenceDate,
          notes: plan.notes,
          createdBy: input.userId,
        })
        .returning({ id: commissionAdjustments.id })

      if (target) {
        const paidDate = advancePaidDate(plan.referenceDate, new Date())

        await tx.insert(financialTransactions).values({
          salonId: input.salonId,
          direction: "out",
          kind: "commission",
          status: "paid",
          description: `Vale — ${professional.name}`.slice(0, 200),
          amount: plan.amount,
          feeAmount: "0.00",
          netAmount: plan.amount,
          dueDate: paidDate,
          competenceDate: paidDate,
          paidAt: paidAtFromDate(paidDate),
          accountId: target.accountId,
          categoryId: target.categoryId,
          professionalId: input.professionalId,
          commissionAdjustmentId: created.id,
          notes: plan.notes,
          createdBy: input.userId,
        })
      }

      return created.id
    })

    return { success: true, data: { adjustmentId } }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar o lançamento")
  }
}

/**
 * Exclui um vale ou uma bonificação.
 *
 * `professionalIds`: indefinido = qualquer profissional do salão; lista = só os
 * daqueles — quem não vê o extrato de todos não apaga lançamento de outra pessoa.
 *
 * Lançamento que já entrou num pagamento não se exclui: o recibo foi emitido com
 * ele. A despesa que um vale gerou no financeiro sai junto (FK com CASCADE).
 */
export async function deleteCommissionAdjustmentService(input: {
  salonId: string
  adjustmentId: string
  professionalIds?: string[]
}): Promise<ActionResult<void>> {
  try {
    if (input.professionalIds && input.professionalIds.length === 0) fail("Lançamento não encontrado")

    await db.transaction(async (tx) => {
      const [adjustment] = await tx
        .select({ id: commissionAdjustments.id, paymentId: commissionAdjustments.paymentId })
        .from(commissionAdjustments)
        .where(
          and(
            eq(commissionAdjustments.id, input.adjustmentId),
            eq(commissionAdjustments.salonId, input.salonId),
            input.professionalIds ? inArray(commissionAdjustments.professionalId, input.professionalIds) : undefined
          )
        )
        .for("update")

      if (!adjustment) fail("Lançamento não encontrado")
      if (adjustment.paymentId) {
        fail("Este lançamento já entrou num pagamento. Estorne o pagamento antes de excluir")
      }

      await tx
        .delete(commissionAdjustments)
        .where(and(eq(commissionAdjustments.id, adjustment.id), eq(commissionAdjustments.salonId, input.salonId)))
    })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir o lançamento")
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

// ============================================================================
// Pagamento de comissão (fatia 3d)
// ============================================================================

/** Contas e categorias de despesa ativas: de onde o pagamento (ou o vale) pode sair. */
export async function listCommissionFinanceOptionsService(
  salonId: string
): Promise<{ accounts: { id: string; name: string }[]; categories: { id: string; name: string }[] }> {
  const [accounts, categories] = await Promise.all([
    db
      .select({ id: financialAccounts.id, name: financialAccounts.name })
      .from(financialAccounts)
      .where(and(eq(financialAccounts.salonId, salonId), eq(financialAccounts.isActive, true)))
      .orderBy(asc(financialAccounts.name)),
    db
      .select({ id: financialCategories.id, name: financialCategories.name })
      .from(financialCategories)
      .where(
        and(
          eq(financialCategories.salonId, salonId),
          eq(financialCategories.kind, "expense"),
          eq(financialCategories.isActive, true)
        )
      )
      .orderBy(asc(financialCategories.name)),
  ])

  return { accounts, categories }
}

export type CommissionOpenRow = {
  professionalId: string
  professionalName: string
  /** Comissões em aberto (já depois da taxa e do auxiliar). */
  entriesCents: number
  entriesCount: number
  advanceCents: number
  bonusCents: number
  adjustmentsCount: number
  /** entriesCents − advanceCents + bonusCents. Negativo = o profissional está devendo. */
  netCents: number
}

/**
 * O que está EM ABERTO até um dia ("YYYY-MM-DD", inclusive), por profissional:
 * comissões liberadas e lançamentos que nenhum pagamento quitou ainda.
 *
 * Não tem data inicial de propósito: o que ficou para trás (um vale maior que a
 * comissão do mês passado) tem que aparecer aqui até ser quitado.
 *
 * `professionalIds`: indefinido = todos; lista = só aqueles (lista vazia = nada).
 */
export async function listOpenCommissionsService(input: {
  salonId: string
  until: string
  professionalIds?: string[]
}): Promise<CommissionOpenRow[]> {
  if (!isCalendarDate(input.until)) return []
  if (input.professionalIds && input.professionalIds.length === 0) return []

  const [entryTotals, adjustmentTotals] = await Promise.all([
    db
      .select({
        professionalId: commissionEntries.professionalId,
        professionalName: professionals.name,
        amount: sql<string>`coalesce(sum(${commissionEntries.amount}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(commissionEntries)
      .innerJoin(sales, eq(sales.id, commissionEntries.saleId))
      .innerJoin(professionals, eq(professionals.id, commissionEntries.professionalId))
      .where(
        and(
          eq(commissionEntries.salonId, input.salonId),
          eq(sales.status, "invoiced"),
          isNull(commissionEntries.paymentId),
          lte(commissionEntries.releaseDate, input.until),
          input.professionalIds ? inArray(commissionEntries.professionalId, input.professionalIds) : undefined
        )
      )
      .groupBy(commissionEntries.professionalId, professionals.name),
    db
      .select({
        professionalId: commissionAdjustments.professionalId,
        professionalName: professionals.name,
        advance: sql<string>`coalesce(sum(${commissionAdjustments.amount}) filter (where ${commissionAdjustments.kind} = 'advance'), 0)`,
        bonus: sql<string>`coalesce(sum(${commissionAdjustments.amount}) filter (where ${commissionAdjustments.kind} = 'bonus'), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(commissionAdjustments)
      .innerJoin(professionals, eq(professionals.id, commissionAdjustments.professionalId))
      .where(
        and(
          eq(commissionAdjustments.salonId, input.salonId),
          isNull(commissionAdjustments.paymentId),
          lte(commissionAdjustments.referenceDate, input.until),
          input.professionalIds ? inArray(commissionAdjustments.professionalId, input.professionalIds) : undefined
        )
      )
      .groupBy(commissionAdjustments.professionalId, professionals.name),
  ])

  const byProfessional = new Map<string, CommissionOpenRow>()

  for (const row of entryTotals) {
    const entriesCents = toCents(row.amount) ?? 0
    byProfessional.set(row.professionalId, {
      professionalId: row.professionalId,
      professionalName: row.professionalName,
      entriesCents,
      entriesCount: row.count,
      advanceCents: 0,
      bonusCents: 0,
      adjustmentsCount: 0,
      netCents: entriesCents,
    })
  }

  for (const row of adjustmentTotals) {
    const current = byProfessional.get(row.professionalId) ?? {
      professionalId: row.professionalId,
      professionalName: row.professionalName,
      entriesCents: 0,
      entriesCount: 0,
      advanceCents: 0,
      bonusCents: 0,
      adjustmentsCount: 0,
      netCents: 0,
    }
    const advanceCents = toCents(row.advance) ?? 0
    const bonusCents = toCents(row.bonus) ?? 0
    byProfessional.set(row.professionalId, {
      ...current,
      advanceCents,
      bonusCents,
      adjustmentsCount: row.count,
      netCents: commissionNetCents({ amountCents: current.entriesCents, advanceCents, bonusCents }),
    })
  }

  return Array.from(byProfessional.values()).sort((a, b) =>
    a.professionalName.localeCompare(b.professionalName, "pt-BR")
  )
}

/** UPDATE ... WHERE id IN (...) em blocos: um profissional pode ter milhares de itens. */
const PAYMENT_UPDATE_CHUNK = 2000

function chunks<T>(values: T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size))
  return out
}

/**
 * Paga, de uma vez, tudo o que está em aberto até `cutoffDate` para cada
 * profissional escolhido. Um pagamento por profissional, todos com o mesmo
 * `batchId`; entram todos ou nenhum.
 *
 * As linhas em aberto são TRAVADAS (FOR UPDATE) antes da soma: dois cliques em
 * "Pagar", ou um vale lançado no mesmo instante, não viram pagamento em dobro nem
 * pagamento por um valor diferente do que foi conferido (`expectedCents`).
 *
 * Com `accountId`, cada pagamento de valor maior que zero gera uma despesa PAGA no
 * financeiro, naquela conta. Sem conta, nada é lançado lá.
 */
export async function payCommissionsService(input: {
  salonId: string
  userId: string
  cutoffDate: unknown
  paidOn: unknown
  notes?: unknown
  accountId?: string | null
  categoryId?: string | null
  professionals: { professionalId: string; expectedCents: number }[]
}): Promise<ActionResult<{ batchId: string; payments: number; totalCents: number }>> {
  try {
    const expectedById = new Map(input.professionals.map((row) => [row.professionalId, row.expectedCents]))
    const professionalIds = Array.from(expectedById.keys())

    const batch = planCommissionPaymentBatch(
      { cutoffDate: input.cutoffDate, paidOn: input.paidOn, notes: input.notes, professionals: professionalIds.length },
      new Date()
    )
    if (!batch.ok) fail(batch.error)

    const result = await db.transaction(async (tx) => {
      const professionalRows = await tx
        .select({ id: professionals.id, name: professionals.name })
        .from(professionals)
        .where(and(eq(professionals.salonId, input.salonId), inArray(professionals.id, professionalIds)))

      if (professionalRows.length !== professionalIds.length) fail("Profissional não encontrado")

      const target = input.accountId
        ? await loadExpenseTarget(tx, input.salonId, { accountId: input.accountId, categoryId: input.categoryId })
        : null

      const entryRows = await tx
        .select({
          id: commissionEntries.id,
          professionalId: commissionEntries.professionalId,
          amount: commissionEntries.amount,
        })
        .from(commissionEntries)
        .innerJoin(sales, eq(sales.id, commissionEntries.saleId))
        .where(
          and(
            eq(commissionEntries.salonId, input.salonId),
            eq(sales.status, "invoiced"),
            isNull(commissionEntries.paymentId),
            lte(commissionEntries.releaseDate, batch.cutoffDate),
            inArray(commissionEntries.professionalId, professionalIds)
          )
        )
        .for("update", { of: commissionEntries })

      const adjustmentRows = await tx
        .select({
          id: commissionAdjustments.id,
          professionalId: commissionAdjustments.professionalId,
          kind: commissionAdjustments.kind,
          amount: commissionAdjustments.amount,
        })
        .from(commissionAdjustments)
        .where(
          and(
            eq(commissionAdjustments.salonId, input.salonId),
            isNull(commissionAdjustments.paymentId),
            lte(commissionAdjustments.referenceDate, batch.cutoffDate),
            inArray(commissionAdjustments.professionalId, professionalIds)
          )
        )
        .for("update")

      const batchId = randomUUID()
      let totalCents = 0

      for (const professional of professionalRows) {
        const entries = entryRows.filter((row) => row.professionalId === professional.id)
        const adjustments = adjustmentRows.filter((row) => row.professionalId === professional.id)

        const plan = planCommissionPayment({
          entries,
          adjustments,
          expectedCents: expectedById.get(professional.id),
        })
        if (!plan.ok) fail(`${professional.name}: ${plan.error}`)

        const [payment] = await tx
          .insert(commissionPayments)
          .values({
            salonId: input.salonId,
            batchId,
            professionalId: professional.id,
            cutoffDate: batch.cutoffDate,
            entriesAmount: plan.entriesAmount,
            advancesAmount: plan.advancesAmount,
            bonusesAmount: plan.bonusesAmount,
            amount: plan.amount,
            paidOn: batch.paidOn,
            accountId: target?.accountId ?? null,
            notes: batch.notes,
            createdBy: input.userId,
          })
          .returning({ id: commissionPayments.id })

        for (const ids of chunks(entries.map((row) => row.id), PAYMENT_UPDATE_CHUNK)) {
          await tx
            .update(commissionEntries)
            .set({ paymentId: payment.id })
            .where(and(eq(commissionEntries.salonId, input.salonId), inArray(commissionEntries.id, ids)))
        }

        for (const ids of chunks(adjustments.map((row) => row.id), PAYMENT_UPDATE_CHUNK)) {
          await tx
            .update(commissionAdjustments)
            .set({ paymentId: payment.id })
            .where(and(eq(commissionAdjustments.salonId, input.salonId), inArray(commissionAdjustments.id, ids)))
        }

        // Valor zero quita sem sair dinheiro: não há despesa a lançar.
        if (target && plan.amountCents > 0) {
          await tx.insert(financialTransactions).values({
            salonId: input.salonId,
            direction: "out",
            kind: "commission",
            status: "paid",
            description: `Comissão — ${professional.name}`.slice(0, 200),
            amount: plan.amount,
            feeAmount: "0.00",
            netAmount: plan.amount,
            dueDate: batch.paidOn,
            competenceDate: batch.paidOn,
            paidAt: paidAtFromDate(batch.paidOn),
            accountId: target.accountId,
            categoryId: target.categoryId,
            professionalId: professional.id,
            commissionPaymentId: payment.id,
            notes: batch.notes,
            createdBy: input.userId,
          })
        }

        totalCents += plan.amountCents
      }

      return { batchId, payments: professionalRows.length, totalCents }
    })

    return { success: true, data: result }
  } catch (error) {
    return toFailure(error, "Não foi possível registrar o pagamento")
  }
}

/**
 * Estorna um pagamento: a linha é apagada, as comissões e os lançamentos que ela
 * quitou voltam a ficar em aberto (FK com SET NULL) e a despesa que ela gerou no
 * financeiro sai junto (FK com CASCADE).
 *
 * `professionalIds`: indefinido = qualquer profissional do salão; lista = só os
 * daqueles.
 */
export async function undoCommissionPaymentService(input: {
  salonId: string
  paymentId: string
  professionalIds?: string[]
}): Promise<ActionResult<void>> {
  try {
    if (input.professionalIds && input.professionalIds.length === 0) fail("Pagamento não encontrado")

    const deleted = await db
      .delete(commissionPayments)
      .where(
        and(
          eq(commissionPayments.id, input.paymentId),
          eq(commissionPayments.salonId, input.salonId),
          input.professionalIds ? inArray(commissionPayments.professionalId, input.professionalIds) : undefined
        )
      )
      .returning({ id: commissionPayments.id })

    if (deleted.length === 0) fail("Pagamento não encontrado")

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível estornar o pagamento")
  }
}

export type CommissionPaymentRow = {
  id: string
  batchId: string
  /** Quantos pagamentos saíram no mesmo lote (para a impressão agrupada). */
  batchSize: number
  paidOn: string
  cutoffDate: string
  professionalId: string
  professionalName: string
  /** Quem registrou o pagamento. */
  userName: string | null
  /** De onde saiu. NULL = pago sem registrar no financeiro. */
  accountName: string | null
  entriesAmount: string
  advancesAmount: string
  bonusesAmount: string
  amount: string
  notes: string | null
}

const paymentColumns = {
  id: commissionPayments.id,
  batchId: commissionPayments.batchId,
  batchSize: sql<number>`(count(*) over (partition by ${commissionPayments.batchId}))::int`,
  paidOn: commissionPayments.paidOn,
  cutoffDate: commissionPayments.cutoffDate,
  professionalId: commissionPayments.professionalId,
  professionalName: professionals.name,
  // Cadastro antigo pode ter só nome e sobrenome, sem o nome completo.
  userName: sql<
    string | null
  >`coalesce(${profiles.fullName}, nullif(trim(concat_ws(' ', ${profiles.firstName}, ${profiles.lastName})), ''))`,
  accountName: financialAccounts.name,
  entriesAmount: commissionPayments.entriesAmount,
  advancesAmount: commissionPayments.advancesAmount,
  bonusesAmount: commissionPayments.bonusesAmount,
  amount: commissionPayments.amount,
  notes: commissionPayments.notes,
}

/**
 * Pagamentos feitos num período (pelo dia do pagamento, "YYYY-MM-DD", inclusive),
 * do mais recente para o mais antigo. O total é do período inteiro.
 */
export async function listCommissionPaymentsService(input: {
  salonId: string
  from: string
  to: string
  professionalIds?: string[]
  limit: number
}): Promise<{ rows: CommissionPaymentRow[]; truncated: boolean; totalCents: number }> {
  if (!isCalendarDate(input.from) || !isCalendarDate(input.to)) return { rows: [], truncated: false, totalCents: 0 }
  if (input.professionalIds && input.professionalIds.length === 0) return { rows: [], truncated: false, totalCents: 0 }

  const where = and(
    eq(commissionPayments.salonId, input.salonId),
    gte(commissionPayments.paidOn, input.from),
    lte(commissionPayments.paidOn, input.to),
    input.professionalIds ? inArray(commissionPayments.professionalId, input.professionalIds) : undefined
  )

  const [rows, [total]] = await Promise.all([
    db
      .select(paymentColumns)
      .from(commissionPayments)
      .innerJoin(professionals, eq(professionals.id, commissionPayments.professionalId))
      .leftJoin(profiles, eq(profiles.id, commissionPayments.createdBy))
      .leftJoin(financialAccounts, eq(financialAccounts.id, commissionPayments.accountId))
      .where(where)
      .orderBy(desc(commissionPayments.paidOn), desc(commissionPayments.createdAt), asc(professionals.name))
      .limit(input.limit + 1),
    db
      .select({ amount: sql<string>`coalesce(sum(${commissionPayments.amount}), 0)` })
      .from(commissionPayments)
      .where(where),
  ])

  return {
    rows: rows.slice(0, input.limit),
    truncated: rows.length > input.limit,
    totalCents: toCents(total?.amount) ?? 0,
  }
}

export type CommissionReceipt = {
  payment: CommissionPaymentRow
  entries: {
    id: string
    releaseDate: string | null
    saleNumber: number
    customerName: string | null
    description: string
    role: CommissionRole
    amount: string
  }[]
  adjustments: {
    id: string
    referenceDate: string
    kind: CommissionAdjustmentKind
    amount: string
    notes: string | null
  }[]
}

/** Recibos de um lote ficam numa impressão só; mais que isso é engano de chamada. */
const MAX_RECEIPTS = 200

/**
 * O recibo de UM pagamento (`paymentId`) ou de todos os de um lote (`batchId`), com
 * o que cada um quitou.
 *
 * `professionalIds`: indefinido = qualquer profissional do salão; lista = só os
 * daqueles — quem não vê o extrato de todos só imprime o próprio recibo.
 */
export async function getCommissionReceiptsService(input: {
  salonId: string
  paymentId?: string
  batchId?: string
  professionalIds?: string[]
}): Promise<{ salonName: string; receipts: CommissionReceipt[] }> {
  const [salon] = await db.select({ name: salons.name }).from(salons).where(eq(salons.id, input.salonId)).limit(1)
  const salonName = salon?.name ?? ""

  if (!input.paymentId && !input.batchId) return { salonName, receipts: [] }
  if (input.professionalIds && input.professionalIds.length === 0) return { salonName, receipts: [] }

  const payments = await db
    .select(paymentColumns)
    .from(commissionPayments)
    .innerJoin(professionals, eq(professionals.id, commissionPayments.professionalId))
    .leftJoin(profiles, eq(profiles.id, commissionPayments.createdBy))
    .leftJoin(financialAccounts, eq(financialAccounts.id, commissionPayments.accountId))
    .where(
      and(
        eq(commissionPayments.salonId, input.salonId),
        input.paymentId
          ? eq(commissionPayments.id, input.paymentId)
          : eq(commissionPayments.batchId, input.batchId as string),
        input.professionalIds ? inArray(commissionPayments.professionalId, input.professionalIds) : undefined
      )
    )
    .orderBy(asc(professionals.name))
    .limit(MAX_RECEIPTS)

  if (payments.length === 0) return { salonName, receipts: [] }

  const paymentIds = payments.map((payment) => payment.id)

  const [entryRows, adjustmentRows] = await Promise.all([
    db
      .select({
        id: commissionEntries.id,
        paymentId: commissionEntries.paymentId,
        releaseDate: commissionEntries.releaseDate,
        saleNumber: sales.number,
        customerName: customers.name,
        description: saleItems.description,
        role: commissionEntries.role,
        amount: commissionEntries.amount,
      })
      .from(commissionEntries)
      .innerJoin(sales, eq(sales.id, commissionEntries.saleId))
      .innerJoin(saleItems, eq(saleItems.id, commissionEntries.saleItemId))
      .leftJoin(customers, eq(customers.id, sales.customerId))
      .where(and(eq(commissionEntries.salonId, input.salonId), inArray(commissionEntries.paymentId, paymentIds)))
      .orderBy(asc(commissionEntries.releaseDate), asc(sales.number), asc(saleItems.position)),
    db
      .select({
        id: commissionAdjustments.id,
        paymentId: commissionAdjustments.paymentId,
        referenceDate: commissionAdjustments.referenceDate,
        kind: commissionAdjustments.kind,
        amount: commissionAdjustments.amount,
        notes: commissionAdjustments.notes,
      })
      .from(commissionAdjustments)
      .where(
        and(eq(commissionAdjustments.salonId, input.salonId), inArray(commissionAdjustments.paymentId, paymentIds))
      )
      .orderBy(asc(commissionAdjustments.referenceDate), asc(commissionAdjustments.createdAt)),
  ])

  return {
    salonName,
    receipts: payments.map((payment) => ({
      payment,
      entries: entryRows.filter((row) => row.paymentId === payment.id),
      adjustments: adjustmentRows.filter((row) => row.paymentId === payment.id),
    })),
  }
}
