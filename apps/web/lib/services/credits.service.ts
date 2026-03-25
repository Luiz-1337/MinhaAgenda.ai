import { db, aiUsageStats, salons, profiles, sql, eq, and, gte, lt } from "@repo/db"

/**
 * Limites de créditos por plano (mensais)
 */
export const PLAN_CREDITS = {
    SOLO: 1_000_000, // 1 milhão
    PRO: 5_000_000, // 5 milhões
    ENTERPRISE: 10_000_000, // 10 milhões
} as const

/**
 * Retorna o início e o fim do mês atual em formato de data ISO (YYYY-MM-DD).
 */
function getCurrentMonthRange(): { start: string; end: string } {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const toIso = (d: Date) => d.toISOString().slice(0, 10)
    return { start: toIso(start), end: toIso(end) }
}

/**
 * Obtém os créditos restantes do salão no mês atual.
 * Útil para processos em background e server actions que já passaram por auth.
 */
export async function getSalonRemainingCredits(salonId: string): Promise<{ remaining: number; total: number; used: number } | { error: string }> {
    try {
        // Busca o salão
        const salon = await db.query.salons.findFirst({
            where: eq(salons.id, salonId),
            columns: { id: true, ownerId: true, settings: true, extraCredits: true },
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

        // Calcula créditos totais baseado no tier ou limite customizado
        const settings = salon.settings as { custom_monthly_limit?: number } | null
        const customLimit = settings?.custom_monthly_limit

        const tier = profile.tier as keyof typeof PLAN_CREDITS
        const planCredits = customLimit || PLAN_CREDITS[tier] || PLAN_CREDITS.SOLO
        const totalCredits = planCredits + (salon.extraCredits ?? 0)

        // Soma créditos usados no mês atual (filtro por data)
        const { start, end } = getCurrentMonthRange()
        const usedCreditsResult = await db
            .select({
                totalUsed: sql<number>`COALESCE(SUM(${aiUsageStats.credits}), 0)::int`,
            })
            .from(aiUsageStats)
            .where(
                and(
                    eq(aiUsageStats.salonId, salonId),
                    gte(aiUsageStats.date, start),
                    lt(aiUsageStats.date, end)
                )
            )

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

/**
 * Debita créditos (tokens) do salão para o dia atual.
 * Usa upsert para acumular uso na linha do dia/modelo correspondente.
 */
export async function debitSalonCredits(
    salonId: string,
    tokensUsed: number,
    model: string
): Promise<void> {
    if (!tokensUsed || tokensUsed <= 0) return

    const today = new Date().toISOString().slice(0, 10)

    await db
        .insert(aiUsageStats)
        .values({
            salonId,
            date: today,
            model,
            credits: tokensUsed,
        })
        .onConflictDoUpdate({
            target: [aiUsageStats.salonId, aiUsageStats.date, aiUsageStats.model],
            set: {
                credits: sql`${aiUsageStats.credits} + ${tokensUsed}`,
                updatedAt: sql`now()`,
            },
        })
}
