"use server"

/**
 * Server Actions da conexão WhatsApp Cloud API (Meta) por salão.
 *
 * Espelha o "conectar WhatsApp" da Evolution, trocando o mecanismo: em vez de
 * QR/instância, o dono conecta o número via Embedded Signup (popup da Meta).
 * Persistimos no AGENTE ATIVO do salão (messaging_provider='cloud' +
 * whatsapp_phone_number_id), que é a chave de resolução de tenant do webhook
 * /cloud.
 *
 * O fluxo padrão devolve phone_number_id + waba_id no evento de sucesso. A
 * COEXISTÊNCIA devolve SÓ o waba_id (evento
 * FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING), então o phone_number_id é resolvido
 * aqui, pela Graph API, depois da troca do code.
 *
 * O `code` do Embedded Signup é OBRIGATÓRIO: só o token do cliente pode assinar
 * nosso app na WABA dele (subscribed_apps), que é o que faz a Meta entregar o
 * inbound. Sem ele a conexão seria gravada morta — painel "Conectado" e nenhuma
 * mensagem chegando. Token de ENVIO = o token do cliente, cifrado em
 * agents.whatsapp_cloud_token (fallback = WHATSAPP_CLOUD_TOKEN da plataforma,
 * que só serve para o número do próprio piloto). O dono nunca digita um token.
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
 * Falha de onboarding cuja mensagem já é segura (e útil) para o dono ver. O
 * catch-all de connectWhatsAppCloud repassa esta mensagem em vez de trocá-la
 * pelo texto genérico — "tem 2 números nessa conta" é acionável, "não foi
 * possível concluir" não é.
 */
class OnboardingError extends Error {}

/**
 * Resolve o phone_number_id a partir da WABA do cliente.
 *
 * Necessário na COEXISTÊNCIA: o evento de sucesso da Meta
 * (FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING) traz só o waba_id, e é o
 * phone_number_id que o webhook /cloud usa para achar o salão — sem ele a
 * conexão "dá certo" na Meta e o inbound cai no vazio.
 *
 * Recusa em vez de chutar quando a WABA tem mais de um número: escolher errado
 * faria a IA responder pela linha errada.
 */
async function resolveWabaPhoneNumberId(wabaId: string, token: string): Promise<string> {
  const res = await fetch(`${GRAPH_BASE}/${wabaId}/phone_numbers?fields=id,display_phone_number`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = (await res.json().catch(() => undefined)) as
    | { data?: Array<{ id?: string; display_phone_number?: string }> }
    | undefined
  if (!res.ok) {
    throw new Error(`phone_numbers falhou (HTTP ${res.status}).`)
  }
  const [first, ...rest] = (json?.data ?? []).filter((n) => !!n.id)
  if (!first?.id) {
    throw new OnboardingError(
      "A Meta conectou a conta, mas nenhum número apareceu nela. Confirme o número no WhatsApp Manager e tente de novo.",
    )
  }
  if (rest.length > 0) {
    throw new OnboardingError(
      `Esta conta da Meta tem ${rest.length + 1} números e não é possível saber qual é o deste salão. ` +
        `Deixe apenas o número do salão na conta e tente de novo.`,
    )
  }
  return first.id
}

/**
 * Dedup CROSS-SALÃO: o número não pode pertencer a OUTRO salão (isolamento de
 * tenant; par com o índice UNIQUE no banco). Dentro do mesmo salão é permitido
 * re-vincular.
 */
async function isNumberTakenByAnotherSalon(phoneNumberId: string, salonId: string): Promise<boolean> {
  const existing = await db.query.agents.findFirst({
    where: eq(agents.whatsappPhoneNumberId, phoneNumberId),
    columns: { id: true, salonId: true },
  })
  return !!existing && existing.salonId !== salonId
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
    // O corpo do erro da Graph (code/subcode/fbtrace) é o que diferencia um PIN
    // errado de um número inelegível — sem ele o log fica só "HTTP 400" e o
    // diagnóstico vira chute. Não carrega token nem code.
    const body = await res.text().catch(() => "")
    throw new Error(`register falhou (HTTP ${res.status}): ${body.slice(0, 300)}`)
  }
}

/**
 * Consulta se o número está em COEXISTÊNCIA (app WhatsApp Business ativo no
 * mesmo número). É o discriminador documentado pela Meta para o pós-onboarding:
 * nesses números o register é PROIBIDO — o QR já registrou, e re-registrar
 * devolve 400 (PIN mismatch). `null` = não deu para saber (campo/req falhou).
 */
