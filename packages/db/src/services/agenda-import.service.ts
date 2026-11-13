/**
 * Sincronização de volta: traz para o MinhaAgenda o que está na agenda oficial
 * (Belasis), inclusive o que a recepção marcou lá.
 *
 * Só nesse sentido (lá → aqui). Para cada agendamento lá no período:
 *  - já existe aqui (criado pela IA, ou trazido antes) → confere: cancelado lá
 *    cancela aqui; horário/profissional mudou lá → corrige aqui; confirmado lá →
 *    confirmado aqui;
 *  - não existe aqui → cria, com o profissional e o serviço do de-para ao
 *    contrário (nº 7 → Ana) e o cliente achado pelo telefone (ou cadastrado);
 *  - profissional ou serviço sem par → pula (conta em "sem vínculo").
 * E o contrário: o que foi para lá e sumiu da lista (apagado, ou remarcado para
 * fora do período) → confere um a um.
 *
 * A agenda oficial manda: nada daqui é empurrado para lá, e o que vem de lá entra
 * sem as travas de expediente/conflito — lá já aceitou. Se bater com algo daqui,
 * entra mesmo assim, e um alerta avisa.
 *
 * O núcleo (`importAgendaAppointments`) recebe tudo por parâmetro e não toca no
 * banco — é o que os testes exercitam. A versão ligada ao banco é
 * `syncAgendaForSalon`.
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { and, eq, gt, gte, inArray, lt, ne, sql } from 'drizzle-orm'

import { db } from '../index'
import { appointments, customers, integrationExternalRefs } from '../schema'
import { isAgendaProviderError } from '../domain/errors/agenda-provider-error'
import {
  AGENDA_PROVIDER_LABELS,
  type AgendaAppointmentSnapshot,
  type AgendaProviderId,
  type AgendaRemoteAppointment,
} from '../domain/integrations/interfaces/agenda-provider.interface'
import { BRAZIL_TIMEZONE } from '../utils/timezone.utils'
import { phoneMatchKey, toE164Digits } from '../utils/phone-match.utils'
import { applyAgendaMoveService, cancelAppointmentService } from './appointments'
import { createAgendaSyncContext, type AgendaSyncContext } from './agenda-sync.service'
import { resolveAgendaProvider } from './agenda-provider-registry.service'
import { fireAndForgetCreate } from './integration-sync'
import type { AgendaSetupResult } from './agenda-setup.service'

/** Período da sincronização: de hoje até daqui a 30 dias (decisão do dono, 21/out). */
export const AGENDA_SYNC_DAYS = 30

export interface AgendaImportSummary {
  /** Itens lá no período (um por serviço), de todos os profissionais de lá. */
  total: number
  imported: number
  updated: number
  cancelled: number
  unchanged: number
  /** Profissional ou serviço sem par aqui — inclui os profissionais de lá que não atendem por aqui. */
  skippedUnlinked: number
  skippedNoPhone: number
  /** Trazidos de lá em cima de algo que já existia aqui no mesmo horário. */
  conflicts: number
  failed: number
}

export interface LocalAppointmentRow {
  id: string
  status: string
  date: Date
  endTime: Date
  professionalId: string
  serviceId: string
}

/** Um agendamento de lá que passou a existir aqui nesta rodada. */
export interface AgendaImportedAppointment {
  appointmentId: string
  externalId: string
  start: Date
  end: Date
  professionalId: string
  serviceId: string
}

