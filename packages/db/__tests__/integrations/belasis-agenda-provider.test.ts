import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BelasisClient } from '../../src/infrastructure/integrations/belasis/belasis-client'
import {
  BelasisAgendaProvider,
  clearBelasisFreeTimesCache,
  clearBelasisLookupCaches,
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

function makeProvider(
  routes: Parameters<typeof fakeApi>[0],
  now = () => Date.UTC(2026, 10, 9, 12, 0, 30),
  options: { trafficColor?: string | null } = {}
) {
  const api = fakeApi(routes)
  const client = new BelasisClient({
    apiKey: 'bpk_teste',
    fetchImpl: api.impl,
    rateLimiter: { acquire: async () => undefined },
    sleep: async () => undefined,
    now,
  })
  return { provider: new BelasisAgendaProvider(client, { now, ...options }), calls: api.calls }
}

const paged = (data: unknown[]) => ({ status: 200, body: { data, page: 1, limit: 100, total: data.length } })

/** Busca de clientes que responde por termo; termo não listado → nada. */
const clientSearch =
  (byTerm: Record<string, unknown[]>): Handler =>
  (call) =>
    paged(byTerm[call.query.search] ?? [])

/** Sufixo de 4 dígitos "popular": 900 registros que não são a cliente, 100 por página. */
const crowdedPage = (call: Call) => {
  const page = Number(call.query.page)
  const data: Array<{ id: number; name: string; cellphone?: string }> = Array.from({ length: 100 }, (_, i) => ({
    id: 10_000 + page * 100 + i,
    name: `Cliente ${page}-${i}`,
  }))
  return { status: 200, body: { data, page, limit: 100, total: 900 } }
}

const searchTerms = (calls: Call[]) => calls.filter((c) => c.path === '/api/v1/clients' && c.method === 'GET').map((c) => c.query.search)

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
  clearBelasisLookupCaches()
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
  it('cliente já existe (telefone guardado formatado e sem DDI) → acha pelo hífen e cria o agendamento com ele', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/clients': clientSearch({
        '9105-4646': [
          { id: 12, name: 'Outra', phone: '(11) 99105-4646' }, // mesmo final, outro DDD
          { id: 88, name: 'Maria Souza', phone: '(47) 99105-4646', active: true },
        ],
      }),
      'POST /api/v1/schedule_groups': () => ({ status: 201, body: group() }),
    })

    const created = await provider.createAppointment(input)

    expect(created).toEqual({ externalId: '501', externalCustomerId: '88' })
    expect(searchTerms(calls)).toEqual(['91054646', '9105-4646']) // achou: nem chega nos 4 dígitos
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
    expect(searchTerms(calls)).toEqual(['91054646', '9105-4646', '4646']) // do mais específico ao mais amplo
    const newClient = calls.find((c) => c.method === 'POST' && c.path === '/api/v1/clients')!
    expect(newClient.body).toEqual({ name: 'Maria Souza', phone: '5547991054646', cellphone: '5547991054646' })
  })

  it('achado pelos 8 últimos dígitos → uma busca só', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/clients': clientSearch({ '91054646': [{ id: 88, name: 'Maria Souza', cellphone: '47991054646' }] }),
      'POST /api/v1/schedule_groups': () => ({ status: 201, body: group() }),
    })

    const created = await provider.createAppointment(input)

    expect(created.externalCustomerId).toBe('88')
    expect(searchTerms(calls)).toEqual(['91054646'])
    expect(calls.find((c) => c.path === '/api/v1/clients')!.query).toMatchObject({ page: '1' })
  })

  it('sufixo de 4 dígitos comum (mais de 5 páginas) e cliente novo → não estoura: cadastra e agenda', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/clients': (call) => (call.query.search === '4646' ? crowdedPage(call) : paged([])),
      'POST /api/v1/clients': () => ({ status: 201, body: { id: 140, name: 'Maria Souza', cellphone: '5547991054646' } }),
      'POST /api/v1/schedule_groups': () => ({ status: 201, body: group({ client_id: 140 }) }),
    })

    const created = await provider.createAppointment(input)

    expect(created).toEqual({ externalId: '501', externalCustomerId: '140' })
    // 5 páginas dos 4 dígitos e para (não lê as 9), e segue para o cadastro
    expect(searchTerms(calls)).toEqual(['91054646', '9105-4646', '4646', '4646', '4646', '4646', '4646'])
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([
      '/api/v1/clients',
      '/api/v1/schedule_groups',
    ])
  })

  it('cliente nas páginas lidas dos 4 dígitos (formato que os termos específicos não pegam) → acha', async () => {
    const { provider } = makeProvider({
      'GET /api/v1/clients': (call) => {
        if (call.query.search !== '4646') return paged([])
        const page = crowdedPage(call)
        if (call.query.page === '3') page.body.data[42] = { id: 88, name: 'Maria Souza', cellphone: '47 99105 4646' }
        return page
      },
      'POST /api/v1/schedule_groups': () => ({ status: 201, body: group() }),
    })

    await expect(provider.createAppointment(input)).resolves.toEqual({ externalId: '501', externalCustomerId: '88' })
  })

  it('cadastro recusado ("Celular já está em uso") e nenhuma busca acha → rejected com erro claro, não unavailable', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/clients': (call) => (call.query.search === '4646' ? crowdedPage(call) : paged([])),
      'POST /api/v1/clients': () => ({ status: 422, body: ['Celular já está em uso'] }),
    })

    const error = await provider.createAppointment(input).catch((e: unknown) => e)

    expect(error).toMatchObject({
      kind: 'rejected',
      message: expect.stringContaining('a busca por telefone não achou o cadastro'),
      detail: expect.objectContaining({ httpStatus: 422, messages: ['Celular já está em uso'] }),
    })
    expect(String((error as Error).message)).not.toContain('4646') // nada do cliente na mensagem (vai para log e alerta)
    // Depois do 422 repete só os termos específicos: os 4 dígitos dariam o mesmo
    const postAt = calls.findIndex((c) => c.method === 'POST')
    expect(searchTerms(calls.slice(postAt))).toEqual(['91054646', '9105-4646'])
    expect(calls.some((c) => c.path === '/api/v1/schedule_groups')).toBe(false)
  })

  it('cadastro recusado porque acabou de ser cadastrado por outro caminho → a nova busca acha', async () => {
    let created = false
    const { provider } = makeProvider({
      'GET /api/v1/clients': (call) =>
        paged(created && call.query.search === '91054646' ? [{ id: 88, name: 'Maria', cellphone: '5547991054646' }] : []),
      'POST /api/v1/clients': () => {
        created = true // a sincronização cadastrou no meio do caminho
        return { status: 422, body: ['Celular já está em uso'] }
      },
      'POST /api/v1/schedule_groups': () => ({ status: 201, body: group() }),
    })

    await expect(provider.createAppointment(input)).resolves.toEqual({ externalId: '501', externalCustomerId: '88' })
  })

  it('cadastro recusado por outro motivo → o 422 da Belasis sobe como está', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/clients': () => paged([]),
      'POST /api/v1/clients': () => ({ status: 422, body: ['Telefone não é válido'] }),
    })

    await expect(provider.createAppointment(input)).rejects.toMatchObject({
      kind: 'rejected',
      message: expect.stringContaining('Telefone não é válido'),
    })
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1) // não é o nome: não tenta o padrão
  })

  describe('nome do cliente no cadastro (vem do perfil do WhatsApp)', () => {
    const newClient = () =>
      makeProvider({
        'GET /api/v1/clients': () => paged([]),
        'POST /api/v1/clients': () => ({ status: 201, body: { id: 140, name: 'x', cellphone: '5547991054646' } }),
        'POST /api/v1/schedule_groups': () => ({ status: 201, body: group({ client_id: 140 }) }),
      })

    it.each([
      ['💤', 'Cliente WhatsApp'], // só emoji (produção, 03/nov): sobraria nada
      ['Ana 💇‍♀️ Silva', 'Ana Silva'],
      ['Thaíssa Giovanna Simão', 'Thaíssa Giovanna Simão'], // acento fica
      ['  Ana Carolina (Sheronn) ', 'Ana Carolina Sheronn'],
    ])('%j → cadastra lá como %j', async (name, expected) => {
      const { provider, calls } = newClient()

      await provider.createAppointment({ ...input, customer: { name, phone: input.customer.phone } })

      const post = calls.find((c) => c.method === 'POST' && c.path === '/api/v1/clients')!
      expect(post.body).toMatchObject({ name: expected })
    })

    it('a Belasis recusa o nome mesmo limpo (422 de caractere inválido) → tenta uma vez com o nome padrão', async () => {
      const { provider, calls } = makeProvider({
        'GET /api/v1/clients': () => paged([]),
        'POST /api/v1/clients': [
          { status: 422, body: ['Nome possui carácter inválido.', 'Nickname possui carácter inválido.'] },
          { status: 201, body: { id: 140, name: 'Cliente WhatsApp', cellphone: '5547991054646' } },
        ],
        'POST /api/v1/schedule_groups': () => ({ status: 201, body: group({ client_id: 140 }) }),
      })

      const created = await provider.createAppointment({ ...input, customer: { name: 'Ana Ŧ Silva', phone: input.customer.phone } })

      expect(created.externalCustomerId).toBe('140')
      const names = calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/clients').map((c) => c.body?.name)
      expect(names).toEqual(['Ana Ŧ Silva', 'Cliente WhatsApp'])
    })

    it('o nome padrão também recusado → não insiste: uma tentativa só, e o 422 sobe', async () => {
      const { provider, calls } = makeProvider({
        'GET /api/v1/clients': () => paged([]),
        'POST /api/v1/clients': () => ({ status: 422, body: ['Nome possui carácter inválido.'] }),
      })

      await expect(
        provider.createAppointment({ ...input, customer: { name: '💤', phone: input.customer.phone } })
      ).rejects.toMatchObject({ kind: 'rejected' })
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
    })
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
  it('mesmo dia, profissional e serviço → PATCH da hora, com serviço e profissional do item, mesmo id', async () => {
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
    // Sem o serviço a API real recusa: 422 "Calendars calendar products product é obrigatório(a)".
    expect(patch.body).toEqual({
      calendars_attributes: [{ id: 9001, inventory_product_id: 33, employee_id: 7, start_hour: '14:00', end_hour: '15:00' }],
    })
  })

  it('outro dia → a API não move: cria o novo e remove o antigo', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/schedule_groups/501': () => ({ status: 200, body: group() }),
      'GET /api/v1/clients': () => paged([{ id: 88, name: 'Maria', cellphone: '5547991054646' }]),
      'POST /api/v1/schedule_groups': () => ({ status: 201, body: group({ id: 777, date: '2026-11-11' }) }),
      'DELETE /api/v1/schedule_groups/501': () => ({ status: 204 }),
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
      'DELETE /api/v1/schedule_groups/501',
    ])
  })

  it('outro dia e o antigo não sai → devolve o novo e aponta o antigo', async () => {
    const { provider } = makeProvider({
      'GET /api/v1/schedule_groups/501': () => ({ status: 200, body: group() }),
      'GET /api/v1/clients': () => paged([{ id: 88, name: 'Maria', cellphone: '5547991054646' }]),
      'POST /api/v1/schedule_groups': () => ({ status: 201, body: group({ id: 777 }) }),
      'DELETE /api/v1/schedule_groups/501': () => ({ status: 503 }),
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

    expect(calls.some((c) => c.method === 'DELETE' || c.path.endsWith('/cancel'))).toBe(false)
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

    it('cancelar o único item que sobrou remove o agendamento inteiro', async () => {
      const lone = group({ id: 620, calendars: [{ id: 2, employee_id: 12, inventory_product_id: 40, start_hour: '11:00', end_hour: '11:30' }] })
      const { provider, calls } = makeProvider({
        'GET /api/v1/schedule_groups/620': () => ({ status: 200, body: lone }),
        'DELETE /api/v1/schedule_groups/620': () => ({ status: 204 }),
      })

      await provider.cancelAppointment('620:2')

      expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
        'GET /api/v1/schedule_groups/620',
        'DELETE /api/v1/schedule_groups/620',
      ])
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
  // Lá o cancelado (disconfirm) continua ocupando o horário na grade (API real, 03/nov).
  it('cancelar remove lá (DELETE), não só marca como cancelado', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/schedule_groups/501': () => ({ status: 200, body: group() }),
      'DELETE /api/v1/schedule_groups/501': () => ({ status: 204 }),
    })

    await provider.cancelAppointment('501')

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /api/v1/schedule_groups/501',
      'DELETE /api/v1/schedule_groups/501',
    ])
  })

  it('cancelar descarta a grade guardada daquele dia: a sugestão seguinte já vê o horário livre', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/employees/7/free_times': () => ({ status: 200, body: [{ hour: '10:00', label: 'available' }] }),
      'GET /api/v1/schedule_groups/501': () => ({ status: 200, body: group() }),
      'DELETE /api/v1/schedule_groups/501': () => ({ status: 204 }),
    })
    const window = {
      externalProfessionalId: '7',
      start: new Date('2026-11-10T12:00:00.000Z'),
      end: new Date('2026-11-10T15:00:00.000Z'),
    }

    await provider.getBusyIntervals(window)
    await provider.cancelAppointment('501')
    await provider.getBusyIntervals(window)

    expect(calls.filter((c) => c.path.endsWith('/free_times'))).toHaveLength(2)
  })

  it('a Belasis não deixa remover (422) → ao menos cancela pelo /cancel', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/schedule_groups/501': () => ({ status: 200, body: group() }),
      'DELETE /api/v1/schedule_groups/501': () => ({ status: 422, body: ['Falha ao remover agendamento'] }),
      'PATCH /api/v1/schedule_groups/501/cancel': () => ({ status: 200, body: group({ status: 'disconfirm' }) }),
    })

    await provider.cancelAppointment('501')

    expect(calls.at(-1)).toMatchObject({ method: 'PATCH', path: '/api/v1/schedule_groups/501/cancel' })
  })

  it('já cancelado lá (pela recepção) → não mexe no registro', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/schedule_groups/501': () => ({ status: 200, body: group({ status: 'disconfirm' }) }),
    })

    await provider.cancelAppointment('501')

    expect(calls.map((c) => c.method)).toEqual(['GET'])
  })

  it('não existe mais lá → not_found (a orquestração dá como cancelado)', async () => {
    const { provider } = makeProvider({ 'GET /api/v1/schedule_groups/501': () => ({ status: 404 }) })

    await expect(provider.cancelAppointment('501')).rejects.toMatchObject({ kind: 'not_found' })
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

describe('BelasisAgendaProvider — cor do agendamento de lead de tráfego', () => {
  const COLORS = [
    { id: 3, name: 'Confirmado', color: '#2196F3', default_for: 'confirmed' },
    { id: 17, name: 'Marrom', color: '#3E2723', default_for: null },
  ]
  const CLIENT = { id: 88, name: 'Maria Souza', cellphone: '5547991054646' }
  const traffic: AgendaAppointmentInput = { ...input, leadSource: 'paid_traffic' }

  const routes = (extra: Parameters<typeof fakeApi>[0] = {}): Parameters<typeof fakeApi>[0] => ({
    'GET /api/v1/clients': () => paged([CLIENT]),
    'GET /api/v1/schedule_colors': () => ({ status: 200, body: COLORS }),
    'POST /api/v1/schedule_groups': () => ({ status: 201, body: group() }),
    ...extra,
  })
  const groupPosts = (calls: Call[]) =>
    calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/schedule_groups').map((c) => c.body ?? {})
  const colorLookups = (calls: Call[]) => calls.filter((c) => c.path === '/api/v1/schedule_colors').length

  it('tráfego + cor configurada pelo nome → manda o schedule_color_id que a conta tem para essa cor', async () => {
    const { provider, calls } = makeProvider(routes(), undefined, { trafficColor: 'Marrom' })

    const created = await provider.createAppointment(traffic)

    expect(created).toEqual({ externalId: '501', externalCustomerId: '88' })
    expect(groupPosts(calls)).toEqual([expect.objectContaining({ client_id: 88, schedule_color_id: 17 })])
  })

  it.each([' marrom ', 'MARROM', 'Marróm'])('o nome configurado como "%s" acha a cor "Marrom"', async (name) => {
    const { provider, calls } = makeProvider(routes(), undefined, { trafficColor: name })

    await provider.createAppointment(traffic)

    expect(groupPosts(calls)[0]).toMatchObject({ schedule_color_id: 17 })
  })

  it('lead orgânico ou de origem desconhecida → sem cor, e nem consulta as cores', async () => {
    const { provider, calls } = makeProvider(routes(), undefined, { trafficColor: 'Marrom' })

    await provider.createAppointment({ ...input, leadSource: 'organic' })
    await provider.createAppointment(input)

    expect(groupPosts(calls).every((body) => !('schedule_color_id' in body))).toBe(true)
    expect(colorLookups(calls)).toBe(0)
  })

  it.each([undefined, null, '', '   '])('cor não configurada (%j) → agenda normalmente, sem cor e sem consulta', async (value) => {
    const { provider, calls } = makeProvider(routes(), undefined, { trafficColor: value })

    const created = await provider.createAppointment(traffic)

    expect(created.externalId).toBe('501')
    expect(groupPosts(calls)).toHaveLength(1)
    expect(groupPosts(calls)[0]).not.toHaveProperty('schedule_color_id')
    expect(colorLookups(calls)).toBe(0)
  })

  it('a conta não tem cor com o nome configurado → agenda sem cor', async () => {
    const { provider, calls } = makeProvider(routes(), undefined, { trafficColor: 'Roxo' })

    const created = await provider.createAppointment(traffic)

    expect(created.externalId).toBe('501')
    expect(groupPosts(calls)[0]).not.toHaveProperty('schedule_color_id')
  })

  it('a listagem de cores está fora do ar → agenda sem cor', async () => {
    const { provider, calls } = makeProvider(
      routes({ 'GET /api/v1/schedule_colors': () => ({ status: 500 }) }),
      undefined,
      { trafficColor: 'Marrom' }
    )

    const created = await provider.createAppointment(traffic)

    expect(created.externalId).toBe('501')
    expect(groupPosts(calls)).toHaveLength(1)
    expect(groupPosts(calls)[0]).not.toHaveProperty('schedule_color_id')
  })

  it('a Belasis recusa a cor (422) → cria de novo SEM a cor, e o agendamento sai', async () => {
    const { provider, calls } = makeProvider(
      routes({
        'POST /api/v1/schedule_groups': [
          { status: 422, body: ['Cor de agendamento não encontrada'] },
          { status: 201, body: group() },
        ],
      }),
      undefined,
      { trafficColor: 'Marrom' }
    )

    const created = await provider.createAppointment(traffic)

    expect(created).toEqual({ externalId: '501', externalCustomerId: '88' })
    const posts = groupPosts(calls)
    expect(posts).toHaveLength(2)
    expect(posts[0]).toMatchObject({ schedule_color_id: 17 })
    expect(posts[1]).not.toHaveProperty('schedule_color_id')
    expect(posts[1]).toMatchObject({ client_id: 88, date: '2026-11-10' })
  })

  it('recusa de texto desconhecido com cor → tenta uma vez sem a cor antes de desistir', async () => {
    const { provider, calls } = makeProvider(
      routes({
        'POST /api/v1/schedule_groups': [
          { status: 422, body: ['Parâmetros inválidos'] },
          { status: 201, body: group() },
        ],
      }),
      undefined,
      { trafficColor: 'Marrom' }
    )

    await expect(provider.createAppointment(traffic)).resolves.toMatchObject({ externalId: '501' })
    expect(groupPosts(calls).map((body) => 'schedule_color_id' in body)).toEqual([true, false])
  })

  it('recusa que continua sem a cor → o erro da Belasis sobe (a cor não mascara outro problema)', async () => {
    const { provider, calls } = makeProvider(
      routes({ 'POST /api/v1/schedule_groups': () => ({ status: 422, body: ['Profissional não atende o serviço'] }) }),
      undefined,
      { trafficColor: 'Marrom' }
    )

    await expect(provider.createAppointment(traffic)).rejects.toMatchObject({ kind: 'rejected' })
    expect(groupPosts(calls)).toHaveLength(2)
  })

  it('horário recusado com cor → slot_unavailable na hora, sem segunda tentativa', async () => {
    const { provider, calls } = makeProvider(
      routes({ 'POST /api/v1/schedule_groups': () => ({ status: 422, body: ['Horário indisponível'] }) }),
      undefined,
      { trafficColor: 'Marrom' }
    )

    await expect(provider.createAppointment(traffic)).rejects.toMatchObject({ kind: 'slot_unavailable' })
    expect(groupPosts(calls)).toHaveLength(1)
  })

  it('depois de recusada, a cor fica de fora por alguns minutos: o POST recusado não se repete a cada agendamento', async () => {
    let now = Date.UTC(2026, 10, 9, 12, 0, 30)
    const { provider, calls } = makeProvider(
      routes({
        'POST /api/v1/schedule_groups': [
          { status: 422, body: ['Cor de agendamento não encontrada'] },
          { status: 201, body: group() },
          { status: 201, body: group({ id: 502 }) },
          { status: 201, body: group({ id: 503 }) },
        ],
      }),
      () => now,
      { trafficColor: 'Marrom' }
    )

    await provider.createAppointment(traffic) // recusada, depois sem cor
    await provider.createAppointment(traffic) // direto sem cor
    expect(groupPosts(calls).map((body) => 'schedule_color_id' in body)).toEqual([true, false, false])

    now += 11 * 60_000 // passou o tempo: confere a cor de novo
    await provider.createAppointment(traffic)
    expect(groupPosts(calls)[3]).toMatchObject({ schedule_color_id: 17 })
  })

  it('consulta as cores uma vez e reaproveita nos agendamentos seguintes', async () => {
    const { provider, calls } = makeProvider(routes(), undefined, { trafficColor: 'Marrom' })

    await provider.createAppointment(traffic)
    await provider.createAppointment(traffic)

    expect(colorLookups(calls)).toBe(1)
    expect(groupPosts(calls).map((body) => body.schedule_color_id)).toEqual([17, 17])
  })

  it('id numérico configurado → usa direto, sem consultar as cores', async () => {
    const { provider, calls } = makeProvider(routes(), undefined, { trafficColor: '42' })

    await provider.createAppointment(traffic)

    expect(groupPosts(calls)[0]).toMatchObject({ schedule_color_id: 42 })
    expect(colorLookups(calls)).toBe(0)
  })

  it('id de cliente guardado envelhecido + cor: troca o cliente e MANTÉM a cor', async () => {
    const { provider, calls } = makeProvider(
      routes({
        'POST /api/v1/schedule_groups': [
          { status: 422, body: ['Cliente não encontrado'] },
          { status: 201, body: group() },
        ],
      }),
      undefined,
      { trafficColor: 'Marrom' }
    )

    const created = await provider.createAppointment({ ...traffic, customer: { ...traffic.customer, externalId: '999' } })

    expect(created).toEqual({ externalId: '501', externalCustomerId: '88' })
    expect(groupPosts(calls).map((body) => [body.client_id, body.schedule_color_id])).toEqual([
      [999, 17],
      [88, 17],
    ])
  })

  it('cliente velho E cor recusada → sai sem cor, com o cliente certo', async () => {
    const { provider, calls } = makeProvider(
      routes({
        'POST /api/v1/schedule_groups': [
          { status: 422, body: ['Cliente não encontrado'] },
          { status: 422, body: ['Erro que não diz qual campo'] },
          { status: 201, body: group() },
        ],
      }),
      undefined,
      { trafficColor: 'Marrom' }
    )

    const created = await provider.createAppointment({ ...traffic, customer: { ...traffic.customer, externalId: '999' } })

    expect(created.externalCustomerId).toBe('88')
    expect(groupPosts(calls).map((body) => [body.client_id, body.schedule_color_id])).toEqual([
      [999, 17],
      [88, 17],
      [88, undefined],
    ])
  })

  it('remarcar para outro dia: o agendamento novo de lá também leva a cor', async () => {
    const { provider, calls } = makeProvider(
      routes({
        'GET /api/v1/schedule_groups/501': () => ({ status: 200, body: group({ date: '2026-11-09' }) }),
        'POST /api/v1/schedule_groups': () => ({ status: 201, body: group({ id: 777 }) }),
        'DELETE /api/v1/schedule_groups/501': () => ({ status: 204 }),
      }),
      undefined,
      { trafficColor: 'Marrom' }
    )

    const moved = await provider.rescheduleAppointment('501', { ...traffic, customer: { ...traffic.customer, externalId: '88' } })

    expect(moved.externalId).toBe('777')
    expect(groupPosts(calls)[0]).toMatchObject({ client_id: 88, schedule_color_id: 17 })
  })
})

describe('BelasisAgendaProvider — o que a cliente já tem marcado lá', () => {
  const PHONE = '5547991054646'

  it('findCustomerByPhone acha o cadastro pelo telefone (qualquer formato) e não cadastra ninguém', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/clients': clientSearch({
        '9105-4646': [{ id: 88, name: 'Maria Souza', phone: '(47) 99105-4646', active: true }],
      }),
    })

    await expect(provider.findCustomerByPhone('+55 (47) 99105-4646')).resolves.toEqual({
      externalId: '88',
      name: 'Maria Souza',
    })
    expect(calls.every((c) => c.method === 'GET')).toBe(true)
  })

  it('não achou → null, e o agendamento logo depois NÃO repete a busca: cadastra direto', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/clients': () => paged([]),
      'POST /api/v1/clients': () => ({ status: 201, body: { id: 140, name: 'Maria Souza', cellphone: PHONE } }),
      'POST /api/v1/schedule_groups': () => ({ status: 201, body: group({ client_id: 140 }) }),
    })

    await expect(provider.findCustomerByPhone(PHONE)).resolves.toBeNull()
    expect(searchTerms(calls)).toEqual(['91054646', '9105-4646', '4646'])

    const created = await provider.createAppointment(input)

    expect(created.externalCustomerId).toBe('140')
    expect(searchTerms(calls)).toHaveLength(3) // nenhuma busca a mais
  })

  it('a lembrança de "não achei" dura pouco: passado o tempo, o agendamento volta a procurar', async () => {
    let now = Date.UTC(2026, 10, 9, 12, 0, 30)
    const { provider, calls } = makeProvider(
      {
        'GET /api/v1/clients': () => paged([]),
        'POST /api/v1/clients': () => ({ status: 201, body: { id: 140, name: 'Maria Souza', cellphone: PHONE } }),
        'POST /api/v1/schedule_groups': () => ({ status: 201, body: group({ client_id: 140 }) }),
      },
      () => now
    )

    await provider.findCustomerByPhone(PHONE)
    now += 11 * 60_000
    await provider.createAppointment(input)

    expect(searchTerms(calls)).toHaveLength(6)
  })

  it('cliente nova que demora para responder o nome: a segunda consulta não repete a busca', async () => {
    let now = Date.UTC(2026, 10, 9, 12, 0, 30)
    const { provider, calls } = makeProvider({ 'GET /api/v1/clients': () => paged([]) }, () => now)

    await expect(provider.findCustomerByPhone(PHONE)).resolves.toBeNull()
    now += 4 * 60_000
    await expect(provider.findCustomerByPhone(PHONE)).resolves.toBeNull()

    expect(searchTerms(calls)).toHaveLength(3)
  })

  it('"não achei" lembrado, mas a Belasis diz que o celular já existe → procura de novo e usa o cadastro que apareceu', async () => {
    let registered = false
    const { provider, calls } = makeProvider({
      'GET /api/v1/clients': () => paged(registered ? [{ id: 88, name: 'Maria Souza', cellphone: PHONE }] : []),
      'POST /api/v1/clients': () => {
        registered = true // a recepção cadastrou nesse meio-tempo
        return { status: 422, body: ['Celular já está em uso'] }
      },
      'POST /api/v1/schedule_groups': () => ({ status: 201, body: group() }),
    })

    await expect(provider.findCustomerByPhone(PHONE)).resolves.toBeNull()
    const created = await provider.createAppointment(input)

    expect(created.externalCustomerId).toBe('88')
    expect(calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/schedule_groups')).toHaveLength(1)
  })

  it('o que não é telefone (id interno do WhatsApp) → null sem tocar na API', async () => {
    const { provider, calls } = makeProvider({})

    await expect(provider.findCustomerByPhone('136784245694524')).resolves.toBeNull()
    expect(calls).toEqual([])
  })

  it('listCustomerAppointments pede só os agendamentos daquela cliente, no período, em datas de Brasília', async () => {
    const { provider, calls } = makeProvider({
      'GET /api/v1/schedule_groups': () =>
        paged([
          {
            id: 610,
            client_id: 88,
            status: 'unconfirmed',
            date: '2026-11-17',
            observation: 'Marcado pela recepção',
            calendars: [{ id: 9100, employee_id: 7, inventory_product_id: 33, start_hour: '17:00', end_hour: '18:00' }],
          },
        ]),
    })

    const appointments = await provider.listCustomerAppointments('88', {
      start: new Date('2026-11-12T03:00:00.000Z'),
      end: new Date('2027-05-11T03:00:00.000Z'),
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].query).toMatchObject({ client_id: '88', start_date: '2026-11-12', end_date: '2027-05-11' })
    expect(appointments).toEqual([
      {
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
        notes: 'Marcado pela recepção',
      },
    ])
  })

  it('a API devolve horários de outras clientes (filtro `client_id` ignorado) → ficam de fora', async () => {
    const group = (id: number, clientId: number | undefined, hour: string) => ({
      id,
      ...(clientId === undefined ? {} : { client_id: clientId }),
      status: 'unconfirmed',
      date: '2026-11-17',
      calendars: [{ id: id * 10, employee_id: 7, inventory_product_id: 33, start_hour: hour, end_hour: '18:00' }],
    })
    const { provider } = makeProvider({
      'GET /api/v1/schedule_groups': () =>
        paged([group(611, 12, '10:00'), group(610, 88, '17:00'), group(612, undefined, '11:00')]),
    })

    const appointments = await provider.listCustomerAppointments('88', {
      start: new Date('2026-11-12T03:00:00.000Z'),
      end: new Date('2027-05-11T03:00:00.000Z'),
    })

    expect(appointments.map((appointment) => appointment.externalId)).toEqual(['610'])
  })

  it('vínculo de cliente inválido → recusa sem chamar a API', async () => {
    const { provider, calls } = makeProvider({})

    await expect(
      provider.listCustomerAppointments('abc', { start: input.start, end: input.end })
    ).rejects.toMatchObject({ kind: 'rejected' })
    expect(calls).toEqual([])
  })
})
