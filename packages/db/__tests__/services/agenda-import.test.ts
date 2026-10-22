import { describe, expect, it, vi } from 'vitest'

/** O núcleo não toca no banco, mas o módulo importa o barrel (DATABASE_URL de fachada basta). */
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'

const { importAgendaAppointments } = await import('../../src/services/agenda-import.service')

import type { AgendaImportDeps, LocalAppointmentRow } from '../../src/services/agenda-import.service'
import type { AgendaAlert, AgendaSyncContext } from '../../src/services/agenda-sync.service'
import type {
  AgendaAppointmentSnapshot,
  AgendaProvider,
  AgendaRemoteAppointment,
  AgendaRemoteCustomer,
} from '../../src/domain/integrations/interfaces/agenda-provider.interface'
import type { ExternalRefEntity } from '../../src/infrastructure/repositories/integration-external-refs.repository'

const ANA = '00000000-0000-4000-8000-0000000000a1'
const CORTE = '00000000-0000-4000-8000-0000000000b1'
const MARIA = '00000000-0000-4000-8000-0000000000c1'
const OURS = '00000000-0000-4000-8000-0000000000d1'

const at = (hhmm: string, day = '12') => new Date(`2026-11-${day}T${hhmm}:00.000Z`)
const window = { start: at('03:00', '10'), end: at('03:00', '30') }

function remote(overrides: Partial<AgendaRemoteAppointment> = {}): AgendaRemoteAppointment {
  return {
    externalId: '610',
    status: 'active',
    confirmed: false,
    start: at('18:00'),
    end: at('19:00'),
    externalProfessionalId: '7',
    externalServiceId: '33',
    externalCustomerId: '88',
    remindedByProvider: false,
    createdByUsId: null,
    ...overrides,
  }
}

function memoryRefs(initial: Array<[ExternalRefEntity, string, string]> = []) {
  const store = new Map<string, string>(initial.map(([entity, internal, external]) => [`${entity}:${internal}`, external]))
  return {
    store,
    getExternalId: vi.fn(async (entity: ExternalRefEntity, internalId: string) => store.get(`${entity}:${internalId}`) ?? null),
    getInternalId: vi.fn(async (entity: ExternalRefEntity, externalId: string) => {
      for (const [key, value] of store) {
        if (value === externalId && key.startsWith(`${entity}:`)) return key.slice(entity.length + 1)
      }
      return null
    }),
    setExternalId: vi.fn(async (entity: ExternalRefEntity, internalId: string, externalId: string) => {
      store.set(`${entity}:${internalId}`, externalId)
    }),
  }
}

/** Ana ↔ 7 e Corte ↔ 33 vinculados, como depois da tela de vínculo. */
const LINKED: Array<[ExternalRefEntity, string, string]> = [
  ['professional', ANA, '7'],
  ['service', CORTE, '33'],
]

