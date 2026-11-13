import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * "O que esta cliente já tem marcado na agenda oficial?" — a consulta por cliente
 * que roda antes de a IA dizer que não há agendamento, remarcar ou agendar.
 *
 * Os dois casos reais que ela existe para resolver (Spettacolo Salone):
 *  - 12/nov: "vou precisar reagendar o corte para dia 19nov" — o corte de 17/11
 *    tinha sido marcado por uma atendente direto na Belasis; a IA respondeu "não
 *    encontrei um agendamento futuro", criou outro em 19/11 e o de 17/11 ficou lá;
 *  - 10/nov: "Gostaria de marcar para outro dia" — mesma história, com o horário
 *    de 10/11 às 14h.
 */

const SALON = '00000000-0000-4000-8000-000000000001'
const FABIANO = '00000000-0000-4000-8000-0000000000a1'
const CORTE = '00000000-0000-4000-8000-0000000000b1'
const FERNANDA = '00000000-0000-4000-8000-0000000000c1'
const OUTRA = '00000000-0000-4000-8000-0000000000c2'
const LOCAL = '00000000-0000-4000-8000-0000000000d1'
const PHONE = '5511988888551'

const h = vi.hoisted(() => ({
  resolveAgendaProvider: vi.fn(),
  customerLookup: vi.fn(),
  ctx: null as unknown,
  deps: null as unknown,
}))

vi.mock('../../src/index', async () => {
  const schema = await import('../../src/schema')
  return { ...schema, db: { query: { customers: { findFirst: h.customerLookup } } } }
})
vi.mock('../../src/services/agenda-provider-registry.service', () => ({
  resolveAgendaProvider: h.resolveAgendaProvider,
}))
vi.mock('../../src/services/agenda-sync.service', () => ({
  createAgendaSyncContext: () => h.ctx,
}))
vi.mock('../../src/services/appointments', () => ({
  applyAgendaMoveService: vi.fn(),
  cancelAppointmentService: vi.fn(),
}))
vi.mock('../../src/services/integration-sync', () => ({ fireAndForgetCreate: vi.fn() }))
vi.mock('../../src/services/agenda-import.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/agenda-import.service')>()
  return { ...actual, createAgendaImportDeps: () => h.deps }
})

const {
  refreshCustomerFromAgenda,
  refreshCustomerAppointmentsFromAgenda,
  clearAgendaCustomerRefreshMemo,
  AGENDA_CUSTOMER_LOOKAHEAD_DAYS,
} = await import('../../src/services/agenda-customer-refresh.service')

import type { AgendaImportDeps, LocalAppointmentRow } from '../../src/services/agenda-import.service'
import type { AgendaSyncContext } from '../../src/services/agenda-sync.service'
import type {
  AgendaAppointmentSnapshot,
  AgendaProvider,
  AgendaRemoteAppointment,
} from '../../src/domain/integrations/interfaces/agenda-provider.interface'
import type { ExternalRefEntity } from '../../src/infrastructure/repositories/integration-external-refs.repository'

/** Hoje, 12/nov/2026, 18:10 em Brasília. */
const NOW = new Date('2026-11-12T21:10:00.000Z')
const range = { start: new Date('2026-11-12T03:00:00.000Z'), end: new Date('2027-05-11T03:00:00.000Z') }

/** O corte que a atendente marcou lá para 17/11 às 17h (Brasília). */
function remote(overrides: Partial<AgendaRemoteAppointment> = {}): AgendaRemoteAppointment {
  return {
    externalId: '610',
    status: 'active',
    confirmed: false,
    start: new Date('2026-11-17T20:00:00.000Z'),
    end: new Date('2026-11-17T21:00:00.000Z'),
    externalProfessionalId: '7',
    externalServiceId: '33',
    externalCustomerId: '88',
    remindedByProvider: false,
    createdByUsId: null,
    ...overrides,
  }
}

