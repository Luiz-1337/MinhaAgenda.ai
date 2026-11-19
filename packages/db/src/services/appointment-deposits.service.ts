import { and, eq } from "drizzle-orm"

import { appointmentDeposits, appointments, db, profiles, sales, salons } from "../index"
import {
  parseAdvancePayment,
  planDepositAmount,
  planDepositTransition,
  type AdvancePaymentConfig,
  type DepositAction,
  type DepositSource,
  type DepositStatus,
} from "../domain/appointment-deposits"
import { centsToNumeric, toCents } from "../domain/sales"
import type { ActionResult } from "./appointments"

/**
 * Sinal do agendamento (docs/ROADMAP.md, fase 8, fatia 8a).
 *
 * Só I/O: a regra pura (domain/appointment-deposits.ts) valida, este arquivo
 * grava. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`, e o agendamento é
 * conferido como sendo do salão antes de receber um sinal.
 */

/** O sinal que o salão configurou. NULL = o salão não pede sinal. */
export async function getSalonAdvancePaymentService(salonId: string): Promise<AdvancePaymentConfig | null> {
  const salon = await db.query.salons.findFirst({ where: eq(salons.id, salonId), columns: { settings: true } })
  return parseAdvancePayment(salon?.settings)
}

export type AppointmentDepositRow = {
  id: string
  amountCents: number
  status: DepositStatus
  source: DepositSource
  createdAt: string
  receivedAt: string | null
  /** Primeiro nome de quem marcou como recebido ou dispensado. */
  settledByName: string | null
  /** A comanda em que o sinal foi abatido (fatia 8b). NULL = ainda não foi. */
  appliedSale: { id: string; number: number } | null
}

/** O sinal de um agendamento. NULL = não há sinal. */
export async function getAppointmentDepositService(input: {
  salonId: string
  appointmentId: string
}): Promise<AppointmentDepositRow | null> {
  const [row] = await db
    .select({
      id: appointmentDeposits.id,
      amount: appointmentDeposits.amount,
      status: appointmentDeposits.status,
      source: appointmentDeposits.source,
      createdAt: appointmentDeposits.createdAt,
      receivedAt: appointmentDeposits.receivedAt,
      firstName: profiles.firstName,
      fullName: profiles.fullName,
      saleId: sales.id,
      saleNumber: sales.number,
    })
    .from(appointmentDeposits)
    .leftJoin(profiles, eq(profiles.id, appointmentDeposits.settledBy))
    .leftJoin(sales, and(eq(sales.id, appointmentDeposits.saleId), eq(sales.salonId, input.salonId)))
    .where(
      and(eq(appointmentDeposits.salonId, input.salonId), eq(appointmentDeposits.appointmentId, input.appointmentId))
    )
    .limit(1)
  if (!row) return null

  return {
    id: row.id,
    amountCents: toCents(row.amount) ?? 0,
    status: row.status as DepositStatus,
    source: row.source as DepositSource,
    createdAt: row.createdAt.toISOString(),
    receivedAt: row.receivedAt?.toISOString() ?? null,
    settledByName: row.firstName || row.fullName?.split(" ")[0] || null,
    appliedSale: row.saleId && row.saleNumber !== null ? { id: row.saleId, number: row.saleNumber } : null,
  }
}

/**
 * Cria o pedido de sinal de um agendamento, "aguardando". Um por agendamento: se
 * já existe, devolve erro (quem chama pela página online ignora).
 */
export async function createAppointmentDepositService(input: {
  salonId: string
  appointmentId: string
  amountCents: number
  source: DepositSource
  createdBy?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const plan = planDepositAmount(input.amountCents)
  if (!plan.ok) return { success: false, error: plan.error }

  try {
    const [appointment] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(eq(appointments.id, input.appointmentId), eq(appointments.salonId, input.salonId)))
      .limit(1)
    if (!appointment) return { success: false, error: "Agendamento não encontrado" }

    const [created] = await db
      .insert(appointmentDeposits)
      .values({
        salonId: input.salonId,
        appointmentId: input.appointmentId,
        amount: centsToNumeric(plan.amountCents),
        status: "pending",
        source: input.source,
        createdBy: input.createdBy ?? null,
      })
      .onConflictDoNothing({ target: appointmentDeposits.appointmentId })
      .returning({ id: appointmentDeposits.id })
    if (!created) return { success: false, error: "Este agendamento já tem sinal" }

    return { success: true, data: created }
  } catch (error) {
    console.error("Não foi possível registrar o sinal", error)
    return { success: false, error: "Não foi possível registrar o sinal" }
  }
}

/** Marca o sinal como recebido, dispensado ou de volta a "aguardando". */
export async function settleAppointmentDepositService(input: {
  salonId: string
  appointmentId: string
  action: DepositAction
  userId: string
  now: Date
}): Promise<ActionResult<{ status: DepositStatus }>> {
  try {
    return await db.transaction(async (tx) => {
      const [deposit] = await tx
        .select({
          id: appointmentDeposits.id,
          status: appointmentDeposits.status,
          saleId: appointmentDeposits.saleId,
        })
        .from(appointmentDeposits)
        .where(
          and(
            eq(appointmentDeposits.salonId, input.salonId),
            eq(appointmentDeposits.appointmentId, input.appointmentId)
          )
        )
        .for("update")
      if (!deposit) return { success: false as const, error: "Este agendamento não tem sinal" }

      const plan = planDepositTransition(deposit.status as DepositStatus, input.action, deposit.saleId !== null)
      if (!plan.ok) return { success: false as const, error: plan.error }

      await tx
        .update(appointmentDeposits)
        .set({
          status: plan.status,
          receivedAt: plan.status === "received" ? input.now : null,
          settledBy: plan.status === "pending" ? null : input.userId,
          updatedAt: input.now,
        })
        .where(eq(appointmentDeposits.id, deposit.id))

      return { success: true as const, data: { status: plan.status } }
    })
  } catch (error) {
    console.error("Não foi possível atualizar o sinal", error)
    return { success: false, error: "Não foi possível atualizar o sinal" }
  }
}

/** Apaga o pedido de sinal. Só o que ainda está "aguardando": o recebido é registro. */
export async function deleteAppointmentDepositService(input: {
  salonId: string
  appointmentId: string
}): Promise<ActionResult<void>> {
  try {
    const deleted = await db
      .delete(appointmentDeposits)
      .where(
        and(
          eq(appointmentDeposits.salonId, input.salonId),
          eq(appointmentDeposits.appointmentId, input.appointmentId),
          eq(appointmentDeposits.status, "pending")
        )
      )
      .returning({ id: appointmentDeposits.id })
    if (deleted.length === 0) {
      return { success: false, error: "Só dá para tirar o sinal que ainda está aguardando. Reabra antes" }
    }
    return { success: true, data: undefined }
  } catch (error) {
    console.error("Não foi possível tirar o sinal", error)
    return { success: false, error: "Não foi possível tirar o sinal" }
  }
}
