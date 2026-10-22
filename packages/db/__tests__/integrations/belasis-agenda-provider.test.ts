import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BelasisClient } from '../../src/infrastructure/integrations/belasis/belasis-client'
import {
  BelasisAgendaProvider,
  clearBelasisFreeTimesCache,
} from '../../src/infrastructure/integrations/belasis/belasis-agenda-provider'
import { belasisReferenceMarker } from '../../src/infrastructure/integrations/belasis/belasis-mapping'
import type { AgendaAppointmentInput } from '../../src/domain/integrations/interfaces/agenda-provider.interface'

const APPOINTMENT = '00000000-0000-4000-8000-0000000000d1'

interface Call {
  method: string
  path: string
  query: Record<string, string>
  body?: Record<string, unknown>
}

type Handler = (call: Call) => { status: number; body?: unknown }

/** API Belasis falsa: rotas "MÉTODO /caminho" → resposta. Registra cada chamada. */
function fakeApi(routes: Record<string, Handler | Array<{ status: number; body?: unknown }>>) {
  const calls: Call[] = []
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const call: Call = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }
    calls.push(call)
    const route = routes[`${call.method} ${call.path}`]
    if (!route) throw new Error(`rota não roteirizada: ${call.method} ${call.path}`)
    const result = Array.isArray(route) ? route.shift() : route(call)
    if (!result) throw new Error(`roteiro esgotado: ${call.method} ${call.path}`)
    const text = result.body === undefined ? '' : JSON.stringify(result.body)
    return { ok: result.status < 300, status: result.status, text: async () => text } as unknown as Response
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

function makeProvider(routes: Parameters<typeof fakeApi>[0], now = () => Date.UTC(2026, 10, 9, 12, 0, 30)) {
  const api = fakeApi(routes)
  const client = new BelasisClient({
    apiKey: 'bpk_teste',
    fetchImpl: api.impl,
    rateLimiter: { acquire: async () => undefined },
    sleep: async () => undefined,
    now,
  })
  return { provider: new BelasisAgendaProvider(client, { now }), calls: api.calls }
}

const paged = (data: unknown[]) => ({ status: 200, body: { data, page: 1, limit: 100, total: data.length } })

/** 10:00 → 11:00 em Brasília, dia 10/11/2026. */
const input: AgendaAppointmentInput = {
  idempotencyKey: APPOINTMENT,
  externalProfessionalId: '7',
  externalServiceId: '33',
  start: new Date('2026-11-10T13:00:00.000Z'),
  end: new Date('2026-11-10T14:00:00.000Z'),
  customer: { name: 'Maria Souza', phone: '5547991054646' },
  notes: 'Prefere secador frio',
}

const group = (overrides: Record<string, unknown> = {}) => ({
  id: 501,
  client_id: 88,
  status: 'unconfirmed',
  date: '2026-11-10',
  observation: `Agendado pelo MinhaAgenda ${belasisReferenceMarker(APPOINTMENT)}`,
  calendars: [{ id: 9001, employee_id: 7, inventory_product_id: 33, start_hour: '10:00', end_hour: '11:00' }],
  ...overrides,
})

beforeEach(() => {
  clearBelasisFreeTimesCache()
})

describe('BelasisAgendaProvider.getBusyIntervals', () => {
  const freeTimes = [
    { hour: '09:00', label: 'available' },
    { hour: '09:30', label: 'available' },
    { hour: '10:00', label: 'unavailable' },
    { hour: '10:30', label: 'available' },
  ]

  it('consulta free_times do dia de Brasília e devolve o ocupado que toca a janela', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/employees/7/free_times': () => ({ status: 200, body: freeTimes }),
    })

    const busy = await provider.getBusyIntervals({
      externalProfessionalId: '7',
      start: new Date('2026-11-10T12:00:00.000Z'), // 09:00
      end: new Date('2026-11-10T15:00:00.000Z'), // 12:00
    })

    expect(calls).toEqual([expect.objectContaining({ query: { date: '2026-11-10' } })])
    expect(busy.map((b) => [b.start.toISOString(), b.end.toISOString()])).toEqual([
      ['2026-11-10T13:00:00.000Z', '2026-11-10T13:30:00.000Z'], // 10:00 indisponível
      ['2026-11-10T14:00:00.000Z', '2026-11-11T03:00:00.000Z'], // depois do último horário (10:30 + 30min)
    ])
  })

  it('reaproveita a grade por alguns segundos (cota de 30/min), mas fresh: true vai à API', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/employees/7/free_times': () => ({ status: 200, body: freeTimes }),
    })
    const window = {
      externalProfessionalId: '7',
      start: new Date('2026-11-10T12:00:00.000Z'),
      end: new Date('2026-11-10T14:00:00.000Z'),
    }

    await provider.getBusyIntervals(window)
    await provider.getBusyIntervals(window)
    expect(calls).toHaveLength(1)

    await provider.getBusyIntervals({ ...window, fresh: true })
    expect(calls).toHaveLength(2)
  })

  it('remarcação: o horário atual do próprio agendamento conta como livre', async () => {
    const { provider } = makeProvider({
      'GET /api/v1/employees/7/free_times': () => ({ status: 200, body: freeTimes }),
      'GET /api/v1/schedule_groups/501': () => ({
        status: 200,
        body: group({ calendars: [{ id: 9001, employee_id: 7, inventory_product_id: 33, start_hour: '10:00', end_hour: '10:30' }] }),
      }),
    })

    const busy = await provider.getBusyIntervals({
      externalProfessionalId: '7',
      start: new Date('2026-11-10T13:00:00.000Z'),
      end: new Date('2026-11-10T13:30:00.000Z'),
      excludeExternalAppointmentId: '501',
      fresh: true,
    })

    expect(busy).toEqual([])
  })
})

