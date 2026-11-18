"use server"

import { z } from "zod"
import {
  deleteAppointmentLabelService,
  listAppointmentLabelsService,
  saveAppointmentLabelService,
  setAppointmentLabelService,
  type AppointmentLabelRow,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { formatZodError } from "@/lib/services/validation.service"
import type { ActionResult } from "@/lib/types/common"

/**
 * Etiquetas na agenda (docs/ROADMAP.md, fase 7, fatia 7b).
 *
 * Toda action começa em `authorizeSalon`: sessão → permissão `schedule.*` no
 * salão. O `salonId` chega do cliente, então estar logado não basta (ver
 * __tests__/lib/actions-authz.test.ts). Não há módulo: a agenda é do produto base.
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

const saveLabelSchema = z.object({
  salonId: z.string().uuid(),
  labelId: z.string().uuid().nullish(),
  name: z.string().max(100),
  color: z.string().max(20),
})

const labelRefSchema = z.object({ salonId: z.string().uuid(), labelId: z.string().uuid() })

const setLabelSchema = z.object({
  salonId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  labelId: z.string().uuid().nullable(),
})

/** As etiquetas do salão, em ordem alfabética, com quantos agendamentos usam cada uma. */
export async function getAppointmentLabels(
  salonId: string
): Promise<{ labels: AppointmentLabelRow[]; can: { manage: boolean } } | { error: string }> {
  const auth = await authorizeSalon(salonId, "schedule.access")
  if ("error" in auth) return auth

  try {
    const [labels, permissions] = await Promise.all([
      listAppointmentLabelsService(salonId),
      getSalonPermissions(salonId, auth.userId),
    ])
    return { labels, can: { manage: permissions.has("schedule.edit") } }
  } catch (error) {
    console.error("Erro ao carregar as etiquetas da agenda:", error)
    return { error: "Não foi possível carregar as etiquetas" }
  }
}

/** Cria ou altera uma etiqueta. */
export async function saveAppointmentLabel(input: {
  salonId: string
  labelId?: string | null
  name: string
  color: string
}): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "schedule.edit")
  if ("error" in auth) return auth

  const parsed = saveLabelSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, labelId, ...draft } = parsed.data
  const result = await saveAppointmentLabelService({ salonId, labelId, draft })
  if (!result.success) return { error: result.error }

  return { success: true, data: undefined }
}

/** Exclui uma etiqueta; os agendamentos que a usavam ficam sem etiqueta. */
export async function deleteAppointmentLabel(input: { salonId: string; labelId: string }): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "schedule.edit")
  if ("error" in auth) return auth

  const parsed = labelRefSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await deleteAppointmentLabelService(parsed.data)
  if (!result.success) return { error: result.error }

  return { success: true, data: undefined }
}

/** Põe ou tira (labelId NULL) a etiqueta de um agendamento. */
export async function setAppointmentLabel(input: {
  salonId: string
  appointmentId: string
  labelId: string | null
}): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "schedule.edit")
  if ("error" in auth) return auth

  const parsed = setLabelSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await setAppointmentLabelService(parsed.data)
  if (!result.success) return { error: result.error }

  return { success: true, data: undefined }
}