function memoryRefs(initial: Array<[ExternalRefEntity, string, string]>) {
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
      // O índice único de lá para cá: o mesmo id externo não serve a dois daqui.
      for (const [key, value] of store) {
        if (value === externalId && key.startsWith(`${entity}:`) && key !== `${entity}:${internalId}`) {
          throw new Error('duplicate key value violates unique constraint')
        }
      }
      store.set(`${entity}:${internalId}`, externalId)
    }),
  }
}

/** Fabiano ↔ 7 e Corte ↔ 33 vinculados, como depois da tela de vínculo. */
const LINKED: Array<[ExternalRefEntity, string, string]> = [
  ['professional', FABIANO, '7'],
  ['service', CORTE, '33'],
]

function setup(options: {
  items?: AgendaRemoteAppointment[]
  refs?: Array<[ExternalRefEntity, string, string]>
  /** O que a busca por telefone acha lá. `undefined` = o cadastro 88. */
  byPhone?: { externalId: string; name: string } | null
  local?: Record<string, LocalAppointmentRow>
  linkedLocal?: Array<LocalAppointmentRow & { externalId: string }>
  snapshot?: AgendaAppointmentSnapshot | null
  withoutCustomerListing?: boolean
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
    getAppointment: vi.fn(async () => (options.snapshot === undefined ? null : options.snapshot)),
    findCustomerByPhone: vi.fn(async () =>
      options.byPhone === undefined ? { externalId: '88', name: 'Fernanda Lima Duarte' } : options.byPhone
    ),
    ...(options.withoutCustomerListing
      ? {}
      : { listCustomerAppointments: vi.fn(async () => options.items ?? []) }),
  } satisfies AgendaProvider

  const refs = memoryRefs([...LINKED, ...(options.refs ?? [])])
  const ctx: AgendaSyncContext = {
    agenda: { providerId: 'belasis', salonId: SALON, integrationId: 'int-1', provider },
    refs,
    alert: vi.fn(async () => undefined),
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
    findOrCreateCustomer: vi.fn(async () => OUTRA),
    hasConflict: vi.fn(async () => false),
    discardAppointment: vi.fn(async () => undefined),
  } satisfies AgendaImportDeps

  return { ctx, deps, provider, refs }
}

const localRow = (overrides: Partial<LocalAppointmentRow> = {}): LocalAppointmentRow => ({
  id: LOCAL,
  status: 'pending',
  date: new Date('2026-11-17T20:00:00.000Z'),
  endTime: new Date('2026-11-17T21:00:00.000Z'),
  professionalId: FABIANO,
  serviceId: CORTE,
  ...overrides,
})

const customer = { id: FERNANDA, phone: PHONE }

