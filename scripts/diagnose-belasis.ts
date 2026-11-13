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
 *   4. o formato do telefone guardado nos clientes (com/sem DDI, formatado);
 *   5. se a listagem de agendamentos filtra MESMO por cliente (`client_id`) — é
 *      disso que depende a consulta "o que esta cliente já tem marcado lá", que
 *      roda antes de a IA remarcar ou agendar. Se a API ignorar o filtro, o
 *      MinhaAgenda descarta o que é de outros clientes, mas cada consulta
 *      percorre a agenda do salão inteiro;
 *   6. as cores de agendamento da conta e se existe a do lead de tráfego pago
 *      (BELASIS_TRAFFIC_COLOR).
 *
 * NÃO cria, altera nem cancela nada. NÃO imprime a chave. Faz ~8 requisições,
 * mais 3 a 7 com --phone (o limite da Belasis é 30 por minuto por chave).
 *
 * Uso (a partir da raiz do repo):
 *   BELASIS_TOKEN=bpk_... pnpm --filter @repo/db exec tsx ../../scripts/diagnose-belasis.ts \
 *     [--date AAAA-MM-DD] [--employee ID] [--client ID] [--color NOME] [--phone 5547999998888]
 */

import { formatInTimeZone } from 'date-fns-tz'

import { normalizeColorName } from '../packages/db/src/infrastructure/integrations/belasis/belasis-agenda-provider'
import { BelasisClient } from '../packages/db/src/infrastructure/integrations/belasis/belasis-client'
import { isBelasisApiError } from '../packages/db/src/infrastructure/integrations/belasis/belasis-errors'
import {
  BELASIS_TIME_ZONE,
  belasisPhoneSearchTerms,
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

  // Um cliente com horário nesse dia: a amostra do passo 6.
  let sampleClientId: number | undefined

  console.log(`\n5) Agendamentos de ${date} (devem cair nos horários ✗ acima)`)
  try {
    const groups = await client.listScheduleGroups({ startDate: date, endDate: date })
    sampleClientId = groups.find((g) => Number.isSafeInteger(g.client_id))?.client_id
    console.log(`   ${groups.length} agendamento(s)`)
    const withoutClient = groups.filter((g) => !Number.isSafeInteger(g.client_id)).length
    if (withoutClient > 0) {
      console.log(`   ⚠️  ${withoutClient} sem client_id: a sincronização não consegue dizer de quem são e não os traz`)
    }
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

  console.log('\n6) Filtro por cliente na listagem (client_id) — o que a cliente já tem marcado lá')
  const clientId = Number(arg('client') ?? sampleClientId)
  if (!Number.isSafeInteger(clientId) || clientId <= 0) {
    console.log('   — sem cliente para testar: passe --client ID, ou um --date que tenha agendamento')
  } else {
    try {
      // O mesmo recorte da consulta de verdade: de hoje a 180 dias.
      const today = formatInTimeZone(new Date(), BELASIS_TIME_ZONE, 'yyyy-MM-dd')
      const until = formatInTimeZone(new Date(Date.now() + 180 * 86_400_000), BELASIS_TIME_ZONE, 'yyyy-MM-dd')
      const groups = await client.listScheduleGroups({ clientId, startDate: today, endDate: until })
      const own = groups.filter((g) => g.client_id === clientId).length
      const withoutOwner = groups.filter((g) => g.client_id === undefined || g.client_id === null).length
      const others = groups.length - own - withoutOwner
      console.log(`   cliente #${clientId}, de ${today} a ${until}: ${groups.length} agendamento(s)`)
      if (groups.length === 0) {
        console.log('   — nenhum no período: não dá para concluir. Teste com um cliente que tenha horário futuro')
      } else if (others === 0 && withoutOwner === 0) {
        console.log('   ✅ todos são desse cliente: o filtro funciona')
      } else {
        if (others > 0) {
          console.log(`   ⚠️  ${others} são de OUTROS clientes: a API ignorou o filtro. O MinhaAgenda descarta esses itens,`)
          console.log('      mas cada consulta percorre a agenda inteira (várias requisições por conversa)')
        }
        if (withoutOwner > 0) {
          console.log(`   ⚠️  ${withoutOwner} vieram sem client_id: sem saber de quem são, o MinhaAgenda os deixa de fora`)
        }
      }
    } catch (error) {
      console.log(`   ❌ ${explain(error)}`)
    }
  }

  console.log('\n7) Cores de agendamento (schedule_colors) — a cor do lead de tráfego pago')
  try {
    const colors = await client.listScheduleColors()
    console.log(`   ${colors.length} cor(es)`)
    for (const c of colors) {
      console.log(`   - #${c.id} ${c.name} ${c.color ?? ''}${c.default_for ? ` · padrão de "${c.default_for}"` : ''}`)
    }
    // Variável vazia (como no .env.example) conta como não definida.
    const wanted = arg('color')?.trim() || process.env.BELASIS_TRAFFIC_COLOR?.trim() || 'Marrom'
    // A mesma comparação do provedor: por id, ou pelo nome sem acento, caixa e espaço sobrando.
    const match = /^\d+$/.test(wanted)
      ? colors.find((c) => c.id === Number(wanted))
      : colors.find((c) => normalizeColorName(c.name ?? '') === normalizeColorName(wanted))
    console.log(
      match
        ? `   ✅ "${wanted}" existe: #${match.id} — é o schedule_color_id que vai no agendamento de tráfego`
        : `   ⚠️  não há cor "${wanted}" nesta conta: os agendamentos de tráfego saem sem cor até ela ser cadastrada`
    )
  } catch (error) {
    console.log(`   ❌ ${explain(error)}`)
  }

  const phoneArg = arg('phone')
  if (phoneArg) {
    console.log('\n8) Busca de cliente por telefone')
    const phone = toBelasisPhone(phoneArg)
    if (!phone) {
      console.log('   ❌ isso não é um telefone no formato DDI + DDD + número')
      return
    }
    // Os mesmos termos, na mesma ordem e com o mesmo teto de páginas, que o
    // provedor usa — mas aqui roda todos, para mostrar qual acha.
    const terms = belasisPhoneSearchTerms(phone)
    const searches = [
      ...terms.specific.map((term) => ({ term, maxPages: 1 })),
      { term: terms.broad, maxPages: 5 },
    ]
    for (const { term, maxPages } of searches) {
      try {
        const { clients, complete } = await client.searchClients(term, { maxPages })
        const isMatch = (c: (typeof clients)[number]) => phonesMatch(c.cellphone, phone) || phonesMatch(c.phone, phone)
        const matches = clients.filter(isMatch)
        console.log(
          `   busca por "${shape(term)}": ${clients.length} candidato(s)${complete ? '' : ` (cortada em ${maxPages} página(s))`}, ${matches.length} com este telefone`
        )
        // Os que batem primeiro; os outros mostram o formato guardado lá.
        for (const c of [...matches, ...clients.filter((c) => !isMatch(c))].slice(0, 10)) {
          console.log(`   - #${c.id} phone=${shape(c.phone)} cellphone=${shape(c.cellphone)}${isMatch(c) ? ' ← É ESTE' : ''}`)
        }
      } catch (error) {
        console.log(`   ❌ ${explain(error)}`)
      }
    }
  }
}

main().catch((error) => {
  console.error(`❌ ${explain(error)}`)
  process.exit(1)
})
