/**
 * Leva para a Belasis os agendamentos FUTUROS do salão que foram criados aqui
 * ANTES da integração ser ativada.
 *
 * O MinhaAgenda só grava na agenda oficial no momento de criar ou remarcar
 * (appointments.ts); a sincronização automática é só Belasis → MinhaAgenda. Então
 * o que já existia aqui na hora da ativação nunca chega lá sozinho, e a recepção
 * vê o profissional livre nesses horários. Cadastrar à mão na Belasis NÃO resolve:
 * sem o par salvo, a sincronização traz cada um de volta como agendamento novo
 * (agenda-import.service.ts) — duplicado aqui, com lembrete em dobro.
 *
 * Este script usa o mesmo caminho do agendamento ao vivo, um por um:
 *   1. profissional e serviço vinculados? cliente com telefone que a Belasis aceite?
 *   2. já está lá com a marca `[MinhaAgenda <id>]` (rodada anterior que não salvou
 *      o par)? → só salva o par, não cria de novo;
 *   3. o horário está livre lá (`checkAgendaSlot`, sem cache)? ocupado → pula;
 *   4. grava lá (`pushAppointmentToAgenda`) e salva o par.
 *
 * Diferenças do fluxo ao vivo, de propósito:
 *   - falha lá NÃO desfaz nada aqui: o agendamento é antigo e o cliente já foi avisado;
 *   - alertas são impressos, não gravados no painel do salão (quem roda é que resolve);
 *   - ritmo de segundo plano (15 chamadas/min), para não tirar a vez da IA na cota.
 *
 * Por padrão é SIMULAÇÃO: só lê (banco e Belasis) e mostra o que faria. `--apply`
 * grava. Rodar de novo é seguro: quem já tem par lá não entra na lista.
 *
 * Precisa de DATABASE_URL e ENCRYPTION_KEY (a mesma do app, que decifra o token).
 *
 * Uso (a partir da raiz do repo):
 *   pnpm --filter @repo/db exec tsx ../../scripts/backfill-belasis.ts --salon <uuid> \
 *     [--apply] [--only id1,id2] [--skip id1,id2]
 */

import { formatInTimeZone } from 'date-fns-tz'

import {
  and,
  appointments,
  asc,
  customers,
  db,
  eq,
  gte,
  inArray,
  integrationExternalRefs,
  isNull,
  postgresClient,
  professionals,
  salons,
  services,
} from '../packages/db/src/index'
import type { ILogger } from '../packages/db/src/infrastructure/logger'
import {
  BELASIS_TIME_ZONE,
  toBelasisPhone,
} from '../packages/db/src/infrastructure/integrations/belasis/belasis-mapping'
import { resolveAgendaProvider } from '../packages/db/src/services/agenda-provider-registry.service'
import {
  checkAgendaSlot,
  createAgendaSyncContext,
  pushAppointmentToAgenda,
  type AgendaSyncContext,
} from '../packages/db/src/services/agenda-sync.service'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function idList(name: string): Set<string> {
  return new Set((arg(name) ?? '').split(',').map((id) => id.trim().toLowerCase()).filter(Boolean))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const local = (d: Date) => formatInTimeZone(d, BELASIS_TIME_ZONE, 'dd/MM HH:mm')

/** O log do núcleo, em uma linha por evento, no meio da saída do script. */
const consoleLogger: ILogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: (message, meta) => console.log(`      ⚠️  ${message}${meta ? ` ${JSON.stringify(meta)}` : ''}`),
  error: (message, meta) => console.log(`      ❌ ${message}${meta ? ` ${JSON.stringify(meta)}` : ''}`),
  child: () => consoleLogger,
}

type Outcome = 'sent' | 'linked' | 'ready' | 'unlinked' | 'noPhone' | 'busy' | 'failed'

const OUTCOME_LABELS: Record<Outcome, string> = {
  sent: 'enviados à Belasis',
  linked: 'já estavam lá (par salvo agora)',
  ready: 'prontos para enviar',
  unlinked: 'sem vínculo de profissional/serviço',
  noPhone: 'telefone que a Belasis não aceita',
  busy: 'horário ocupado/indisponível lá',
  failed: 'falharam',
}

