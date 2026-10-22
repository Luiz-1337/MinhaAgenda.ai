"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  domainServices,
  type AgendaLinkingData,
  type AgendaSetupResult,
  type AgendaSetupStatus,
} from "@repo/db"
import { createClient } from "@/lib/supabase/server"
import { formatZodError } from "@/lib/services/validation.service"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import { enqueueAgendaSync, readAgendaSyncStatus } from "@/lib/queues/agenda-sync-queue"
import type { ActionResult } from "@/lib/types/common"
import type { AgendaSyncStatus } from "@/lib/types/agenda-sync"

/**
 * Tela de Integrações → Belasis (agenda oficial do salão). Cada action autentica,
 * checa permissão de gestão no salão e delega ao @repo/db (agenda-setup.service).
 * Conectar não muda nada para a IA: só ativar, depois do vínculo.
 */

const PROVIDER = "belasis" as const

const salonIdSchema = z.string().uuid()

/** null = autorizado; string = mensagem de erro. */
async function authorize(salonId: string): Promise<string | null> {
  if (!salonIdSchema.safeParse(salonId).success) return "Salão inválido"
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return "Unauthorized"
  if (!(await hasSalonPermission(salonId, user.id))) return "Acesso negado a este salão"
  return null
}

function toAction<T>(result: AgendaSetupResult<T>): ActionResult<T> {
  return result.ok ? { success: true, data: result.data } : { error: result.error }
}

export async function getBelasisStatus(salonId: string): Promise<ActionResult<AgendaSetupStatus>> {
  const denied = await authorize(salonId)
  if (denied) return { error: denied }
  try {
    return { success: true, data: await domainServices.getAgendaSetupStatus(salonId, PROVIDER) }
  } catch (error) {
    console.error("[belasis] status:", error)
    return { error: "Não foi possível carregar a integração com a Belasis" }
  }
}

const connectSchema = z.object({ token: z.string().min(1, "Cole o token").max(500, "Token longo demais") })

export async function connectBelasis(
  salonId: string,
  token: string
): Promise<ActionResult<{ reconnected: boolean }>> {
  const denied = await authorize(salonId)
  if (denied) return { error: denied }
  const parsed = connectSchema.safeParse({ token })
  if (!parsed.success) return { error: formatZodError(parsed.error) }
  try {
    const result = await domainServices.connectAgenda(salonId, PROVIDER, parsed.data.token)
    revalidatePath(`/${salonId}/integrations`)
    return toAction(result)
  } catch (error) {
    console.error("[belasis] conectar:", error)
    return { error: "Não foi possível conectar a Belasis" }
  }
}

export async function getBelasisLinking(salonId: string): Promise<ActionResult<AgendaLinkingData>> {
  const denied = await authorize(salonId)
  if (denied) return { error: denied }
  try {
    return toAction(await domainServices.getAgendaLinkingData(salonId, PROVIDER))
  } catch (error) {
    console.error("[belasis] vínculos (leitura):", error)
    return { error: "Não foi possível carregar os vínculos com a Belasis" }
  }
}

const linkSchema = z.object({
  internalId: z.string().uuid(),
  externalId: z.string().trim().min(1).max(64).nullable(),
})

const linksSchema = z.object({
  professionals: z.array(linkSchema).max(500),
  services: z.array(linkSchema).max(2000),
})

export async function saveBelasisLinks(
  salonId: string,
  links: z.infer<typeof linksSchema>
): Promise<ActionResult<{ professionals: number; services: number }>> {
  const denied = await authorize(salonId)
  if (denied) return { error: denied }
  const parsed = linksSchema.safeParse(links)
  if (!parsed.success) return { error: formatZodError(parsed.error) }
  try {
    const result = await domainServices.saveAgendaLinks(salonId, PROVIDER, parsed.data)
    revalidatePath(`/${salonId}/integrations`)
    return toAction(result)
  } catch (error) {
    console.error("[belasis] vínculos (gravação):", error)
    return { error: "Não foi possível salvar os vínculos" }
  }
}

export async function setBelasisActive(salonId: string, active: boolean): Promise<ActionResult> {
  const denied = await authorize(salonId)
  if (denied) return { error: denied }
  if (typeof active !== "boolean") return { error: "Valor inválido" }
  try {
    const result = await domainServices.setAgendaActive(salonId, PROVIDER, active)
    revalidatePath(`/${salonId}/integrations`)
    return toAction(result)
  } catch (error) {
    console.error("[belasis] ativar/pausar:", error)
    return { error: "Não foi possível alterar a integração" }
  }
}

/**
 * "Sincronizar agora": traz para cá a agenda da Belasis dos próximos 30 dias.
 * Só enfileira (o worker faz o trabalho); `queued: false` = já estava rodando.
 */
export async function startBelasisSync(salonId: string): Promise<ActionResult<{ queued: boolean }>> {
  const denied = await authorize(salonId)
  if (denied) return { error: denied }
  try {
    if (!(await domainServices.hasActiveAgendaProvider(salonId))) {
      return { error: "Ative a integração com a Belasis para sincronizar." }
    }
    const result = await enqueueAgendaSync({ salonId, trigger: "manual" })
    return { success: true, data: { queued: result.enqueued } }
  } catch (error) {
    console.error("[belasis] sincronizar:", error)
    return { error: "Não foi possível iniciar a sincronização" }
  }
}

export async function getBelasisSyncStatus(salonId: string): Promise<ActionResult<AgendaSyncStatus | null>> {
  const denied = await authorize(salonId)
  if (denied) return { error: denied }
  try {
    return { success: true, data: await readAgendaSyncStatus(salonId) }
  } catch (error) {
    console.error("[belasis] andamento da sincronização:", error)
    return { error: "Não foi possível ler o andamento da sincronização" }
  }
}

export async function disconnectBelasis(salonId: string): Promise<ActionResult> {
  const denied = await authorize(salonId)
  if (denied) return { error: denied }
  try {
    const result = await domainServices.disconnectAgenda(salonId, PROVIDER)
    revalidatePath(`/${salonId}/integrations`)
    return toAction(result)
  } catch (error) {
    console.error("[belasis] desconectar:", error)
    return { error: "Não foi possível desconectar a Belasis" }
  }
}
