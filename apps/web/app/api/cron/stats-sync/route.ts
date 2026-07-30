import { logger } from '@repo/db'
import { db, salons, sql } from '@repo/db'
import { requireCronAuth } from '@/lib/services/admin-auth.service'
import { syncRealUsageData } from '@/lib/services/stats-sync.service'
import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Reconciliação de `ai_usage_stats` / `agent_stats` a partir de `messages`.
 *
 * ## Por que existe
 *
 * Isto rodava a CADA abertura do dashboard, num `after()`: varria todas as mensagens
 * do salão sem filtro de data e fazia 1 SELECT + 1 UPSERT sequenciais por par
 * (dia, modelo) — num salão com um ano de operação, ~2000 queries sequenciais por
 * visita, contra um banco a um oceano de distância. Reconciliação é trabalho de
 * cron, não de request.
 *
 * A versão que agrega no SQL (`stats-sync.service.ts`) já existia no repo, ÓRFÃ, com
 * um comentário dizendo que era chamada por este cron — que nunca havia sido criado.
 *
 * ## ⚠️ Este cron MOVE o saldo de créditos que o cliente vê
 *
 * `debitSalonCredits` (o escritor ao vivo, no worker) gravava token BRUTO,
 * ignorando `MODEL_WEIGHTS` — o salão era cobrado em dobro por todo uso do modelo
 * mini. Isso foi corrigido na raiz: agora ele grava crédito PONDERADO. Mas as
 * linhas HISTÓRICAS seguem como foram gravadas, e este sync sobrescreve com o
 * recálculo ponderado a partir de `messages`.
 *
 * Medido em produção em 30/07/2026, antes de qualquer execução:
 *
 *   Spettacolo         1.779.154 -> 2.550.520   (+771.366)
 *   Spettacolo Salone  1.265.982 ->   604.520   (-661.462)
 *   Studio A           2.448.112 ->         0   (seed, sem mensagens reais)
 *   Salão TOP          2.185.745 -> 2.185.745   (sem mudança)
 *
 * O `+` do Spettacolo é uso que o escritor ao vivo PERDEU (mensagem com token que
 * nunca foi debitada). O `-` do Salone é a cobrança em dobro sendo desfeita. Os
 * zeros são salões de demonstração cujo `ai_usage_stats` veio de seed, sem
 * mensagem correspondente.
 *
 * Por isso este cron **NÃO está registrado em `vercel.json`**: ligá-lo é decisão do
 * dono, não efeito colateral de um deploy. Rode com `?dryRun=1` primeiro — ele
 * relata o degrau por salão sem escrever nada.
 */
export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request.headers)
  if (authError) return authError

  const startedAt = Date.now()
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1'

  try {
    if (dryRun) {
      // Relata o degrau por salão: o que está gravado hoje vs o que o sync gravaria.
      const rows = await db.execute(sql`
        with recomputado as (
          select c.salon_id,
                 (m.created_at at time zone 'America/Sao_Paulo')::date as dia,
                 m.model,
                 sum(case lower(btrim(coalesce(m.model,'')))
                          when 'gpt-5.4-mini-2026-03-17'
                            then round((m.total_tokens * 0.5)::numeric)
                          else m.total_tokens::numeric end)::int as credits
          from messages m
          join chats c on c.id = m.chat_id
          where m.role = 'assistant' and m.model is not null and m.total_tokens > 0
          group by c.salon_id, (m.created_at at time zone 'America/Sao_Paulo')::date, m.model
        )
        select coalesce(s.name, '(sem salão)') as salon_name,
               coalesce(sum(a.credits), 0)::int as current_credits,
               coalesce(sum(r.credits), 0)::int as after_sync,
               coalesce(sum(r.credits), 0)::int - coalesce(sum(a.credits), 0)::int as delta
          from recomputado r
          full outer join ai_usage_stats a
            on a.salon_id = r.salon_id and a.date = r.dia and a.model = r.model
          left join salons s on s.id = coalesce(r.salon_id, a.salon_id)
         group by s.name
        having coalesce(sum(a.credits), 0) <> 0 or coalesce(sum(r.credits), 0) <> 0
         order by abs(coalesce(sum(r.credits), 0) - coalesce(sum(a.credits), 0)) desc
      `)

      logger.info('Stats sync cron DRY RUN', { salons: rows.length })

      return Response.json({
        ok: true,
        dryRun: true,
        perSalon: rows,
        note: 'Nada foi escrito. `delta` é quanto o saldo de créditos de cada salão mudaria.',
        durationMs: Date.now() - startedAt,
      })
    }

    const allSalons = await db.select({ id: salons.id, name: salons.name }).from(salons)

    let processed = 0
    const failures: Array<{ salonId: string; error: string }> = []

    // Sequencial de propósito: é reconciliação de madrugada, não caminho de request.
    // Em paralelo, os upserts de salões diferentes competiriam pelo mesmo pool.
    for (const salon of allSalons) {
      try {
        await syncRealUsageData(salon.id)
        processed++
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        // Um salão que falha não pode abortar os outros.
        logger.error('Stats sync failed for salon', { salonId: salon.id, error: errMsg })
        failures.push({ salonId: salon.id, error: errMsg })
      }
    }

    const durationMs = Date.now() - startedAt
    logger.info('Stats sync cron executed', { processed, failed: failures.length, durationMs })

    return Response.json({ ok: true, processed, failed: failures.length, failures, durationMs })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.error('Stats sync cron failed', { error: errMsg }, error as Error)
    return new Response('Stats sync cron failed', { status: 500 })
  }
}
