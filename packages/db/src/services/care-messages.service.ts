import { and, asc, desc, eq, gt, inArray, isNotNull, lt, lte, ne, notExists, sql } from "drizzle-orm"

import {
  db,
  appointments,
  careMessageDispatches,
  careMessageRules,
  customers,
  products,
  reviewSettings,
  reviews,
  saleItems,
  sales,
  salons,
  services,
} from "../index"
import {
  CARE_OFFSET_LIMITS,
  decideCareDispatch,
  planCareMessageRule,
  saleMessageSchedule,
  toWhatsAppNumber,
  type CareDispatchDecision,
  type CareDispatchKind,
  type CareMessageKind,
  type CareMessageRuleDraft,
} from "../domain/care-messages"
import { parseSalonModules } from "../domain/permissions"
import type { CareDispatchStatus } from "../schema"
import type { ActionResult } from "./appointments"

/**
 * Mensagens de cuidados e de retorno (docs/ROADMAP.md, fase 6, fatia 6d).
 *
 * Só I/O: carrega o que a regra pura (domain/care-messages.ts) precisa, deixa ela
 * decidir e grava. Quem autoriza as telas é a Server Action; quem ENVIA é o app
 * (apps/web/lib/services/care-messages), porque o WhatsApp mora lá — este arquivo
 * só agenda, entrega a fila e registra o resultado.
 *
 * Isolamento por salão: toda consulta das telas leva `salon_id`. A FILA é a
 * exceção de propósito: o cron processa todos os salões, e cada linha carrega o
 * próprio salão.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

class CareMessageRuleError extends Error {}

function fail(message: string): never {
  throw new CareMessageRuleError(message)
}

function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined
  const direct = error as { code?: string; cause?: unknown }
  const cause = (typeof direct.cause === "object" && direct.cause !== null ? direct.cause : {}) as { code?: string }
  return direct.code ?? cause.code
}

function toFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof CareMessageRuleError) return { success: false, error: error.message }
  if (pgErrorCode(error) === "23505") {
    return { success: false, error: "Este item já tem uma mensagem desse tipo. Altere a que existe" }
  }
  console.error(fallback, error)
  return { success: false, error: fallback }
}

// ============================================================================
// As mensagens (telas do salão)
// ============================================================================

export type CareMessageRuleRow = {
  id: string
  kind: CareMessageKind
  serviceId: string | null
  productId: string | null
  itemName: string
  offsetDays: number
  message: string
  isActive: boolean
}

export type CareMessageItemOption = { id: string; name: string }

export async function listCareMessageRulesService(salonId: string): Promise<{
  rules: CareMessageRuleRow[]
  services: CareMessageItemOption[]
  products: CareMessageItemOption[]
}> {
  const [rows, serviceRows, productRows] = await Promise.all([
    db
      .select({
        id: careMessageRules.id,
        kind: careMessageRules.kind,
        serviceId: careMessageRules.serviceId,
        productId: careMessageRules.productId,
        serviceName: services.name,
        productName: products.name,
        offsetDays: careMessageRules.offsetDays,
        message: careMessageRules.message,
        isActive: careMessageRules.isActive,
      })
      .from(careMessageRules)
      .leftJoin(services, eq(services.id, careMessageRules.serviceId))
      .leftJoin(products, eq(products.id, careMessageRules.productId))
      .where(eq(careMessageRules.salonId, salonId)),
    db
      .select({ id: services.id, name: services.name })
      .from(services)
      .where(and(eq(services.salonId, salonId), eq(services.isActive, true)))
      .orderBy(asc(services.name)),
    db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(and(eq(products.salonId, salonId), eq(products.isActive, true)))
      .orderBy(asc(products.name)),
  ])

  const rules = rows
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      serviceId: row.serviceId,
      productId: row.productId,
      itemName: row.serviceName ?? row.productName ?? "—",
      offsetDays: row.offsetDays,
      message: row.message,
      isActive: row.isActive,
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName, "pt-BR") || a.kind.localeCompare(b.kind))

  return { rules, services: serviceRows, products: productRows }
}

/** Cria (sem `ruleId`) ou altera a mensagem de um serviço ou produto. */
export async function saveCareMessageRuleService(input: {
  salonId: string
  ruleId?: string | null
  draft: CareMessageRuleDraft
}): Promise<ActionResult<{ id: string }>> {
  try {
    const plan = planCareMessageRule(input.draft)
    if (!plan.ok) return { success: false, error: plan.error }
    const rule = plan.rule

    const id = await db.transaction(async (tx) => {
      // O item tem que ser deste salão: o id chega do navegador.
      if (rule.serviceId) {
        const [service] = await tx
          .select({ id: services.id })
          .from(services)
          .where(and(eq(services.id, rule.serviceId), eq(services.salonId, input.salonId)))
          .limit(1)
        if (!service) fail("Serviço não encontrado")
      }
      if (rule.productId) {
        const [product] = await tx
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.id, rule.productId), eq(products.salonId, input.salonId)))
          .limit(1)
        if (!product) fail("Produto não encontrado")
      }

      if (input.ruleId) {
        const [updated] = await tx
          .update(careMessageRules)
          .set({ ...rule, updatedAt: new Date() })
          .where(and(eq(careMessageRules.id, input.ruleId), eq(careMessageRules.salonId, input.salonId)))
          .returning({ id: careMessageRules.id })
        if (!updated) fail("Mensagem não encontrada")
        return updated.id
      }

      const [created] = await tx
        .insert(careMessageRules)
        .values({ ...rule, salonId: input.salonId })
        .returning({ id: careMessageRules.id })
      return created.id
    })

    return { success: true, data: { id } }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar a mensagem")
  }
}

