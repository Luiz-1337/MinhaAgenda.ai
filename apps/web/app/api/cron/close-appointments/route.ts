import { logger } from '@repo/db'
import { db, sql } from '@repo/db'
import { requireCronAuth } from '@/lib/services/admin-auth.service'
import { startOfDayBrazil } from '@/lib/utils/timezone.utils'
import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

/**
 * Fechamento automático de atendimentos (cron diário, ver vercel.json).
 *
 * Fecha os agendamentos que já passaram e ninguém marcou no balcão, gravando
 * `status='completed'`, `completed_at`, `price_charged` e `outcome_source='cron'`.
 *
 * ## O que este cron deliberadamente NÃO faz
 *
 * **Não grava `no_show`.** Ausência não é observável pelo sistema: "ninguém clicou"
 * não distingue "o cliente veio e o balcão esqueceu de fechar" de "o cliente não
 * apareceu". Chutar falta contaminaria o preditor de risco e acusaria cliente
 * inocente. Falta só entra por decisão humana.
 *
 * **Não olha para trás mais de 7 dias.** Esta janela é uma TRAVA, não uma
 * otimização: o motor de reengajamento por IA usa a última visita para decidir a
 * quem escrever. Fechar de uma vez o histórico inteiro daria a toda a base um
 * `last_visit_at` antigo simultaneamente, e o cooldown de `campaign_messages`
 * está vazio para essas pessoas — a primeira rodada sairia em massa. Varredura
 * histórica, se um dia for desejada, é script manual com dry-run e revisão.
 *
 * **Não fecha serviço de preço incerto.** Só `priceType='fixed'`, sem
 * `priceOnRequest` e com `price > 0`. ~30% dos serviços em produção são faixa,
 * sob avaliação ou 0; inventar receita para eles é pior que deixar pendente —
 * relatório errado destrói a confiança mais rápido que relatório ausente. O que
 * sobra fica no selo "aguardando fechamento" da agenda, para uma pessoa resolver.
 *
 * O selo usa janela de 90 dias, mais larga que os 7 daqui, de propósito: lá é uma
 * pessoa decidindo uma a uma, então esconder o atraso só faria a receita ficar
 * incompleta em silêncio. Ver `getPendingOutcomeCount`.
 *
 * **Não roda em salão que não pediu.** `salons.auto_close_appointments` nasce
 * `false`. O caminho sempre-ligado é o selo; o cron é opt-in.
 *
 * Idempotente pelo próprio WHERE (`status IN ('pending','confirmed')`).
 * `?dryRun=1` relata sem escrever — é o que se roda antes de ligar a flag no
 * primeiro salão.
 */
export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request.headers)
  if (authError) return authError

  const startedAt = Date.now()
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1'

  try {
    // Fecha só o que terminou ANTES de hoje (em Brasília). O atendimento de hoje
    // ainda pode ser fechado pelo balcão; o cron não corre atrás do próprio dia.
    // `appointments.end_time` é timestamp sem timezone guardando UTC, então o corte
    // tem que ser calculado no fuso certo — cortar por UTC jogaria as noites de
    // 21h-24h BRT para o dia seguinte.
    const cutoff = startOfDayBrazil(new Date())
    const floor = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    // Predicado único, usado pelo relatório e pela escrita: se divergirem, o
    // dry-run deixa de significar alguma coisa.
    const elegiveis = sql`
      from appointments a
      join salons  sa on sa.id = a.salon_id
      join services sv on sv.id = a.service_id
      join customers c on c.id = a.client_id
      where a.status in ('pending', 'confirmed')
        and a.end_time < ${cutoff}
        and a.end_time > ${floor}
        and sa.auto_close_appointments = true
        -- Placeholders internos ficam fora: fechar um "Bloqueio de Horário" daria
        -- histórico de visita ao contato "Google Calendar" e o colocaria na mira
        -- do motor de retenção.
        and sv.is_system = false
        and c.is_system = false
        -- Preço confiável, e só ele.
        and sv.price_type = 'fixed'
        and sv.price_on_request = false
        and sv.price > 0
    `

    if (dryRun) {
      const rows = await db.execute(sql`
        select a.salon_id, sa.name as salon_name, count(*)::int as fecharia,
               sum(sv.price)::numeric as receita_estimada
        ${elegiveis}
        group by a.salon_id, sa.name
        order by fecharia desc
      `)

      const total = rows.reduce((acc, r) => acc + Number(r.fecharia ?? 0), 0)

      logger.info('Close-appointments cron DRY RUN', { total, salons: rows.length })

      return Response.json({
        ok: true,
        dryRun: true,
        wouldClose: total,
        perSalon: rows,
        window: { from: floor.toISOString(), until: cutoff.toISOString() },
        durationMs: Date.now() - startedAt,
      })
    }

    // UPDATE ... FROM: o preço é POR LINHA (vem do serviço de cada agendamento),
    // então não dá para fazer um set único. Uma ida ao banco, atômica, e o
    // RETURNING dá a observabilidade sem uma segunda query.
    const closed = await db.execute(sql`
      with elegiveis as (
        select a.id, sv.price
        ${elegiveis}
      )
      update appointments t
         set status         = 'completed',
             completed_at   = now(),
             price_charged  = e.price,
             outcome_source = 'cron',
             updated_at     = now()
        from elegiveis e
       where t.id = e.id
         -- Reafirma o guard: se o balcão fechou entre o select e o update, não
         -- sobrescreve o que a pessoa registrou.
         and t.status in ('pending', 'confirmed')
      returning t.id, t.salon_id, t.price_charged
    `)

    const durationMs = Date.now() - startedAt

    logger.info('Close-appointments cron executed', {
      closed: closed.length,
      windowFrom: floor.toISOString(),
      windowUntil: cutoff.toISOString(),
      durationMs,
    })

    return Response.json({
      ok: true,
      closed: closed.length,
      window: { from: floor.toISOString(), until: cutoff.toISOString() },
      durationMs,
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.error('Close-appointments cron failed', { error: errMsg }, error as Error)
    return new Response('Close-appointments cron failed', { status: 500 })
  }
}
