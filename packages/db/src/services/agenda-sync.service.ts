/**
 * Agenda oficial externa (primeiro caso: Belasis) dentro do fluxo de agendamento.
 *
 * Quando o salão tem agenda oficial conectada, é ela que manda:
 *
 *  1. ANTES de reservar aqui, `checkAgendaSlot` pergunta se o horário está livre
 *     lá. Sem resposta, não agenda (fail-closed): reservar às cegas na agenda que
 *     a recepção usa é double-booking.
 *  2. DEPOIS de reservar aqui, `createInAgenda` grava lá na hora, não em segundo
 *     plano. Se lá recusar, quem chama desfaz a reserva local e a IA oferece outro
 *     horário — o cliente nunca recebe confirmação de algo que não existe na
 *     agenda oficial.
 *  3. Remarcar segue a mesma ideia (`rescheduleInAgenda`). Cancelar nunca é
 *     bloqueado pela agenda externa (`cancelInAgenda` só avisa se não chegou lá).
 *
 * O Google Calendar continua sendo espelho, em segundo plano (integration-sync.ts).
 *
 * O núcleo (check/create/reschedule/cancel) recebe tudo por `AgendaSyncContext` e
 * não toca no banco — é o que os testes exercitam com um provedor falso. A versão
 * ligada ao banco sai de `prepareAgendaSync`.
 */
import { and, eq } from 'drizzle-orm'

import { db } from '../index'
import { customers, systemAlerts } from '../schema'
import { logger as defaultLogger, type ILogger } from '../infrastructure/logger'
import {
  AGENDA_PROVIDER_LABELS,
  type AgendaAppointmentInput,
  type AgendaBusyInterval,
  type AgendaCreatedAppointment,
} from '../domain/integrations/interfaces/agenda-provider.interface'
import { isAgendaProviderError } from '../domain/errors/agenda-provider-error'
import { resolveAgendaProvider, type ResolvedAgendaProvider } from './agenda-provider-registry.service'
import {
  findExternalRefId,
  findInternalRefId,
  upsertExternalRef,
  type ExternalRefEntity,
} from '../infrastructure/repositories/integration-external-refs.repository'

// ============================================================================
// Tipos
// ============================================================================

export interface AgendaRefs {
  getExternalId(entity: ExternalRefEntity, internalId: string): Promise<string | null>
  /** O de-para ao contrário: o id de lá → o id daqui (sincronização de volta). */
  getInternalId(entity: ExternalRefEntity, externalId: string): Promise<string | null>
  setExternalId(entity: ExternalRefEntity, internalId: string, externalId: string): Promise<void>
}

export interface AgendaAlert {
  type: string
  severity: 'critical' | 'warning'
  title: string
  detail?: Record<string, unknown>
}

export interface AgendaSyncContext {
  agenda: ResolvedAgendaProvider
  refs: AgendaRefs
  /** Nunca lança: alerta que falha não pode derrubar o agendamento. */
  alert(alert: AgendaAlert): Promise<void>
  logger: Pick<ILogger, 'info' | 'warn' | 'error'>
}

export type AgendaSyncFailureCode =
  | 'EXTERNAL_AGENDA_CONFLICT'
  | 'EXTERNAL_AGENDA_REJECTED'
  | 'EXTERNAL_AGENDA_NOT_LINKED'
  | 'EXTERNAL_AGENDA_UNAVAILABLE'

export interface AgendaSyncFailure {
  ok: false
  code: AgendaSyncFailureCode
  /** Lido pela IA (vira o erro da tool) e pelo painel (toast). Sem detalhe interno. */
  error: string
}

export type AgendaSyncOutcome = { ok: true; externalId?: string } | AgendaSyncFailure

/** O agendamento local, do jeito que a agenda externa precisa recebê-lo. */
export interface AgendaPushInput {
  appointmentId: string
  professionalId: string
  serviceId: string
  start: Date
  end: Date
  customer: { id: string; name: string; phone: string }
  notes?: string | null
}