/** Exclui a mensagem. Os envios que ainda não saíram vão junto; o histórico fica. */
export async function deleteCareMessageRuleService(input: {
  salonId: string
  ruleId: string
}): Promise<ActionResult<void>> {
  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(careMessageDispatches)
        .where(
          and(
            eq(careMessageDispatches.salonId, input.salonId),
            eq(careMessageDispatches.ruleId, input.ruleId),
            eq(careMessageDispatches.status, "pending")
          )
        )

      const deleted = await tx
        .delete(careMessageRules)
        .where(and(eq(careMessageRules.id, input.ruleId), eq(careMessageRules.salonId, input.salonId)))
        .returning({ id: careMessageRules.id })
      if (deleted.length === 0) fail("Mensagem não encontrada")
    })
    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir a mensagem")
  }
}

export type CareMessageDispatchRow = {
  id: string
  kind: CareDispatchKind
  status: CareDispatchStatus
  customerId: string
  customerName: string
  itemName: string | null
  scheduledFor: Date
  sentAt: Date | null
  body: string | null
  detail: string | null
  saleId: string | null
  saleNumber: number | null
}

/** Os envios mais recentes do salão: o que saiu, o que falhou e o que está na fila. */
export async function listCareMessageDispatchesService(input: {
  salonId: string
  limit: number
}): Promise<{ rows: CareMessageDispatchRow[]; truncated: boolean }> {
  const rows = await db
    .select({
      id: careMessageDispatches.id,
      kind: careMessageDispatches.kind,
      status: careMessageDispatches.status,
      customerId: careMessageDispatches.customerId,
      customerName: customers.name,
      itemName: careMessageDispatches.itemName,
      scheduledFor: careMessageDispatches.scheduledFor,
      sentAt: careMessageDispatches.sentAt,
      body: careMessageDispatches.body,
      detail: careMessageDispatches.detail,
      saleId: careMessageDispatches.saleId,
      saleNumber: sales.number,
    })
    .from(careMessageDispatches)
    .innerJoin(customers, eq(customers.id, careMessageDispatches.customerId))
    .leftJoin(sales, eq(sales.id, careMessageDispatches.saleId))
    .where(eq(careMessageDispatches.salonId, input.salonId))
    .orderBy(desc(careMessageDispatches.scheduledFor), desc(careMessageDispatches.createdAt))
    .limit(input.limit + 1)

  return { rows: rows.slice(0, input.limit), truncated: rows.length > input.limit }
}

/** Tira da fila um envio que ainda não saiu. */
export async function cancelCareMessageDispatchService(input: {
  salonId: string
  dispatchId: string
}): Promise<ActionResult<void>> {
  try {
    const deleted = await db
      .delete(careMessageDispatches)
      .where(
        and(
          eq(careMessageDispatches.id, input.dispatchId),
          eq(careMessageDispatches.salonId, input.salonId),
          eq(careMessageDispatches.status, "pending")
        )
      )
      .returning({ id: careMessageDispatches.id })
    if (deleted.length === 0) return { success: false, error: "Este envio não está mais na fila" }
    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível cancelar o envio")
  }
}

