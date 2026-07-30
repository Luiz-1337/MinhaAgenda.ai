import { db, aiUsageStats, salons, profiles, sql, eq, and, gte, lt } from "@repo/db"
// Relativos OBRIGATORIAMENTE: este arquivo está no grafo de import do worker
// (message-processor.ts o carrega por `import("../lib/services/credits.service")`),
// e o worker roda via tsx, que NÃO resolve o alias `@/`. O tsc não pega isso —
// quebra só em runtime, em produção.
import { calculateCredits } from "../utils/credits"
import { formatBrazilTime } from "../utils/timezone.utils"

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
 * Debita créditos do salão para o dia atual.
 * Usa upsert para acumular uso na linha do dia/modelo correspondente.
 *
 * ⚠️ Grava crédito PONDERADO por modelo (`calculateCredits`), não token bruto.
 *
 * Antes gravava `tokensUsed` cru, ignorando `MODEL_WEIGHTS` — que diz que o modelo
 * mini vale 0,5 por token. Resultado: o salão era COBRADO EM DOBRO por todo uso do
 * mini, e só voltava ao número certo se alguém abrisse o dashboard (o `after()`
 * recalculava a tabela inteira, ponderado, sobrescrevendo). Ou seja: o saldo do
 * cliente dependia de alguém ter visitado uma tela.
 *
 * Medido em produção antes da correção: Spettacolo Salone tinha 1.265.982 créditos
 * gravados contra 604.520 no recálculo ponderado — mais que o dobro.
 *
 * O corte do dia usa Brasília, não UTC: `toISOString().slice(0,10)` jogava todo uso
 * entre 21h e 24h para o dia seguinte, e a coluna `date` é o eixo do gráfico de
 * consumo.
 */
export async function debitSalonCredits(
    salonId: string,
    tokensUsed: number,
    model: string
): Promise<void> {
    if (!tokensUsed || tokensUsed <= 0) return

    const credits = calculateCredits(tokensUsed, model)
    if (credits <= 0) return

    const today = formatBrazilTime(new Date(), "yyyy-MM-dd")

    await db
        .insert(aiUsageStats)
        .values({
            salonId,
            date: today,
            model,
            credits,
        })
        .onConflictDoUpdate({
            target: [aiUsageStats.salonId, aiUsageStats.date, aiUsageStats.model],
            set: {
                credits: sql`${aiUsageStats.credits} + ${credits}`,
                updatedAt: sql`now()`,
            },
        })
}
