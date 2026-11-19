"use server"

import { z } from "zod"
import {
  createCustomerDocumentService,
  deleteCustomerDocumentService,
  deleteDocumentTemplateService,
  getCustomerDocumentService,
  listCustomerDocumentsService,
  listDocumentTemplatesService,
  saveDocumentTemplateService,
  type CustomerDocumentDetail,
  type CustomerDocumentRow,
  type DocumentTemplateRow,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { formatZodError } from "@/lib/services/validation.service"
import type { ActionResult } from "@/lib/types/common"

/**
 * Documentos com assinatura — o lado do salão (docs/ROADMAP.md, fase 7, fatia 7e).
 *
 * Toda action começa em `authorizeSalon`: sessão → permissão no salão. O
 * `salonId` chega do cliente, então estar logado não basta (ver
 * __tests__/lib/actions-authz.test.ts). Não há módulo: a ficha do cliente é do
 * produto base.
 *
 * Ver, gerar e gerenciar modelos pedem `customers.documents` — ter acesso aos
 * contatos (`customers.access`) NÃO basta. Excluir documento ASSINADO pede também
 * `customers.delete`.
 *
 * Assinar é do cliente do salão, sem login: fica em `public-documents.ts`.
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

/** Formato das entradas; a regra (limites, campos) fica em domain/customer-documents.ts. */
const saveTemplateSchema = z.object({
  salonId: z.string().uuid(),
  templateId: z.string().uuid().nullish(),
  name: z.string().max(200),
  body: z.string().max(40000),
  isActive: z.boolean(),
})

const templateRefSchema = z.object({ salonId: z.string().uuid(), templateId: z.string().uuid() })

const customerRefSchema = z.object({ salonId: z.string().uuid(), customerId: z.string().uuid() })

const createSchema = z.object({
  salonId: z.string().uuid(),
  customerId: z.string().uuid(),
  templateId: z.string().uuid(),
})

const documentRefSchema = z.object({
  salonId: z.string().uuid(),
  customerId: z.string().uuid(),
  documentId: z.string().uuid(),
})

/** Os modelos do salão (ativos e inativos), com quantos documentos cada um já gerou. */
export async function getDocumentTemplates(
  salonId: string
): Promise<{ templates: DocumentTemplateRow[] } | { error: string }> {
  const auth = await authorizeSalon(salonId, "customers.documents")
  if ("error" in auth) return auth

  try {
    return { templates: await listDocumentTemplatesService(salonId) }
  } catch (error) {
    console.error("Erro ao carregar os modelos de documento:", error)
    return { error: "Não foi possível carregar os modelos" }
  }
}

/** Cria ou altera um modelo. Os documentos já gerados não mudam. */
export async function saveDocumentTemplate(input: z.infer<typeof saveTemplateSchema>): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "customers.documents")
  if ("error" in auth) return auth

  const parsed = saveTemplateSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, templateId, isActive, ...draft } = parsed.data
  const result = await saveDocumentTemplateService({ salonId, templateId, isActive, draft })
  if (!result.success) return { error: result.error }

  return { success: true, data: undefined }
}

/** Exclui um modelo; os documentos já gerados com ele ficam. */
export async function deleteDocumentTemplate(input: { salonId: string; templateId: string }): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "customers.documents")
  if ("error" in auth) return auth

  const parsed = templateRefSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await deleteDocumentTemplateService(parsed.data)
  if (!result.success) return { error: result.error }

  return { success: true, data: undefined }
}

export type CustomerDocumentsData = {
  documents: CustomerDocumentRow[]
  /** Só os modelos ativos: os que dá para gerar agora. */
  templates: { id: string; name: string }[]
  can: { deleteSigned: boolean }
}

/** Os documentos de um cliente e os modelos que dá para gerar. */
export async function getCustomerDocuments(input: {
  salonId: string
  customerId: string
}): Promise<CustomerDocumentsData | { error: string }> {
  const auth = await authorizeSalon(input?.salonId, "customers.documents")
  if ("error" in auth) return auth

  const parsed = customerRefSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  try {
    const [documents, templates, permissions] = await Promise.all([
      listCustomerDocumentsService({ ...parsed.data, now: new Date() }),
      listDocumentTemplatesService(parsed.data.salonId, { onlyActive: true }),
      getSalonPermissions(parsed.data.salonId, auth.userId),
    ])
    return {
      documents,
      templates: templates.map((template) => ({ id: template.id, name: template.name })),
      can: { deleteSigned: permissions.has("customers.delete") },
    }
  } catch (error) {
    console.error("Erro ao carregar os documentos do cliente:", error)
    return { error: "Não foi possível carregar os documentos" }
  }
}

/** Um documento inteiro: o texto e, se assinado, a assinatura e o registro dela. */
export async function getCustomerDocument(input: {
  salonId: string
  customerId: string
  documentId: string
}): Promise<{ document: CustomerDocumentDetail } | { error: string }> {
  const auth = await authorizeSalon(input?.salonId, "customers.documents")
  if ("error" in auth) return auth

  const parsed = documentRefSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  try {
    const document = await getCustomerDocumentService({ ...parsed.data, now: new Date() })
    return document ? { document } : { error: "Documento não encontrado" }
  } catch (error) {
    console.error("Erro ao carregar o documento:", error)
    return { error: "Não foi possível carregar o documento" }
  }
}

/** Gera um documento para o cliente a partir de um modelo e devolve o token do link. */
export async function createCustomerDocument(
  input: z.infer<typeof createSchema>
): Promise<ActionResult<{ token: string }>> {
  const auth = await authorizeSalon(input?.salonId, "customers.documents")
  if ("error" in auth) return auth

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await createCustomerDocumentService({ ...parsed.data, createdBy: auth.userId, now: new Date() })
  if (!result.success) return { error: result.error }

  return { success: true, data: { token: result.data.token } }
}

/** Exclui um documento. O ASSINADO pede `customers.documents` E `customers.delete`. */
export async function deleteCustomerDocument(input: {
  salonId: string
  customerId: string
  documentId: string
}): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "customers.documents")
  if ("error" in auth) return auth

  const parsed = documentRefSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const allowSigned = await can(parsed.data.salonId, auth.userId, "customers.delete")
  const result = await deleteCustomerDocumentService({ ...parsed.data, allowSigned })
  if (!result.success) return { error: result.error }

  return { success: true, data: undefined }
}