// ============================================================================
// Comanda → fila
// ============================================================================

/**
 * A comanda foi faturada: agenda os cuidados de depois e o retorno dos serviços e
 * produtos dela. Roda DENTRO da transação do faturamento.
 *
 * Um envio por comanda e por mensagem — faturar de novo depois de reabrir não
 * agenda outro. O retorno mais novo substitui o que ainda estava na fila para o
 * mesmo cliente: quem voltou antes da hora não recebe o "já faz tempo" da visita
 * anterior.
 */
export async function enqueueSaleCareMessages(
  tx: Tx,
  input: { salonId: string; saleId: string; customerId: string; saleDate: Date; moduleEnabled: boolean; now: Date }
): Promise<void> {
  if (!input.moduleEnabled) return

  const items = await tx
    .select({ serviceId: saleItems.serviceId, productId: saleItems.productId })
    .from(saleItems)
    .where(and(eq(saleItems.saleId, input.saleId), eq(saleItems.salonId, input.salonId)))

  const serviceIds = [...new Set(items.map((item) => item.serviceId).filter((id): id is string => id !== null))]
  const productIds = [...new Set(items.map((item) => item.productId).filter((id): id is string => id !== null))]
  if (serviceIds.length === 0 && productIds.length === 0) return

  const rules = await tx
    .select({
      id: careMessageRules.id,
      kind: careMessageRules.kind,
      offsetDays: careMessageRules.offsetDays,
      serviceName: services.name,
      productName: products.name,
    })
    .from(careMessageRules)
    .leftJoin(services, eq(services.id, careMessageRules.serviceId))
    .leftJoin(products, eq(products.id, careMessageRules.productId))
    .where(
      and(
        eq(careMessageRules.salonId, input.salonId),
        eq(careMessageRules.isActive, true),
        inArray(careMessageRules.kind, ["post_care", "return"]),
        sql`(${serviceIds.length > 0 ? inArray(careMessageRules.serviceId, serviceIds) : sql`false`} OR ${
          productIds.length > 0 ? inArray(careMessageRules.productId, productIds) : sql`false`
        })`
      )
    )

  for (const rule of rules) {
    const scheduledFor = saleMessageSchedule({ saleDate: input.saleDate, offsetDays: rule.offsetDays, now: input.now })
    if (!scheduledFor) continue

    if (rule.kind === "return") {
      await tx
        .delete(careMessageDispatches)
        .where(
          and(
            eq(careMessageDispatches.salonId, input.salonId),
            eq(careMessageDispatches.customerId, input.customerId),
            eq(careMessageDispatches.ruleId, rule.id),
            eq(careMessageDispatches.status, "pending"),
            ne(careMessageDispatches.saleId, input.saleId)
          )
        )
    }

    await tx
      .insert(careMessageDispatches)
      .values({
        salonId: input.salonId,
        customerId: input.customerId,
        kind: rule.kind,
        ruleId: rule.id,
        saleId: input.saleId,
        itemName: rule.serviceName ?? rule.productName,
        scheduledFor,
      })
      .onConflictDoNothing()
  }
}

/** A comanda foi excluída: o que ainda não saiu não sai mais. */
export async function discardPendingSaleCareMessages(tx: Tx, input: { salonId: string; saleId: string }): Promise<void> {
  await tx
    .delete(careMessageDispatches)
    .where(
      and(
        eq(careMessageDispatches.salonId, input.salonId),
        eq(careMessageDispatches.saleId, input.saleId),
        eq(careMessageDispatches.status, "pending")
      )
    )
}

// ============================================================================
// Agendamento → fila (cuidados de antes)
// ============================================================================

/**
 * Põe na fila os cuidados de antes dos agendamentos que entraram na janela (N dias
 * antes), de todos os salões. O índice único (agendamento, mensagem) garante um
 * envio só. Devolve quantos entraram.
 */
