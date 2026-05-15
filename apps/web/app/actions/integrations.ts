"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db, salonIntegrations, customers, customerTrinksProfile, eq, and, sql } from "@repo/db"
import { createClient } from "@/lib/supabase/server"
import { formatZodError } from "@/lib/services/validation.service"
import type { ActionResult } from "@/lib/types/common"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import {
  isTrinksIntegrationActive,
  getTrinksProfessionals,
  getTrinksServices,
  getTrinksProducts,
} from "@repo/db"
import { setupWatchChannelsForSalon, teardownWatchChannels } from "@repo/db/services/google-calendar-sync"
import { enqueueTrinksProfileSync } from "@/lib/queues/trinks-sync-queue"

const updateSalonIntegrationSchema = z.object({
  salonId: z.string().uuid(),
  isActive: z.boolean(),
})

/**
 * Atualiza o campo isActive de uma integração do salão (ex: Google Calendar)
 */
export async function updateSalonIntegration(
  salonId: string,
  isActive: boolean
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Não autenticado" }
    }

    // Validação
    const parsed = updateSalonIntegrationSchema.safeParse({ salonId, isActive })
    if (!parsed.success) {
      return { error: formatZodError(parsed.error) }
    }

    // Permission Check
    const hasAccess = await hasSalonPermission(salonId, user.id)
    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // Busca integração Google do salão
    const integration = await db.query.salonIntegrations.findFirst({
      where: and(
        eq(salonIntegrations.salonId, salonId),
        eq(salonIntegrations.provider, "google")
      ),
    })

    if (!integration) {
      return { error: "Integração Google Calendar não encontrada para este salão" }
    }

    // Atualiza isActive
    await db
      .update(salonIntegrations)
      .set({
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(salonIntegrations.id, integration.id))

    // Manage watch channels based on isActive toggle
    if (isActive) {
      // Re-enable: setup watch channels for bidirectional sync
      setupWatchChannelsForSalon(salonId).catch((error) => {
        console.error('Failed to setup watch channels on enable:', error)
      })
    } else {
      // Disable: teardown watch channels
      teardownWatchChannels(salonId).catch((error) => {
        console.error('Failed to teardown watch channels on disable:', error)
      })
    }

    revalidatePath(`/${salonId}/dashboard`)
    revalidatePath(`/${salonId}/settings`)
    return { success: true }
  } catch (error) {
    console.error("Erro ao atualizar integração do salão:", error)
    return { error: "Falha ao atualizar integração" }
  }
}

const saveTrinksTokenSchema = z.object({
  salonId: z.string().uuid(),
  token: z.string().min(1, "Token é obrigatório"),
})

/**
 * Salva ou atualiza o token da API Trinks para um salão
 */
export async function saveTrinksToken(
  salonId: string,
  token: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Unauthorized" }
    }

    // Validação
    const parsed = saveTrinksTokenSchema.safeParse({ salonId, token })
    if (!parsed.success) {
      return { error: formatZodError(parsed.error) }
    }

    // Permission Check
    const hasAccess = await hasSalonPermission(salonId, user.id)
    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // Verifica se já existe integração Trinks para este salão
    const existing = await db.query.salonIntegrations.findFirst({
      where: and(
        eq(salonIntegrations.salonId, salonId),
        eq(salonIntegrations.provider, "trinks")
      ),
    })

    if (existing) {
      // Atualiza integração existente
      await db
        .update(salonIntegrations)
        .set({
          accessToken: token,
          updatedAt: new Date(),
        })
        .where(eq(salonIntegrations.id, existing.id))
    } else {
      // Cria nova integração
      await db.insert(salonIntegrations).values({
        salonId,
        provider: "trinks",
        accessToken: token,
        refreshToken: token, // Para Trinks, refreshToken e accessToken são iguais (ApiKey)
      })
    }

    revalidatePath(`/${salonId}/settings`)
    return { success: true }
  } catch (error) {
    console.error("Erro ao salvar token Trinks:", error)
    return { error: "Falha ao salvar token Trinks" }
  }
}

/**
 * Busca o status da integração Trinks para um salão
 */
export async function getTrinksIntegration(
  salonId: string
): Promise<ActionResult<{ isActive: boolean; hasToken: boolean }>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Unauthorized" }
    }

    if (!salonId) {
      return { error: "salonId é obrigatório" }
    }

    // Permission Check
    const hasAccess = await hasSalonPermission(salonId, user.id)
    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    const isActive = await isTrinksIntegrationActive(salonId)

    const integration = await db.query.salonIntegrations.findFirst({
      where: and(
        eq(salonIntegrations.salonId, salonId),
        eq(salonIntegrations.provider, "trinks")
      ),
      columns: {
        accessToken: true,
      },
    })

    return {
      success: true,
      data: {
        isActive,
        hasToken: !!integration?.accessToken,
      },
    }
  } catch (error) {
    console.error("Erro ao buscar integração Trinks:", error)
    return { error: "Falha ao buscar integração Trinks" }
  }
}