describe('BelasisAgendaProvider.createAppointment', () => {
  it('cliente já existe (telefone guardado formatado e sem DDI) → cria o agendamento com ele', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/clients': () =>
        paged([
          { id: 12, name: 'Outra', phone: '(11) 99105-4646' }, // mesmo final, outro DDD
          { id: 88, name: 'Maria Souza', phone: '(47) 99105-4646', active: true },
        ]),
      'POST /api/v1/schedule_groups': () => ({ status: 201, body: group() }),
    })

    const created = await provider.createAppointment(input)

    expect(created).toEqual({ externalId: '501', externalCustomerId: '88' })
    const search = calls.find((c) => c.path === '/api/v1/clients')!
    expect(search.query.search).toBe('4646') // 4 últimos dígitos: contíguos em qualquer formato
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.body).toEqual({
      client_id: 88,
      date: '2026-11-10',
      status: 'unconfirmed',
      observation: `Prefere secador frio\n\nAgendado pelo MinhaAgenda ${belasisReferenceMarker(APPOINTMENT)}`,
      calendars_attributes: [
        { inventory_product_id: 33, employee_id: 7, start_hour: '10:00', end_hour: '11:00', reminder: false },
      ],
    })
  })

  it('cliente não existe → cadastra com telefone só dígitos + DDI e então agenda', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/clients': () => paged([]),
      'POST /api/v1/clients': () => ({ status: 201, body: { id: 140, name: 'Maria Souza', phone: '5547991054646' } }),
      'POST /api/v1/schedule_groups': () => ({ status: 201, body: group({ client_id: 140 }) }),
    })

    const created = await provider.createAppointment({ ...input, customer: { name: 'Maria Souza', phone: '+55 47 99105-4646' } })

    expect(created.externalCustomerId).toBe('140')
    const newClient = calls.find((c) => c.method === 'POST' && c.path === '/api/v1/clients')!
    expect(newClient.body).toEqual({ name: 'Maria Souza', phone: '5547991054646', cellphone: '5547991054646' })
  })

  it('telefone que não é telefone (id interno do WhatsApp) → recusa sem tocar na API', async () => {
    const { provider, calls } = makeProvider({})

    await expect(
      provider.createAppointment({ ...input, customer: { name: 'X', phone: '136784245694524' } })
    ).rejects.toMatchObject({ kind: 'rejected' })
    expect(calls).toEqual([])
  })

  it('id de cliente guardado envelhecido → acha pelo telefone e tenta de novo uma vez', async () => {
    const { provider, calls } = makeProvider({
      'POST /api/v1/schedule_groups': [
        { status: 422, body: ['Cliente não encontrado'] },
        { status: 201, body: group() },
      ],
      'GET /api/v1/clients': () => paged([{ id: 88, name: 'Maria Souza', cellphone: '5547991054646' }]),
    })

    const created = await provider.createAppointment({ ...input, customer: { ...input.customer, externalId: '999' } })

    expect(created).toEqual({ externalId: '501', externalCustomerId: '88' })
    const posts = calls.filter((c) => c.method === 'POST')
    expect(posts.map((p) => p.body?.client_id)).toEqual([999, 88])
  })

  it('horário recusado pela Belasis → slot_unavailable', async () => {
    const { provider } = makeProvider({
      'GET /api/v1/clients': () => paged([{ id: 88, name: 'Maria', cellphone: '5547991054646' }]),
      'POST /api/v1/schedule_groups': () => ({ status: 422, body: ['Horário indisponível'] }),
    })

    await expect(provider.createAppointment(input)).rejects.toMatchObject({ kind: 'slot_unavailable' })
  })
})

