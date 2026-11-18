import { and, asc, count, desc, eq, sql } from "drizzle-orm"

import { db, anamnesisTemplates, customerAnamneses, customers, profiles } from "../index"
import {
  ANAMNESIS_LIMITS,
  parseAnamnesisAnswers,
  parseAnamnesisQuestions,
  planAnamnesisAnswers,
  planAnamnesisTemplate,
  type AnamnesisAnswer,
  type AnamnesisQuestion,
  type AnamnesisTemplateDraft,
} from "../domain/anamneses"
import type { ActionResult } from "./appointments"

/**
 * Anamneses (docs/ROADMAP.md, fase 7, fatia 7d).
 *
 * Só I/O: a regra pura (domain/anamneses.ts) valida, este arquivo grava. Quem
 * autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`. Responder confere que o
 * cliente E o modelo são do mesmo salão — os dois ids chegam do navegador.
 */

class AnamnesisRuleError extends Error {}

function fail(message: string): never {
  throw new AnamnesisRuleError(message)
}

function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined
  const direct = error as { code?: string; cause?: unknown }
  const cause = (typeof direct.cause === "object" && direct.cause !== null ? direct.cause : {}) as { code?: string }
  return direct.code ?? cause.code
}

function toFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof AnamnesisRuleError) return { success: false, error: error.message }
  if (pgErrorCode(error) === "23505") return { success: false, error: "Já existe um modelo com esse nome" }
  console.error(fallback, error)
  return { success: false, error: fallback }
}

export type AnamnesisTemplateRow = {
  id: string
  name: string
  isActive: boolean
  questions: AnamnesisQuestion[]
  /** Quantas fichas já foram respondidas com o modelo. */
  filled: number
}

/** Os modelos do salão, em ordem alfabética. */
export async function listAnamnesisTemplatesService(
  salonId: string,
  options: { onlyActive?: boolean } = {}
): Promise<AnamnesisTemplateRow[]> {
  const rows = await db
    .select({
      id: anamnesisTemplates.id,
      name: anamnesisTemplates.name,
      isActive: anamnesisTemplates.isActive,
      questions: anamnesisTemplates.questions,
      filled: sql<number>`(
        select count(*)::int from ${customerAnamneses}
        where ${customerAnamneses.templateId} = "anamnesis_templates"."id"
      )`,
    })
    .from(anamnesisTemplates)
    .where(
      and(
        eq(anamnesisTemplates.salonId, salonId),
        options.onlyActive ? eq(anamnesisTemplates.isActive, true) : undefined
      )
    )
    .orderBy(asc(sql`lower(${anamnesisTemplates.name})`))

  return rows.map((row) => ({ ...row, questions: parseAnamnesisQuestions(row.questions) }))
}

/** Cria (sem `templateId`) ou altera um modelo. As fichas já respondidas não mudam. */
export async function saveAnamnesisTemplateService(input: {
  salonId: string
  templateId?: string | null
  isActive: boolean
  draft: AnamnesisTemplateDraft
}): Promise<ActionResult<{ id: string }>> {
  try {
    const plan = planAnamnesisTemplate(input.draft)
    if (!plan.ok) return { success: false, error: plan.error }

    const values = { ...plan.template, isActive: input.isActive }

    if (input.templateId) {
      const [updated] = await db
        .update(anamnesisTemplates)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(anamnesisTemplates.id, input.templateId), eq(anamnesisTemplates.salonId, input.salonId)))
        .returning({ id: anamnesisTemplates.id })
      if (!updated) return { success: false, error: "Modelo não encontrado" }
      return { success: true, data: updated }
    }

    const id = await db.transaction(async (tx) => {
      const [total] = await tx
        .select({ value: count() })
        .from(anamnesisTemplates)
        .where(eq(anamnesisTemplates.salonId, input.salonId))
      if ((total?.value ?? 0) >= ANAMNESIS_LIMITS.templates) {
        fail(`O salão já tem ${ANAMNESIS_LIMITS.templates} modelos. Exclua um para criar outro`)
      }

      const [created] = await tx
        .insert(anamnesisTemplates)
        .values({ ...values, salonId: input.salonId })
        .returning({ id: anamnesisTemplates.id })
      return created.id
    })

    return { success: true, data: { id } }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar o modelo")
  }
}

