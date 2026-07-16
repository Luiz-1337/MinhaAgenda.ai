"use server"

/**
 * Server Actions da conexão WhatsApp Cloud API (Meta) por salão.
 *
 * Espelha o "conectar WhatsApp" da Evolution, trocando o mecanismo: em vez de
 * QR/instância, o dono conecta o número via Embedded Signup (popup da Meta),
 * que devolve phone_number_id + waba_id. Persistimos no AGENTE ATIVO do salão
 * (messaging_provider='cloud' + whatsapp_phone_number_id), que é a chave de
 * resolução de tenant do webhook /cloud.
 *
 * Token de ENVIO = token da plataforma (env WHATSAPP_CLOUD_TOKEN); o dono
 * coloca só o NÚMERO, nunca um token.
 */

import { createHmac } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import { encryptSecret } from "@/lib/infra/crypto"
import { logger } from "@/lib/infra/logger"
import { db, agents, eq, and } from "@repo/db"
import { revalidatePath } from "next/cache"

export interface WhatsAppCloudStatus {
  connected: boolean
  phoneNumberId: string | null
  wabaId: string | null
}

const GRAPH_BASE = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION ?? "v25.0"}`

/**
 * Troca o authorization code do Embedded Signup pelo access token do CLIENTE
 * (customer-scoped business token). É uma chamada server-to-server com as
 * credenciais do NOSSO app. Lança em falha — nunca loga o code nem o token.
 */
async function exchangeCodeForToken(code: string): Promise<string> {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error("NEXT_PUBLIC_META_APP_ID / WHATSAPP_APP_SECRET ausentes na configuração.")
  }
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`)
  url.searchParams.set("client_id", appId)
  url.searchParams.set("client_secret", appSecret)
  url.searchParams.set("code", code)
  const res = await fetch(url, { method: "GET" })
  const json = (await res.json().catch(() => undefined)) as { access_token?: string } | undefined
  if (!res.ok || !json?.access_token) {
    throw new Error(`Troca do code falhou (HTTP ${res.status}).`)
  }
  return json.access_token
}

/**
 * Assina o NOSSO app nos webhooks da WABA do cliente. Sem isso a Meta não
 * entrega o inbound daquele número. Idempotente (re-assinar devolve success).
 */
