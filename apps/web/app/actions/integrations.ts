"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { createClient } from "@/lib/supabase/server"
import { db, salonIntegrations } from "@repo/db"
import { formatZodError } from "@/lib/services/validation.service"
import type { ActionResult } from "@/lib/types/common"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import {
  isTrinksIntegrationActive,
  getTrinksProfessionals,
  getTrinksServices,
  getTrinksProducts,
} from "@repo/db"

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

