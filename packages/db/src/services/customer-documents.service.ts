import { createHash, randomBytes } from "node:crypto"
import { and, asc, count, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm"

import { db, customerDocuments, customers, documentTemplates, profiles, salons } from "../index"
import {
  DOCUMENT_LIMITS,
  documentExpiry,
  documentHashInput,
  documentStatus,
  isDocumentToken,
  planDocumentSignature,
  planDocumentTemplate,
  renderDocument,
  type DocumentStatus,
  type DocumentTemplateDraft,
} from "../domain/customer-documents"
import type { ActionResult } from "./appointments"

/**
 * Documentos com assinatura (docs/ROADMAP.md, fase 7, fatia 7e).
 *
 * Só I/O: a regra pura (domain/customer-documents.ts) valida, este arquivo grava.
 * Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta do painel leva `salon_id`. As duas funções
 * PÚBLICAS do fim do arquivo são a exceção de propósito: não há sessão, e a única
 * credencial é o token do documento.
 */

class DocumentRuleError extends Error {}

function fail(message: string): never {
  throw new DocumentRuleError(message)
}

function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined
  const direct = error as { code?: string; cause?: unknown }
  const cause = (typeof direct.cause === "object" && direct.cause !== null ? direct.cause : {}) as { code?: string }
  return direct.code ?? cause.code
}

function toFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof DocumentRuleError) return { success: false, error: error.message }
  if (pgErrorCode(error) === "23505") return { success: false, error: "Já existe um modelo com esse nome" }
  console.error(fallback, error)
  return { success: false, error: fallback }
}

/** 192 bits aleatórios, em base64url (32 caracteres). */
function newDocumentToken(): string {
  return randomBytes(24).toString("base64url")
}

const brazilDay = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

function firstName(row: { firstName: string | null; fullName: string | null }): string | null {
  return row.firstName || row.fullName?.split(" ")[0] || null
}

// ============================================================================
// Modelos
// ============================================================================

export type DocumentTemplateRow = {
  id: string
  name: string
  body: string
  isActive: boolean
  /** Quantos documentos já foram gerados com o modelo. */
  generated: number
}

/** Os modelos do salão, em ordem alfabética. */
export async function listDocumentTemplatesService(
  salonId: string,
  options: { onlyActive?: boolean } = {}
): Promise<DocumentTemplateRow[]> {
  return db
    .select({
      id: documentTemplates.id,
      name: documentTemplates.name,
      body: documentTemplates.body,
      isActive: documentTemplates.isActive,
      generated: sql<number>`(
        select count(*)::int from ${customerDocuments}
        where ${customerDocuments.templateId} = "document_templates"."id"
      )`,
    })
    .from(documentTemplates)
    .where(
      and(
        eq(documentTemplates.salonId, salonId),
        options.onlyActive ? eq(documentTemplates.isActive, true) : undefined
      )
    )
    .orderBy(asc(sql`lower(${documentTemplates.name})`))
}

/** Cria (sem `templateId`) ou altera um modelo. Os documentos já gerados não mudam. */
export async function saveDocumentTemplateService(input: {
  salonId: string
  templateId?: string | null
  isActive: boolean
  draft: DocumentTemplateDraft
}): Promise<ActionResult<{ id: string }>> {
  try {
    const plan = planDocumentTemplate(input.draft)
    if (!plan.ok) return { success: false, error: plan.error }

    const values = { ...plan.template, isActive: input.isActive }

    if (input.templateId) {
      const [updated] = await db
        .update(documentTemplates)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(documentTemplates.id, input.templateId), eq(documentTemplates.salonId, input.salonId)))
        .returning({ id: documentTemplates.id })
      if (!updated) return { success: false, error: "Modelo não encontrado" }
      return { success: true, data: updated }
    }

    const id = await db.transaction(async (tx) => {
      const [total] = await tx
        .select({ value: count() })
        .from(documentTemplates)
        .where(eq(documentTemplates.salonId, input.salonId))
      if ((total?.value ?? 0) >= DOCUMENT_LIMITS.templates) {
        fail(`O salão já tem ${DOCUMENT_LIMITS.templates} modelos. Exclua um para criar outro`)
      }

      const [created] = await tx
        .insert(documentTemplates)
        .values({ ...values, salonId: input.salonId })
        .returning({ id: documentTemplates.id })
      return created.id
    })

    return { success: true, data: { id } }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar o modelo")
  }
}

