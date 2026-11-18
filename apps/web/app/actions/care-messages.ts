"use server"

import { revalidatePath } from "next/cache"
import {
  CARE_OFFSET_LIMITS,
  CARE_SEND_HOURS,
  cancelCareMessageDispatchService,
  deleteCareMessageRuleService,
  listCareMessageDispatchesService,
  listCareMessageRulesService,
  saveCareMessageRuleService,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import {
  careMessageDispatchRefSchema,
  careMessageRuleRefSchema,
  saveCareMessageRuleSchema,
} from "@/lib/schemas/care-messages.schema"
import type { ActionResult } from "@/lib/types/common"
import type { CareMessagesDTO, SaveCareMessageRuleInput } from "@/lib/types/care-messages"

/**
 * Mensagens de cuidados e de retorno — telas do salão (docs/ROADMAP.md, fase 6,
 * fatia 6d).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `care_messages` ligado
 * no salão → permissão `care_messages.*`. O `salonId` chega do cliente, então estar
 * logado não basta (ver __tests__/lib/actions-authz.test.ts).
 *
 * Aqui só se escreve a mensagem e se olha a fila. Quem ENVIA é o cron
 * (app/api/cron/care-messages), sem sessão de usuário.
 */

/** Envios mostrados na tela. */
const DISPATCH_ROWS = 200

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "care_messages"))) {
    return { error: "Mensagens de cuidados e retorno não estão disponíveis neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

/** As mensagens do salão, os itens que podem ter mensagem e os envios recentes. */
export async function getCareMessages(salonId: string): Promise<CareMessagesDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "care_messages.access")
  if ("error" in auth) return auth

  try {
    const [catalog, dispatches, permissions] = await Promise.all([
      listCareMessageRulesService(salonId),
      listCareMessageDispatchesService({ salonId, limit: DISPATCH_ROWS }),
      getSalonPermissions(salonId, auth.userId),
    ])

    return {
      rules: catalog.rules,
      services: catalog.services,
      products: catalog.products,
      dispatches: dispatches.rows.map((row) => ({
        ...row,
        scheduledFor: row.scheduledFor.toISOString(),
        sentAt: row.sentAt ? row.sentAt.toISOString() : null,
      })),
      truncated: dispatches.truncated,
      limits: { ...CARE_OFFSET_LIMITS },
      sendHours: { ...CARE_SEND_HOURS },
      can: { manage: permissions.has("care_messages.manage") },
    }
  } catch (error) {
    console.error("Erro ao carregar as mensagens de cuidados e retorno:", error)
    return { error: "Não foi possível carregar as mensagens" }
  }
}

/** Cria ou altera a mensagem de um serviço ou produto. */
export async function saveCareMessageRule(input: SaveCareMessageRuleInput): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "care_messages.manage")
  if ("error" in auth) return auth

  const parsed = saveCareMessageRuleSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, ruleId, ...draft } = parsed.data
  const result = await saveCareMessageRuleService({ salonId, ruleId, draft })
  if (!result.success) return { error: result.error }

  revalidatePath(`/${salonId}/care-messages`)
  return { success: true, data: undefined }
}

/** Exclui a mensagem; o que ainda estava na fila por causa dela sai junto. */
export async function deleteCareMessageRule(input: { salonId: string; ruleId: string }): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "care_messages.manage")
  if ("error" in auth) return auth

  const parsed = careMessageRuleRefSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await deleteCareMessageRuleService(parsed.data)
  if (!result.success) return { error: result.error }

  revalidatePath(`/${parsed.data.salonId}/care-messages`)
  return { success: true, data: undefined }
}

/** Tira da fila um envio que ainda não saiu. */
export async function cancelCareMessageDispatch(input: { salonId: string; dispatchId: string }): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "care_messages.manage")
  if ("error" in auth) return auth

  const parsed = careMessageDispatchRefSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await cancelCareMessageDispatchService(parsed.data)
  if (!result.success) return { error: result.error }

  revalidatePath(`/${parsed.data.salonId}/care-messages`)
  return { success: true, data: undefined }
}