/**
 * Remove a integração Trinks de um salão
 */
export async function deleteTrinksIntegration(
  salonId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Unauthorized" }
    }

    if (!salonId) {
      return { error: "salonId é obrigatório" }
    }

    // Permission Check
    const hasAccess = await hasSalonPermission(salonId, user.id)
    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    await db
      .delete(salonIntegrations)
      .where(
        and(
          eq(salonIntegrations.salonId, salonId),
          eq(salonIntegrations.provider, "trinks")
        )
      )

    revalidatePath(`/${salonId}/settings`)
    return { success: true }
  } catch (error) {
    console.error("Erro ao remover integração Trinks:", error)
    return { error: "Falha ao remover integração Trinks" }
  }
}

/**
 * Sincroniza dados da Trinks (profissionais, serviços, produtos)
 */
export async function syncTrinksData(
  salonId: string,
  dataType: "professionals" | "services" | "products"
): Promise<ActionResult<unknown[]>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Unauthorized" }
    }

    if (!salonId) {
      return { error: "salonId é obrigatório" }
    }

    // Permission Check
    const hasAccess = await hasSalonPermission(salonId, user.id)
    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // Verifica se a integração está ativa
    if (!(await isTrinksIntegrationActive(salonId))) {
      return { error: "Integração Trinks não está ativa" }
    }

    let data: unknown[]

    switch (dataType) {
      case "professionals":
        data = await getTrinksProfessionals(salonId)
        break
      case "services":
        data = await getTrinksServices(salonId)
        break
      case "products":
        data = await getTrinksProducts(salonId)
        break
      default:
        return { error: "Tipo de dados inválido" }
    }

    return {
      success: true,
      data,
    }
  } catch (error: any) {
    console.error(`Erro ao sincronizar ${dataType} da Trinks:`, error)
    return {
      error: error.message || `Falha ao sincronizar ${dataType} da Trinks`,
    }
  }
}

const SYNC_CUSTOMERS_BATCH_LIMIT = 500

/**
 * Triggers Cliente 360° sync for all customers of a salon. Non-blocking:
 * jobs are enqueued and the worker pool processes them at its own pace
 * (concurrency 5, rate-limited 30/min by the queue limiter).
 *
 * Returns immediately with the count of jobs queued so the UI can show
 * "Sincronizando X clientes…" feedback.
 */
export async function syncTrinksCustomers(
  salonId: string
): Promise<ActionResult<{ enqueued: number }>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }
    if (!salonId) return { error: "salonId é obrigatório" }

    const hasAccess = await hasSalonPermission(salonId, user.id)
    if (!hasAccess) return { error: "Acesso negado a este salão" }

    if (!(await isTrinksIntegrationActive(salonId))) {
      return { error: "Integração Trinks não está ativa" }
    }

    const salonCustomers = await db
      .select({ id: customers.id, phone: customers.phone })
      .from(customers)
      .where(eq(customers.salonId, salonId))
      .limit(SYNC_CUSTOMERS_BATCH_LIMIT)

    let enqueued = 0
    for (const c of salonCustomers) {
      const job = await enqueueTrinksProfileSync({
        salonId,
        customerId: c.id,
        customerPhone: c.phone,
      })
      if (job) enqueued++
    }

    return { success: true, data: { enqueued } }
  } catch (error) {
    console.error("Erro ao sincronizar clientes Trinks:", error)
    const msg = error instanceof Error ? error.message : "Falha ao iniciar sincronização de clientes"
    return { error: msg }
  }
}

/**
 * Returns aggregate Cliente 360° stats for the integration card UI:
 * how many profiles are stored locally and the most recent sync time.
 */
export async function getTrinksProfilesStats(
  salonId: string
): Promise<ActionResult<{ count: number; lastSyncedAt: string | null }>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }
    if (!salonId) return { error: "salonId é obrigatório" }

    const hasAccess = await hasSalonPermission(salonId, user.id)
    if (!hasAccess) return { error: "Acesso negado a este salão" }

    const result = await db
      .select({
        count: sql<number>`count(*)::int`,
        lastSyncedAt: sql<Date | null>`max(${customerTrinksProfile.syncedAt})`,
      })
      .from(customerTrinksProfile)
      .where(eq(customerTrinksProfile.salonId, salonId))

    const row = result[0]
    return {
      success: true,
      data: {
        count: Number(row?.count ?? 0),
        lastSyncedAt: row?.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
      },
    }
  } catch (error) {
    console.error("Erro ao buscar estatísticas de perfis Trinks:", error)
    const msg = error instanceof Error ? error.message : "Falha ao buscar estatísticas"
    return { error: msg }
  }
}

