/**
 * Serviço para gerenciar Templates HSM do WhatsApp via Twilio Content API
 * @see https://www.twilio.com/docs/content-api
 */

import { db, whatsappTemplates, salons } from "@repo/db"
import { eq } from "drizzle-orm"
import { logger } from "../logger"
import { getSubaccountCredentials } from "./twilio-subaccount.service"

const CONTENT_API_BASE = "https://content.twilio.com/v1"

/** Tipos de template suportados */
export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION"

export interface TemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"
  text: string
  url?: string
  phoneNumber?: string
}

export interface CreateTemplateOptions {
  name: string
  body: string
  language?: string
  category: TemplateCategory
  header?: string
  footer?: string
  buttons?: TemplateButton[]
}

export interface TemplateApprovalStatus {
  status: "pending" | "approved" | "rejected" | "unsubmitted"
  rejectionReason?: string
  lastUpdated?: Date
}

/** Mensagens de erro por código Twilio Content API */
const TWILIO_ERROR_MESSAGES: Record<number, string> = {
  20003: "Autenticação falhou. Verifique as credenciais.",
  20404: "Template não encontrado.",
  20429: "Muitas requisições. Aguarde alguns minutos.",
  60200: "Variáveis no início/fim da mensagem não são permitidas.",
  60201: "Variáveis adjacentes sem texto entre elas não são permitidas.",
  60202: "Template muito genérico. Adicione mais contexto.",
}

const FALLBACK_MESSAGE = "Erro ao processar template. Verifique os dados e tente novamente."

function mapTwilioError(err: { code?: number; message?: string }): string {
  if (err?.code && TWILIO_ERROR_MESSAGES[err.code]) {
    return TWILIO_ERROR_MESSAGES[err.code]
  }
  if (typeof err?.message === "string" && err.message.length > 0) {
    return err.message
  }
  return FALLBACK_MESSAGE
}

/**
 * Faz requisição autenticada para a Content API
 */
