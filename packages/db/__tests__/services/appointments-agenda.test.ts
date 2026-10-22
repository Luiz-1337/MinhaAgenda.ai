import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A ligação da agenda oficial dentro de `appointments.ts`: o que acontece com a
 * reserva LOCAL conforme a agenda externa responde. O núcleo (o que conta como
 * conflito, como cada erro é traduzido) está em agenda-sync.test.ts; aqui o
 * agenda-sync é dublado e o banco é um falso que só registra as escritas.
 *
 * O que este arquivo protege: o cliente nunca recebe confirmação de um horário
 * que a agenda oficial recusou — a linha local é desfeita e o espelho do Google
 * não dispara.
 */

const SALON = '00000000-0000-4000-8000-000000000001'
const PRO = '00000000-0000-4000-8000-0000000000a1'
const SERVICE = '00000000-0000-4000-8000-0000000000b1'
const CLIENT = '00000000-0000-4000-8000-0000000000c1'
const APPOINTMENT = '00000000-0000-4000-8000-0000000000d1'
// Bem no futuro, para não cair na trava de horário passado.
const WHEN = '2030-03-12T10:00:00'

const h = vi.hoisted(() => {
  const calls: { op: string; values?: unknown }[] = []
  const ctx = { tag: 'agenda-ctx' }
  return {
    calls,
    ctx,
    prepareAgendaSync: vi.fn(),
    checkAgendaSlot: vi.fn(),
    pushAppointmentToAgenda: vi.fn(),
    cancelAppointmentInAgenda: vi.fn(),
    fireAndForgetCreate: vi.fn(),
    fireAndForgetUpdate: vi.fn(),
    fireAndForgetDelete: vi.fn(),
    existingAppointment: null as Record<string, unknown> | null,
  }
})

vi.mock('../../src/index', async () => {
  const schema = await import('../../src/schema')
  const chain = (op: string, result: unknown) => {
    const builder: Record<string, unknown> = {}
    for (const method of ['set', 'values', 'from', 'onConflictDoUpdate']) {
      builder[method] = (values?: unknown) => {
        if (method === 'set' || method === 'values') h.calls.push({ op, values })
        return builder
      }
    }
    builder.where = () => {
      if (op !== 'select') h.calls.push({ op: `${op}.where` })
      return Object.assign(Promise.resolve(result), builder)
    }
    builder.returning = () => Promise.resolve(result)
    return builder
  }
  const tx = {
    execute: vi.fn(async () => undefined),
    query: { appointments: { findFirst: vi.fn(async () => null) } },
    insert: () => chain('insert', [{ id: APPOINTMENT }]),
    update: () => chain('update', undefined),
  }
  const db = {
    query: {
      services: {
        findFirst: vi.fn(async () => ({
          id: SERVICE, salonId: SALON, duration: 60, durationMax: null,
          allowedWeekdays: null, allowedStartTimes: null, isActive: true,
        })),
      },
      professionals: {
        findFirst: vi.fn(async () => ({ id: PRO, salonId: SALON, isActive: true, personKey: null })),
      },
      professionalServices: { findFirst: vi.fn(async () => ({ id: 'ps-1' })) },
      appointments: { findFirst: vi.fn(async () => h.existingAppointment) },
    },
    // Expediente: o dia inteiro, para a regra de horário não interferir.
    select: () => chain('select', [{ startTime: '00:00', endTime: '23:59', isBreak: false }]),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    delete: () => chain('delete', undefined),
    update: () => chain('update', undefined),
  }
  return { ...schema, db }
})

vi.mock('../../src/services/agenda-sync.service', () => ({
  prepareAgendaSync: h.prepareAgendaSync,
  checkAgendaSlot: h.checkAgendaSlot,
  pushAppointmentToAgenda: h.pushAppointmentToAgenda,
  cancelAppointmentInAgenda: h.cancelAppointmentInAgenda,
}))
vi.mock('../../src/services/integration-sync', () => ({
  fireAndForgetCreate: h.fireAndForgetCreate,
  fireAndForgetUpdate: h.fireAndForgetUpdate,
  fireAndForgetDelete: h.fireAndForgetDelete,
}))
vi.mock('../../src/services/google-calendar', () => ({
  getGoogleFreeBusyForProfessional: vi.fn(async () => []),
}))
vi.mock('../../src/services/person', () => ({
  getPersonProfessionalIdsByKey: vi.fn(async () => [PRO]),
}))
vi.mock('../../src/services/slot-filler.service', () => ({
  processVacantSlot: vi.fn(async () => undefined),
}))