/** Exclui o modelo. Os documentos já gerados ficam, com o texto gravado neles. */
export async function deleteDocumentTemplateService(input: {
  salonId: string
  templateId: string
}): Promise<ActionResult<void>> {
  try {
    const deleted = await db
      .delete(documentTemplates)
      .where(and(eq(documentTemplates.id, input.templateId), eq(documentTemplates.salonId, input.salonId)))
      .returning({ id: documentTemplates.id })
    if (deleted.length === 0) return { success: false, error: "Modelo não encontrado" }
    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir o modelo")
  }
}

// ============================================================================
// Documentos do cliente
// ============================================================================

export type CustomerDocumentRow = {
  id: string
  title: string
  status: DocumentStatus
  /** Só enquanto dá para assinar: o salão copia o link e manda ao cliente. */
  token: string | null
  createdAt: string
  expiresAt: string
  /** Primeiro nome de quem gerou. NULL quando o usuário foi removido. */
  createdByName: string | null
  signedAt: string | null
  signerName: string | null
}

/** Os documentos de um cliente, do mais recente para o mais antigo. Sem texto nem imagem. */
export async function listCustomerDocumentsService(input: {
  salonId: string
  customerId: string
  now: Date
}): Promise<CustomerDocumentRow[]> {
  const rows = await db
    .select({
      id: customerDocuments.id,
      title: customerDocuments.title,
      token: customerDocuments.token,
      createdAt: customerDocuments.createdAt,
      expiresAt: customerDocuments.expiresAt,
      signedAt: customerDocuments.signedAt,
      signerName: customerDocuments.signerName,
      firstName: profiles.firstName,
      fullName: profiles.fullName,
    })
    .from(customerDocuments)
    .leftJoin(profiles, eq(profiles.id, customerDocuments.createdBy))
    .where(and(eq(customerDocuments.salonId, input.salonId), eq(customerDocuments.customerId, input.customerId)))
    .orderBy(desc(customerDocuments.createdAt))

  return rows.map((row) => {
    const status = documentStatus(row, input.now)
    return {
      id: row.id,
      title: row.title,
      status,
      token: status === "pending" ? row.token : null,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      createdByName: firstName(row),
      signedAt: row.signedAt?.toISOString() ?? null,
      signerName: row.signerName,
    }
  })
}

export type CustomerDocumentDetail = {
  id: string
  title: string
  body: string
  bodyHash: string
  status: DocumentStatus
  createdAt: string
  signedAt: string | null
  signerName: string | null
  signatureImage: string | null
  signerIp: string | null
  signerUserAgent: string | null
}

/** Um documento inteiro: o texto e, se assinado, a assinatura e o registro dela. */
export async function getCustomerDocumentService(input: {
  salonId: string
  customerId: string
  documentId: string
  now: Date
}): Promise<CustomerDocumentDetail | null> {
  const [row] = await db
    .select({
      id: customerDocuments.id,
      title: customerDocuments.title,
      body: customerDocuments.body,
      bodyHash: customerDocuments.bodyHash,
      createdAt: customerDocuments.createdAt,
      expiresAt: customerDocuments.expiresAt,
      signedAt: customerDocuments.signedAt,
      signerName: customerDocuments.signerName,
      signatureImage: customerDocuments.signatureImage,
      signerIp: customerDocuments.signerIp,
      signerUserAgent: customerDocuments.signerUserAgent,
    })
    .from(customerDocuments)
    .where(
      and(
        eq(customerDocuments.id, input.documentId),
        eq(customerDocuments.salonId, input.salonId),
        eq(customerDocuments.customerId, input.customerId)
      )
    )
    .limit(1)
  if (!row) return null

  return {
    id: row.id,
    title: row.title,
    body: row.body,
    bodyHash: row.bodyHash,
    status: documentStatus(row, input.now),
    createdAt: row.createdAt.toISOString(),
    signedAt: row.signedAt?.toISOString() ?? null,
    signerName: row.signerName,
    signatureImage: row.signatureImage,
    signerIp: row.signerIp,
    signerUserAgent: row.signerUserAgent,
  }
}

