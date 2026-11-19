import { and, asc, count, eq, sql } from "drizzle-orm"

import { db, appointmentLabels, appointments } from "../index"
import {
  MAX_APPOINTMENT_LABELS,
  planAppointmentLabel,
  type AppointmentLabelDraft,
} from "../domain/appointment-labels"
import type { ActionResult } from "./appointments"

/**
 * Etiquetas na agenda (docs/ROADMAP.md, fase 7, fatia 7b).
 *
 * Só I/O: a regra pura (domain/appointment-labels.ts) valida, este arquivo grava.
 * Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`. Marcar um agendamento
 * confere que o agendamento E a etiqueta são do mesmo salão — os dois ids chegam
 * do navegador.
 */

class AppointmentLabelRuleError extends Error {}

function fail(message: string): never {
  throw new AppointmentLabelRuleError(message)
}

function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined
  const direct = error as { code?: string; cause?: unknown }
  const cause = (typeof direct.cause === "object" && direct.cause !== null ? direct.cause : {}) as { code?: string }
  return direct.code ?? cause.code
}

function toFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof AppointmentLabelRuleError) return { success: false, error: error.message }
  if (pgErrorCode(error) === "23505") return { success: false, error: "Já existe uma etiqueta com esse nome" }
  console.error(fallback, error)
  return { success: false, error: fallback }
}

export type AppointmentLabelRow = {
  id: string
  name: string
  color: string
  /** Quantos agendamentos usam a etiqueta (de qualquer data). */
  appointments: number
}

export async function listAppointmentLabelsService(salonId: string): Promise<AppointmentLabelRow[]> {
  return db
    .select({
      id: appointmentLabels.id,
      name: appointmentLabels.name,
      color: appointmentLabels.color,
      appointments: sql<number>`(
        select count(*)::int from ${appointments}
        where ${appointments.labelId} = "appointment_labels"."id"
      )`,
    })
    .from(appointmentLabels)
    .where(eq(appointmentLabels.salonId, salonId))
    .orderBy(asc(sql`lower(${appointmentLabels.name})`))
}

/** Cria (sem `labelId`) ou altera uma etiqueta. */
export async function saveAppointmentLabelService(input: {
  salonId: string
  labelId?: string | null
  draft: AppointmentLabelDraft
}): Promise<ActionResult<{ id: string }>> {
  try {
    const plan = planAppointmentLabel(input.draft)
    if (!plan.ok) return { success: false, error: plan.error }

    if (input.labelId) {
      const [updated] = await db
        .update(appointmentLabels)
        .set({ ...plan.label, updatedAt: new Date() })
        .where(and(eq(appointmentLabels.id, input.labelId), eq(appointmentLabels.salonId, input.salonId)))
        .returning({ id: appointmentLabels.id })
      if (!updated) return { success: false, error: "Etiqueta não encontrada" }
      return { success: true, data: updated }
    }

    const id = await db.transaction(async (tx) => {
      const [total] = await tx
        .select({ value: count() })
        .from(appointmentLabels)
        .where(eq(appointmentLabels.salonId, input.salonId))
      if ((total?.value ?? 0) >= MAX_APPOINTMENT_LABELS) {
        fail(`O salão já tem ${MAX_APPOINTMENT_LABELS} etiquetas. Exclua uma para criar outra`)
      }

      const [created] = await tx
        .insert(appointmentLabels)
        .values({ ...plan.label, salonId: input.salonId })
        .returning({ id: appointmentLabels.id })
      return created.id
    })

    return { success: true, data: { id } }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar a etiqueta")
  }
}

/** Exclui a etiqueta. Os agendamentos que a usavam ficam sem etiqueta (FK SET NULL). */
export async function deleteAppointmentLabelService(input: {
  salonId: string
  labelId: string
}): Promise<ActionResult<void>> {
  try {
    const deleted = await db
      .delete(appointmentLabels)
      .where(and(eq(appointmentLabels.id, input.labelId), eq(appointmentLabels.salonId, input.salonId)))
      .returning({ id: appointmentLabels.id })
    if (deleted.length === 0) return { success: false, error: "Etiqueta não encontrada" }
    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir a etiqueta")
  }
}

/** Põe (ou tira, com `labelId` NULL) a etiqueta de um agendamento. */
export async function setAppointmentLabelService(input: {
  salonId: string
  appointmentId: string
  labelId: string | null
}): Promise<ActionResult<void>> {
  try {
    if (input.labelId) {
      const [label] = await db
        .select({ id: appointmentLabels.id })
        .from(appointmentLabels)
        .where(and(eq(appointmentLabels.id, input.labelId), eq(appointmentLabels.salonId, input.salonId)))
        .limit(1)
      if (!label) return { success: false, error: "Etiqueta não encontrada" }
    }

    // Só o label_id: `updated_at` fica de fora de propósito. A etiqueta é um
    // marcador de tela — não muda horário nem dados do atendimento, então não
    // conta como alteração do agendamento.
    const updated = await db
      .update(appointments)
      .set({ labelId: input.labelId })
      .where(and(eq(appointments.id, input.appointmentId), eq(appointments.salonId, input.salonId)))
      .returning({ id: appointments.id })
    if (updated.length === 0) return { success: false, error: "Agendamento não encontrado" }

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível mudar a etiqueta do agendamento")
  }
}