describe('refreshCustomerFromAgenda — trazer para cá o que a recepção marcou para ESTA cliente', () => {
  it('caso real (12/nov): o corte marcado pela atendente passa a existir aqui, no cadastro da cliente do WhatsApp', async () => {
    const { ctx, deps, provider, refs } = setup({ items: [remote()] })

    const result = await refreshCustomerFromAgenda(ctx, deps, { customer, ...range })

    expect(provider.findCustomerByPhone).toHaveBeenCalledWith(PHONE)
    expect(provider.listCustomerAppointments).toHaveBeenCalledWith('88', range)
    expect(deps.insertAppointment).toHaveBeenCalledWith({
      professionalId: FABIANO,
      serviceId: CORTE,
      clientId: FERNANDA,
      start: new Date('2026-11-17T20:00:00.000Z'),
      end: new Date('2026-11-17T21:00:00.000Z'),
      status: 'pending',
    })
    expect(result).toEqual({
      foundThere: true,
      imported: [
        {
          appointmentId: 'new-1',
          externalId: '610',
          start: new Date('2026-11-17T20:00:00.000Z'),
          end: new Date('2026-11-17T21:00:00.000Z'),
          professionalId: FABIANO,
          serviceId: CORTE,
        },
      ],
      unlinked: [],
    })
    // Com o par salvo, remarcar por aqui mexe no agendamento de lá — não cria outro.
    expect(refs.store.get('appointment:new-1')).toBe('610')
    // E o cadastro de lá fica vinculado: o próximo agendamento reaproveita, não cadastra de novo.
    expect(refs.store.get(`customer:${FERNANDA}`)).toBe('88')
  })

  it('a listagem traz também o horário de OUTRA cliente (filtro por cliente ignorado lá) → só o dela entra', async () => {
    const daOutra = remote({
      externalId: '611',
      externalCustomerId: '12',
      start: new Date('2026-11-18T13:00:00.000Z'),
      end: new Date('2026-11-18T14:00:00.000Z'),
    })
    const semDono = remote({
      externalId: '612',
      externalCustomerId: 'undefined',
      start: new Date('2026-11-19T13:00:00.000Z'),
      end: new Date('2026-11-19T14:00:00.000Z'),
    })
    const { ctx, deps, refs } = setup({ items: [daOutra, remote(), semDono] })

    const result = await refreshCustomerFromAgenda(ctx, deps, { customer, ...range })

    // O horário da outra pessoa não vira agendamento da cliente da conversa.
    expect(deps.insertAppointment).toHaveBeenCalledTimes(1)
    expect(deps.insertAppointment).toHaveBeenCalledWith(expect.objectContaining({ clientId: FERNANDA }))
    expect(result.imported.map((item) => item.externalId)).toEqual(['610'])
    expect(result.unlinked).toEqual([])
    expect(refs.store.get('appointment:new-1')).toBe('610')
    expect([...refs.store.values()]).not.toContain('611')
    expect([...refs.store.values()]).not.toContain('612')
  })

  it('o agendamento vai para a cliente da conversa, e não para quem o telefone guardado lá apontaria', async () => {
    const { ctx, deps } = setup({ items: [remote()] })

    await refreshCustomerFromAgenda(ctx, deps, { customer, ...range })

    expect(deps.findOrCreateCustomer).not.toHaveBeenCalled()
    expect(deps.insertAppointment).toHaveBeenCalledWith(expect.objectContaining({ clientId: FERNANDA }))
  })

  it('cliente já vinculada → vai direto pelo id guardado, sem buscar por telefone', async () => {
    const { ctx, deps, provider } = setup({ items: [remote()], refs: [['customer', FERNANDA, '88']] })

    await refreshCustomerFromAgenda(ctx, deps, { customer, ...range })

    expect(provider.findCustomerByPhone).not.toHaveBeenCalled()
    expect(provider.listCustomerAppointments).toHaveBeenCalledWith('88', range)
  })

  it('sem cadastro lá → não há o que ela possa ter marcado lá (nem lista)', async () => {
    const { ctx, deps, provider } = setup({ items: [remote()], byPhone: null })

    const result = await refreshCustomerFromAgenda(ctx, deps, { customer, ...range })

    expect(result).toEqual({ foundThere: false, imported: [], unlinked: [] })
    expect(provider.listCustomerAppointments).not.toHaveBeenCalled()
    expect(deps.insertAppointment).not.toHaveBeenCalled()
  })

  it('confere só os agendamentos DESTA cliente (não os do salão inteiro)', async () => {
    const { ctx, deps } = setup({ items: [], refs: [['customer', FERNANDA, '88']] })

    await refreshCustomerFromAgenda(ctx, deps, { customer, ...range })

    expect(deps.listLinkedLocalAppointments).toHaveBeenCalledWith(range, { clientId: FERNANDA })
  })

  it('já existe aqui e a recepção mudou o horário lá → corrige aqui, sem criar outro', async () => {
    const { ctx, deps } = setup({
      items: [remote({ start: new Date('2026-11-18T20:00:00.000Z'), end: new Date('2026-11-18T21:00:00.000Z') })],
      refs: [['customer', FERNANDA, '88'], ['appointment', LOCAL, '610']],
      local: { [LOCAL]: localRow() },
      linkedLocal: [{ ...localRow(), externalId: '610' }],
    })

    const result = await refreshCustomerFromAgenda(ctx, deps, { customer, ...range })

    expect(deps.moveAppointment).toHaveBeenCalledWith(LOCAL, {
      start: new Date('2026-11-18T20:00:00.000Z'),
      end: new Date('2026-11-18T21:00:00.000Z'),
    })
    expect(deps.insertAppointment).not.toHaveBeenCalled()
    expect(result.imported).toEqual([])
  })

  it('o que está aqui e sumiu de lá (recepção apagou) → cancela aqui', async () => {
    const { ctx, deps, provider } = setup({
      items: [],
      refs: [['customer', FERNANDA, '88'], ['appointment', LOCAL, '610']],
      local: { [LOCAL]: localRow() },
      linkedLocal: [{ ...localRow(), externalId: '610' }],
      snapshot: null,
    })

    await refreshCustomerFromAgenda(ctx, deps, { customer, ...range })

    expect(provider.getAppointment).toHaveBeenCalledWith('610')
    expect(deps.cancelAppointment).toHaveBeenCalledWith(LOCAL)
  })

  it('serviço de lá sem par aqui → não dá para trazer; devolve o horário para a IA avisar em vez de duplicar', async () => {
    const { ctx, deps } = setup({ items: [remote({ externalServiceId: '99' })], refs: [['customer', FERNANDA, '88']] })

    const result = await refreshCustomerFromAgenda(ctx, deps, { customer, ...range })

    expect(deps.insertAppointment).not.toHaveBeenCalled()
    expect(result.imported).toEqual([])
    expect(result.unlinked).toEqual([
      { externalId: '610', start: new Date('2026-11-17T20:00:00.000Z'), end: new Date('2026-11-17T21:00:00.000Z') },
    ])
  })

  it('profissional de lá sem par aqui → idem', async () => {
    const { ctx, deps } = setup({ items: [remote({ externalProfessionalId: '55' })], refs: [['customer', FERNANDA, '88']] })

    const result = await refreshCustomerFromAgenda(ctx, deps, { customer, ...range })

    expect(deps.insertAppointment).not.toHaveBeenCalled()
    expect(result.unlinked.map((u) => u.externalId)).toEqual(['610'])
  })

  it('cancelado lá e nunca esteve aqui → nada a trazer nem a avisar', async () => {
    const { ctx, deps } = setup({ items: [remote({ status: 'cancelled' })], refs: [['customer', FERNANDA, '88']] })

    const result = await refreshCustomerFromAgenda(ctx, deps, { customer, ...range })

    expect(result).toEqual({ foundThere: true, imported: [], unlinked: [] })
  })

  it('cancelado lá e sem par (profissional de fora) → também não vira aviso', async () => {
    const { ctx, deps } = setup({
      items: [remote({ status: 'cancelled', externalProfessionalId: '55' })],
      refs: [['customer', FERNANDA, '88']],
    })

    const result = await refreshCustomerFromAgenda(ctx, deps, { customer, ...range })

    expect(result.unlinked).toEqual([])
  })

  it('duas visitas marcadas pela recepção → as duas vêm', async () => {
    const { ctx, deps } = setup({
      items: [remote(), remote({ externalId: '611', start: new Date('2026-12-15T20:00:00.000Z'), end: new Date('2026-12-15T21:00:00.000Z') })],
      refs: [['customer', FERNANDA, '88']],
    })

    const result = await refreshCustomerFromAgenda(ctx, deps, { customer, ...range })

    expect(result.imported.map((i) => i.externalId)).toEqual(['610', '611'])
  })

  it('o cadastro de lá já está vinculado a OUTRO cliente daqui (duplicado aqui) → a consulta segue mesmo sem salvar o atalho', async () => {
    const { ctx, deps, refs } = setup({ items: [remote()], refs: [['customer', OUTRA, '88']] })

    const result = await refreshCustomerFromAgenda(ctx, deps, { customer, ...range })

    expect(refs.store.get(`customer:${FERNANDA}`)).toBeUndefined()
    expect(result.foundThere).toBe(true)
    expect(result.imported).toHaveLength(1)
    // O horário vai para a cliente DA CONVERSA — é ela que a IA enxerga —, e não
    // para o cadastro duplicado que segura o vínculo.
    expect(deps.insertAppointment).toHaveBeenCalledWith(expect.objectContaining({ clientId: FERNANDA }))
    expect(deps.insertAppointment).not.toHaveBeenCalledWith(expect.objectContaining({ clientId: OUTRA }))
  })

  it('a sincronização do salão trouxe o mesmo agendamento no mesmo instante → fica um só aqui (a sobra é desfeita)', async () => {
    const { ctx, deps, refs } = setup({ items: [remote()], refs: [['customer', FERNANDA, '88']] })
    // A outra rodada grava o par logo depois de esta ter criado o agendamento.
    refs.setExternalId.mockImplementationOnce(async () => {
      refs.store.set(`appointment:${LOCAL}`, '610')
      throw new Error('duplicate key value violates unique constraint "integration_external_refs_external_unique"')
    })

    const result = await refreshCustomerFromAgenda(ctx, deps, { customer, ...range })

    expect(deps.insertAppointment).toHaveBeenCalledTimes(1)
    expect(deps.discardAppointment).toHaveBeenCalledWith('new-1')
    expect(result.imported).toEqual([])
    expect(refs.store.get(`appointment:${LOCAL}`)).toBe('610')
    expect(refs.store.has('appointment:new-1')).toBe(false)
  })

  it('o par não pôde ser salvo por outro motivo → não apaga nada às cegas', async () => {
    const { ctx, deps, refs } = setup({ items: [remote()], refs: [['customer', FERNANDA, '88']] })
    refs.setExternalId.mockRejectedValueOnce(new Error('banco fora do ar'))

    const result = await refreshCustomerFromAgenda(ctx, deps, { customer, ...range })

    expect(deps.discardAppointment).not.toHaveBeenCalled()
    expect(result.imported).toEqual([])
  })

  it('provedor que não sabe listar por cliente → nada (e nada quebra)', async () => {
    const { ctx, deps } = setup({ withoutCustomerListing: true })

    await expect(refreshCustomerFromAgenda(ctx, deps, { customer, ...range })).resolves.toEqual({
      foundThere: false,
      imported: [],
      unlinked: [],
    })
  })

  it('a agenda oficial não responde → o erro sobe para quem chama decidir', async () => {
    const { ctx, deps, provider } = setup({ refs: [['customer', FERNANDA, '88']] })
    provider.listCustomerAppointments?.mockRejectedValue(new Error('Sem conexão com a Belasis'))

    await expect(refreshCustomerFromAgenda(ctx, deps, { customer, ...range })).rejects.toThrow('Sem conexão')
  })
})

