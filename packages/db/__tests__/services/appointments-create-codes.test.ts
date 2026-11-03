import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cada recusa do `createAppointmentService` precisa vir com um `code`, igual ao
 * `updateAppointmentService` já faz. Sem código, a tool de agendamento da IA
 * (mcp-server) tratava tudo como "Verifique os dados e tente novamente" e o
 * cliente recebia um pedido de data e horário de novo — inclusive quando o
 * horário estava só ocupado ou fora do expediente.
 *
 * O banco é um falso que deixa provocar cada recusa; o resto é dublado.
 */

const SALON = '00000000-0000-4000-8000-000000000001'
const PRO = '00000000-0000-4000-8000-0000000000a1'
const SERVICE = '00000000-0000-4000-8000-0000000000b1'
const CLIENT = '00000000-0000-4000-8000-0000000000c1'
const APPOINTMENT = '00000000-0000-4000-8000-0000000000d1'
// Bem no futuro, para não cair na trava de horário passado.
const WHEN = '2030-03-12T10:00:00'

const h = vi.hoisted(() => ({
  proService: { id: 'ps-1' } as { id: string } | null,
  workSpans: [{ startTime: '00:00', endTime: '23:59', isBreak: false }],
  googleBusy: [] as { start: Date; end: Date }[],
  overlapping: null as { id: string } | null,
  prepareAgendaSync: vi.fn(),
}))

vi.mock('../../src/index', async () => {
  const schema = await import('../../src/schema')
  const chain = (result: () => unknown) => {
    const builder: Record<string, unknown> = {}
    for (const method of ['set', 'values', 'from', 'onConflictDoUpdate']) {
      builder[method] = () => builder
    }
    builder.where = () => Object.assign(Promise.resolve(result()), builder)
    builder.returning = () => Promise.resolve(result())
    return builder
  }
  const tx = {
    execute: vi.fn(async () => undefined),
    query: { appointments: { findFirst: vi.fn(async () => h.overlapping) } },
    insert: () => chain(() => [{ id: APPOINTMENT }]),
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
      professionalServices: { findFirst: vi.fn(async () => h.proService) },
    },
    select: () => chain(() => h.workSpans),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  }
  return { ...schema, db }
})

vi.mock('../../src/services/agenda-sync.service', () => ({
  prepareAgendaSync: h.prepareAgendaSync,
  checkAgendaSlot: vi.fn(),
  pushAppointmentToAgenda: vi.fn(),
  cancelAppointmentInAgenda: vi.fn(),
}))
vi.mock('../../src/services/integration-sync', () => ({
  fireAndForgetCreate: vi.fn(),
  fireAndForgetUpdate: vi.fn(),
  fireAndForgetDelete: vi.fn(),
}))
vi.mock('../../src/services/google-calendar', () => ({
  getGoogleFreeBusyForProfessional: vi.fn(async () => h.googleBusy),
}))
vi.mock('../../src/services/person', () => ({
  getPersonProfessionalIdsByKey: vi.fn(async () => [PRO]),
}))
vi.mock('../../src/services/slot-filler.service', () => ({
  processVacantSlot: vi.fn(async () => undefined),
}))

const { createAppointmentService } = await import('../../src/services/appointments')

const input = { salonId: SALON, professionalId: PRO, clientId: CLIENT, serviceId: SERVICE, date: WHEN }

beforeEach(() => {
  h.proService = { id: 'ps-1' }
  h.workSpans = [{ startTime: '00:00', endTime: '23:59', isBreak: false }]
  h.googleBusy = []
  h.overlapping = null
  h.prepareAgendaSync.mockResolvedValue({ ok: true, ctx: null })
})

describe('createAppointmentService / códigos das recusas', () => {
  it('sem recusa → cria', async () => {
    expect(await createAppointmentService(input)).toEqual({ success: true, data: { appointmentId: APPOINTMENT } })
  })

  it('profissional não faz o serviço → PROFESSIONAL_CANNOT_PERFORM_SERVICE', async () => {
    h.proService = null

    expect(await createAppointmentService(input)).toEqual({
      success: false,
      error: 'Profissional não executa este serviço',
      code: 'PROFESSIONAL_CANNOT_PERFORM_SERVICE',
    })
  })

  it('horário que já passou → PAST_APPOINTMENT', async () => {
    expect(await createAppointmentService({ ...input, date: '2020-03-12T10:00:00' })).toEqual({
      success: false,
      error: 'Não é possível agendar em um horário que já passou',
      code: 'PAST_APPOINTMENT',
    })
  })

  it('profissional sem expediente no dia → PROFESSIONAL_NOT_AVAILABLE', async () => {
    h.workSpans = []

    expect(await createAppointmentService(input)).toEqual({
      success: false,
      error: 'Profissional não possui horários cadastrados neste dia',
      code: 'PROFESSIONAL_NOT_AVAILABLE',
    })
  })

  it('fora do expediente → PROFESSIONAL_NOT_AVAILABLE', async () => {
    h.workSpans = [{ startTime: '14:00', endTime: '18:00', isBreak: false }]

    expect(await createAppointmentService(input)).toEqual({
      success: false,
      error: 'Horário fora do expediente do profissional',
      code: 'PROFESSIONAL_NOT_AVAILABLE',
    })
  })

  it('ocupado no Google Calendar → APPOINTMENT_CONFLICT', async () => {
    h.googleBusy = [{ start: new Date('2030-01-01T00:00:00Z'), end: new Date('2031-01-01T00:00:00Z') }]

    expect(await createAppointmentService(input)).toEqual({
      success: false,
      error: 'Horário indisponível (conflito com Google Calendar)',
      code: 'APPOINTMENT_CONFLICT',
    })
  })

  it('ocupado por outro agendamento daqui → APPOINTMENT_CONFLICT', async () => {
    h.overlapping = { id: 'outro' }

    expect(await createAppointmentService(input)).toEqual({
      success: false,
      error: 'Horário indisponível (conflito de agenda)',
      code: 'APPOINTMENT_CONFLICT',
    })
  })
})