const { createAppointmentService, updateAppointmentService, cancelAppointmentService } = await import(
  '../../src/services/appointments'
)

const createInput = {
  salonId: SALON,
  professionalId: PRO,
  clientId: CLIENT,
  serviceId: SERVICE,
  date: WHEN,
}

const ops = () => h.calls.map((c) => c.op)

beforeEach(() => {
  h.calls.length = 0
  vi.clearAllMocks()
  h.existingAppointment = null
  h.checkAgendaSlot.mockResolvedValue({ ok: true })
  h.pushAppointmentToAgenda.mockResolvedValue({ ok: true, externalId: 'ext-1' })
  h.cancelAppointmentInAgenda.mockResolvedValue(true)
})

describe('createAppointmentService × agenda oficial', () => {
  it('salão SEM agenda oficial → fluxo de sempre (sem checagem, sem push, espelho do Google dispara)', async () => {
    h.prepareAgendaSync.mockResolvedValue({ ok: true, ctx: null })

    const result = await createAppointmentService(createInput)

    expect(result).toEqual({ success: true, data: { appointmentId: APPOINTMENT } })
    expect(h.checkAgendaSlot).not.toHaveBeenCalled()
    expect(h.pushAppointmentToAgenda).not.toHaveBeenCalled()
    expect(h.fireAndForgetCreate).toHaveBeenCalledWith(APPOINTMENT, SALON, undefined)
    expect(ops()).not.toContain('delete.where')
  })

  it('agenda aceita → sucesso, com push do agendamento recém-criado', async () => {
    h.prepareAgendaSync.mockResolvedValue({ ok: true, ctx: h.ctx })

    const result = await createAppointmentService(createInput)

    expect(result.success).toBe(true)
    expect(h.pushAppointmentToAgenda).toHaveBeenCalledWith(
      h.ctx,
      'create',
      expect.objectContaining({ appointmentId: APPOINTMENT, clientId: CLIENT, professionalId: PRO, serviceId: SERVICE })
    )
    expect(h.fireAndForgetCreate).toHaveBeenCalled()
  })

  it('horário ocupado na agenda oficial → recusa ANTES de reservar aqui', async () => {
    h.prepareAgendaSync.mockResolvedValue({ ok: true, ctx: h.ctx })
    h.checkAgendaSlot.mockResolvedValue({ ok: false, code: 'EXTERNAL_AGENDA_CONFLICT', error: 'ocupado lá' })

    const result = await createAppointmentService(createInput)

    expect(result).toEqual({ success: false, error: 'ocupado lá', code: 'EXTERNAL_AGENDA_CONFLICT' })
    expect(ops()).not.toContain('insert')
    expect(h.fireAndForgetCreate).not.toHaveBeenCalled()
  })

  it('agenda recusa o push → a reserva local é DESFEITA e o Google não é avisado', async () => {
    h.prepareAgendaSync.mockResolvedValue({ ok: true, ctx: h.ctx })
    h.pushAppointmentToAgenda.mockResolvedValue({ ok: false, code: 'EXTERNAL_AGENDA_REJECTED', error: 'recusado lá' })

    const result = await createAppointmentService(createInput)

    expect(result).toEqual({ success: false, error: 'recusado lá', code: 'EXTERNAL_AGENDA_REJECTED' })
    expect(ops()).toEqual(['insert', 'delete.where'])
    expect(h.fireAndForgetCreate).not.toHaveBeenCalled()
  })

  it('agenda oficial não carrega (credencial quebrada) → não agenda', async () => {
    h.prepareAgendaSync.mockResolvedValue({ ok: false, code: 'EXTERNAL_AGENDA_UNAVAILABLE', error: 'fora do ar' })

    const result = await createAppointmentService(createInput)

    expect(result).toEqual({ success: false, error: 'fora do ar', code: 'EXTERNAL_AGENDA_UNAVAILABLE' })
    expect(ops()).not.toContain('insert')
  })

  it('agendamento vindo de sync externo (skipExternalSync) → nem consulta a agenda oficial', async () => {
    const result = await createAppointmentService({ ...createInput, skipExternalSync: true })

    expect(result.success).toBe(true)
    expect(h.prepareAgendaSync).not.toHaveBeenCalled()
    expect(h.pushAppointmentToAgenda).not.toHaveBeenCalled()
  })
})

