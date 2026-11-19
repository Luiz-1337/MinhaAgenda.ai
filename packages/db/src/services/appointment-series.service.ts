import { and, asc, eq, gte, inArray } from "drizzle-orm"

import { db, appointmentSeries, appointments } from "../index"
import { planAppointmentSeries } from "../domain/appointment-series"
import { cancelAppointmentService, createAppointmentService, type ActionResult } from "./appointments"

/**
 * Recorrência de agendamento (docs/ROADMAP.md, fase 7, fatia 7c).
 *
 * Não tem regra de agenda própria: cada data da série é criada pelo
 * `createAppointmentService` (expediente, regra do serviço, conflito, agenda
 * oficial, Google) e cancelada pelo `cancelAppointmentService`. Este arquivo só
 * repete a chamada e amarra os agendamentos numa série.
 *
 * Isolamento por salão: toda consulta leva `salon_id`.
 */

export type AppointmentSeriesResult = {
  /** NULL quando só um agendamento coube: um agendamento sozinho não é série. */
  seriesId: string | null
  created: { date: string; appointmentId: string }[]
  failed: { date: string; error: string }[]
}

/**
 * Cria o agendamento e as repetições, um por um, na ordem das datas.
 *
 * A PRIMEIRA data precisa caber: se ela falha, nada é criado e o erro (com o
 * `code`) volta como no agendamento avulso. As seguintes que não couberem são
 * puladas e relatadas — quem está no balcão resolve as exceções à mão.
 */
export async function createAppointmentSeriesService(input: {
  salonId: string
  professionalId: string
  clientId: string
  serviceId: string
  /** "YYYY-MM-DDTHH:mm" (Brasília). */
  start: string
  intervalWeeks: number
  occurrences: number
  notes?: string
  createdBy?: string | null
  allowServiceRuleOverride?: boolean
}): Promise<ActionResult<AppointmentSeriesResult>> {
  const plan = planAppointmentSeries(input)
  if (!plan.ok) return { success: false, error: plan.error }

  const created: AppointmentSeriesResult["created"] = []
  const failed: AppointmentSeriesResult["failed"] = []

  for (const [index, date] of plan.dates.entries()) {
    const result = await createAppointmentService({
      salonId: input.salonId,
      professionalId: input.professionalId,
      clientId: input.clientId,
      serviceId: input.serviceId,
      // O serviço espera segundos ("...T15:00:00"), como o formulário avulso manda.
      date: `${date}:00`,
      notes: input.notes,
      allowServiceRuleOverride: input.allowServiceRuleOverride,
    })

    if (result.success) {
      created.push({ date, appointmentId: result.data.appointmentId })
      continue
    }

    if (index === 0) return { success: false, error: result.error, code: result.code }
    failed.push({ date, error: result.error })
  }

  if (created.length < 2) {
    return { success: true, data: { seriesId: null, created, failed } }
  }

  try {
    const seriesId = await db.transaction(async (tx) => {
      const [series] = await tx
        .insert(appointmentSeries)
        .values({
          salonId: input.salonId,
          intervalWeeks: plan.intervalWeeks,
          occurrences: plan.occurrences,
          createdBy: input.createdBy ?? null,
        })
        .returning({ id: appointmentSeries.id })

      // Só o series_id: `updated_at` fica de fora, como na etiqueta — amarrar na
      // série não é alteração do atendimento.
      await tx
        .update(appointments)
        .set({ seriesId: series.id })
        .where(
          and(
            eq(appointments.salonId, input.salonId),
            inArray(
              appointments.id,
              created.map((item) => item.appointmentId)
            )
          )
        )

      return series.id
    })

    return { success: true, data: { seriesId, created, failed } }
  } catch (error) {
    // Os agendamentos JÁ existem (e já foram para a agenda oficial e o Google):
    // não se desfaz. Ficam avulsos, e quem chamou é avisado do que foi criado.
    console.error("Agendamentos criados, mas não foi possível amarrá-los numa série", error)
    return { success: true, data: { seriesId: null, created, failed } }
  }
}

/**
 * Cancela um agendamento e os PRÓXIMOS da mesma série (os que ainda estão
 * pendentes ou confirmados, daquela data em diante). Os anteriores ficam.
 */
export async function cancelAppointmentSeriesService(input: {
  salonId: string
  /** O agendamento a partir do qual a série é cancelada. */
  appointmentId: string
  reason?: string
  cancelledBy?: string | null
}): Promise<ActionResult<{ cancelled: number; failed: number }>> {
  try {
    const [pivot] = await db
      .select({ seriesId: appointments.seriesId, date: appointments.date })
      .from(appointments)
      .where(and(eq(appointments.id, input.appointmentId), eq(appointments.salonId, input.salonId)))
      .limit(1)

    if (!pivot) return { success: false, error: "Agendamento não encontrado" }
    if (!pivot.seriesId) return { success: false, error: "Este agendamento não faz parte de uma série" }

    const targets = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.salonId, input.salonId),
          eq(appointments.seriesId, pivot.seriesId),
          gte(appointments.date, pivot.date),
          inArray(appointments.status, ["pending", "confirmed"])
        )
      )
      .orderBy(asc(appointments.date))

    let cancelled = 0
    let failedCount = 0

    for (const target of targets) {
      const result = await cancelAppointmentService({
        appointmentId: target.id,
        salonId: input.salonId,
        reason: input.reason,
        cancelledBy: input.cancelledBy ?? null,
        source: "panel",
      })
      if (result.success) cancelled++
      else failedCount++
    }

    if (cancelled === 0 && failedCount > 0) {
      return { success: false, error: "Não foi possível cancelar os agendamentos da série" }
    }
    return { success: true, data: { cancelled, failed: failedCount } }
  } catch (error) {
    console.error("Não foi possível cancelar a série", error)
    return { success: false, error: "Não foi possível cancelar a série" }
  }
}