export const AGENDA_SYNC_MESSAGES = {
  conflict: 'Horário indisponível (já ocupado na agenda do salão)',
  rejected: 'A agenda do salão recusou este agendamento',
  notLinkedProfessional:
    'Este profissional ainda não está vinculado à agenda do salão, então não dá para agendar com ele por aqui',
  notLinkedService:
    'Este serviço ainda não está vinculado à agenda do salão, então não dá para agendá-lo por aqui',
  unavailable: 'Não foi possível confirmar na agenda do salão agora. Tente de novo em instantes',
} as const

// ============================================================================
// Helpers
// ============================================================================

function overlaps(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start.getTime() < b.end.getTime() && a.end.getTime() > b.start.getTime()
}

function labelOf(ctx: AgendaSyncContext): string {
  return AGENDA_PROVIDER_LABELS[ctx.agenda.providerId]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const UNAVAILABLE: AgendaSyncFailure = {
  ok: false,
  code: 'EXTERNAL_AGENDA_UNAVAILABLE',
  error: AGENDA_SYNC_MESSAGES.unavailable,
}

async function notLinked(
  ctx: AgendaSyncContext,
  entity: 'professional' | 'service',
  internalId: string
): Promise<AgendaSyncFailure> {
  const what = entity === 'professional' ? 'profissional' : 'serviço'
  await ctx.alert({
    type: 'agenda_not_linked',
    severity: 'warning',
    title: `Há ${what} sem vínculo com a ${labelOf(ctx)}: a IA não consegue agendar com ele. Faça o vínculo em Integrações.`,
    detail: { entity, internalId },
  })
  return {
    ok: false,
    code: 'EXTERNAL_AGENDA_NOT_LINKED',
    error: entity === 'professional'
      ? AGENDA_SYNC_MESSAGES.notLinkedProfessional
      : AGENDA_SYNC_MESSAGES.notLinkedService,
  }
}

/** Traduz o erro do provedor para o desfecho que quem chama entende. */
async function failureFrom(
  ctx: AgendaSyncContext,
  error: unknown,
  operation: 'check' | 'create' | 'reschedule' | 'cancel',
  detail: Record<string, unknown>
): Promise<AgendaSyncFailure> {
  const kind = isAgendaProviderError(error) ? error.kind : 'unknown'
  ctx.logger.warn(`Agenda oficial falhou (${operation})`, {
    provider: ctx.agenda.providerId,
    salonId: ctx.agenda.salonId,
    kind,
    ...detail,
    error: errorMessage(error),
  })

  switch (kind) {
    case 'slot_unavailable':
      return { ok: false, code: 'EXTERNAL_AGENDA_CONFLICT', error: AGENDA_SYNC_MESSAGES.conflict }
    case 'rejected':
    case 'not_found':
      await ctx.alert({
        type: 'agenda_rejected',
        severity: 'warning',
        title: `A ${labelOf(ctx)} recusou uma operação de agendamento feita por aqui. Confira se os vínculos de profissionais e serviços continuam certos.`,
        detail: { operation, kind, ...detail, error: errorMessage(error) },
      })
      return { ok: false, code: 'EXTERNAL_AGENDA_REJECTED', error: AGENDA_SYNC_MESSAGES.rejected }
    case 'auth':
      await ctx.alert({
        type: 'agenda_auth_failed',
        severity: 'critical',
        title: `A conexão com a ${labelOf(ctx)} parou de funcionar e a IA não consegue agendar. Reconecte em Integrações.`,
        detail: { operation },
      })
      return UNAVAILABLE
    default:
      return UNAVAILABLE
  }
}

/** Guarda os vínculos de uma escrita que deu certo lá. Nunca desfaz o agendamento. */
async function rememberCreated(
  ctx: AgendaSyncContext,
  input: AgendaPushInput,
  created: AgendaCreatedAppointment
): Promise<void> {
  try {
    await ctx.refs.setExternalId('appointment', input.appointmentId, created.externalId)
  } catch (error) {
    // O agendamento existe nos dois lados; só remarcar/cancelar por aqui é que
    // não vai chegar lá. Pior seria desfazer uma reserva que a agenda aceitou.
    ctx.logger.error('Agendamento criado na agenda oficial, mas o vínculo não foi salvo', {
      appointmentId: input.appointmentId,
      externalId: created.externalId,
      error: errorMessage(error),
    })
    await ctx.alert({
      type: 'agenda_ref_not_saved',
      severity: 'warning',
      title: `Um agendamento foi criado na ${labelOf(ctx)}, mas o vínculo não foi salvo: remarcar ou cancelar por aqui não vai chegar lá.`,
      detail: { appointmentId: input.appointmentId, externalId: created.externalId },
    })
  }

  if (created.externalCustomerId) {
    try {
      await ctx.refs.setExternalId('customer', input.customer.id, created.externalCustomerId)
    } catch (error) {
      // Só um atalho para a próxima vez (evita buscar o cliente por telefone).
      ctx.logger.warn('Vínculo do cliente com a agenda oficial não foi salvo', {
        customerId: input.customer.id,
        error: errorMessage(error),
      })
    }
  }
}

async function mapForPush(
  ctx: AgendaSyncContext,
  input: AgendaPushInput
): Promise<{ ok: true; payload: AgendaAppointmentInput } | AgendaSyncFailure> {
  const [externalProfessionalId, externalServiceId, externalCustomerId] = await Promise.all([
    ctx.refs.getExternalId('professional', input.professionalId),
    ctx.refs.getExternalId('service', input.serviceId),
    ctx.refs.getExternalId('customer', input.customer.id),
  ])
  if (!externalProfessionalId) return notLinked(ctx, 'professional', input.professionalId)
  if (!externalServiceId) return notLinked(ctx, 'service', input.serviceId)

  return {
    ok: true,
    payload: {
      idempotencyKey: input.appointmentId,
      externalProfessionalId,
      externalServiceId,
      start: input.start,
      end: input.end,
      customer: {
        name: input.customer.name,
        phone: input.customer.phone,
        ...(externalCustomerId ? { externalId: externalCustomerId } : {}),
      },
      ...(input.notes ? { notes: input.notes } : {}),
    },
  }
}

/**
 * A escrita foi enviada e a resposta não veio. Se o provedor sabe procurar pela
 * chave de idempotência, confere; senão, falha e pede para a equipe olhar a agenda.
 */
async function resolveUncertainCreate(
  ctx: AgendaSyncContext,
  input: AgendaPushInput,
  payload: AgendaAppointmentInput,
  error: unknown
): Promise<AgendaSyncOutcome> {
  const provider = ctx.agenda.provider
  if (provider.findAppointmentByIdempotencyKey) {
    try {
      const found = await provider.findAppointmentByIdempotencyKey(payload.idempotencyKey, {
        externalProfessionalId: payload.externalProfessionalId,
        start: payload.start,
      })
      if (found) {
        await rememberCreated(ctx, input, { externalId: found.externalId })
        return { ok: true, externalId: found.externalId }
      }
      // Conferido: não gravou. É uma falha comum, sem nada a limpar lá.
      return failureFrom(ctx, error, 'create', { appointmentId: input.appointmentId })
    } catch {
      // Nem a conferência respondeu — cai no alerta.
    }
  }

  ctx.logger.error('Escrita incerta na agenda oficial: pode ter ficado um agendamento lá', {
    appointmentId: input.appointmentId,
    error: errorMessage(error),
  })
  await ctx.alert({
    type: 'agenda_write_uncertain',
    severity: 'warning',
    title: `Confira a agenda da ${labelOf(ctx)}: um agendamento pode ter ficado lá sem ter sido confirmado ao cliente.`,
    detail: {
      appointmentId: input.appointmentId,
      professionalId: input.professionalId,
      start: input.start.toISOString(),
      customerName: input.customer.name,
    },
  })
  return UNAVAILABLE
}

async function writeCreate(
  ctx: AgendaSyncContext,
  input: AgendaPushInput,
  payload: AgendaAppointmentInput
): Promise<AgendaSyncOutcome> {
  try {
    const created = await ctx.agenda.provider.createAppointment(payload)
    await rememberCreated(ctx, input, created)
    return { ok: true, externalId: created.externalId }
  } catch (error) {
    if (isAgendaProviderError(error) && error.kind === 'uncertain') {
      return resolveUncertainCreate(ctx, input, payload, error)
    }
    return failureFrom(ctx, error, 'create', { appointmentId: input.appointmentId })
  }
}

// ============================================================================
// Núcleo
// ============================================================================

/**
 * O horário está livre na agenda oficial? Sempre com dado fresco (sem cache):
 * é a última checagem antes de gravar.
 *
 * `current` é o agendamento sendo remarcado. Se ele já existe lá, o provedor
 * desconta o horário que ele mesmo ocupa (não é conflito consigo). Se ainda não
 * existe lá, a agenda externa nem sabe dele e não há o que descontar.
 */
export async function checkAgendaSlot(
  ctx: AgendaSyncContext,
  input: {
    professionalId: string
    start: Date
    end: Date
    current?: { appointmentId: string }
  }
): Promise<AgendaSyncOutcome> {
  const externalProfessionalId = await ctx.refs.getExternalId('professional', input.professionalId)
  if (!externalProfessionalId) return notLinked(ctx, 'professional', input.professionalId)

  const ownExternalId = input.current
    ? await ctx.refs.getExternalId('appointment', input.current.appointmentId)
    : null

  let busy: AgendaBusyInterval[]
  try {
    busy = await ctx.agenda.provider.getBusyIntervals({
      externalProfessionalId,
      start: input.start,
      end: input.end,
      fresh: true,
      ...(ownExternalId ? { excludeExternalAppointmentId: ownExternalId } : {}),
    })
  } catch (error) {
    return failureFrom(ctx, error, 'check', { professionalId: input.professionalId })
  }

  const conflict = busy.some(
    (interval) =>
      overlaps(interval, input) &&
      // Defesa extra: período identificado como do próprio agendamento.
      !(ownExternalId && interval.externalAppointmentId === ownExternalId)
  )

  return conflict
    ? { ok: false, code: 'EXTERNAL_AGENDA_CONFLICT', error: AGENDA_SYNC_MESSAGES.conflict }
    : { ok: true }
}

/** Grava na agenda oficial um agendamento que acabou de ser reservado aqui. */
export async function createInAgenda(
  ctx: AgendaSyncContext,
  input: AgendaPushInput
): Promise<AgendaSyncOutcome> {
  const mapped = await mapForPush(ctx, input)
  if (!mapped.ok) return mapped
  return writeCreate(ctx, input, mapped.payload)
}

/**
 * Leva para a agenda oficial um agendamento remarcado aqui. Se ele ainda não
 * existe lá (foi criado antes da conexão, ou apagaram lá), passa a existir.
 */
export async function rescheduleInAgenda(
  ctx: AgendaSyncContext,
  input: AgendaPushInput
): Promise<AgendaSyncOutcome> {
  const externalId = await ctx.refs.getExternalId('appointment', input.appointmentId)
  if (!externalId) return createInAgenda(ctx, input)

  const mapped = await mapForPush(ctx, input)
  if (!mapped.ok) return mapped

  try {
    const moved = await ctx.agenda.provider.rescheduleAppointment(externalId, mapped.payload)
    if (moved.externalId !== externalId || moved.externalCustomerId) {
      // A remarcação virou outro agendamento lá (criar + cancelar).
      await rememberCreated(ctx, input, moved)
    }
    if (moved.staleExternalId) {
      await ctx.alert({
        type: 'agenda_cancel_failed',
        severity: 'warning',
        title: `Uma remarcação criou o horário novo na ${labelOf(ctx)}, mas o antigo não foi cancelado lá: ele continua ocupando a agenda até alguém cancelar.`,
        detail: { appointmentId: input.appointmentId, staleExternalId: moved.staleExternalId },
      })
    }
    return { ok: true, externalId: moved.externalId }
  } catch (error) {
    if (isAgendaProviderError(error) && error.kind === 'not_found') {
      // Apagaram lá (a recepção, por exemplo). O cliente quer o horário novo.
      return writeCreate(ctx, input, mapped.payload)
    }
    if (isAgendaProviderError(error) && error.kind === 'uncertain') {
      await ctx.alert({
        type: 'agenda_write_uncertain',
        severity: 'warning',
        title: `Confira a agenda da ${labelOf(ctx)}: uma remarcação pode ter chegado lá sem ter sido confirmada ao cliente.`,
        detail: { appointmentId: input.appointmentId, start: input.start.toISOString() },
      })
      return UNAVAILABLE
    }
    return failureFrom(ctx, error, 'reschedule', { appointmentId: input.appointmentId })
  }
}

/**
 * Cancela na agenda oficial. Quem chama cancela aqui de qualquer jeito — o
 * cliente pediu — e só registra a falha; o alerta avisa que o horário continua
 * ocupado lá.
 */
export async function cancelInAgenda(
  ctx: AgendaSyncContext,
  input: { appointmentId: string; reason?: string }
): Promise<AgendaSyncOutcome> {
  const externalId = await ctx.refs.getExternalId('appointment', input.appointmentId)
  if (!externalId) return { ok: true }

  try {
    await ctx.agenda.provider.cancelAppointment(externalId, { reason: input.reason })
    return { ok: true, externalId }
  } catch (error) {
    if (isAgendaProviderError(error) && error.kind === 'not_found') {
      return { ok: true, externalId } // já não existe lá
    }
    const failure = await failureFrom(ctx, error, 'cancel', { appointmentId: input.appointmentId })
    await ctx.alert({
      type: 'agenda_cancel_failed',
      severity: 'warning',
      title: `Um cancelamento feito por aqui não chegou à ${labelOf(ctx)}: o horário continua ocupado lá até alguém cancelar.`,
      detail: { appointmentId: input.appointmentId, externalId },
    })
    return failure
  }
}

/**
 * O que a agenda oficial diz HOJE de um agendamento criado por aqui.
 * - `not_linked`: não existe lá (anterior à conexão) — nada a conferir;
 * - `cancelled`: cancelado ou apagado lá;
 * - `moved`: o horário mudou lá;
 * - `unknown`: a agenda não respondeu — quem chama segue como se nada tivesse mudado.
 */
export type AgendaAppointmentState =
  | { state: 'not_linked' }
  | { state: 'same'; remindedByProvider: boolean }
  | { state: 'cancelled' }
  | { state: 'moved'; start: Date; end: Date; remindedByProvider: boolean }
  | { state: 'unknown' }

/**
 * Confere um agendamento na agenda oficial. Existe porque a Belasis não tem
 * webhook: se a recepção cancela ou remarca lá, só se descobre perguntando — e o
 * momento que importa é antes de mandar o lembrete do horário antigo.
 */
export async function inspectAgendaAppointment(
  ctx: AgendaSyncContext,
  input: { appointmentId: string; start: Date; end: Date }
): Promise<AgendaAppointmentState> {
  const provider = ctx.agenda.provider
  if (!provider.getAppointment) return { state: 'unknown' }

  const externalId = await ctx.refs.getExternalId('appointment', input.appointmentId)
  if (!externalId) return { state: 'not_linked' }

  try {
    const remote = await provider.getAppointment(externalId)
    if (!remote || remote.status === 'cancelled') return { state: 'cancelled' }
    const remindedByProvider = remote.remindedByProvider === true
    if (remote.start.getTime() !== input.start.getTime() || remote.end.getTime() !== input.end.getTime()) {
      return { state: 'moved', start: remote.start, end: remote.end, remindedByProvider }
    }
    return { state: 'same', remindedByProvider }
  } catch (error) {
    ctx.logger.warn('Agenda oficial não respondeu à conferência do agendamento', {
      appointmentId: input.appointmentId,
      error: errorMessage(error),
    })
    return { state: 'unknown' }
  }
}

// ============================================================================
// Ligação com o banco
// ============================================================================

/**
 * Alerta no painel do salão (tabela system_alerts). Um aberto por tipo: a mesma
 * falha repetida em cada mensagem não pode virar uma enxurrada. Nunca lança.
 */
export async function recordAgendaAlert(salonId: string, alert: AgendaAlert): Promise<void> {
  try {
    const open = await db.query.systemAlerts.findFirst({
      where: and(
        eq(systemAlerts.salonId, salonId),
        eq(systemAlerts.type, alert.type),
        eq(systemAlerts.status, 'open')
      ),
      columns: { id: true },
    })
    if (open) return

    await db.insert(systemAlerts).values({
      scope: 'salon',
      salonId,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      detail: alert.detail ?? null,
    })
  } catch (error) {
    defaultLogger.error('Falha ao gravar alerta da agenda oficial', {
      salonId,
      type: alert.type,
      error: errorMessage(error),
    })
  }
}

export function createAgendaSyncContext(
  agenda: ResolvedAgendaProvider,
  logger: ILogger = defaultLogger
): AgendaSyncContext {
  const scope = { salonId: agenda.salonId, provider: agenda.providerId }
  return {
    agenda,
    refs: {
      getExternalId: (entity, internalId) => findExternalRefId(scope, entity, internalId),
      getInternalId: (entity, externalId) => findInternalRefId(scope, entity, externalId),
      setExternalId: (entity, internalId, externalId) => upsertExternalRef(scope, entity, internalId, externalId),
    },
    alert: (alert) => recordAgendaAlert(agenda.salonId, alert),
    logger,
  }
}

export type AgendaSyncPreparation = { ok: true; ctx: AgendaSyncContext | null } | AgendaSyncFailure

/**
 * Monta a agenda oficial do salão para um agendamento. `ctx: null` = o salão não
 * tem agenda oficial e nada muda no fluxo.
 *
 * Se o salão TEM agenda oficial e ela não pôde ser carregada (credencial que não
 * decifra, por exemplo), devolve falha: agendar trava; cancelar segue sem ela.
 */
export async function prepareAgendaSync(salonId: string): Promise<AgendaSyncPreparation> {
  try {
    const agenda = await resolveAgendaProvider(salonId)
    return { ok: true, ctx: agenda ? createAgendaSyncContext(agenda) : null }
  } catch (error) {
    defaultLogger.error('Agenda oficial do salão não pôde ser carregada', {
      salonId,
      error: errorMessage(error),
    })
    await recordAgendaAlert(salonId, {
      type: 'agenda_unavailable',
      severity: 'critical',
      title: 'A agenda oficial do salão não pôde ser carregada e a IA não consegue agendar. Reconecte em Integrações.',
    })
    return UNAVAILABLE
  }
}

/** Nome e telefone do cliente, que a agenda externa precisa para achar ou criar o cadastro. */
export async function loadAgendaCustomer(
  clientId: string
): Promise<AgendaPushInput['customer'] | null> {
  const customer = await db.query.customers.findFirst({
    where: eq(customers.id, clientId),
    columns: { id: true, name: true, phone: true },
  })
  return customer ?? null
}

/**
 * `createInAgenda`/`rescheduleInAgenda` com o cliente carregado do banco e SEM
 * lançar: qualquer exceção (só acontece antes de chegar ao provedor — os erros
 * dele já viram desfecho) volta como falha, para quem chama desfazer a reserva.
 */
export async function pushAppointmentToAgenda(
  ctx: AgendaSyncContext,
  mode: 'create' | 'reschedule',
  input: Omit<AgendaPushInput, 'customer'> & { clientId: string }
): Promise<AgendaSyncOutcome> {
  try {
    const customer = await loadAgendaCustomer(input.clientId)
    if (!customer) {
      return { ok: false, code: 'EXTERNAL_AGENDA_REJECTED', error: AGENDA_SYNC_MESSAGES.rejected }
    }
    const push: AgendaPushInput = {
      appointmentId: input.appointmentId,
      professionalId: input.professionalId,
      serviceId: input.serviceId,
      start: input.start,
      end: input.end,
      notes: input.notes,
      customer,
    }
    return mode === 'create' ? await createInAgenda(ctx, push) : await rescheduleInAgenda(ctx, push)
  } catch (error) {
    ctx.logger.error('Falha inesperada ao gravar na agenda oficial', {
      appointmentId: input.appointmentId,
      mode,
      error: errorMessage(error),
    })
    return UNAVAILABLE
  }
}

/**
 * Para o cancelamento: carrega a agenda oficial e cancela lá, sem nunca lançar
 * (o cancelamento local já aconteceu). False = não chegou lá.
 */
export async function cancelAppointmentInAgenda(input: {
  salonId: string
  appointmentId: string
  reason?: string
}): Promise<boolean> {
  try {
    const agenda = await prepareAgendaSync(input.salonId)
    if (!agenda.ok) return false
    if (!agenda.ctx) return true
    const cancelled = await cancelInAgenda(agenda.ctx, {
      appointmentId: input.appointmentId,
      reason: input.reason,
    })
    return cancelled.ok
  } catch (error) {
    defaultLogger.error('Falha inesperada ao cancelar na agenda oficial', {
      salonId: input.salonId,
      appointmentId: input.appointmentId,
      error: errorMessage(error),
    })
    return false
  }
}

/** `inspectAgendaAppointment` ligado ao banco, sem nunca lançar. */
export async function checkAppointmentInAgenda(
  salonId: string,
  appointment: { id: string; date: Date; endTime: Date }
): Promise<AgendaAppointmentState> {
  try {
    const agenda = await resolveAgendaProvider(salonId)
    if (!agenda) return { state: 'not_linked' }
    return await inspectAgendaAppointment(createAgendaSyncContext(agenda), {
      appointmentId: appointment.id,
      start: appointment.date,
      end: appointment.endTime,
    })
  } catch (error) {
    defaultLogger.warn('Conferência na agenda oficial falhou', {
      salonId,
      appointmentId: appointment.id,
      error: errorMessage(error),
    })
    return { state: 'unknown' }
  }
}

/**
 * Horários ocupados na agenda oficial, para a IA não oferecer o que já foi
 * vendido lá. Lança se a agenda não responder: a disponibilidade segue sem ela,
 * e a checagem na hora de agendar (`checkAgendaSlot`) é que trava.
 */
export async function getAgendaBusyIntervals(
  salonId: string,
  professionalId: string,
  start: Date,
  end: Date
): Promise<AgendaBusyInterval[]> {
  const agenda = await resolveAgendaProvider(salonId)
  if (!agenda) return []

  const externalProfessionalId = await findExternalRefId(
    { salonId, provider: agenda.providerId },
    'professional',
    professionalId
  )
  // Sem vínculo, o agendamento com ele seria recusado de qualquer jeito: o período
  // inteiro ocupado evita oferecer um horário que não pode ser confirmado.
  if (!externalProfessionalId) return [{ start, end }]

  return agenda.provider.getBusyIntervals({ externalProfessionalId, start, end })
}
