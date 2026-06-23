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

import { createClient } from "@/lib/supabase/server"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import { db, agents, eq, and } from "@repo/db"
import { revalidatePath } from "next/cache"

export interface WhatsAppCloudStatus {
  connected: boolean
  phoneNumberId: string | null
  wabaId: string | null
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
  input: { phoneNumberId: string; wabaId?: string },
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

  try {
    // Garante UM ÚNICO agente Cloud por salão: limpa a config Cloud de qualquer
    // outro agente do salão (evita split-brain se o agente ativo mudou) ANTES de
    // gravar no agente ativo atual.
    await db
      .update(agents)
      .set({ messagingProvider: "evolution", whatsappPhoneNumberId: null, whatsappWabaId: null, updatedAt: new Date() })
      .where(and(eq(agents.salonId, salonId), eq(agents.messagingProvider, "cloud")))

    await db
      .update(agents)
      .set({
        messagingProvider: "cloud",
        whatsappPhoneNumberId: phoneNumberId,
        whatsappWabaId: input.wabaId ?? null,
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