async function main(): Promise<void> {
  const salonId = arg('salon')
  if (!salonId || !UUID.test(salonId)) {
    console.error('❌ Informe o salão: --salon <uuid>')
    process.exit(1)
  }
  const apply = process.argv.includes('--apply')
  const only = idList('only')
  const skip = idList('skip')

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { name: true },
  })
  if (!salon) {
    console.error('❌ Salão não encontrado')
    process.exit(1)
  }

  let agenda
  try {
    agenda = await resolveAgendaProvider(salonId, { background: true })
  } catch (error) {
    console.error(`❌ A agenda oficial não pôde ser carregada (ENCRYPTION_KEY certa?): ${errorMessage(error)}`)
    process.exit(1)
  }
  if (!agenda) {
    console.error('❌ A integração com a agenda oficial não está ATIVA neste salão (Integrações → Ativar).')
    process.exit(1)
  }
  if (agenda.providerId !== 'belasis') {
    console.error(`❌ Este script é da Belasis; o salão usa ${agenda.providerId}.`)
    process.exit(1)
  }

  const alerts: string[] = []
  const ctx: AgendaSyncContext = {
    ...createAgendaSyncContext(agenda, consoleLogger),
    alert: async (alert) => {
      alerts.push(alert.title)
      console.log(`      🔔 ${alert.title}`)
    },
  }

  const candidates = (
    await db
      .select({
        id: appointments.id,
        start: appointments.date,
        end: appointments.endTime,
        notes: appointments.notes,
        professionalId: appointments.professionalId,
        professionalName: professionals.name,
        serviceId: appointments.serviceId,
        serviceName: services.name,
        clientId: appointments.clientId,
        clientName: customers.name,
        clientPhone: customers.phone,
      })
      .from(appointments)
      .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .innerJoin(customers, eq(customers.id, appointments.clientId))
      .leftJoin(
        integrationExternalRefs,
        and(
          eq(integrationExternalRefs.salonId, salonId),
          eq(integrationExternalRefs.provider, agenda.providerId),
          eq(integrationExternalRefs.entityType, 'appointment'),
          eq(integrationExternalRefs.internalId, appointments.id)
        )
      )
      .where(
        and(
          eq(appointments.salonId, salonId),
          inArray(appointments.status, ['pending', 'confirmed']),
          gte(appointments.date, new Date()),
          isNull(integrationExternalRefs.id)
        )
      )
      .orderBy(asc(appointments.date))
  ).filter((row) => (only.size === 0 || only.has(row.id)) && !skip.has(row.id))

  console.log(`\n${apply ? '🚀 ENVIO' : '🔎 SIMULAÇÃO (nada é gravado; use --apply para enviar)'}`)
  console.log(`   Salão: ${salon.name}`)
  console.log(`   ${candidates.length} agendamento(s) futuro(s) sem par na Belasis`)
  if (candidates.length > 0) {
    // ~2 leituras por agendamento (+3 a 4 escritas no envio) a 15 chamadas/min.
    console.log(`   Ritmo de segundo plano: uns ${Math.ceil((candidates.length * (apply ? 6 : 2)) / 15)} min no total`)
  }

  const counts: Record<Outcome, number> = {
    sent: 0, linked: 0, ready: 0, unlinked: 0, noPhone: 0, busy: 0, failed: 0,
  }
  const report = (outcome: Outcome, message: string) => {
    counts[outcome]++
    console.log(`      ${outcome === 'sent' || outcome === 'linked' || outcome === 'ready' ? '✅' : '⏭️ '} ${message}`)
  }

  for (const [index, row] of candidates.entries()) {
    console.log(
      `\n   [${index + 1}/${candidates.length}] ${local(row.start)}–${formatInTimeZone(row.end, BELASIS_TIME_ZONE, 'HH:mm')}` +
        ` · ${row.clientName} · ${row.serviceName} · ${row.professionalName}`
    )
    console.log(`      id ${row.id}`)
    if (row.notes?.trim()) console.log(`      observação (vai junto para lá): "${row.notes.trim()}"`)

    try {
      const [externalProfessionalId, externalServiceId] = await Promise.all([
        ctx.refs.getExternalId('professional', row.professionalId),
        ctx.refs.getExternalId('service', row.serviceId),
      ])
      if (!externalProfessionalId) {
        report('unlinked', `profissional "${row.professionalName}" sem vínculo — vincule em Integrações → Belasis`)
        continue
      }
      if (!externalServiceId) {
        report('unlinked', `serviço "${row.serviceName}" sem vínculo — vincule em Integrações → Belasis`)
        continue
      }
      if (!toBelasisPhone(row.clientPhone)) {
        report('noPhone', 'o telefone do cliente não está no formato DDI + DDD + número')
        continue
      }

      // Uma rodada anterior pode ter criado lá sem salvar o par: criar de novo duplicaria
      // na agenda que a recepção usa.
      const existing = await agenda.provider.findAppointmentByIdempotencyKey?.(row.id, {
        externalProfessionalId,
        start: row.start,
      })
      if (existing) {
        if (apply) await ctx.refs.setExternalId('appointment', row.id, existing.externalId)
        report('linked', `já existe na Belasis (#${existing.externalId})${apply ? ' — par salvo' : ' — o envio só salva o par'}`)
        continue
      }

      const slot = await checkAgendaSlot(ctx, {
        professionalId: row.professionalId,
        start: row.start,
        end: row.end,
      })
      if (!slot.ok) {
        report(slot.code === 'EXTERNAL_AGENDA_CONFLICT' ? 'busy' : 'failed', slot.error)
        continue
      }

      if (!apply) {
        report('ready', 'horário livre lá — pronto para enviar')
        continue
      }

      const pushed = await pushAppointmentToAgenda(ctx, 'create', {
        appointmentId: row.id,
        clientId: row.clientId,
        professionalId: row.professionalId,
        serviceId: row.serviceId,
        start: row.start,
        end: row.end,
        notes: row.notes,
      })
      if (pushed.ok) report('sent', `criado na Belasis${pushed.externalId ? ` (#${pushed.externalId})` : ''}`)
      else report('failed', pushed.error)
    } catch (error) {
      report('failed', errorMessage(error))
    }
  }

  console.log('\n📋 Resumo')
  for (const outcome of Object.keys(counts) as Outcome[]) {
    if (counts[outcome] > 0) console.log(`   ${counts[outcome]} ${OUTCOME_LABELS[outcome]}`)
  }
  if (alerts.length > 0) {
    console.log(`\n🔔 ${alerts.length} alerta(s) — não foram gravados no painel do salão:`)
    for (const title of new Set(alerts)) console.log(`   - ${title}`)
  }
  if (!apply && counts.ready + counts.linked > 0) {
    console.log('\nPara enviar, rode de novo com --apply (dá para testar com um só: --only <id>).')
  }
}

main()
  .catch((error) => {
    console.error(`❌ ${errorMessage(error)}`)
    process.exitCode = 1
  })
  .finally(() => postgresClient.end())
