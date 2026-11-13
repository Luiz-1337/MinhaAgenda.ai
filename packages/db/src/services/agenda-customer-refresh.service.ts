/**
 * "O que esta cliente já tem marcado na agenda oficial?"
 *
 * A consulta que roda com a cliente esperando no WhatsApp, antes de a IA dizer
 * que não há agendamento, remarcar ou criar um horário novo.
 *
 * Por que existe: a recepção marca direto na agenda oficial (Belasis), e a
 * sincronização de volta é de hora em hora e deixa de fora o que não tem par
 * aqui. Em 10 e 12/nov/2026 duas clientes pediram para remarcar um horário que
 * uma atendente tinha marcado lá; a IA respondeu "não encontrei nenhum
 * agendamento futuro", criou OUTRO horário, e o original continuou na agenda.
 *
 * O que faz, para UMA cliente:
 *  1. acha o cadastro dela lá — pelo vínculo guardado ou, na falta, pelo telefone
 *     (e guarda o vínculo);
 *  2. lista os agendamentos desse cadastro daqui para a frente;
 *  3. deixa os dois lados iguais com o mesmo miolo da sincronização do salão
 *     (`reconcileAgendaAppointments`): o que a recepção marcou passa a existir
 *     aqui, no cadastro DESTA cliente, e pode ser remarcado ou cancelado pelas
 *     tools de sempre — que na Belasis mudam a hora ou trocam o antigo pelo novo.
 *
 * É só leitura lá. Custa uma chamada à API (mais a busca por telefone na primeira
 * vez), por isso não roda a cada mensagem: quem chama decide quando.
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { and, eq } from 'drizzle-orm'

import { db } from '../index'
import { customers } from '../schema'
import { logger as defaultLogger } from '../infrastructure/logger'
import { BRAZIL_TIMEZONE } from '../utils/timezone.utils'
import { resolveAgendaProvider } from './agenda-provider-registry.service'
import { createAgendaSyncContext, type AgendaSyncContext } from './agenda-sync.service'
import {
  createAgendaImportDeps,
  reconcileAgendaAppointments,
  type AgendaImportDeps,
  type AgendaImportedAppointment,
} from './agenda-import.service'

/**
 * Até onde olhar. Mais longe que os 30 dias da sincronização do salão: a lista é
 * de uma cliente só, e a remarcação que importa pode ser de um horário marcado
 * com meses de antecedência.
 */
export const AGENDA_CUSTOMER_LOOKAHEAD_DAYS = 180

/** Consultada há menos que isto, não consulta de novo (a cota é de 30/min por chave). */
const RECENT_MS = 60_000
/** Quantas clientes lembrar. Passou disso, esquece as mais antigas. */
const MEMO_MAX = 5_000

/** Um horário que existe lá e não pôde vir para cá: profissional ou serviço sem par. */
export interface AgendaUnlinkedAppointment {
  externalId: string
  start: Date
  end: Date
}

export interface AgendaCustomerRefresh {
  /** A cliente tem cadastro lá (já vinculado, ou achado agora pelo telefone)? */
  foundThere: boolean
  imported: AgendaImportedAppointment[]
  unlinked: AgendaUnlinkedAppointment[]
}

const NOTHING: AgendaCustomerRefresh = { foundThere: false, imported: [], unlinked: [] }

/**
 * O miolo, sem banco: é o que os testes exercitam com um provedor falso.
 * Lança se a agenda oficial não responder — quem chama decide o que fazer.
 */
export async function refreshCustomerFromAgenda(
  ctx: AgendaSyncContext,
  deps: AgendaImportDeps,
  input: { customer: { id: string; phone: string }; start: Date; end: Date }
): Promise<AgendaCustomerRefresh> {
  const provider = ctx.agenda.provider
  if (!provider.listCustomerAppointments) return NOTHING

  let externalCustomerId = await ctx.refs.getExternalId('customer', input.customer.id)
  if (!externalCustomerId && provider.findCustomerByPhone) {
    const found = await provider.findCustomerByPhone(input.customer.phone)
    if (found) {
      externalCustomerId = found.externalId
      try {
        await ctx.refs.setExternalId('customer', input.customer.id, found.externalId)
      } catch {
        // Outro cliente daqui já tem esse par (cadastro duplicado aqui): o
        // atalho fica sem salvar, a consulta segue.
      }
    }
  }
  // Sem cadastro lá, não há o que ela possa ter marcado lá.
  if (!externalCustomerId) return NOTHING

  const range = { start: input.start, end: input.end }
  const listed = await provider.listCustomerAppointments(externalCustomerId, range)
  const linkedLocal = await deps.listLinkedLocalAppointments(range, { clientId: input.customer.id })

  const imported: AgendaImportedAppointment[] = []
  const unlinked: AgendaUnlinkedAppointment[] = []
  await reconcileAgendaAppointments(ctx, deps, {
    listed,
    linkedLocal,
    ownerCustomerId: input.customer.id,
    onImported: (item) => imported.push(item),
    onUnlinked: (item) => unlinked.push({ externalId: item.externalId, start: item.start, end: item.end }),
  })

  return { foundThere: true, imported, unlinked }
}