function setup(options: {
  items: AgendaRemoteAppointment[]
  refs?: Array<[ExternalRefEntity, string, string]>
  local?: Record<string, LocalAppointmentRow>
  linkedLocal?: Array<LocalAppointmentRow & { externalId: string }>
  customer?: AgendaRemoteCustomer | null
  snapshot?: AgendaAppointmentSnapshot | null
  conflict?: boolean
}) {
  const provider = {
    id: 'belasis' as const,
    testConnection: vi.fn(),
    listProfessionals: vi.fn(),
    listServices: vi.fn(),
    getBusyIntervals: vi.fn(),
    createAppointment: vi.fn(),
    rescheduleAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
    listAppointments: vi.fn(async () => options.items),
    getCustomer: vi.fn(async () => (options.customer === undefined ? { name: 'Maria Souza', phone: '47991054646' } : options.customer)),
    getAppointment: vi.fn(async () => (options.snapshot === undefined ? null : options.snapshot)),
  } satisfies AgendaProvider

  const refs = memoryRefs([...LINKED, ...(options.refs ?? [])])
  const alerts: AgendaAlert[] = []
  const ctx: AgendaSyncContext = {
    agenda: { providerId: 'belasis', salonId: 'salon-1', integrationId: 'int-1', provider },
    refs,
    alert: async (alert) => {
      alerts.push(alert)
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }

  let seq = 0
  const deps = {
    findLocalAppointment: vi.fn(async (id: string) => options.local?.[id] ?? null),
    listLinkedLocalAppointments: vi.fn(async () => options.linkedLocal ?? []),
    insertAppointment: vi.fn(async () => `new-${++seq}`),
    cancelAppointment: vi.fn(async () => undefined),
    moveAppointment: vi.fn(async () => undefined),
    markConfirmed: vi.fn(async () => undefined),
    findOrCreateCustomer: vi.fn(async () => MARIA),
    hasConflict: vi.fn(async () => options.conflict ?? false),
  } satisfies AgendaImportDeps

  return { ctx, deps, provider, refs, alerts }
}

const localRow = (overrides: Partial<LocalAppointmentRow> = {}): LocalAppointmentRow => ({
  id: OURS,
  status: 'pending',
  date: at('18:00'),
  endTime: at('19:00'),
  professionalId: ANA,
  serviceId: CORTE,
  ...overrides,
})

describe('importAgendaAppointments — trazer para cá o que está na agenda oficial', () => {
  it('agendamento da recepção: cria aqui com o par de lá (nº 7 → Ana) e a cliente pelo telefone', async () => {
    const { ctx, deps, refs } = setup({ items: [remote({ confirmed: true })] })

    const summary = await importAgendaAppointments(ctx, deps, window)

    expect(summary).toMatchObject({ total: 1, imported: 1, skippedUnlinked: 0 })
    expect(deps.findOrCreateCustomer).toHaveBeenCalledWith({ name: 'Maria Souza', phone: '5547991054646' })
    expect(deps.insertAppointment).toHaveBeenCalledWith({
      professionalId: ANA,
      serviceId: CORTE,
      clientId: MARIA,
      start: at('18:00'),
      end: at('19:00'),
      status: 'confirmed',
    })
    expect(refs.store.get('appointment:new-1')).toBe('610')
    expect(refs.store.get(`customer:${MARIA}`)).toBe('88')
  })

  it('profissional sem par → pula e conta como "sem vínculo"', async () => {
    const { ctx, deps } = setup({ items: [remote({ externalProfessionalId: '99' })] })

    const summary = await importAgendaAppointments(ctx, deps, window)

    expect(summary).toMatchObject({ imported: 0, skippedUnlinked: 1 })
    expect(deps.insertAppointment).not.toHaveBeenCalled()
  })

  it('cliente sem telefone utilizável → pula e conta como "sem telefone"', async () => {
    const { ctx, deps } = setup({ items: [remote()], customer: { name: 'Sem Fone', phone: null } })

    const summary = await importAgendaAppointments(ctx, deps, window)

    expect(summary).toMatchObject({ imported: 0, skippedNoPhone: 1 })
  })

  it('cancelado lá e nunca esteve aqui → nada a trazer', async () => {
    const { ctx, deps } = setup({ items: [remote({ status: 'cancelled' })] })

    const summary = await importAgendaAppointments(ctx, deps, window)

    expect(summary).toMatchObject({ imported: 0, unchanged: 1 })
    expect(deps.insertAppointment).not.toHaveBeenCalled()
  })

  it('a mesma cliente em dois agendamentos → busca o cadastro dela lá uma vez só', async () => {
    const { ctx, deps, provider } = setup({
      items: [remote({ externalId: '610' }), remote({ externalId: '611', start: at('20:00'), end: at('21:00') })],
    })

    await importAgendaAppointments(ctx, deps, window)

    expect(provider.getCustomer).toHaveBeenCalledTimes(1)
    expect(deps.insertAppointment).toHaveBeenCalledTimes(2)
  })

  it('em cima de um horário já ocupado aqui → entra mesmo assim (lá manda) e alerta', async () => {
    const { ctx, deps, alerts } = setup({ items: [remote()], conflict: true })

    const summary = await importAgendaAppointments(ctx, deps, window)

    expect(summary).toMatchObject({ imported: 1, conflicts: 1 })
    expect(alerts.map((a) => a.type)).toEqual(['agenda_conflict'])
  })

  it('um item com erro não derruba os outros', async () => {
    const { ctx, deps } = setup({ items: [remote({ externalId: '610' }), remote({ externalId: '611' })] })
    deps.insertAppointment.mockRejectedValueOnce(new Error('db caiu'))

    const summary = await importAgendaAppointments(ctx, deps, window)

    expect(summary).toMatchObject({ imported: 1, failed: 1 })
  })

  it('avisa o andamento item a item', async () => {
    const { ctx, deps } = setup({ items: [remote({ externalId: '610' }), remote({ externalId: '611' })] })
    const onProgress = vi.fn()

    await importAgendaAppointments(ctx, deps, { ...window, onProgress })

    expect(onProgress.mock.calls).toEqual([[1, 2], [2, 2]])
  })
})

describe('importAgendaAppointments — o que já existe dos dois lados', () => {
  const linked: Array<[ExternalRefEntity, string, string]> = [['appointment', OURS, '501']]

  it('cancelado lá → cancela aqui', async () => {
    const { ctx, deps } = setup({
      items: [remote({ externalId: '501', status: 'cancelled' })],
      refs: linked,
      local: { [OURS]: localRow() },
    })

    const summary = await importAgendaAppointments(ctx, deps, window)

    expect(summary).toMatchObject({ cancelled: 1, imported: 0 })
    expect(deps.cancelAppointment).toHaveBeenCalledWith(OURS)
  })

  it('a recepção mudou o horário lá → corrige aqui', async () => {
    const { ctx, deps } = setup({
      items: [remote({ externalId: '501', start: at('20:00'), end: at('21:00') })],
      refs: linked,
      local: { [OURS]: localRow() },
    })

    const summary = await importAgendaAppointments(ctx, deps, window)

    expect(summary).toMatchObject({ updated: 1 })
    expect(deps.moveAppointment).toHaveBeenCalledWith(OURS, { start: at('20:00'), end: at('21:00') })
  })

  it('confirmado lá → confirmado aqui', async () => {
    const { ctx, deps } = setup({
      items: [remote({ externalId: '501', confirmed: true })],
      refs: linked,
      local: { [OURS]: localRow({ status: 'pending' }) },
    })

    const summary = await importAgendaAppointments(ctx, deps, window)

    expect(summary).toMatchObject({ updated: 1 })
    expect(deps.markConfirmed).toHaveBeenCalledWith(OURS)
    expect(deps.moveAppointment).not.toHaveBeenCalled()
  })

  it('igual dos dois lados → nada muda', async () => {
    const { ctx, deps } = setup({ items: [remote({ externalId: '501' })], refs: linked, local: { [OURS]: localRow() } })

    const summary = await importAgendaAppointments(ctx, deps, window)

    expect(summary).toMatchObject({ unchanged: 1, updated: 0, imported: 0 })
  })

  it('atendimento já concluído aqui não é desfeito, nem se lá estiver cancelado', async () => {
    const { ctx, deps } = setup({
      items: [remote({ externalId: '501', status: 'cancelled' })],
      refs: linked,
      local: { [OURS]: localRow({ status: 'completed' }) },
    })

    const summary = await importAgendaAppointments(ctx, deps, window)

    expect(summary).toMatchObject({ unchanged: 1, cancelled: 0 })
    expect(deps.cancelAppointment).not.toHaveBeenCalled()
  })

  it('criado pela IA mas sem o par salvo → a marca na observação liga os dois (não duplica)', async () => {
    const { ctx, deps, refs } = setup({
      items: [remote({ externalId: '501', createdByUsId: OURS })],
      local: { [OURS]: localRow() },
    })

    const summary = await importAgendaAppointments(ctx, deps, window)

    expect(summary).toMatchObject({ imported: 0, unchanged: 1 })
    expect(refs.store.get(`appointment:${OURS}`)).toBe('501')
    expect(deps.insertAppointment).not.toHaveBeenCalled()
  })

  it('foi para lá e sumiu da lista (apagado lá) → cancela aqui', async () => {
    const { ctx, deps, provider } = setup({
      items: [],
      linkedLocal: [{ ...localRow(), externalId: '501' }],
      snapshot: null,
    })

    const summary = await importAgendaAppointments(ctx, deps, window)

    expect(provider.getAppointment).toHaveBeenCalledWith('501')
    expect(summary).toMatchObject({ cancelled: 1 })
    expect(deps.cancelAppointment).toHaveBeenCalledWith(OURS)
  })

  it('remarcado lá para fora do período → corrige aqui pelo que a conferência diz', async () => {
    const { ctx, deps } = setup({
      items: [],
      linkedLocal: [{ ...localRow(), externalId: '501' }],
      snapshot: { status: 'active', start: at('18:00', '28'), end: at('19:00', '28') },
    })

    const summary = await importAgendaAppointments(ctx, deps, window)

    expect(summary).toMatchObject({ updated: 1 })
    expect(deps.moveAppointment).toHaveBeenCalledWith(OURS, { start: at('18:00', '28'), end: at('19:00', '28') })
  })
})