async function getIsOnBizApp(phoneNumberId: string, token: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}?fields=is_on_biz_app`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = (await res.json().catch(() => undefined)) as { is_on_biz_app?: boolean } | undefined
    if (!res.ok || typeof json?.is_on_biz_app !== "boolean") return null
    return json.is_on_biz_app
  } catch {
    return null
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
    // Opcional de propósito: na Coexistência a Meta não devolve o
    // phone_number_id no evento de sucesso — resolvemos pela WABA mais abaixo.
    phoneNumberId?: string
    wabaId?: string
    // Embedded Signup: authorization code a ser trocado pelo token do cliente,
    // e qual botão originou (dedicado x coexistência).
    code?: string
    flow?: "standard" | "coexistence"
  },
): Promise<{ success: true; phoneNumberId: string } | { error: string }> {
  const auth = await authorize(salonId)
  if ("error" in auth) return auth

  // O `code` é OBRIGATÓRIO, e a recusa vem ANTES de qualquer escrita.
  //
  // É ele que vira o token do cliente, e é o token do cliente que assina nosso
  // app na WABA dele (subscribed_apps) — o único passo que faz a Meta entregar o
  // inbound. O token da plataforma não tem permissão na WABA de terceiro, então
  // uma conexão gravada sem `code` é MORTA por construção: o painel mostra
  // "Conectado", nenhuma mensagem chega, e não há nem alerta (o webhook nunca é
  // chamado, então nem `cloud_number_not_mapped` dispara).
  if (!input.code) {
    return {
      error:
        'A Meta não devolveu a autorização necessária para receber mensagens. Clique em "Concluir" no popup da Meta e tente conectar novamente.',
    }
  }
  if (!input.wabaId) {
    return { error: "waba_id ausente no retorno do Embedded Signup. Tente conectar novamente." }
  }

  let phoneNumberId = digitsOnly(input.phoneNumberId || "")

  // Se o número veio no evento do popup ou se vamos resolvê-lo pela WABA.
  // NÃO é sinal confiável de qual fluxo rodou (a Coexistência PODE mandar o
  // número no evento — aconteceu em prod 29/jul); serve só de fallback para a
  // decisão do register quando a leitura de is_on_biz_app falhar.
  const numberCameFromEvent = phoneNumberId.length > 0

  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.salonId, salonId), eq(agents.isActive, true)),
    columns: { id: true },
  })
  if (!agent) {
    return { error: "Nenhum agente ativo neste salão. Crie/ative um agente antes de conectar." }
  }

  if (phoneNumberId && (await isNumberTakenByAnotherSalon(phoneNumberId, salonId))) {
    return { error: "Este número já está conectado a outro salão." }
  }

  // Troca o code pelo token DO CLIENTE, assina nosso app na WABA dele (habilita o
  // inbound) e registra o número (só dedicado). Só gravamos o token/número APÓS o
  // subscribed_apps dar certo — o inbound é crítico.
  let encryptedToken: string | null = null
  try {
    const clientToken = await exchangeCodeForToken(input.code)

    // Coexistência: é AQUI que o número finalmente aparece (o evento da Meta
    // trouxe só a WABA).
    if (!phoneNumberId) {
      phoneNumberId = await resolveWabaPhoneNumberId(input.wabaId, clientToken)
      // Primeira vez que sabemos qual é o número — o dedup tem que valer
      // ANTES de assinar a WABA na Meta.
      if (await isNumberTakenByAnotherSalon(phoneNumberId, salonId)) {
        throw new OnboardingError("Este número já está conectado a outro salão.")
      }
    }

    // Registrar ou não: em número de COEXISTÊNCIA o register é proibido (o QR
    // já registrou; repetir dá 400/PIN mismatch — doc manda pular). Em número
    // DEDICADO ele é obrigatório (sem register o número não opera na Cloud
    // API). A fonte da verdade é o campo documentado is_on_biz_app do próprio
    // número — nem o botão clicado (a Meta degrada fluxo em silêncio) nem a
    // forma do evento (a Coexistência pode mandar o número nele) são
    // confiáveis. Fallback (campo ilegível): número resolvido pela WABA só
    // existe no caminho da Coexistência => não registra.
    const onBizApp = await getIsOnBizApp(phoneNumberId, clientToken)
    const isCoexistenceNumber = onBizApp ?? !numberCameFromEvent

    await subscribeAppToWaba(input.wabaId, clientToken)
    if (!isCoexistenceNumber) {
      await registerPhoneNumber(phoneNumberId, clientToken)
    }
    encryptedToken = encryptSecret(clientToken)
  } catch (err) {
    // NUNCA logar code/token; só o contexto seguro.
    logger.error({ err, salonId, phoneNumberId, flow: input.flow }, "Onboarding Cloud (Embedded Signup) falhou")
    if (err instanceof OnboardingError) return { error: err.message }
    return { error: "Não foi possível concluir a conexão com a Meta. Tente novamente." }
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
  } catch (err) {
    // Backstop do índice UNIQUE (corrida concorrente) -> mensagem amigável.
    // O catch é cego a QUALQUER outra falha de escrita, então loga o erro real:
    // sem isso um timeout de banco viraria "já conectado a outro salão" e o
    // erro de verdade se perderia (o catch nem tinha binding).
    logger.error({ err, salonId, phoneNumberId, agentId: agent.id }, "Gravação da conexão Cloud falhou")
    return { error: "Este número já está conectado a outro agente/salão." }
  }

  revalidatePath(`/${salonId}/agents`)
  return { success: true, phoneNumberId }
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