describe('BelasisAgendaProvider.rescheduleAppointment', () => {
  it('mesmo dia, profissional e serviço → PATCH só da hora, mesmo id', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/schedule_groups/501': () => ({ status: 200, body: group() }),
      'PATCH /api/v1/schedule_groups/501': () => ({ status: 200, body: group() }),
    })

    const moved = await provider.rescheduleAppointment('501', {
      ...input,
      start: new Date('2026-11-10T17:00:00.000Z'), // 14:00
      end: new Date('2026-11-10T18:00:00.000Z'),
    })

    expect(moved).toEqual({ externalId: '501' })
    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.body).toEqual({ calendars_attributes: [{ id: 9001, start_hour: '14:00', end_hour: '15:00' }] })
  })

  it('outro dia → a API não move: cria o novo e cancela o antigo', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/schedule_groups/501': () => ({ status: 200, body: group() }),
      'GET /api/v1/clients': () => paged([{ id: 88, name: 'Maria', cellphone: '5547991054646' }]),
      'POST /api/v1/schedule_groups': () => ({ status: 201, body: group({ id: 777, date: '2026-11-11' }) }),
      'PATCH /api/v1/schedule_groups/501/cancel': () => ({ status: 200, body: group({ status: 'disconfirm' }) }),
    })

    const moved = await provider.rescheduleAppointment('501', {
      ...input,
      start: new Date('2026-11-11T13:00:00.000Z'),
      end: new Date('2026-11-11T14:00:00.000Z'),
    })

    expect(moved).toEqual({ externalId: '777', externalCustomerId: '88' })
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /api/v1/schedule_groups/501',
      'GET /api/v1/clients',
      'POST /api/v1/schedule_groups',
      'PATCH /api/v1/schedule_groups/501/cancel',
    ])
  })

  it('outro dia e o antigo não cancela → devolve o novo e aponta o antigo', async () => {
    const { provider } = makeProvider({
      'GET /api/v1/schedule_groups/501': () => ({ status: 200, body: group() }),
      'GET /api/v1/clients': () => paged([{ id: 88, name: 'Maria', cellphone: '5547991054646' }]),
      'POST /api/v1/schedule_groups': () => ({ status: 201, body: group({ id: 777 }) }),
      'PATCH /api/v1/schedule_groups/501/cancel': () => ({ status: 503 }),
    })

    const moved = await provider.rescheduleAppointment('501', {
      ...input,
      start: new Date('2026-11-11T13:00:00.000Z'),
      end: new Date('2026-11-11T14:00:00.000Z'),
    })

    expect(moved).toEqual({ externalId: '777', externalCustomerId: '88', staleExternalId: '501' })
  })

  it('o antigo já estava cancelado lá → só cria o novo', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/schedule_groups/501': () => ({ status: 200, body: group({ status: 'disconfirm' }) }),
      'GET /api/v1/clients': () => paged([{ id: 88, name: 'Maria', cellphone: '5547991054646' }]),
      'POST /api/v1/schedule_groups': () => ({ status: 201, body: group({ id: 777 }) }),
    })

    await provider.rescheduleAppointment('501', input)

    expect(calls.some((c) => c.path.endsWith('/cancel'))).toBe(false)
  })

  it('agendamento sumiu lá → not_found (a orquestração recria)', async () => {
    const { provider } = makeProvider({ 'GET /api/v1/schedule_groups/501': () => ({ status: 404 }) })

    await expect(provider.rescheduleAppointment('501', input)).rejects.toMatchObject({ kind: 'not_found' })
  })
})

