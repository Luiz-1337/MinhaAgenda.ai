/**
 * Diagnóstico SOMENTE LEITURA da API Belasis com uma chave real.
 *
 * Confere, antes de ativar a integração num salão, o que a documentação NÃO
 * garante e o código presume:
 *   1. a chave autentica (header ACCESS-TOKEN) e enxerga o estabelecimento CERTO —
 *      a doc diz que a chave vale para "todos os seus estabelecimentos" e não há
 *      parâmetro de estabelecimento: confira se os profissionais listados são os
 *      do salão;
 *   2. o passo da grade de free_times e o que aparece fora do expediente;
 *   3. se os agendamentos do dia batem com os horários indisponíveis (fuso);
 *   4. o formato do telefone guardado nos clientes (com/sem DDI, formatado).
 *
 * NÃO cria, altera nem cancela nada. NÃO imprime a chave. Faz ~6 requisições
 * (o limite da Belasis é 30 por minuto por chave).
 *
 * Uso (a partir da raiz do repo):
 *   BELASIS_TOKEN=bpk_... pnpm --filter @repo/db exec tsx ../../scripts/diagnose-belasis.ts \
 *     [--date AAAA-MM-DD] [--employee ID] [--phone 5547999998888]
 */

import { formatInTimeZone } from 'date-fns-tz'

import { BelasisClient } from '../packages/db/src/infrastructure/integrations/belasis/belasis-client'
import { isBelasisApiError } from '../packages/db/src/infrastructure/integrations/belasis/belasis-errors'
import {
  BELASIS_TIME_ZONE,
  freeTimesToBusyIntervals,
  inferSlotMinutes,
  nextLocalDate,
  phonesMatch,
  toBelasisPhone,
} from '../packages/db/src/infrastructure/integrations/belasis/belasis-mapping'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

/** Formato do valor sem expor o número: "(47) 99105-4646" → "(99) 99999-9999". */
const shape = (value: string | undefined) => (value ? value.replace(/\d/g, '9') : '—')
const local = (d: Date) => formatInTimeZone(d, BELASIS_TIME_ZONE, 'dd/MM HH:mm')

function explain(error: unknown): string {
  return isBelasisApiError(error)
    ? `${error.kind}${error.httpStatus ? ` (HTTP ${error.httpStatus})` : ''}: ${error.message}`
    : String(error)
}

async function main(): Promise<void> {
  const token = process.env.BELASIS_TOKEN
  if (!token) {
    console.error('❌ Defina BELASIS_TOKEN (a chave bpk_... gerada em belasis.app/settings/api).')
    process.exit(1)
  }
  const client = new BelasisClient({ apiKey: token })
  const date = arg('date') ?? nextLocalDate(formatInTimeZone(new Date(), BELASIS_TIME_ZONE, 'yyyy-MM-dd'))

  console.log('\n1) Autenticação')
  try {
    await client.ping()
    console.log('   ✅ a chave autenticou')
  } catch (error) {
    console.log(`   ❌ ${explain(error)}`)
    return
  }

  console.log('\n2) Profissionais ativos (confira se são os do salão certo)')
  const employees = await client.listEmployees({ active: true })
  console.log(`   ${employees.length} profissional(is)`)
  for (const e of employees) console.log(`   - #${e.id} ${e.name}`)

  console.log('\n3) Serviços ativos (primeiros 15)')
  const services = await client.listServices({ active: true })
  console.log(`   ${services.length} serviço(s)`)
  for (const s of services.slice(0, 15)) {
    console.log(`   - #${s.id} ${s.description} · ${s.duration ?? '?'} min · online=${s.available_to_online_scheduling ?? '?'}`)
  }

  const employeeId = Number(arg('employee') ?? employees[0]?.id)
  if (Number.isSafeInteger(employeeId) && employeeId > 0) {
    console.log(`\n4) Grade free_times de #${employeeId} em ${date}`)
    try {
      const slots = await client.getEmployeeFreeTimes(employeeId, date)
      const available = slots.filter((s) => s.label === 'available').length
      console.log(`   ${slots.length} horário(s): ${available} livre(s), ${slots.length - available} ocupado(s)`)
      if (slots.length > 0) {
        console.log(`   primeiro ${slots[0].hour} · último ${slots[slots.length - 1].hour} · passo inferido ${inferSlotMinutes(slots)} min`)
        console.log(`   grade: ${slots.map((s) => `${s.hour}${s.label === 'available' ? '' : '✗'}`).join(' ')}`)
      }
      const busy = freeTimesToBusyIntervals(slots, date)
      console.log('   ocupado como o MinhaAgenda vai enxergar (horário de Brasília):')
      for (const b of busy) console.log(`   - ${local(b.start)} → ${local(b.end)}`)
    } catch (error) {
      console.log(`   ❌ ${explain(error)}`)
    }
  }

  console.log(`\n5) Agendamentos de ${date} (devem cair nos horários ✗ acima)`)
  try {
    const groups = await client.listScheduleGroups({ startDate: date, endDate: date })
    console.log(`   ${groups.length} agendamento(s)`)
    for (const g of groups) {
      const items = (g.calendars ?? [])
        .map((c) => `prof #${c.employee_id} ${c.start_hour}-${c.end_hour} serv #${c.inventory_product_id}`)
        .join('; ')
      const ours = (g.observation ?? '').includes('[MinhaAgenda ')
      console.log(`   - #${g.id} ${g.status ?? '?'} · ${items}${ours ? ' · criado pelo MinhaAgenda' : ''}`)
    }
  } catch (error) {
    console.log(`   ❌ ${explain(error)}`)
  }

  const phoneArg = arg('phone')
  if (phoneArg) {
    console.log('\n6) Busca de cliente por telefone')
    const phone = toBelasisPhone(phoneArg)
    if (!phone) {
      console.log('   ❌ isso não é um telefone no formato DDI + DDD + número')
      return
    }
    const candidates = await client.searchClients(phone.slice(-4))
    console.log(`   busca por "${phone.slice(-4)}": ${candidates.length} candidato(s)`)
    for (const c of candidates.slice(0, 20)) {
      const match = phonesMatch(c.cellphone, phone) || phonesMatch(c.phone, phone)
      console.log(`   - #${c.id} phone=${shape(c.phone)} cellphone=${shape(c.cellphone)}${match ? ' ← É ESTE' : ''}`)
    }
  }
}

main().catch((error) => {
  console.error(`❌ ${explain(error)}`)
  process.exit(1)
})