/** Exclui o modelo. As fichas já respondidas ficam, com o nome do modelo gravado nelas. */
export async function deleteAnamnesisTemplateService(input: {
  salonId: string
  templateId: string
}): Promise<ActionResult<void>> {
  try {
    const deleted = await db
      .delete(anamnesisTemplates)
      .where(and(eq(anamnesisTemplates.id, input.templateId), eq(anamnesisTemplates.salonId, input.salonId)))
      .returning({ id: anamnesisTemplates.id })
    if (deleted.length === 0) return { success: false, error: "Modelo não encontrado" }
    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir o modelo")
  }
}

export type CustomerAnamnesisRow = {
  id: string
  templateName: string
  answers: AnamnesisAnswer[]
  /** Primeiro nome de quem preencheu. NULL quando o usuário foi removido. */
  filledByName: string | null
  createdAt: string
}

/** As fichas respondidas de um cliente, da mais recente para a mais antiga. */
export async function listCustomerAnamnesesService(input: {
  salonId: string
  customerId: string
}): Promise<CustomerAnamnesisRow[]> {
  const rows = await db
    .select({
      id: customerAnamneses.id,
      templateName: customerAnamneses.templateName,
      answers: customerAnamneses.answers,
      createdAt: customerAnamneses.createdAt,
      firstName: profiles.firstName,
      fullName: profiles.fullName,
    })
    .from(customerAnamneses)
    .leftJoin(profiles, eq(profiles.id, customerAnamneses.filledBy))
    .where(and(eq(customerAnamneses.salonId, input.salonId), eq(customerAnamneses.customerId, input.customerId)))
    .orderBy(desc(customerAnamneses.createdAt))

  return rows.map((row) => ({
    id: row.id,
    templateName: row.templateName,
    answers: parseAnamnesisAnswers(row.answers),
    filledByName: row.firstName || row.fullName?.split(" ")[0] || null,
    createdAt: row.createdAt.toISOString(),
  }))
}

/** Grava uma ficha respondida. Responder de novo cria outra: a anterior fica no histórico. */
export async function fillCustomerAnamnesisService(input: {
  salonId: string
  customerId: string
  templateId: string
  /** { idDaPergunta: resposta } */
  answers: unknown
  filledBy?: string | null
}): Promise<ActionResult<{ id: string }>> {
  try {
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.salonId, input.salonId)))
      .limit(1)
    if (!customer) return { success: false, error: "Cliente não encontrado" }

    const [template] = await db
      .select({
        id: anamnesisTemplates.id,
        name: anamnesisTemplates.name,
        isActive: anamnesisTemplates.isActive,
        questions: anamnesisTemplates.questions,
      })
      .from(anamnesisTemplates)
      .where(and(eq(anamnesisTemplates.id, input.templateId), eq(anamnesisTemplates.salonId, input.salonId)))
      .limit(1)
    if (!template) return { success: false, error: "Modelo não encontrado" }
    if (!template.isActive) return { success: false, error: "Este modelo está inativo" }

    const plan = planAnamnesisAnswers(parseAnamnesisQuestions(template.questions), input.answers)
    if (!plan.ok) return { success: false, error: plan.error }

    const [created] = await db
      .insert(customerAnamneses)
      .values({
        salonId: input.salonId,
        customerId: input.customerId,
        templateId: template.id,
        templateName: template.name,
        answers: plan.answers,
        filledBy: input.filledBy ?? null,
      })
      .returning({ id: customerAnamneses.id })

    return { success: true, data: created }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar a anamnese")
  }
}

/** Exclui uma ficha respondida (lançada por engano, ou a pedido do cliente). */
export async function deleteCustomerAnamnesisService(input: {
  salonId: string
  customerId: string
  anamnesisId: string
}): Promise<ActionResult<void>> {
  try {
    const deleted = await db
      .delete(customerAnamneses)
      .where(
        and(
          eq(customerAnamneses.id, input.anamnesisId),
          eq(customerAnamneses.salonId, input.salonId),
          eq(customerAnamneses.customerId, input.customerId)
        )
      )
      .returning({ id: customerAnamneses.id })
    if (deleted.length === 0) return { success: false, error: "Anamnese não encontrada" }
    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir a anamnese")
  }
}