describe('refreshCustomerAppointmentsFromAgenda — ligado ao banco, com a cota de 30/min em mente', () => {
  const agenda = (provider: AgendaProvider) => ({ providerId: 'belasis' as const, salonId: SALON, integrationId: 'int-1', provider })

  function wire(options: Parameters<typeof setup>[0]) {
    const built = setup(options)
    h.ctx = built.ctx
    h.deps = built.deps
    h.resolveAgendaProvider.mockResolvedValue(agenda(built.provider))
    return built
  }

  beforeEach(() => {
    vi.clearAllMocks()
    clearAgendaCustomerRefreshMemo()
    h.customerLookup.mockResolvedValue({ id: FERNANDA, phone: PHONE })
  })

  const call = (now = NOW) => refreshCustomerAppointmentsFromAgenda({ salonId: SALON, customerId: FERNANDA, now })

  it('salão sem agenda oficial → no_agenda, sem tocar em nada', async () => {
    h.resolveAgendaProvider.mockResolvedValue(null)

    await expect(call()).resolves.toEqual({ status: 'no_agenda', imported: [], unlinked: [], newUnlinked: [] })
    expect(h.customerLookup).not.toHaveBeenCalled()
  })

  it('consulta de hoje (0h de Brasília) até 180 dias à frente', async () => {
    const { provider } = wire({ items: [], refs: [['customer', FERNANDA, '88']] })

    await call()

    expect(AGENDA_CUSTOMER_LOOKAHEAD_DAYS).toBe(180)
    expect(provider.listCustomerAppointments).toHaveBeenCalledWith('88', {
      start: new Date('2026-11-12T03:00:00.000Z'),
      end: new Date('2027-05-11T03:00:00.000Z'),
    })
  })

  it('traz o horário da recepção e diz que é novo', async () => {
    wire({ items: [remote()], refs: [['customer', FERNANDA, '88']] })

    const result = await call()

    expect(result.status).toBe('checked')
    expect(result.imported.map((i) => i.appointmentId)).toEqual(['new-1'])
  })

  it('horário de hoje que já passou vem para cá, mas não conta como "ela já tem horário futuro"', async () => {
    wire({
      items: [remote({ start: new Date('2026-11-12T17:00:00.000Z'), end: new Date('2026-11-12T18:00:00.000Z') })],
      refs: [['customer', FERNANDA, '88']],
    })

    const result = await call()

    expect((h.deps as AgendaImportDeps).insertAppointment).toHaveBeenCalled()
    expect(result.imported).toEqual([])
  })

  it('consultada há instantes → não gasta outra chamada (recent)', async () => {
    const { provider } = wire({ items: [remote()], refs: [['customer', FERNANDA, '88']] })

    await call()
    const again = await call(new Date(NOW.getTime() + 20_000))

    expect(again).toEqual({ status: 'recent', imported: [], unlinked: [], newUnlinked: [] })
    expect(provider.listCustomerAppointments).toHaveBeenCalledTimes(1)
  })

  it('passado um minuto, consulta de novo', async () => {
    const { provider } = wire({ items: [], refs: [['customer', FERNANDA, '88']] })

    await call()
    await call(new Date(NOW.getTime() + 61_000))

    expect(provider.listCustomerAppointments).toHaveBeenCalledTimes(2)
  })

  it('horário sem par: é novidade uma vez só — na segunda consulta continua listado, mas não bloqueia de novo', async () => {
    wire({ items: [remote({ externalServiceId: '99' })], refs: [['customer', FERNANDA, '88']] })

    const first = await call()
    const second = await call(new Date(NOW.getTime() + 5 * 60_000))

    expect(first.newUnlinked.map((u) => u.externalId)).toEqual(['610'])
    expect(second.unlinked.map((u) => u.externalId)).toEqual(['610'])
    expect(second.newUnlinked).toEqual([])
  })

  it('consulta recente devolve os horários sem par que já se conhecia', async () => {
    wire({ items: [remote({ externalServiceId: '99' })], refs: [['customer', FERNANDA, '88']] })

    await call()
    const again = await call(new Date(NOW.getTime() + 10_000))

    expect(again.status).toBe('recent')
    expect(again.unlinked.map((u) => u.externalId)).toEqual(['610'])
  })

  it('a agenda oficial não responde → failed, sem lançar (e a próxima tentativa consulta de novo)', async () => {
    const { provider } = wire({ refs: [['customer', FERNANDA, '88']] })
    provider.listCustomerAppointments?.mockRejectedValueOnce(new Error('Sem conexão com a Belasis'))

    await expect(call()).resolves.toEqual({ status: 'failed', imported: [], unlinked: [], newUnlinked: [] })
    await expect(call(new Date(NOW.getTime() + 5_000))).resolves.toMatchObject({ status: 'checked' })
  })

  it('a credencial da agenda não carrega → failed, sem lançar', async () => {
    h.resolveAgendaProvider.mockRejectedValue(new Error('ENCRYPTION_KEY trocada'))

    await expect(call()).resolves.toMatchObject({ status: 'failed' })
  })

  it('cliente que não é deste salão → nada é consultado lá', async () => {
    const { provider } = wire({ items: [remote()] })
    h.customerLookup.mockResolvedValue(undefined)

    await expect(call()).resolves.toMatchObject({ status: 'checked', imported: [] })
    expect(provider.findCustomerByPhone).not.toHaveBeenCalled()
  })
})
