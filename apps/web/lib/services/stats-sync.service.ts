import { db, aiUsageStats, agentStats, agents, chats, messages, sql, eq, and, isNotNull, BRAZIL_TIMEZONE } from "@repo/db"
import { weightedCreditsSql } from "@/lib/utils/credits-sql"

const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))

/**
 * Reconcilia as tabelas de estatísticas a partir de `messages` (fonte real).
 *
 * O worker incrementa ai_usage_stats ao vivo com tokens BRUTOS
 * (debitSalonCredits); este sync sobrescreve com valores PONDERADOS por
 * modelo. Semântica preservada do sync original do dashboard: overwrite (não
 * soma), só grava agentes com créditos > 0, linhas antigas sem contrapartida
 * atual não são limpas.
 *
 * Rodava a cada visita ao dashboard (after()); agora é chamado pelo cron
 * /api/cron/stats-sync.
 */
export async function syncRealUsageData(salonId: string): Promise<void> {
  const w = weightedCreditsSql(messages.totalTokens, messages.model)

  // (A) Agregado por (dia, modelo) direto no SQL — substitui o fetch integral
  //     de messages + agregação em JS. Filtros idênticos ao sync original.
  const usageRows = await db
    .select({
      // DOIS saltos de fuso, e a ordem importa:
      //   AT TIME ZONE 'UTC'  -> "este timestamp naive É UTC"  (naive -> timestamptz)
      //   AT TIME ZONE 'SP'   -> "me dê a hora de parede em SP" (timestamptz -> naive)
      //
      // Um salto só está ERRADO aqui: sobre coluna `timestamp WITHOUT time zone`, o
      // operador INTERPRETA o valor como hora de parede de São Paulo e devolve
      // timestamptz — ou seja, SOMA 3h em vez de subtrair. Medido em produção: o
      // salto único errava o dia em 11 das 111 linhas de appointments, contra 10 do
      // `::date` cru que ele deveria consertar, e 0 do salto duplo.
      //
      // A confusão é fácil porque `now()` JÁ é timestamptz e aceita um salto só
      // (ver chat.service.ts, onde está correto). Coluna naive exige dois.
      date: sql<string>`((${messages.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${BRAZIL_TIMEZONE})::date)::text`,
      model: messages.model,
      credits: sql<number>`SUM(${w})::int`,
    })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(
      and(
        eq(chats.salonId, salonId),
        eq(messages.role, "assistant"),
        isNotNull(messages.model),
        sql`${messages.totalTokens} > 0`
      )
    )
    .groupBy(sql`(${messages.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${BRAZIL_TIMEZONE})::date`, messages.model)

  // (B) Upsert em lote (overwrite, como o sync original) — chunk para limitar
  //     parâmetros por statement.
  for (const part of chunk(usageRows, 200)) {
    await db
      .insert(aiUsageStats)
      .values(part.map((r) => ({ salonId, date: r.date, model: r.model!, credits: r.credits })))
      .onConflictDoUpdate({
        target: [aiUsageStats.salonId, aiUsageStats.date, aiUsageStats.model],
        set: { credits: sql`excluded.credits`, updatedAt: sql`now()` },
      })
  }

  // (C) Total por modelo INCLUINDO model NULL (peso 1.0): alimenta os agentes
  //     e o agregado "Assistente IA" (que soma TODAS as msgs assistant).
  const [byModel, salonAgents] = await Promise.all([
    db
      .select({ model: messages.model, credits: sql<number>`SUM(${w})::int` })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(and(eq(chats.salonId, salonId), eq(messages.role, "assistant"), sql`${messages.totalTokens} > 0`))
      .groupBy(messages.model),
    db.select({ name: agents.name, model: agents.model }).from(agents).where(eq(agents.salonId, salonId)),
  ])

  const byModelMap = new Map(byModel.map((r) => [r.model, r.credits]))

  // Dedupe por agentName: o unique (salonId, agentName) rejeitaria um multi-VALUES
  // com nome repetido ("ON CONFLICT cannot affect row a second time"); last-wins
  // reproduz o comportamento do loop original.
  const agentRows = new Map<string, number>()
  for (const a of salonAgents) {
    if (!a.model) continue
    const credits = byModelMap.get(a.model) ?? 0
    if (credits > 0) agentRows.set(a.name, credits)
  }
  const defaultTotal = byModel.reduce((s, r) => s + r.credits, 0)
  if (defaultTotal > 0) agentRows.set("Assistente IA", defaultTotal)

  if (agentRows.size > 0) {
    await db
      .insert(agentStats)
      .values([...agentRows].map(([agentName, totalCredits]) => ({ salonId, agentName, totalCredits })))
      .onConflictDoUpdate({
        target: [agentStats.salonId, agentStats.agentName],
        set: { totalCredits: sql`excluded.total_credits`, updatedAt: sql`now()` },
      })
  }
}
