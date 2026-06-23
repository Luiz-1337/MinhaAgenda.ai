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

  // Dedup: nenhum OUTRO agente pode usar o mesmo número (isolamento de tenant).
  const existing = await db.query.agents.findFirst({
    where: eq(agents.whatsappPhoneNumberId, phoneNumberId),
    columns: { id: true },
  })
  if (existing && existing.id !== agent.id) {
    return { error: "Este número já está conectado a outro agente/salão." }
  }

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

  revalidatePath(`/${salonId}/agents`)
  return { success: true }
}

/** Desconecta o Cloud do agente ativo (volta a flag para 'evolution'). */
export async function disconnectWhatsAppCloud(
  salonId: string,
): Promise<{ success: true } | { error: string }> {
  const auth = await authorize(salonId)
  if ("error" in auth) return auth

  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.salonId, salonId), eq(agents.isActive, true)),
    columns: { id: true },
  })
  if (!agent) return { error: "Nenhum agente ativo neste salão." }

  await db
    .update(agents)
    .set({
      messagingProvider: "evolution",
      whatsappPhoneNumberId: null,
      whatsappWabaId: null,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agent.id))

  revalidatePath(`/${salonId}/agents`)
  return { success: true }
}

/**
 * Status da conexão Cloud do salão (lê a COLUNA do banco — não bate em API
 * externa). Chamar na page.tsx (RSC) e passar por prop, evitando polling.
 */
export async function getWhatsAppCloudStatus(salonId: string): Promise<WhatsAppCloudStatus> {
  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.salonId, salonId), eq(agents.isActive, true)),
    columns: { messagingProvider: true, whatsappPhoneNumberId: true, whatsappWabaId: true },
  })
  return {
    connected: agent?.messagingProvider === "cloud" && !!agent.whatsappPhoneNumberId,
    phoneNumberId: agent?.whatsappPhoneNumberId ?? null,
    wabaId: agent?.whatsappWabaId ?? null,
  }
}