async function contentApiRequest<T>(
  accountSid: string,
  authToken: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64")
  
  const response = await fetch(`${CONTENT_API_BASE}${path}`, {
    method,
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const twilioErr = { code: errorData?.code, message: errorData?.message }
    throw new Error(mapTwilioError(twilioErr))
  }

  return response.json()
}

/**
 * Cria um template na Twilio Content API
 */
export async function createTemplate(
  accountSid: string,
  authToken: string,
  options: CreateTemplateOptions
): Promise<{ contentSid: string }> {
  const { name, body, language = "pt_BR", header, footer, buttons } = options

  // Monta o tipo do template baseado nos componentes
  const templateTypes: Record<string, unknown> = {}
  
  // Template de texto simples
  if (!header && !footer && (!buttons || buttons.length === 0)) {
    templateTypes["twilio/text"] = { body }
  } else {
    // Template com componentes
    const components: unknown[] = []
    
    if (header) {
      components.push({ type: "header", format: "text", text: header })
    }
    
    components.push({ type: "body", text: body })
    
    if (footer) {
      components.push({ type: "footer", text: footer })
    }
    
    if (buttons && buttons.length > 0) {
      const buttonComponents = buttons.map((btn) => {
        if (btn.type === "QUICK_REPLY") {
          return { type: "button", sub_type: "quick_reply", text: btn.text }
        }
        if (btn.type === "URL") {
          return { type: "button", sub_type: "url", text: btn.text, url: btn.url }
        }
        if (btn.type === "PHONE_NUMBER") {
          return { type: "button", sub_type: "phone_number", text: btn.text, phone_number: btn.phoneNumber }
        }
        return null
      }).filter(Boolean)
      
      if (buttonComponents.length > 0) {
        components.push({ type: "buttons", buttons: buttonComponents })
      }
    }
    
    templateTypes["twilio/card"] = { components }
  }

  try {
    const result = await contentApiRequest<{ sid: string }>(
      accountSid,
      authToken,
      "POST",
      "/Content",
      {
        friendly_name: name,
        language,
        types: templateTypes,
      }
    )

    logger.info({ contentSid: result.sid, name }, "Twilio Content template created")
    return { contentSid: result.sid }
  } catch (err) {
    logger.error({ err, name }, "Failed to create Twilio Content template")
    throw err
  }
}

/**
 * Submete um template para aprovação do WhatsApp
 */
export async function submitForApproval(
  accountSid: string,
  authToken: string,
  contentSid: string,
  name: string,
  category: TemplateCategory
): Promise<void> {
  try {
    await contentApiRequest(
      accountSid,
      authToken,
      "POST",
      `/Content/${contentSid}/ApprovalRequests/whatsapp`,
      {
        name,
        category,
      }
    )

    logger.info({ contentSid, name, category }, "Template submitted for WhatsApp approval")
  } catch (err) {
    logger.error({ err, contentSid, name }, "Failed to submit template for approval")
    throw err
  }
}

/**
 * Obtém o status de aprovação de um template
 */
export async function getApprovalStatus(
  accountSid: string,
  authToken: string,
  contentSid: string
): Promise<TemplateApprovalStatus> {
  try {
    const result = await contentApiRequest<{
      whatsapp?: {
        status?: string
        rejection_reason?: string
        date_updated?: string
      }
    }>(
      accountSid,
      authToken,
      "GET",
      `/Content/${contentSid}/ApprovalRequests`
    )

    const waStatus = result.whatsapp

    if (!waStatus) {
      return { status: "unsubmitted" }
    }

    let status: TemplateApprovalStatus["status"] = "pending"
    if (waStatus.status === "approved") status = "approved"
    else if (waStatus.status === "rejected") status = "rejected"

    return {
      status,
      rejectionReason: waStatus.rejection_reason,
      lastUpdated: waStatus.date_updated ? new Date(waStatus.date_updated) : undefined,
    }
  } catch (err) {
    logger.error({ err, contentSid }, "Failed to get template approval status")
    throw err
  }
}

/**
 * Deleta um template da Content API
 */
export async function deleteTemplate(
  accountSid: string,
  authToken: string,
  contentSid: string
): Promise<void> {
  try {
    await contentApiRequest(
      accountSid,
      authToken,
      "DELETE",
      `/Content/${contentSid}`
    )

    logger.info({ contentSid }, "Twilio Content template deleted")
  } catch (err) {
    logger.error({ err, contentSid }, "Failed to delete Twilio Content template")
    throw err
  }
}

/**
 * Lista todos os templates de um salon
 */
export async function listTemplates(
  accountSid: string,
  authToken: string
): Promise<Array<{
  sid: string
  friendlyName: string
  language: string
  dateCreated: string
}>> {
  try {
    const result = await contentApiRequest<{
      contents: Array<{
        sid: string
        friendly_name: string
        language: string
        date_created: string
      }>
    }>(
      accountSid,
      authToken,
      "GET",
      "/Content"
    )

    return result.contents.map((c) => ({
      sid: c.sid,
      friendlyName: c.friendly_name,
      language: c.language,
      dateCreated: c.date_created,
    }))
  } catch (err) {
    logger.error({ err }, "Failed to list Twilio Content templates")
    throw err
  }
}

// ============================================================================
// Funções de alto nível para uso no contexto de salões
// ============================================================================

/**
 * Cria um template para um salão e salva no banco de dados
 */
export async function createSalonTemplate(
  salonId: string,
  options: CreateTemplateOptions
): Promise<string> {
  // Obtém credenciais da subaccount
  const credentials = await getSubaccountCredentials(salonId)
  if (!credentials) {
    throw new Error("Subaccount Twilio não encontrada. Configure o WhatsApp primeiro.")
  }

  // Cria o template na Twilio
  const { contentSid } = await createTemplate(
    credentials.accountSid,
    credentials.authToken,
    options
  )

  // Salva no banco de dados
  await db.insert(whatsappTemplates).values({
    salonId,
    name: options.name,
    language: options.language || "pt_BR",
    category: options.category,
    body: options.body,
    header: options.header,
    footer: options.footer,
    buttons: options.buttons ? JSON.stringify(options.buttons) : null,
    twilioContentSid: contentSid,
    status: "draft",
  })

  return contentSid
}

/**
 * Submete um template do salão para aprovação
 */
export async function submitSalonTemplateForApproval(
  salonId: string,
  templateId: string
): Promise<void> {
  // Busca o template
  const template = await db.query.whatsappTemplates.findFirst({
    where: eq(whatsappTemplates.id, templateId),
  })

  if (!template || template.salonId !== salonId) {
    throw new Error("Template não encontrado")
  }

  if (!template.twilioContentSid) {
    throw new Error("Template não possui Content SID")
  }

  // Obtém credenciais
  const credentials = await getSubaccountCredentials(salonId)
  if (!credentials) {
    throw new Error("Subaccount Twilio não encontrada")
  }

  // Submete para aprovação
  await submitForApproval(
    credentials.accountSid,
    credentials.authToken,
    template.twilioContentSid,
    template.name,
    template.category
  )

  // Atualiza status no banco
  await db
    .update(whatsappTemplates)
    .set({
      status: "pending",
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(whatsappTemplates.id, templateId))
}

/**
 * Sincroniza o status de aprovação de um template
 */
export async function syncTemplateApprovalStatus(
  salonId: string,
  templateId: string
): Promise<TemplateApprovalStatus> {
  // Busca o template
  const template = await db.query.whatsappTemplates.findFirst({
    where: eq(whatsappTemplates.id, templateId),
  })

  if (!template || template.salonId !== salonId) {
    throw new Error("Template não encontrado")
  }

  if (!template.twilioContentSid) {
    return { status: "unsubmitted" }
  }

  // Obtém credenciais
  const credentials = await getSubaccountCredentials(salonId)
  if (!credentials) {
    throw new Error("Subaccount Twilio não encontrada")
  }

  // Busca status na Twilio
  const approvalStatus = await getApprovalStatus(
    credentials.accountSid,
    credentials.authToken,
    template.twilioContentSid
  )

  // Mapeia status da Twilio para o schema (unsubmitted → draft)
  const dbStatus = approvalStatus.status === "unsubmitted" ? "draft" : approvalStatus.status

  // Atualiza no banco
  await db
    .update(whatsappTemplates)
    .set({
      status: dbStatus,
      rejectionReason: approvalStatus.rejectionReason,
      approvedAt: approvalStatus.status === "approved" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(whatsappTemplates.id, templateId))

  return approvalStatus
}

/**
 * Lista todos os templates de um salão
 */
export async function listSalonTemplates(salonId: string) {
  return db.query.whatsappTemplates.findMany({
    where: eq(whatsappTemplates.salonId, salonId),
    orderBy: (templates, { desc }) => [desc(templates.createdAt)],
  })
}

/**
 * Deleta um template do salão
 */
export async function deleteSalonTemplate(
  salonId: string,
  templateId: string
): Promise<void> {
  // Busca o template
  const template = await db.query.whatsappTemplates.findFirst({
    where: eq(whatsappTemplates.id, templateId),
  })

  if (!template || template.salonId !== salonId) {
    throw new Error("Template não encontrado")
  }

  // Se tem Content SID, deleta na Twilio também
  if (template.twilioContentSid) {
    const credentials = await getSubaccountCredentials(salonId)
    if (credentials) {
      try {
        await deleteTemplate(
          credentials.accountSid,
          credentials.authToken,
          template.twilioContentSid
        )
      } catch {
        // Ignora erro se não conseguir deletar na Twilio
        logger.warn({ templateId, contentSid: template.twilioContentSid }, "Failed to delete template from Twilio")
      }
    }
  }

  // Deleta do banco
  await db.delete(whatsappTemplates).where(eq(whatsappTemplates.id, templateId))
}