export async function enqueueDuePreCareMessages(now: Date, limit = 200): Promise<number> {
  const horizon = new Date(now.getTime() + CARE_OFFSET_LIMITS.pre_care.max * 24 * 60 * 60 * 1000)

  const due = await db
    .select({
      appointmentId: appointments.id,
      salonId: appointments.salonId,
      customerId: appointments.clientId,
      ruleId: careMessageRules.id,
      serviceName: services.name,
    })
    .from(appointments)
    .innerJoin(
      careMessageRules,
      and(
        eq(careMessageRules.salonId, appointments.salonId),
        eq(careMessageRules.serviceId, appointments.serviceId),
        eq(careMessageRules.kind, "pre_care"),
        eq(careMessageRules.isActive, true)
      )
    )
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(
      and(
        inArray(appointments.status, ["pending", "confirmed"]),
        gt(appointments.date, now),
        lte(appointments.date, horizon),
        // Dentro da janela DESTA mensagem: faltam no máximo N dias.
        sql`${appointments.date} <= ${now.toISOString()}::timestamp + make_interval(days => ${careMessageRules.offsetDays})`,
        isNotNull(appointments.clientId),
        notExists(
          db
            .select({ one: sql`1` })
            .from(careMessageDispatches)
            .where(
              and(
                eq(careMessageDispatches.appointmentId, appointments.id),
                eq(careMessageDispatches.ruleId, careMessageRules.id)
              )
            )
        )
      )
    )
    .orderBy(asc(appointments.date))
    .limit(limit)

  if (due.length === 0) return 0

  const inserted = await db
    .insert(careMessageDispatches)
    .values(
      due.map((row) => ({
        salonId: row.salonId,
        customerId: row.customerId,
        kind: "pre_care" as const,
        ruleId: row.ruleId,
        appointmentId: row.appointmentId,
        itemName: row.serviceName,
        scheduledFor: now,
      }))
    )
    .onConflictDoNothing()
    .returning({ id: careMessageDispatches.id })

  return inserted.length
}

// ============================================================================
// A fila (quem consome é o cron do app)
// ============================================================================

/** Envio que ficou "enviando" mais do que isto morreu no meio do caminho. */
const STUCK_SENDING_MS = 15 * 60 * 1000

export type ClaimedCareDispatch = {
  id: string
  salonId: string
  salonName: string
  kind: CareDispatchKind
  customerName: string
  /** No formato do WhatsApp (+55…). NULL = sem telefone que dê para usar. */
  phone: string | null
  itemName: string | null
  /** O texto da mensagem do item. NULL na avaliação ou se a mensagem foi excluída. */
  ruleMessage: string | null
  /** O pedido de avaliação: o token do link e o texto do salão (NULL = padrão). */
  review: { token: string; whatsappText: string | null } | null
  decision: CareDispatchDecision
}

/**
 * Pega da fila o que já está na hora, marca como "enviando" e devolve com a
 * decisão de cada um (enviar, pular ou esperar) já tomada pela regra.
 *
 * `FOR UPDATE SKIP LOCKED` + o estado "enviando": duas execuções do cron ao mesmo
 * tempo não pegam a mesma linha, e nada sai duas vezes.
 */