/**
 * Gera um documento para o cliente a partir de um modelo ativo: tira o retrato do
 * texto, com os campos preenchidos, e cria o link.
 */
export async function createCustomerDocumentService(input: {
  salonId: string
  customerId: string
  templateId: string
  createdBy?: string | null
  now: Date
}): Promise<ActionResult<{ id: string; token: string }>> {
  try {
    const [customer] = await db
      .select({ id: customers.id, name: customers.name, salonName: salons.name })
      .from(customers)
      .innerJoin(salons, eq(salons.id, customers.salonId))
      .where(and(eq(customers.id, input.customerId), eq(customers.salonId, input.salonId)))
      .limit(1)
    if (!customer) return { success: false, error: "Cliente não encontrado" }

    const [template] = await db
      .select({ id: documentTemplates.id, name: documentTemplates.name, body: documentTemplates.body, isActive: documentTemplates.isActive })
      .from(documentTemplates)
      .where(and(eq(documentTemplates.id, input.templateId), eq(documentTemplates.salonId, input.salonId)))
      .limit(1)
    if (!template) return { success: false, error: "Modelo não encontrado" }
    if (!template.isActive) return { success: false, error: "Este modelo está inativo" }

    const rendered = renderDocument(template, {
      cliente: customer.name,
      salao: customer.salonName,
      data: brazilDay.format(input.now),
    })
    if (!rendered.ok) return { success: false, error: rendered.error }

    const [pending] = await db
      .select({ value: count() })
      .from(customerDocuments)
      .where(
        and(
          eq(customerDocuments.salonId, input.salonId),
          eq(customerDocuments.customerId, input.customerId),
          isNull(customerDocuments.signedAt),
          gt(customerDocuments.expiresAt, input.now)
        )
      )
    if ((pending?.value ?? 0) >= DOCUMENT_LIMITS.pendingPerCustomer) {
      return {
        success: false,
        error: `Este cliente já tem ${DOCUMENT_LIMITS.pendingPerCustomer} documentos esperando assinatura. Exclua algum para gerar outro`,
      }
    }

    const [created] = await db
      .insert(customerDocuments)
      .values({
        salonId: input.salonId,
        customerId: input.customerId,
        templateId: template.id,
        title: rendered.title,
        body: rendered.body,
        bodyHash: createHash("sha256").update(documentHashInput(rendered.title, rendered.body)).digest("hex"),
        token: newDocumentToken(),
        expiresAt: documentExpiry(input.now),
        createdBy: input.createdBy ?? null,
        createdAt: input.now,
      })
      .returning({ id: customerDocuments.id, token: customerDocuments.token })

    return { success: true, data: created }
  } catch (error) {
    return toFailure(error, "Não foi possível gerar o documento")
  }
}

/**
 * Exclui um documento. `allowSigned` vem da action: documento assinado só sai com
 * a permissão de excluir clientes. A conferência é na mesma instrução do DELETE,
 * para o documento não ser assinado entre olhar e apagar.
 */
export async function deleteCustomerDocumentService(input: {
  salonId: string
  customerId: string
  documentId: string
  allowSigned: boolean
}): Promise<ActionResult<void>> {
  try {
    const scope = and(
      eq(customerDocuments.id, input.documentId),
      eq(customerDocuments.salonId, input.salonId),
      eq(customerDocuments.customerId, input.customerId)
    )
    const deleted = await db
      .delete(customerDocuments)
      .where(input.allowSigned ? scope : and(scope, isNull(customerDocuments.signedAt)))
      .returning({ id: customerDocuments.id })
    if (deleted.length > 0) return { success: true, data: undefined }

    const [exists] = await db.select({ id: customerDocuments.id }).from(customerDocuments).where(scope).limit(1)
    return {
      success: false,
      error: exists ? "Você não tem permissão para excluir documento assinado" : "Documento não encontrado",
    }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir o documento")
  }
}