describe('BelasisAgendaProvider.getAppointment — conferência sem webhook', () => {
  it('ativo → início e fim em UTC a partir da hora de parede, com profissional e serviço', async () => {
    const { provider } = makeProvider({ 'GET /api/v1/schedule_groups/501': () => ({ status: 200, body: group() }) })

    await expect(provider.getAppointment('501')).resolves.toEqual({
      status: 'active',
      start: new Date('2026-11-10T13:00:00.000Z'),
      end: new Date('2026-11-10T14:00:00.000Z'),
      externalProfessionalId: '7',
      externalServiceId: '33',
      remindedByProvider: false,
    })
  })

  it('lembrete ligado lá → remindedByProvider (o MinhaAgenda não manda o dele)', async () => {
    const { provider } = makeProvider({
      'GET /api/v1/schedule_groups/501': () => ({
        status: 200,
        body: group({
          calendars: [{ id: 9001, employee_id: 7, inventory_product_id: 33, start_hour: '10:00', end_hour: '11:00', reminder: true }],
        }),
      }),
    })

    await expect(provider.getAppointment('501')).resolves.toMatchObject({ remindedByProvider: true })
  })

  it('cancelado lá (disconfirm) → cancelled', async () => {
    const { provider } = makeProvider({
      'GET /api/v1/schedule_groups/501': () => ({ status: 200, body: group({ status: 'disconfirm' }) }),
    })

    await expect(provider.getAppointment('501')).resolves.toMatchObject({ status: 'cancelled' })
  })

  it('apagado lá (404) → null', async () => {
    const { provider } = makeProvider({ 'GET /api/v1/schedule_groups/501': () => ({ status: 404 }) })

    await expect(provider.getAppointment('501')).resolves.toBeNull()
  })
})

describe('BelasisAgendaProvider — sincronização de volta (Belasis → MinhaAgenda)', () => {
  const window = { start: new Date('2026-11-10T03:00:00.000Z'), end: new Date('2026-12-10T03:00:00.000Z') }

  it('lista o período pedido, em datas de Brasília', async () => {
    const { provider, calls } = makeProvider({ 'GET /api/v1/schedule_groups': () => paged([]) })

    await provider.listAppointments(window)

    expect(calls[0].query).toMatchObject({ start_date: '2026-11-10', end_date: '2026-12-10' })
  })

  it('agendamento da recepção vira um item com profissional, serviço, cliente e horário', async () => {
    const { provider } = makeProvider({
      'GET /api/v1/schedule_groups': () =>
        paged([
          {
            id: 610,
            client_id: 88,
            status: 'confirmed',
            date: '2026-11-12',
            observation: 'Cliente pediu franja',
            calendars: [{ id: 9100, employee_id: 7, inventory_product_id: 33, start_hour: '15:00', end_hour: '16:00', reminder: true }],
          },
        ]),
    })

    await expect(provider.listAppointments(window)).resolves.toEqual([
      {
        externalId: '610',
        status: 'active',
        confirmed: true,
        start: new Date('2026-11-12T18:00:00.000Z'),
        end: new Date('2026-11-12T19:00:00.000Z'),
        externalProfessionalId: '7',
        externalServiceId: '33',
        externalCustomerId: '88',
        remindedByProvider: true,
        createdByUsId: null,
        notes: 'Cliente pediu franja',
      },
    ])
  })

  it('dois serviços na mesma visita → dois itens, com referência "grupo:item"', async () => {
    const { provider } = makeProvider({
      'GET /api/v1/schedule_groups': () =>
        paged([
          {
            id: 620,
            client_id: 88,
            status: 'unconfirmed',
            date: '2026-11-12',
            calendars: [
              { id: 1, employee_id: 7, inventory_product_id: 33, start_hour: '10:00', end_hour: '11:00' },
              { id: 2, employee_id: 12, inventory_product_id: 40, start_hour: '11:00', end_hour: '11:30' },
            ],
          },
        ]),
    })

    const items = await provider.listAppointments(window)

    expect(items.map((i) => [i.externalId, i.externalProfessionalId, i.confirmed])).toEqual([
      ['620:1', '7', false],
      ['620:2', '12', false],
    ])
  })

  it('agendamento criado pelo MinhaAgenda é reconhecido pela marca na observação', async () => {
    const { provider } = makeProvider({ 'GET /api/v1/schedule_groups': () => paged([group()]) })

    const [item] = await provider.listAppointments(window)

    expect(item.createdByUsId).toBe(APPOINTMENT)
    expect(item).not.toHaveProperty('notes') // a observação é nossa, não vira nota
  })

  it('cancelado lá vem como cancelled', async () => {
    const { provider } = makeProvider({
      'GET /api/v1/schedule_groups': () => paged([group({ status: 'disconfirm' })]),
    })

    const [item] = await provider.listAppointments(window)

    expect(item.status).toBe('cancelled')
  })

  it('cliente: nome e celular (ou telefone); 404 → null', async () => {
    const { provider } = makeProvider({
      'GET /api/v1/clients/88': () => ({ status: 200, body: { id: 88, name: 'Maria', phone: '4733334444', cellphone: '47991054646' } }),
      'GET /api/v1/clients/99': () => ({ status: 404 }),
    })

    await expect(provider.getCustomer('88')).resolves.toEqual({ name: 'Maria', phone: '47991054646' })
    await expect(provider.getCustomer('99')).resolves.toBeNull()
  })

  describe('item de agendamento com vários serviços ("grupo:item")', () => {
    const multi = () =>
      group({
        id: 620,
        calendars: [
          { id: 1, employee_id: 7, inventory_product_id: 33, start_hour: '10:00', end_hour: '11:00' },
          { id: 2, employee_id: 12, inventory_product_id: 40, start_hour: '11:00', end_hour: '11:30' },
        ],
      })

    it('cancelar um item tira só ele (os outros serviços continuam lá)', async () => {
      const { provider, calls } = makeProvider({
        'GET /api/v1/schedule_groups/620': () => ({ status: 200, body: multi() }),
        'PATCH /api/v1/schedule_groups/620': () => ({ status: 200, body: multi() }),
      })

      await provider.cancelAppointment('620:2')

      const patch = calls.find((c) => c.method === 'PATCH')!
      expect(patch.path).toBe('/api/v1/schedule_groups/620')
      expect(patch.body).toEqual({ calendars_attributes: [{ id: 2, _destroy: true }] })
    })

    it('cancelar o único item que sobrou cancela o agendamento inteiro', async () => {
      const lone = group({ id: 620, calendars: [{ id: 2, employee_id: 12, inventory_product_id: 40, start_hour: '11:00', end_hour: '11:30' }] })
      const { provider, calls } = makeProvider({
        'GET /api/v1/schedule_groups/620': () => ({ status: 200, body: lone }),
        'PATCH /api/v1/schedule_groups/620/cancel': () => ({ status: 200, body: { ...lone, status: 'disconfirm' } }),
      })

      await provider.cancelAppointment('620:2')

      expect(calls.some((c) => c.path === '/api/v1/schedule_groups/620/cancel')).toBe(true)
    })

    it('conferir um item olha só o horário dele', async () => {
      const { provider } = makeProvider({ 'GET /api/v1/schedule_groups/620': () => ({ status: 200, body: multi() }) })

      await expect(provider.getAppointment('620:2')).resolves.toMatchObject({
        start: new Date('2026-11-10T14:00:00.000Z'),
        end: new Date('2026-11-10T14:30:00.000Z'),
        externalProfessionalId: '12',
      })
    })

    it('item que saiu do agendamento lá → null', async () => {
      const { provider } = makeProvider({ 'GET /api/v1/schedule_groups/620': () => ({ status: 200, body: multi() }) })

      await expect(provider.getAppointment('620:3')).resolves.toBeNull()
    })
  })
})

