/**
 * Serviço para gerenciar Twilio Subaccounts
 * Cada salão tem sua própria subaccount Twilio para isolamento multi-tenant
 * @see https://www.twilio.com/docs/iam/api/subaccounts
 */

import twilio from "twilio"
import { db, salons } from "@repo/db"
import { eq } from "drizzle-orm"
import { logger } from "../logger"
import { encrypt, decrypt, isEncrypted } from "./encryption.service"

// Cache de clientes Twilio por salonId para evitar recriação
const clientCache = new Map<string, { client: twilio.Twilio; expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutos

/** Mensagens de erro por código Twilio */
const TWILIO_ERROR_MESSAGES: Record<number, string> = {
  20003: "Autenticação falhou. Verifique as credenciais da conta Twilio principal.",
  20404: "Recurso não encontrado.",
  20429: "Muitas requisições. Aguarde alguns minutos antes de tentar novamente.",
  21211: "Número de telefone inválido.",
}

const FALLBACK_MESSAGE = "Erro ao criar subaccount Twilio. Verifique as credenciais e tente novamente."

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
 * Obtém o cliente Twilio da conta principal
 */
function getMainTwilioClient(): twilio.Twilio {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN são obrigatórios")
  }
  return twilio(accountSid, authToken)
}

/**
 * Cria uma nova subaccount Twilio para um salão
 * @param friendlyName Nome amigável da subaccount (geralmente o nome do salão)
 * @returns SID e AuthToken da nova subaccount
 */
export async function createSubaccount(friendlyName: string): Promise<{
  accountSid: string
  authToken: string
}> {
  const client = getMainTwilioClient()

  try {
    const subaccount = await client.api.v2010.accounts.create({
      friendlyName: friendlyName.substring(0, 64), // Twilio limita a 64 caracteres
    })

    logger.info(
      { subaccountSid: subaccount.sid, friendlyName: friendlyName.substring(0, 20) },
      "Twilio subaccount created"
    )

    return {
      accountSid: subaccount.sid,
      authToken: subaccount.authToken,
    }
  } catch (err) {
    const twilioErr = err as { code?: number; message?: string }
    logger.error(
      { err, code: twilioErr?.code, friendlyName: friendlyName.substring(0, 20) },
      "Failed to create Twilio subaccount"
    )
    throw new Error(mapTwilioError(twilioErr))
  }
}

/**
 * Obtém ou cria uma subaccount Twilio para um salão
 * Se o salão já tem uma subaccount, retorna o cliente da subaccount
 * Caso contrário, cria uma nova subaccount e salva no banco
 * 
 * @param salonId ID do salão
 * @returns Cliente Twilio configurado com as credenciais da subaccount
 */
export async function getOrCreateSubaccount(salonId: string): Promise<twilio.Twilio> {
  // Verifica cache primeiro
  const cached = clientCache.get(salonId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.client
  }

  // Busca dados do salão
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: {
      id: true,
      name: true,
      twilioSubaccountSid: true,
      twilioSubaccountToken: true,
    },
  })

  if (!salon) {
    throw new Error("Salão não encontrado")
  }

  let accountSid = salon.twilioSubaccountSid
  let authToken = salon.twilioSubaccountToken

  // Se já tem subaccount, descriptografa o token e retorna o cliente
  if (accountSid && authToken) {
    // Descriptografa o token se estiver criptografado
    const decryptedToken = isEncrypted(authToken) ? decrypt(authToken) : authToken

    const client = twilio(accountSid, decryptedToken)
    
    // Adiciona ao cache
    clientCache.set(salonId, {
      client,
      expiresAt: Date.now() + CACHE_TTL_MS,
    })

    return client
  }

  // Cria nova subaccount
  const { accountSid: newSid, authToken: newToken } = await createSubaccount(salon.name)

  // Criptografa o token antes de salvar
  const encryptedToken = encrypt(newToken)

  // Salva no banco
  await db
    .update(salons)
    .set({
      twilioSubaccountSid: newSid,
      twilioSubaccountToken: encryptedToken,
      updatedAt: new Date(),
    })
    .where(eq(salons.id, salonId))

  logger.info(
    { salonId, subaccountSid: newSid },
    "Subaccount created and saved for salon"
  )

  const client = twilio(newSid, newToken)

  // Adiciona ao cache
  clientCache.set(salonId, {
    client,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })

  return client
}

