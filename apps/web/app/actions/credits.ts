"use server"

import { createClient } from "@/lib/supabase/server"
import { db, aiUsageStats, salons, profiles, sql } from "@repo/db"
import { eq } from "drizzle-orm"

/**
 * Limites de créditos por plano
 */
const PLAN_CREDITS = {
  SOLO: 1_000_000, // 1 milhão
  PRO: 5_000_000, // 5 milhões
  ENTERPRISE: 10_000_000, // 10 milhões
} as const

/**
 * Obtém os créditos restantes do salão baseado no plano do usuário
 */
export async function getRemainingCredits(salonId: string): Promise<{ remaining: number; total: number; used: number } | { error: string }> {
  if (!salonId) {
    return { error: "salonId é obrigatório" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  try {
    // Busca o salão e verifica acesso
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { id: true, ownerId: true },
    })

    if (!salon) {
      return { error: "Salão não encontrado" }
    }

    // Busca o perfil do usuário para obter o tier
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.id, salon.ownerId),
      columns: { tier: true },
    })

    if (!profile) {
      return { error: "Perfil não encontrado" }
    }

    // Calcula créditos totais baseado no tier
    const tier = profile.tier as keyof typeof PLAN_CREDITS
    const totalCredits = PLAN_CREDITS[tier] || PLAN_CREDITS.SOLO

    // Soma todos os créditos usados do salão na tabela aiUsageStats
    const usedCreditsResult = await db
      .select({
        totalUsed: sql<number>`COALESCE(SUM(${aiUsageStats.credits}), 0)::int`,
      })
      .from(aiUsageStats)
      .where(eq(aiUsageStats.salonId, salonId))

    const usedCredits = Number(usedCreditsResult[0]?.totalUsed) || 0

    // Calcula créditos restantes (não pode ser negativo)
    const remainingCredits = Math.max(0, totalCredits - usedCredits)

    return {
      remaining: remainingCredits,
      total: totalCredits,
      used: usedCredits,
    }
  } catch (error) {
    console.error("Erro ao buscar créditos restantes:", error)
    return { error: "Erro ao buscar créditos" }
  }
}

