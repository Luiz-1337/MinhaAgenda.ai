"use server"

import { z } from "zod"
import {
  deleteAnamnesisTemplateService,
  deleteCustomerAnamnesisService,
  fillCustomerAnamnesisService,
  listAnamnesisTemplatesService,
  listCustomerAnamnesesService,
  saveAnamnesisTemplateService,
  type AnamnesisTemplateRow,
  type CustomerAnamnesisRow,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { formatZodError } from "@/lib/services/validation.service"
import type { ActionResult } from "@/lib/types/common"

/**
 * Anamneses (docs/ROADMAP.md, fase 7, fatia 7d).
 *
 * Toda action começa em `authorizeSalon`: sessão → permissão no salão. O
 * `salonId` chega do cliente, então estar logado não basta (ver
 * __tests__/lib/actions-authz.test.ts). Não há módulo: a ficha do cliente é do
 * produto base.
 *
 * A anamnese é dado de saúde. Ver e preencher pedem `customers.anamneses` — ter
 * acesso aos contatos (`customers.access`) NÃO basta. Excluir uma ficha
 * respondida pede também `customers.delete`.
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

/** Formato das entradas; a regra (limites, tipos, obrigatórias) fica em domain/anamneses.ts. */
const questionSchema = z.object({
  id: z.string().max(40).optional(),
  label: z.string().max(400),
  type: z.string().max(30),
  required: z.boolean(),
  options: z.array(z.string().max(200)).max(50),
})

const saveTemplateSchema = z.object({
  salonId: z.string().uuid(),
  templateId: z.string().uuid().nullish(),
  name: z.string().max(200),
  isActive: z.boolean(),
  questions: z.array(questionSchema).max(100),
})

const templateRefSchema = z.object({ salonId: z.string().uuid(), templateId: z.string().uuid() })

const customerRefSchema = z.object({ salonId: z.string().uuid(), customerId: z.string().uuid() })

const answerSchema = z.union([z.string().max(5000), z.boolean(), z.array(z.string().max(200)).max(50), z.null()])

const fillSchema = z.object({
  salonId: z.string().uuid(),
  customerId: z.string().uuid(),
  templateId: z.string().uuid(),
  answers: z.record(z.string().max(40), answerSchema),
})

const anamnesisRefSchema = z.object({
  salonId: z.string().uuid(),
  customerId: z.string().uuid(),
  anamnesisId: z.string().uuid(),
})

/** Os modelos do salão (ativos e inativos), com quantas fichas cada um já tem. */
export async function getAnamnesisTemplates(
  salonId: string
): Promise<{ templates: AnamnesisTemplateRow[] } | { error: string }> {
  const auth = await authorizeSalon(salonId, "customers.anamneses")
  if ("error" in auth) return auth

  try {
    return { templates: await listAnamnesisTemplatesService(salonId) }
  } catch (error) {
    console.error("Erro ao carregar os modelos de anamnese:", error)
    return { error: "Não foi possível carregar os modelos" }
  }
}

/** Cria ou altera um modelo. As fichas já respondidas não mudam. */
export async function saveAnamnesisTemplate(input: z.infer<typeof saveTemplateSchema>): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "customers.anamneses")
  if ("error" in auth) return auth

  const parsed = saveTemplateSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, templateId, isActive, ...draft } = parsed.data
  const result = await saveAnamnesisTemplateService({ salonId, templateId, isActive, draft })
  if (!result.success) return { error: result.error }

  return { success: true, data: undefined }
}

/** Exclui um modelo; as fichas já respondidas com ele ficam. */
export async function deleteAnamnesisTemplate(input: { salonId: string; templateId: string }): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "customers.anamneses")
  if ("error" in auth) return auth

  const parsed = templateRefSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await deleteAnamnesisTemplateService(parsed.data)
  if (!result.success) return { error: result.error }

  return { success: true, data: undefined }
}

export type CustomerAnamnesesData = {
  anamneses: CustomerAnamnesisRow[]
  /** Só os modelos ativos: os que dá para responder agora. */
  templates: AnamnesisTemplateRow[]
  can: { delete: boolean }
}

/** As anamneses de um cliente e os modelos que dá para responder. */
export async function getCustomerAnamneses(input: {
  salonId: string
  customerId: string
}): Promise<CustomerAnamnesesData | { error: string }> {
  const auth = await authorizeSalon(input?.salonId, "customers.anamneses")
  if ("error" in auth) return auth

  const parsed = customerRefSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  try {
    const [anamneses, templates, permissions] = await Promise.all([
      listCustomerAnamnesesService(parsed.data),
      listAnamnesisTemplatesService(parsed.data.salonId, { onlyActive: true }),
      getSalonPermissions(parsed.data.salonId, auth.userId),
    ])
    return { anamneses, templates, can: { delete: permissions.has("customers.delete") } }
  } catch (error) {
    console.error("Erro ao carregar as anamneses do cliente:", error)
    return { error: "Não foi possível carregar as anamneses" }
  }
}

/** Grava uma ficha respondida. Responder de novo cria outra; a anterior fica no histórico. */
export async function fillCustomerAnamnesis(input: z.infer<typeof fillSchema>): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "customers.anamneses")
  if ("error" in auth) return auth

  const parsed = fillSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await fillCustomerAnamnesisService({ ...parsed.data, filledBy: auth.userId })
  if (!result.success) return { error: result.error }

  return { success: true, data: undefined }
}

/** Exclui uma ficha respondida. Pede `customers.anamneses` E `customers.delete`. */
export async function deleteCustomerAnamnesis(input: {
  salonId: string
  customerId: string
  anamnesisId: string
}): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "customers.anamneses")
  if ("error" in auth) return auth

  const parsed = anamnesisRefSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  if (!(await can(parsed.data.salonId, auth.userId, "customers.delete"))) {
    return { error: "Você não tem permissão para excluir anamneses" }
  }

  const result = await deleteCustomerAnamnesisService(parsed.data)
  if (!result.success) return { error: result.error }

  return { success: true, data: undefined }
}