// ============================================================================
// Ligação com o banco
// ============================================================================

/**
 * - `no_agenda`: o salão não tem agenda oficial — nada a consultar;
 * - `checked`: consultou agora;
 * - `recent`: consultou há instantes e não repetiu;
 * - `failed`: a agenda oficial não respondeu. O que se sabe é só o que está aqui.
 */
export type AgendaCustomerRefreshStatus = 'no_agenda' | 'checked' | 'recent' | 'failed'

export interface AgendaCustomerRefreshResult {
  status: AgendaCustomerRefreshStatus
  /** Horários FUTUROS de lá que passaram a existir aqui nesta consulta. */
  imported: AgendaImportedAppointment[]
  /** Horários futuros de lá que não puderam vir (profissional ou serviço sem par). */
  unlinked: AgendaUnlinkedAppointment[]
  /**
   * Os de `unlinked` que aparecem pela primeira vez. Quem bloqueia um agendamento
   * por causa deles bloqueia uma vez só: na segunda tentativa a cliente já foi
   * avisada e o agendamento segue.
   */
  newUnlinked: AgendaUnlinkedAppointment[]
}

interface Memo {
  checkedAt: number
  unlinked: AgendaUnlinkedAppointment[]
  reported: Set<string>
}

const memo = new Map<string, Memo>()

/** Para testes. */
export function clearAgendaCustomerRefreshMemo(): void {
  memo.clear()
}

function remember(key: string, value: Memo): void {
  memo.delete(key)
  memo.set(key, value)
  while (memo.size > MEMO_MAX) {
    const oldest = memo.keys().next().value
    if (oldest === undefined) break
    memo.delete(oldest)
  }
}

const empty = (status: AgendaCustomerRefreshStatus): AgendaCustomerRefreshResult => ({
  status,
  imported: [],
  unlinked: [],
  newUnlinked: [],
})

/**
 * `refreshCustomerFromAgenda` ligado ao banco. NUNCA lança: se a agenda oficial
 * não responder, devolve `failed` e quem chama segue com o que tem aqui (agendar
 * continua travado pela checagem de horário, que é fail-closed).
 */
export async function refreshCustomerAppointmentsFromAgenda(input: {
  salonId: string
  customerId: string
  now?: Date
}): Promise<AgendaCustomerRefreshResult> {
  const now = input.now ?? new Date()
  const isFuture = (item: { start: Date }) => item.start.getTime() > now.getTime()

  let agenda
  try {
    agenda = await resolveAgendaProvider(input.salonId)
  } catch (error) {
    defaultLogger.warn('Agenda oficial não pôde ser carregada para consultar a cliente', {
      salonId: input.salonId,
      error: error instanceof Error ? error.message : String(error),
    })
    return empty('failed')
  }
  if (!agenda) return empty('no_agenda')

  const key = `${input.salonId}:${input.customerId}`
  const previous = memo.get(key)
  if (previous && now.getTime() - previous.checkedAt < RECENT_MS) {
    return { status: 'recent', imported: [], unlinked: previous.unlinked.filter(isFuture), newUnlinked: [] }
  }

  try {
    const customer = await db.query.customers.findFirst({
      where: and(eq(customers.id, input.customerId), eq(customers.salonId, input.salonId)),
      columns: { id: true, phone: true },
    })
    if (!customer) return empty('checked')

    const today = formatInTimeZone(now, BRAZIL_TIMEZONE, 'yyyy-MM-dd')
    const start = fromZonedTime(`${today}T00:00:00`, BRAZIL_TIMEZONE)
    const end = new Date(start.getTime() + AGENDA_CUSTOMER_LOOKAHEAD_DAYS * 86_400_000)

    const result = await refreshCustomerFromAgenda(
      createAgendaSyncContext(agenda),
      createAgendaImportDeps(input.salonId, agenda.providerId),
      { customer, start, end }
    )

    const unlinked = result.unlinked.filter(isFuture)
    const reported = previous?.reported ?? new Set<string>()
    const newUnlinked = unlinked.filter((item) => !reported.has(item.externalId))
    for (const item of newUnlinked) reported.add(item.externalId)
    remember(key, { checkedAt: now.getTime(), unlinked, reported })

    return { status: 'checked', imported: result.imported.filter(isFuture), unlinked, newUnlinked }
  } catch (error) {
    defaultLogger.warn('Consulta dos horários da cliente na agenda oficial falhou', {
      salonId: input.salonId,
      customerId: input.customerId,
      error: error instanceof Error ? error.message : String(error),
    })
    return empty('failed')
  }
}