/**
 * Obtém o cliente Twilio de uma subaccount existente
 * Retorna null se o salão não tem subaccount configurada
 * 
 * @param salonId ID do salão
 * @returns Cliente Twilio ou null
 */
export async function getSubaccountClient(salonId: string): Promise<twilio.Twilio | null> {
  // Verifica cache primeiro
  const cached = clientCache.get(salonId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.client
  }

  // Busca dados do salão
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: {
      twilioSubaccountSid: true,
      twilioSubaccountToken: true,
    },
  })

  if (!salon?.twilioSubaccountSid || !salon?.twilioSubaccountToken) {
    return null
  }

  // Descriptografa o token
  const decryptedToken = isEncrypted(salon.twilioSubaccountToken)
    ? decrypt(salon.twilioSubaccountToken)
    : salon.twilioSubaccountToken

  const client = twilio(salon.twilioSubaccountSid, decryptedToken)

  // Adiciona ao cache
  clientCache.set(salonId, {
    client,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })

  return client
}

/**
 * Obtém as credenciais da subaccount de um salão
 * Útil para validação de webhooks
 * 
 * @param salonId ID do salão
 * @returns Credenciais da subaccount ou null
 */
export async function getSubaccountCredentials(salonId: string): Promise<{
  accountSid: string
  authToken: string
} | null> {
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: {
      twilioSubaccountSid: true,
      twilioSubaccountToken: true,
    },
  })

  if (!salon?.twilioSubaccountSid || !salon?.twilioSubaccountToken) {
    return null
  }

  // Descriptografa o token
  const decryptedToken = isEncrypted(salon.twilioSubaccountToken)
    ? decrypt(salon.twilioSubaccountToken)
    : salon.twilioSubaccountToken

  return {
    accountSid: salon.twilioSubaccountSid,
    authToken: decryptedToken,
  }
}

/**
 * Remove a subaccount do cache (útil após atualizar credenciais)
 */
export function invalidateSubaccountCache(salonId: string): void {
  clientCache.delete(salonId)
}

/**
 * Suspende uma subaccount (soft delete)
 * A subaccount pode ser reativada depois
 */
export async function suspendSubaccount(salonId: string): Promise<void> {
  const credentials = await getSubaccountCredentials(salonId)
  if (!credentials) {
    return
  }

  const mainClient = getMainTwilioClient()

  try {
    await mainClient.api.v2010.accounts(credentials.accountSid).update({
      status: "suspended",
    })

    logger.info(
      { salonId, subaccountSid: credentials.accountSid },
      "Twilio subaccount suspended"
    )

    // Limpa o cache
    invalidateSubaccountCache(salonId)
  } catch (err) {
    const twilioErr = err as { code?: number; message?: string }
    logger.error(
      { err, salonId, code: twilioErr?.code },
      "Failed to suspend Twilio subaccount"
    )
    throw new Error(mapTwilioError(twilioErr))
  }
}

/**
 * Reativa uma subaccount suspensa
 */
export async function reactivateSubaccount(salonId: string): Promise<void> {
  const credentials = await getSubaccountCredentials(salonId)
  if (!credentials) {
    throw new Error("Subaccount não encontrada para este salão")
  }

  const mainClient = getMainTwilioClient()

  try {
    await mainClient.api.v2010.accounts(credentials.accountSid).update({
      status: "active",
    })

    logger.info(
      { salonId, subaccountSid: credentials.accountSid },
      "Twilio subaccount reactivated"
    )

    // Limpa o cache para forçar recriação
    invalidateSubaccountCache(salonId)
  } catch (err) {
    const twilioErr = err as { code?: number; message?: string }
    logger.error(
      { err, salonId, code: twilioErr?.code },
      "Failed to reactivate Twilio subaccount"
    )
    throw new Error(mapTwilioError(twilioErr))
  }
}