describe('BelasisAgendaProvider — cancelar, conferir, catálogo', () => {
  it('cancela pelo /cancel', async () => {
    const { provider, calls } = makeProvider({
      'PATCH /api/v1/schedule_groups/501/cancel': () => ({ status: 200, body: group({ status: 'disconfirm' }) }),
    })

    await provider.cancelAppointment('501')

    expect(calls).toEqual([expect.objectContaining({ method: 'PATCH', path: '/api/v1/schedule_groups/501/cancel' })])
  })

  it('confere escrita incerta pela referência na observação + dia + hora + profissional', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/schedule_groups': () =>
        paged([
          group({ id: 400, observation: 'outro agendamento' }),
          group({ id: 401, status: 'disconfirm' }), // cancelado: não conta
          group({ id: 402 }),
        ]),
    })

    const found = await provider.findAppointmentByIdempotencyKey(APPOINTMENT, {
      externalProfessionalId: '7',
      start: input.start,
    })

    expect(found).toEqual({ externalId: '402' })
    expect(calls[0].query).toMatchObject({ start_date: '2026-11-10', end_date: '2026-11-10' })
  })

  it('catálogo: só ativos, com o nome e a duração da Belasis', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/employees': () => paged([{ id: 7, name: 'Ana' }]),
      'GET /api/v1/inventory/services': () => paged([{ id: 33, description: 'Corte Feminino', price_cents: 9000, duration: 60 }]),
    })

    await expect(provider.listProfessionals()).resolves.toEqual([{ externalId: '7', name: 'Ana' }])
    await expect(provider.listServices()).resolves.toEqual([
      { externalId: '33', name: 'Corte Feminino', durationMinutes: 60 },
    ])
    expect(calls.every((c) => c.query.active === 'true')).toBe(true)
  })

  it('vínculo inválido (id que não é inteiro) → recusa sem chamar a API', async () => {
    const { provider, calls } = makeProvider({})

    await expect(
      provider.getBusyIntervals({ externalProfessionalId: 'abc', start: input.start, end: input.end })
    ).rejects.toMatchObject({ kind: 'rejected' })
    expect(calls).toEqual([])
  })
})