/** O cliente tem documento ASSINADO? Quem pergunta é a exclusão de cliente. */
export async function customerHasSignedDocumentService(input: {
  salonId: string
  customerId: string
}): Promise<boolean> {
  const [row] = await db
    .select({ id: customerDocuments.id })
    .from(customerDocuments)
    .where(
      and(
        eq(customerDocuments.salonId, input.salonId),
        eq(customerDocuments.customerId, input.customerId),
        isNotNull(customerDocuments.signedAt)
      )
    )
    .limit(1)
  return !!row
}

// ============================================================================
// Público — sem sessão; a credencial é o token
// ============================================================================

export type PublicDocument = {
  salonName: string
  title: string
  body: string
  bodyHash: string
  status: DocumentStatus
  signedAt: string | null
  signerName: string | null
  signatureImage: string | null
}

/**
 * O que a página pública mostra para um token. NULL = token desconhecido (mesma
 * resposta para "não existe" e "malformado").
 *
 * Devolve o texto do documento (que pode ter o nome do cliente, se o modelo usa
 * {{cliente}}) e, depois de assinado, a assinatura — é a via do cliente. NÃO
 * devolve telefone, id nem nada mais do cadastro, nem o IP gravado.
 */
export async function getPublicDocumentService(token: unknown, now: Date): Promise<PublicDocument | null> {
  if (!isDocumentToken(token)) return null

  const [row] = await db
    .select({
      salonName: salons.name,
      title: customerDocuments.title,
      body: customerDocuments.body,
      bodyHash: customerDocuments.bodyHash,
      expiresAt: customerDocuments.expiresAt,
      signedAt: customerDocuments.signedAt,
      signerName: customerDocuments.signerName,
      signatureImage: customerDocuments.signatureImage,
    })
    .from(customerDocuments)
    .innerJoin(salons, eq(salons.id, customerDocuments.salonId))
    .where(eq(customerDocuments.token, token))
    .limit(1)
  if (!row) return null

  return {
    salonName: row.salonName,
    title: row.title,
    body: row.body,
    bodyHash: row.bodyHash,
    status: documentStatus(row, now),
    signedAt: row.signedAt?.toISOString() ?? null,
    signerName: row.signerName,
    signatureImage: row.signatureImage,
  }
}

/**
 * Grava a assinatura. Uma vez só: a segunda tentativa é recusada, mesmo que duas
 * cheguem juntas (a linha é travada antes de decidir).
 */
export async function signPublicDocumentService(input: {
  token: unknown
  signerName: unknown
  signatureImage: unknown
  accepted: unknown
  ip: string | null
  userAgent: string | null
  now: Date
}): Promise<ActionResult<void>> {
  if (!isDocumentToken(input.token)) return { success: false, error: "Link inválido" }
  const token = input.token

  try {
    const error = await db.transaction(async (tx) => {
      const [document] = await tx
        .select({ id: customerDocuments.id, signedAt: customerDocuments.signedAt, expiresAt: customerDocuments.expiresAt })
        .from(customerDocuments)
        .where(eq(customerDocuments.token, token))
        .for("update")
      if (!document) return "Link inválido"

      const plan = planDocumentSignature({
        status: documentStatus(document, input.now),
        signerName: input.signerName,
        signatureImage: input.signatureImage,
        accepted: input.accepted,
      })
      if (!plan.ok) return plan.error

      await tx
        .update(customerDocuments)
        .set({
          signedAt: input.now,
          signerName: plan.signerName,
          signatureImage: plan.signatureImage,
          signerIp: input.ip?.slice(0, 64) || null,
          signerUserAgent: input.userAgent?.slice(0, 300) || null,
        })
        .where(eq(customerDocuments.id, document.id))
      return null
    })

    return error ? { success: false, error } : { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível registrar a sua assinatura")
  }
}