describe('updateAppointmentService × agenda oficial', () => {
  const previous = {
    id: APPOINTMENT,
    salonId: SALON,
    clientId: CLIENT,
    professionalId: PRO,
    serviceId: SERVICE,
    date: new Date('2030-03-12T13:00:00.000Z'),
    endTime: new Date('2030-03-12T14:00:00.000Z'),
    status: 'pending',
    notes: 'nota antiga',
  }

  it('agenda recusa a remarcação → a linha local VOLTA ao horário anterior', async () => {
    h.existingAppointment = previous
    h.prepareAgendaSync.mockResolvedValue({ ok: true, ctx: h.ctx })
    h.pushAppointmentToAgenda.mockResolvedValue({ ok: false, code: 'EXTERNAL_AGENDA_CONFLICT', error: 'ocupado lá' })

    const result = await updateAppointmentService({ appointmentId: APPOINTMENT, date: '2030-03-12T15:00:00' })

    expect(result).toEqual({ success: false, error: 'ocupado lá', code: 'EXTERNAL_AGENDA_CONFLICT' })
    const updates = h.calls.filter((c) => c.op === 'update' && c.values)
    expect(updates).toHaveLength(2)
    // A segunda escrita é a reversão, com os valores de antes.
    expect(updates[1].values).toMatchObject({
      professionalId: PRO,
      serviceId: SERVICE,
      date: previous.date,
      endTime: previous.endTime,
      notes: 'nota antiga',
    })
    expect(h.fireAndForgetUpdate).not.toHaveBeenCalled()
  })

  it('checa a agenda oficial ignorando o próprio horário atual (mesmo profissional)', async () => {
    h.existingAppointment = previous
    h.prepareAgendaSync.mockResolvedValue({ ok: true, ctx: h.ctx })

    await updateAppointmentService({ appointmentId: APPOINTMENT, date: '2030-03-12T15:00:00' })

    expect(h.checkAgendaSlot).toHaveBeenCalledWith(
      h.ctx,
      expect.objectContaining({ professionalId: PRO, current: { appointmentId: APPOINTMENT } })
    )
  })

  it('só a nota mudou → não vai para a agenda oficial', async () => {
    h.existingAppointment = previous

    const result = await updateAppointmentService({ appointmentId: APPOINTMENT, notes: 'nota nova' })

    expect(result.success).toBe(true)
    expect(h.prepareAgendaSync).not.toHaveBeenCalled()
    expect(h.pushAppointmentToAgenda).not.toHaveBeenCalled()
  })
})

describe('cancelAppointmentService × agenda oficial', () => {
  const existing = {
    id: APPOINTMENT, salonId: SALON, professionalId: PRO, serviceId: SERVICE,
    date: new Date('2030-03-12T13:00:00.000Z'), status: 'pending',
  }

  it('cancelamento não chegou à agenda oficial → cancela aqui mesmo assim e marca sync failed', async () => {
    h.existingAppointment = existing
    h.cancelAppointmentInAgenda.mockResolvedValue(false)

    const result = await cancelAppointmentService({ appointmentId: APPOINTMENT, reason: 'desistiu' })

    expect(result).toEqual({ success: true, data: undefined })
    expect(h.cancelAppointmentInAgenda).toHaveBeenCalledWith({
      salonId: SALON, appointmentId: APPOINTMENT, reason: 'desistiu',
    })
    const updates = h.calls.filter((c) => c.op === 'update' && c.values)
    expect(updates[0].values).toMatchObject({ status: 'cancelled' })
    expect(updates[1].values).toMatchObject({ syncStatus: 'failed' })
  })

  it('cancelamento que VEIO da agenda oficial (skipAgendaSync) não volta para lá, mas o Google é avisado', async () => {
    h.existingAppointment = existing

    await cancelAppointmentService({ appointmentId: APPOINTMENT, source: 'belasis', skipAgendaSync: true })

    expect(h.cancelAppointmentInAgenda).not.toHaveBeenCalled()
    expect(h.fireAndForgetDelete).toHaveBeenCalledWith(APPOINTMENT, SALON, undefined)
    const updates = h.calls.filter((c) => c.op === 'update' && c.values)
    expect(updates[0].values).toMatchObject({ status: 'cancelled', outcomeSource: 'belasis' })
  })

  it('cancelamento chegou → só o soft cancel', async () => {
    h.existingAppointment = existing

    await cancelAppointmentService({ appointmentId: APPOINTMENT })

    const updates = h.calls.filter((c) => c.op === 'update' && c.values)
    expect(updates).toHaveLength(1)
    expect(updates[0].values).toMatchObject({ status: 'cancelled' })
  })
})