export interface AgendaImportDeps {
  findLocalAppointment(id: string): Promise<LocalAppointmentRow | null>
  /**
   * Agendamentos daqui com par lá, pendentes/confirmados, no período. Com
   * `clientId`, só os de um cliente (a consulta por cliente, antes de agendar).
   */
  listLinkedLocalAppointments(
    range: { start: Date; end: Date },
    filter?: { clientId?: string }
  ): Promise<Array<LocalAppointmentRow & { externalId: string }>>
  insertAppointment(input: {
    professionalId: string
    serviceId: string
    clientId: string
    start: Date
    end: Date
    status: 'pending' | 'confirmed'
    notes?: string
  }): Promise<string>
  cancelAppointment(id: string): Promise<void>
  moveAppointment(
    id: string,
    change: { start: Date; end: Date; professionalId?: string; serviceId?: string }
  ): Promise<void>
  markConfirmed(id: string): Promise<void>
  findOrCreateCustomer(input: { name: string; phone: string }): Promise<string | null>
  hasConflict(input: { professionalId: string; start: Date; end: Date; excludeId?: string }): Promise<boolean>
  /**
   * Desfaz um agendamento que acabou de ser criado aqui e não pôde ficar: outra
   * rodada (a sincronização do salão × a consulta de uma cliente) trouxe o mesmo
   * agendamento de lá ao mesmo tempo e ficou com o par. Sem isto sobraria um
   * agendamento em dobro aqui.
   */
  discardAppointment?(id: string): Promise<void>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Desfecho daqui não se desfaz pela sincronização. */
const FINAL_STATUSES = new Set(['cancelled', 'completed', 'no_show'])

export async function importAgendaAppointments(
  ctx: AgendaSyncContext,
  deps: AgendaImportDeps,
  input: { start: Date; end: Date; onProgress?: (done: number, total: number) => void }
): Promise<AgendaImportSummary> {
  const provider = ctx.agenda.provider
  if (!provider.listAppointments) {
    throw new Error(`${AGENDA_PROVIDER_LABELS[ctx.agenda.providerId]} não permite listar agendamentos`)
  }

  // Lança se a listagem falhar (token, fora do ar): sem a lista, não há o que sincronizar.
  const listed = await provider.listAppointments({ start: input.start, end: input.end })
  const linkedLocal = await deps.listLinkedLocalAppointments({ start: input.start, end: input.end })

  return reconcileAgendaAppointments(ctx, deps, { listed, linkedLocal, onProgress: input.onProgress })
}

/**
 * O miolo da sincronização: recebe o que está lá (`listed`) e o que daqui tem par
 * lá (`linkedLocal`) e deixa os dois lados iguais. Quem chama decide o recorte:
 * o salão inteiro (`importAgendaAppointments`) ou uma cliente só
 * (`refreshCustomerFromAgenda`, antes de a IA remarcar ou agendar).
 */
export async function reconcileAgendaAppointments(
  ctx: AgendaSyncContext,
  deps: AgendaImportDeps,
  input: {
    listed: AgendaRemoteAppointment[]
    linkedLocal: Array<LocalAppointmentRow & { externalId: string }>
    /**
     * O cliente DAQUI que é dono de todos os itens (recorte de uma cliente: a
     * lista veio do cadastro dela lá). Sem isto, cada item acha ou cadastra o
     * cliente pelo telefone guardado lá.
     */
    ownerCustomerId?: string
    onProgress?: (done: number, total: number) => void
    /** Um agendamento de lá passou a existir aqui. */
    onImported?: (imported: AgendaImportedAppointment) => void
    /** Um agendamento ATIVO de lá ficou de fora: profissional ou serviço sem par aqui. */
    onUnlinked?: (item: AgendaRemoteAppointment) => void
  }
): Promise<AgendaImportSummary> {
  const provider = ctx.agenda.provider
  const { listed, linkedLocal } = input

  const internal = (entity: 'professional' | 'service', externalId: string | undefined) =>
    externalId ? ctx.refs.getInternalId(entity, externalId) : Promise.resolve(null)

  // A lista vem com o salão inteiro lá — todos os profissionais, inclusive os que
  // não atendem por aqui (já houve 684 itens para 1 profissional vinculado).
  // Só segue para o laço, e para a barra de progresso, o que pode mexer em algo
  // daqui: profissional com par, marca da IA na observação, ou agendamento já
  // ligado a um daqui (a recepção pode tê-lo passado para outro profissional lá).
  // O resto vai direto para "sem vínculo", sem consulta item a item.
  const linkedExternalIds = new Set(linkedLocal.map((local) => local.externalId))
  const professionalHasPair = new Map<string, boolean>()
  for (const externalProfessionalId of new Set(listed.map((item) => item.externalProfessionalId))) {
    professionalHasPair.set(externalProfessionalId, (await internal('professional', externalProfessionalId)) !== null)
  }
  const reaches = (item: AgendaRemoteAppointment) =>
    professionalHasPair.get(item.externalProfessionalId) === true ||
    item.createdByUsId !== null ||
    linkedExternalIds.has(item.externalId)
  const remote = listed.filter(reaches)
  if (input.onUnlinked) {
    for (const item of listed) {
      if (!reaches(item) && item.status === 'active') input.onUnlinked(item)
    }
  }

  const summary: AgendaImportSummary = {
    total: listed.length,
    imported: 0,
    updated: 0,
    cancelled: 0,
    unchanged: 0,
    skippedUnlinked: listed.length - remote.length,
    skippedNoPhone: 0,
    conflicts: 0,
    failed: 0,
  }
  const seen = new Set<string>()
  const claimed = new Set<string>()
  const customerCache = new Map<string, string | null>()

  async function resolveCustomer(externalCustomerId: string): Promise<string | null> {
    if (customerCache.has(externalCustomerId)) return customerCache.get(externalCustomerId) ?? null
    let localId = await ctx.refs.getInternalId('customer', externalCustomerId)
    if (!localId && provider.getCustomer) {
      const remoteCustomer = await provider.getCustomer(externalCustomerId)
      const phone = toE164Digits(remoteCustomer?.phone)
      if (remoteCustomer && phone) {
        localId = await deps.findOrCreateCustomer({ name: remoteCustomer.name, phone })
        if (localId) {
          try {
            await ctx.refs.setExternalId('customer', localId, externalCustomerId)
          } catch {
            // Outro cliente daqui já tem esse par: o atalho fica sem salvar.
          }
        }
      }
    }
    customerCache.set(externalCustomerId, localId ?? null)
    return localId ?? null
  }

  /** Aplica aqui o que está lá, para um agendamento que já existe dos dois lados. */
  async function reconcile(local: LocalAppointmentRow, remoteState: AgendaAppointmentSnapshot & { confirmed?: boolean }) {
    if (FINAL_STATUSES.has(local.status)) {
      summary.unchanged++
      return
    }
    if (remoteState.status === 'cancelled') {
      await deps.cancelAppointment(local.id)
      summary.cancelled++
      return
    }

    const [professionalId, serviceId] = await Promise.all([
      internal('professional', remoteState.externalProfessionalId),
      internal('service', remoteState.externalServiceId),
    ])
    const professionalChanged = professionalId !== null && professionalId !== local.professionalId
    const serviceChanged = serviceId !== null && serviceId !== local.serviceId
    const timeChanged =
      remoteState.start.getTime() !== local.date.getTime() || remoteState.end.getTime() !== local.endTime.getTime()

    let changed = false
    if (timeChanged || professionalChanged || serviceChanged) {
      await deps.moveAppointment(local.id, {
        start: remoteState.start,
        end: remoteState.end,
        ...(professionalChanged ? { professionalId: professionalId! } : {}),
        ...(serviceChanged ? { serviceId: serviceId! } : {}),
      })
      changed = true
    }
    if (remoteState.confirmed && local.status === 'pending') {
      await deps.markConfirmed(local.id)
      changed = true
    }
    if (changed) summary.updated++
    else summary.unchanged++
  }

  for (const [index, item] of remote.entries()) {
    seen.add(item.externalId)
    try {
      let localId = await ctx.refs.getInternalId('appointment', item.externalId)

      // Criado pela IA, mas sem o par salvo — ou a referência mudou porque o
      // agendamento ganhou outro serviço lá. A marca na observação resolve.
      if (!localId && item.createdByUsId && !claimed.has(item.createdByUsId)) {
        const own = await deps.findLocalAppointment(item.createdByUsId)
        const professionalId = await internal('professional', item.externalProfessionalId)
        if (own && (professionalId === null || own.professionalId === professionalId)) {
          await ctx.refs.setExternalId('appointment', own.id, item.externalId)
          localId = own.id
        }
      }

      if (localId) {
        claimed.add(localId)
        const local = await deps.findLocalAppointment(localId)
        if (local) await reconcile(local, item)
        else summary.unchanged++
      } else if (item.status === 'cancelled') {
        summary.unchanged++ // cancelado lá e nunca esteve aqui: nada a trazer
      } else {
        const [professionalId, serviceId] = await Promise.all([
          internal('professional', item.externalProfessionalId),
          internal('service', item.externalServiceId),
        ])
        if (!professionalId || !serviceId) {
          summary.skippedUnlinked++
          input.onUnlinked?.(item)
        } else {
          const clientId = input.ownerCustomerId ?? (await resolveCustomer(item.externalCustomerId))
          if (!clientId) {
            summary.skippedNoPhone++
          } else {
            if (await deps.hasConflict({ professionalId, start: item.start, end: item.end })) {
              summary.conflicts++
            }
            const newId = await deps.insertAppointment({
              professionalId,
              serviceId,
              clientId,
              start: item.start,
              end: item.end,
              status: item.confirmed ? 'confirmed' : 'pending',
              ...(item.notes ? { notes: item.notes } : {}),
            })
            try {
              await ctx.refs.setExternalId('appointment', newId, item.externalId)
            } catch (error) {
              // O par já é de outro agendamento daqui: outra rodada trouxe este
              // mesmo agendamento agora há pouco (o índice único de lá para cá é
              // o que decide quem fica). O que acabou de ser criado é a sobra.
              const winner = await ctx.refs.getInternalId('appointment', item.externalId)
              if (!winner || winner === newId || !deps.discardAppointment) throw error
              await deps.discardAppointment(newId)
              claimed.add(winner)
              summary.unchanged++
              input.onProgress?.(index + 1, remote.length)
              continue
            }
            claimed.add(newId)
            summary.imported++
            input.onImported?.({
              appointmentId: newId,
              externalId: item.externalId,
              start: item.start,
              end: item.end,
              professionalId,
              serviceId,
            })
          }
        }
      }
    } catch (error) {
      summary.failed++
      ctx.logger.warn('Falha ao sincronizar um agendamento da agenda oficial', {
        externalId: item.externalId,
        error: errorMessage(error),
      })
    }
    input.onProgress?.(index + 1, remote.length)
  }

  // O que foi para lá e não veio na lista: apagado lá, ou remarcado para fora do período.
  // A lista do começo basta: o que o laço tocou está em `seen`/`claimed`, e o que
  // ele criou já nasceu com par.
  if (provider.getAppointment) {
    for (const local of linkedLocal) {
      if (seen.has(local.externalId) || claimed.has(local.id)) continue
      try {
        const snapshot = await provider.getAppointment(local.externalId)
        await reconcile(local, snapshot ?? { status: 'cancelled', start: local.date, end: local.endTime })
      } catch (error) {
        summary.failed++
        ctx.logger.warn('Falha ao conferir um agendamento na agenda oficial', {
          appointmentId: local.id,
          error: errorMessage(error),
        })
      }
    }
  }

  if (summary.conflicts > 0) {
    await ctx.alert({
      type: 'agenda_conflict',
      severity: 'warning',
      title: `A sincronização trouxe da ${AGENDA_PROVIDER_LABELS[ctx.agenda.providerId]} ${summary.conflicts} agendamento(s) em horário que já tinha agendamento aqui. Confira a agenda.`,
      detail: { conflicts: summary.conflicts },
    })
  }

  return summary
}

// ============================================================================
// Ligação com o banco
// ============================================================================

export function createAgendaImportDeps(salonId: string, providerId: AgendaProviderId): AgendaImportDeps {
  const localColumns = {
    id: appointments.id,
    status: appointments.status,
    date: appointments.date,
    endTime: appointments.endTime,
    professionalId: appointments.professionalId,
    serviceId: appointments.serviceId,
  }

  return {
    async findLocalAppointment(id) {
      const [row] = await db
        .select(localColumns)
        .from(appointments)
        .where(and(eq(appointments.id, id), eq(appointments.salonId, salonId)))
        .limit(1)
      return row ?? null
    },

    async listLinkedLocalAppointments(range, filter) {
      return db
        .select({ ...localColumns, externalId: integrationExternalRefs.externalId })
        .from(appointments)
        .innerJoin(
          integrationExternalRefs,
          and(
            eq(integrationExternalRefs.internalId, appointments.id),
            eq(integrationExternalRefs.salonId, salonId),
            eq(integrationExternalRefs.provider, providerId),
            eq(integrationExternalRefs.entityType, 'appointment')
          )
        )
        .where(
          and(
            eq(appointments.salonId, salonId),
            inArray(appointments.status, ['pending', 'confirmed']),
            gte(appointments.date, range.start),
            lt(appointments.date, range.end),
            ...(filter?.clientId ? [eq(appointments.clientId, filter.clientId)] : [])
          )
        )
    },

    async insertAppointment(input) {
      // A origem do lead acompanha a cliente também no que a recepção marcou lá:
      // quem veio de anúncio e fechou por telefone continua sendo lead de tráfego.
      const [owner] = await db
        .select({ leadSource: customers.leadSource })
        .from(customers)
        .where(and(eq(customers.id, input.clientId), eq(customers.salonId, salonId)))
        .limit(1)
      const [row] = await db
        .insert(appointments)
        .values({
          salonId,
          professionalId: input.professionalId,
          serviceId: input.serviceId,
          clientId: input.clientId,
          date: input.start,
          endTime: input.end,
          status: input.status,
          // Veio da agenda oficial: já está lá.
          syncStatus: 'synced',
          notes: input.notes ?? null,
          leadSource: owner?.leadSource ?? null,
        })
        .returning({ id: appointments.id })
      // O Google (se conectado) espelha a agenda daqui — inclusive o que veio de lá.
      fireAndForgetCreate(row.id, salonId)
      return row.id
    },

    async cancelAppointment(id) {
      const result = await cancelAppointmentService({
        appointmentId: id,
        salonId,
        reason: 'Cancelado na agenda oficial do salão',
        source: providerId,
        skipAgendaSync: true,
      })
      if (!result.success) throw new Error(result.error)
    },

    async moveAppointment(id, change) {
      await applyAgendaMoveService({ appointmentId: id, salonId, ...change })
    },

    async markConfirmed(id) {
      await db
        .update(appointments)
        .set({ status: 'confirmed', updatedAt: new Date() })
        .where(and(eq(appointments.id, id), eq(appointments.salonId, salonId), eq(appointments.status, 'pending')))
    },

    async findOrCreateCustomer({ name, phone }) {
      const key = phoneMatchKey(phone)
      if (!key) return null
      // Os telefones daqui variam (com/sem o 9, formatados): busca pelo final e
      // compara normalizado, para não duplicar a pessoa.
      const candidates = await db
        .select({ id: customers.id, phone: customers.phone })
        .from(customers)
        .where(
          and(
            eq(customers.salonId, salonId),
            sql`regexp_replace(${customers.phone}, '\\D', '', 'g') like ${'%' + phone.slice(-8)}`
          )
        )
        .limit(20)
      const match = candidates.find((c) => phoneMatchKey(c.phone) === key)
      if (match) return match.id

      // O nome vem do cadastro da agenda oficial (digitado pela recepção), não do
      // perfil do WhatsApp: já nasce confirmado.
      const [created] = await db
        .insert(customers)
        .values({ salonId, name: name.trim() || 'Cliente', phone, nameConfirmedAt: new Date() })
        .onConflictDoNothing()
        .returning({ id: customers.id })
      if (created) return created.id

      const existing = await db.query.customers.findFirst({
        where: and(eq(customers.salonId, salonId), eq(customers.phone, phone)),
        columns: { id: true },
      })
      return existing?.id ?? null
    },

    async discardAppointment(id) {
      // Só o que veio de lá e ainda não tem par: nunca apaga um agendamento que
      // alguém já vinculou. (O espelho do Google, se o salão tiver, pode ter
      // recebido o evento dessa sobra; a sincronização do Google o reconcilia.)
      await db.delete(appointments).where(
        and(
          eq(appointments.id, id),
          eq(appointments.salonId, salonId),
          sql`not exists (
            select 1 from ${integrationExternalRefs}
             where ${integrationExternalRefs.salonId} = ${salonId}
               and ${integrationExternalRefs.entityType} = 'appointment'
               and ${integrationExternalRefs.internalId} = ${appointments.id}
          )`
        )
      )
    },

    async hasConflict({ professionalId, start, end, excludeId }) {
      const row = await db.query.appointments.findFirst({
        where: and(
          eq(appointments.salonId, salonId),
          eq(appointments.professionalId, professionalId),
          ne(appointments.status, 'cancelled'),
          lt(appointments.date, end),
          gt(appointments.endTime, start),
          ...(excludeId ? [ne(appointments.id, excludeId)] : [])
        ),
        columns: { id: true },
      })
      return row !== undefined
    },
  }
}

/**
 * Sincroniza a agenda oficial do salão para cá: de hoje até daqui a 30 dias.
 * Roda em segundo plano (worker), no ritmo lento do provedor — a mesma chave de
 * API atende a IA ao vivo, que não pode ficar sem vaga.
 */
export async function syncAgendaForSalon(
  salonId: string,
  options: { onProgress?: (done: number, total: number) => void; now?: Date } = {}
): Promise<AgendaSetupResult<AgendaImportSummary>> {
  let agenda
  try {
    agenda = await resolveAgendaProvider(salonId, { background: true })
  } catch {
    return { ok: false, error: 'A agenda oficial do salão não pôde ser carregada. Reconecte em Integrações.' }
  }
  if (!agenda) return { ok: false, error: 'A integração com a agenda oficial não está ativa neste salão.' }

  const label = AGENDA_PROVIDER_LABELS[agenda.providerId]
  const today = formatInTimeZone(options.now ?? new Date(), BRAZIL_TIMEZONE, 'yyyy-MM-dd')
  const start = fromZonedTime(`${today}T00:00:00`, BRAZIL_TIMEZONE)
  const end = new Date(start.getTime() + AGENDA_SYNC_DAYS * 86_400_000)
  const ctx = createAgendaSyncContext(agenda)

  try {
    const summary = await importAgendaAppointments(ctx, createAgendaImportDeps(salonId, agenda.providerId), {
      start,
      end,
      onProgress: options.onProgress,
    })
    return { ok: true, data: summary }
  } catch (error) {
    if (isAgendaProviderError(error) && error.kind === 'auth') {
      await ctx.alert({
        type: 'agenda_auth_failed',
        severity: 'critical',
        title: `A conexão com a ${label} parou de funcionar e a IA não consegue agendar. Reconecte em Integrações.`,
        detail: { operation: 'sync' },
      })
      return { ok: false, error: `A ${label} recusou o token salvo. Reconecte em Integrações.` }
    }
    ctx.logger.error('Sincronização com a agenda oficial falhou', { salonId, error: errorMessage(error) })
    return { ok: false, error: `Não foi possível falar com a ${label} agora. Tente de novo em instantes.` }
  }
}
