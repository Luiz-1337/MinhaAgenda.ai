"use server"

import { z } from "zod"
import {
  createAppointmentDepositService,
  deleteAppointmentDepositService,
  getAppointmentDepositService,
  getSalonAdvancePaymentService,
  settleAppointmentDepositService,
  DEPOSIT_ACTIONS,
  type AppointmentDepositRow,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can } from "@/lib/services/permissions.service"
import { formatZodError } from "@/lib/services/validation.service"
import type { ActionResult } from "@/lib/types/common"

/**
 * Sinal do agendamento — o lado do salão (docs/ROADMAP.md, fase 8, fatia 8a).
 *
 * Toda action começa em `authorizeSalon`: sessão → permissão no salão. O
 * `salonId` chega do cliente, então estar logado não basta (ver
 * __tests__/lib/actions-authz.test.ts). Não há módulo: o sinal é da agenda, que é
 * do produto base, e a configuração dele já existia.
 *
 * Ver o sinal é de quem vê a agenda (`schedule.access`). Lançar, marcar como
 * recebido, dispensar, reabrir e tirar é de quem edita (`schedule.edit`).
 *
 * O sistema NÃO recebe o dinheiro: estas actions só registram o que alguém do
 * salão viu chegar por PIX.
 */

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

const refSchema = z.object({ salonId: z.string().uuid(), appointmentId: z.string().uuid() })

const createSchema = refSchema.extend({ amountCents: z.number().int() })

const settleSchema = refSchema.extend({ action: z.enum(DEPOSIT_ACTIONS) })

export type AppointmentDepositData = {
  deposit: AppointmentDepositRow | null
  /** O valor que o salão configurou para o sinal, em centavos. NULL = não configurou. */
  suggestedCents: number | null
  can: { manage: boolean }
}

/** O sinal de um agendamento e o valor sugerido pelo que o salão configurou. */
export async function getAppointmentDeposit(input: {
  salonId: string
  appointmentId: string
}): Promise<AppointmentDepositData | { error: string }> {
  const auth = await authorizeSalon(input?.salonId, "schedule.access")
  if ("error" in auth) return auth

  const parsed = refSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  try {
    const [deposit, config, manage] = await Promise.all([
      getAppointmentDepositService(parsed.data),
      getSalonAdvancePaymentService(parsed.data.salonId),
      can(parsed.data.salonId, auth.userId, "schedule.edit"),
    ])
    return { deposit, suggestedCents: config?.amountCents ?? null, can: { manage } }
  } catch (error) {
    console.error("Erro ao carregar o sinal do agendamento:", error)
    return { error: "Não foi possível carregar o sinal" }
  }
}

/** Lança um pedido de sinal num agendamento que não tem. */
export async function createAppointmentDeposit(input: z.infer<typeof createSchema>): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "schedule.edit")
  if ("error" in auth) return auth

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await createAppointmentDepositService({ ...parsed.data, source: "panel", createdBy: auth.userId })
  if (!result.success) return { error: result.error }

  return { success: true, data: undefined }
}

/** Marca o sinal como recebido, dispensado, ou de volta a "aguardando". */
export async function settleAppointmentDeposit(input: z.infer<typeof settleSchema>): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "schedule.edit")
  if ("error" in auth) return auth

  const parsed = settleSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await settleAppointmentDepositService({ ...parsed.data, userId: auth.userId, now: new Date() })
  if (!result.success) return { error: result.error }

  return { success: true, data: undefined }
}

/** Tira o pedido de sinal. Só o que ainda está "aguardando". */
export async function deleteAppointmentDeposit(input: z.infer<typeof refSchema>): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "schedule.edit")
  if ("error" in auth) return auth

  const parsed = refSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await deleteAppointmentDepositService(parsed.data)
  if (!result.success) return { error: result.error }

  return { success: true, data: undefined }
}