async function subscribeAppToWaba(wabaId: string, token: string): Promise<void> {
  const res = await fetch(`${GRAPH_BASE}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`subscribed_apps falhou (HTTP ${res.status}).`)
  }
}

/**
 * Registra o número na Cloud API (só número DEDICADO — na Coexistência o número
 * já está registrado e este passo é pulado). O PIN de verificação em 2 etapas é
 * DERIVADO de forma determinística (ENCRYPTION_KEY + phone_number_id), então
 * re-rodar o onboarding usa o mesmo PIN (idempotente) sem precisar guardá-lo.
 */
async function registerPhoneNumber(phoneNumberId: string, token: string): Promise<void> {
  const secret = process.env.ENCRYPTION_KEY ?? ""
  const digest = createHmac("sha256", secret).update(`wa-register-pin:${phoneNumberId}`).digest("hex")
  const pin = (parseInt(digest.slice(0, 8), 16) % 1_000_000).toString().padStart(6, "0")
  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  })
  if (!res.ok) {
    throw new Error(`register falhou (HTTP ${res.status}).`)
  }
}

async function authorize(salonId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }
  const allowed = await hasSalonPermission(salonId, user.id)
  if (!allowed) return { error: "Sem permissão para este salão" }
  return { ok: true }
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "")
}

/**
 * Conecta o número Cloud ao agente ativo do salão. Chamado pelo onSuccess do
 * Embedded Signup. Faz dedup do phone_number_id (defesa anti-sequestro, par com
 * o índice UNIQUE no banco).
 */
export async function connectWhatsAppCloud(
  salonId: string,
  input: {
    phoneNumberId: string
    wabaId?: string
    // Embedded Signup self-service: authorization code a ser trocado pelo token
    // do cliente + flow (dedicado x coexistência). Quando ausentes (caminho
    // manual/piloto), pula a troca e o envio usa o token da plataforma.
    code?: string
    flow?: "standard" | "coexistence"
  },
): Promise<{ success: true } | { error: string }> {
  const auth = await authorize(salonId)
  if ("error" in auth) return auth

  const phoneNumberId = digitsOnly(input.phoneNumberId || "")
  if (!phoneNumberId) return { error: "phone_number_id inválido" }

  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.salonId, salonId), eq(agents.isActive, true)),
    columns: { id: true },
  })
  if (!agent) {
    return { error: "Nenhum agente ativo neste salão. Crie/ative um agente antes de conectar." }
  }

  // Dedup CROSS-SALÃO: o número não pode pertencer a OUTRO salão (isolamento de
  // tenant). Dentro do mesmo salão é permitido re-vincular (limpeza abaixo).
  const existing = await db.query.agents.findFirst({
    where: eq(agents.whatsappPhoneNumberId, phoneNumberId),
    columns: { id: true, salonId: true },
  })
  if (existing && existing.salonId !== salonId) {
    return { error: "Este número já está conectado a outro salão." }
  }

  // Embedded Signup self-service: troca o code pelo token DO CLIENTE, assina nosso
  // app na WABA dele (habilita o inbound) e registra o número (só dedicado). Sem
  // code (caminho manual/piloto), pula tudo e o envio usa o token da plataforma.
  // Só gravamos o token/número APÓS o subscribed_apps dar certo (inbound é crítico).
  let encryptedToken: string | null = null
  if (input.code) {
    if (!input.wabaId) {
      return { error: "waba_id ausente no retorno do Embedded Signup. Tente conectar novamente." }
    }
    try {
      const clientToken = await exchangeCodeForToken(input.code)
      await subscribeAppToWaba(input.wabaId, clientToken)
      if (input.flow !== "coexistence") {
        // Coexistência: o número já está registrado (app WhatsApp Business) — pula register.
        await registerPhoneNumber(phoneNumberId, clientToken)
      }
      encryptedToken = encryptSecret(clientToken)
    } catch (err) {
      // NUNCA logar code/token; só o contexto seguro.
      logger.error({ err, salonId, phoneNumberId, flow: input.flow }, "Onboarding Cloud (Embedded Signup) falhou")
      return { error: "Não foi possível concluir a conexão com a Meta. Tente novamente." }
    }
  }

  try {
    // Garante UM ÚNICO agente Cloud por salão: limpa a config Cloud de qualquer
    // outro agente do salão (evita split-brain se o agente ativo mudou) ANTES de
    // gravar no agente ativo atual.
    await db
      .update(agents)
      .set({ messagingProvider: "evolution", whatsappPhoneNumberId: null, whatsappWabaId: null, whatsappCloudToken: null, updatedAt: new Date() })
      .where(and(eq(agents.salonId, salonId), eq(agents.messagingProvider, "cloud")))

    await db
      .update(agents)
      .set({
        messagingProvider: "cloud",
        whatsappPhoneNumberId: phoneNumberId,
        whatsappWabaId: input.wabaId ?? null,
        whatsappCloudToken: encryptedToken,
        whatsappStatus: "verified",
        whatsappConnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agent.id))
  } catch {
    // Backstop do índice UNIQUE (corrida concorrente) -> mensagem amigável.
    return { error: "Este número já está conectado a outro agente/salão." }
  }

  revalidatePath(`/${salonId}/agents`)
  return { success: true }
}

/** Desconecta o Cloud do agente ativo (volta a flag para 'evolution'). */
export async function disconnectWhatsAppCloud(
  salonId: string,
): Promise<{ success: true } | { error: string }> {
  const auth = await authorize(salonId)
  if ("error" in auth) return auth

  // Limpa a config Cloud de QUALQUER agente Cloud do salão (não só o ativo) —
  // cobre o caso de o número estar num agente que não é mais o ativo.
  await db
    .update(agents)
    .set({
      messagingProvider: "evolution",
      whatsappPhoneNumberId: null,
      whatsappWabaId: null,
      whatsappCloudToken: null,
      whatsappStatus: null,
      whatsappConnectedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(agents.salonId, salonId), eq(agents.messagingProvider, "cloud")))

  revalidatePath(`/${salonId}/agents`)
  return { success: true }
}

/**
 * Status da conexão Cloud do salão (lê a COLUNA do banco — não bate em API
 * externa). Chamar na page.tsx (RSC) e passar por prop, evitando polling.
 */
export async function getWhatsAppCloudStatus(salonId: string): Promise<WhatsAppCloudStatus> {
  // É uma server action exposta -> precisa se AUTO-autorizar (não confiar só no
  // chamador). Sem permissão, devolve "não conectado" em vez de vazar o número.
  const auth = await authorize(salonId)
  if ("error" in auth) return { connected: false, phoneNumberId: null, wabaId: null }

  // Procura o agente do salão com config Cloud (independente de qual está ativo).
  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.salonId, salonId), eq(agents.messagingProvider, "cloud")),
    columns: { whatsappPhoneNumberId: true, whatsappWabaId: true },
  })
  return {
    connected: !!agent?.whatsappPhoneNumberId,
    phoneNumberId: agent?.whatsappPhoneNumberId ?? null,
    wabaId: agent?.whatsappWabaId ?? null,
  }
}