export async function claimDueCareDispatches(now: Date, limit: number): Promise<ClaimedCareDispatch[]> {
  // O que morreu no meio de um envio vira falha — reenviar poderia duplicar.
  await db
    .update(careMessageDispatches)
    .set({ status: "failed", detail: "O envio foi interrompido antes de terminar", updatedAt: now })
    .where(
      and(
        eq(careMessageDispatches.status, "sending"),
        lt(careMessageDispatches.updatedAt, new Date(now.getTime() - STUCK_SENDING_MS))
      )
    )

  const claimed = await db.transaction(async (tx) => {
    const due = await tx
      .select({ id: careMessageDispatches.id })
      .from(careMessageDispatches)
      .where(and(eq(careMessageDispatches.status, "pending"), lte(careMessageDispatches.scheduledFor, now)))
      .orderBy(asc(careMessageDispatches.scheduledFor))
      .limit(limit)
      .for("update", { skipLocked: true })

    if (due.length === 0) return []

    return tx
      .update(careMessageDispatches)
      .set({ status: "sending", updatedAt: now })
      .where(
        inArray(
          careMessageDispatches.id,
          due.map((row) => row.id)
        )
      )
      .returning()
  })

  const result: ClaimedCareDispatch[] = []

  for (const row of claimed) {
    const [[salon], [customer], [rule], [sale], [appointment], [review]] = await Promise.all([
      db.select({ name: salons.name, settings: salons.settings }).from(salons).where(eq(salons.id, row.salonId)).limit(1),
      db
        .select({ name: customers.name, phone: customers.phone, optedOutAt: customers.optedOutAt })
        .from(customers)
        .where(eq(customers.id, row.customerId))
        .limit(1),
      row.ruleId
        ? db
            .select({ message: careMessageRules.message, isActive: careMessageRules.isActive })
            .from(careMessageRules)
            .where(eq(careMessageRules.id, row.ruleId))
            .limit(1)
        : Promise.resolve([]),
      row.saleId ? db.select({ status: sales.status }).from(sales).where(eq(sales.id, row.saleId)).limit(1) : Promise.resolve([]),
      row.appointmentId
        ? db
            .select({ status: appointments.status, date: appointments.date })
            .from(appointments)
            .where(eq(appointments.id, row.appointmentId))
            .limit(1)
        : Promise.resolve([]),
      row.reviewId
        ? db
            .select({
              token: reviews.token,
              rating: reviews.rating,
              isEnabled: reviewSettings.isEnabled,
              sendWhatsapp: reviewSettings.sendWhatsapp,
              whatsappText: reviewSettings.whatsappText,
            })
            .from(reviews)
            .leftJoin(reviewSettings, eq(reviewSettings.salonId, reviews.salonId))
            .where(eq(reviews.id, row.reviewId))
            .limit(1)
        : Promise.resolve([]),
    ])

    // Só o retorno precisa saber se o cliente já tem horário marcado.
    let hasUpcoming = false
    if (row.kind === "return") {
      const [upcoming] = await db
        .select({ id: appointments.id })
        .from(appointments)
        .where(
          and(
            eq(appointments.salonId, row.salonId),
            eq(appointments.clientId, row.customerId),
            inArray(appointments.status, ["pending", "confirmed"]),
            gt(appointments.date, now)
          )
        )
        .limit(1)
      hasUpcoming = upcoming !== undefined
    }

    const modules = parseSalonModules(salon?.settings)
    const phone = toWhatsAppNumber(customer?.phone)

    const decision = decideCareDispatch({
      kind: row.kind,
      scheduledFor: row.scheduledFor,
      now,
      moduleEnabled: modules.includes(row.kind === "review" ? "reviews" : "care_messages"),
      customerHasPhone: phone !== null,
      customerOptedOut: customer?.optedOutAt != null,
      rule: rule ? { isActive: rule.isActive } : null,
      saleStatus: sale?.status ?? null,
      appointment: appointment ? { status: appointment.status, at: appointment.date } : null,
      review: review
        ? { answered: review.rating !== null, settingsEnabled: review.isEnabled === true && review.sendWhatsapp === true }
        : null,
      customerHasUpcomingAppointment: hasUpcoming,
    })

    result.push({
      id: row.id,
      salonId: row.salonId,
      salonName: salon?.name ?? "",
      kind: row.kind,
      customerName: customer?.name ?? "",
      phone,
      itemName: row.itemName,
      ruleMessage: rule?.message ?? null,
      review: review ? { token: review.token, whatsappText: review.whatsappText } : null,
      decision,
    })
  }

  return result
}

/** Registra o que aconteceu com um envio que estava "enviando". */
export async function finishCareDispatch(
  dispatchId: string,
  outcome:
    | { status: "sent"; body: string; now: Date }
    | { status: "failed"; body: string | null; detail: string; now: Date }
    | { status: "skipped"; detail: string; now: Date }
    /** Volta para a fila (a comanda está reaberta). */
    | { status: "pending"; now: Date }
): Promise<void> {
  const set =
    outcome.status === "sent"
      ? { status: "sent" as const, body: outcome.body, detail: null, sentAt: outcome.now }
      : outcome.status === "failed"
        ? { status: "failed" as const, body: outcome.body, detail: outcome.detail.slice(0, 500) }
        : outcome.status === "skipped"
          ? { status: "skipped" as const, detail: outcome.detail }
          : { status: "pending" as const }

  await db
    .update(careMessageDispatches)
    .set({ ...set, updatedAt: outcome.now })
    .where(and(eq(careMessageDispatches.id, dispatchId), eq(careMessageDispatches.status, "sending")))
}
