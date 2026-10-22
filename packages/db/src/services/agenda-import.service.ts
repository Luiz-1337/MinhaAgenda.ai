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
  /** Itens lá no período (um por serviço). */
  total: number
  imported: number
  updated: number
  cancelled: number
  unchanged: number
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

export interface AgendaImportDeps {
  findLocalAppointment(id: string): Promise<LocalAppointmentRow | null>
  /** Agendamentos daqui com par lá, pendentes/confirmados, no período. */
  listLinkedLocalAppointments(range: {
    start: Date
    end: Date
  }): Promise<Array<LocalAppointmentRow & { externalId: string }>>
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
  const remote = await provider.listAppointments({ start: input.start, end: input.end })

  const summary: AgendaImportSummary = {
    total: remote.length,
    imported: 0,
    updated: 0,
    cancelled: 0,
    unchanged: 0,
    skippedUnlinked: 0,
    skippedNoPhone: 0,
    conflicts: 0,
    failed: 0,
  }
  const seen = new Set<string>()
  const claimed = new Set<string>()
  const customerCache = new Map<string, string | null>()

  const internal = (entity: 'professional' | 'service', externalId: string | undefined) =>
    externalId ? ctx.refs.getInternalId(entity, externalId) : Promise.resolve(null)

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
        } else {
          const clientId = await resolveCustomer(item.externalCustomerId)
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
            await ctx.refs.setExternalId('appointment', newId, item.externalId)
            claimed.add(newId)
            summary.imported++
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
  if (provider.getAppointment) {
    const linked = await deps.listLinkedLocalAppointments({ start: input.start, end: input.end })
    for (const local of linked) {
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

    async listLinkedLocalAppointments(range) {
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
            lt(appointments.date, range.end)
          )
        )
    },

    async insertAppointment(input) {
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

      const [created] = await db
        .insert(customers)
        .values({ salonId, name: name.trim() || 'Cliente', phone })
        .onConflictDoNothing()
        .returning({ id: customers.id })
      if (created) return created.id

      const existing = await db.query.customers.findFirst({
        where: and(eq(customers.salonId, salonId), eq(customers.phone, phone)),
        columns: { id: true },
      })
      return existing?.id ?? null
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
