import { describe, expect, it, vi } from 'vitest'

import {
  BelasisClient,
  InMemoryBelasisRateLimiter,
} from '../../src/infrastructure/integrations/belasis/belasis-client'
import { BelasisApiError } from '../../src/infrastructure/integrations/belasis/belasis-errors'

const TOKEN = 'bpk_chave_de_teste'

interface Call {
  method: string
  url: URL
  headers: Record<string, string>
  body?: unknown
}

function response(status: number, body?: unknown): Response {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)
  return { ok: status >= 200 && status < 300, status, text: async () => text } as unknown as Response
}

/** fetch falso: cada chamada consome a próxima resposta (ou lança o erro dado). */
function scriptedFetch(script: Array<Response | Error>) {
  const calls: Call[] = []
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? 'GET',
      url: new URL(String(input)),
      headers: init?.headers as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    const next = script.shift()
    if (!next) throw new Error('fetch chamado mais vezes que o roteiro')
    if (next instanceof Error) throw next
    return next
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

function makeClient(script: Array<Response | Error>, overrides: { now?: () => number } = {}) {
  const fetch = scriptedFetch(script)
  const sleep = vi.fn(async () => undefined)
  const client = new BelasisClient({
    apiKey: TOKEN,
    fetchImpl: fetch.impl,
    rateLimiter: { acquire: async () => undefined },
    sleep,
    now: overrides.now ?? (() => Date.UTC(2026, 10, 10, 13, 0, 55)), // :55 → minuto vira em 5s
  })
  return { client, calls: fetch.calls, sleep }
}

const networkError = (code?: string) => Object.assign(new TypeError('fetch failed'), code ? { cause: { code } } : {})

async function errorOf(promise: Promise<unknown>): Promise<BelasisApiError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(BelasisApiError)
    return error as BelasisApiError
  }
  throw new Error('era para ter lançado')
}

describe('BelasisClient — transporte', () => {
  it('autentica com o header ACCESS-TOKEN e a chave crua (sem "Bearer"), na base documentada', async () => {
    const { client, calls } = makeClient([response(200, { data: [], page: 1, limit: 1, total: 0 })])

    await client.ping()

    expect(calls[0].url.origin + calls[0].url.pathname).toBe('https://api.belasis.com.br/api/v1/employees')
    expect(calls[0].headers['ACCESS-TOKEN']).toBe(TOKEN)
    expect(calls[0].headers).not.toHaveProperty('Authorization')
    expect(calls[0].headers['Content-Type']).toBe('application/json')
  })

  it('a chave nunca vai na URL', async () => {
    const { client, calls } = makeClient([response(200, [])])

    await client.getEmployeeFreeTimes(7, '2026-11-10')

    expect(calls[0].url.toString()).not.toContain(TOKEN)
    expect(calls[0].url.pathname).toBe('/api/v1/employees/7/free_times')
    expect(calls[0].url.searchParams.get('date')).toBe('2026-11-10')
  })

  it('pagina até cobrir o total, pedindo 100 por página', async () => {
    const page = (ids: number[], n: number) =>
      response(200, { data: ids.map((id) => ({ id, name: `P${id}` })), page: n, limit: 100, total: 150 })
    const { client, calls } = makeClient([
      page(Array.from({ length: 100 }, (_, i) => i + 1), 1),
      page(Array.from({ length: 50 }, (_, i) => i + 101), 2),
    ])

    const employees = await client.listEmployees({ active: true })

    expect(employees).toHaveLength(150)
    expect(calls.map((c) => c.url.searchParams.get('page'))).toEqual(['1', '2'])
    expect(calls[0].url.searchParams.get('limit')).toBe('100')
    expect(calls[0].url.searchParams.get('active')).toBe('true')
  })

  it('serviços ficam em /inventory/services', async () => {
    const { client, calls } = makeClient([response(200, { data: [], page: 1, limit: 100, total: 0 })])

    await client.listServices()

    expect(calls[0].url.pathname).toBe('/api/v1/inventory/services')
  })

  it('cancelar é PATCH em /cancel (status disconfirm), não DELETE', async () => {
    const { client, calls } = makeClient([response(200, { id: 9, client_id: 1, date: '2026-11-10', status: 'disconfirm' })])

    await client.cancelScheduleGroup(9)

    expect(calls[0].method).toBe('PATCH')
    expect(calls[0].url.pathname).toBe('/api/v1/schedule_groups/9/cancel')
  })

  it('204 / corpo vazio → undefined', async () => {
    const { client } = makeClient([response(204)])
    await expect(client.cancelScheduleGroup(9)).resolves.toBeUndefined()
  })
})

describe('BelasisClient — erros viram o kind certo', () => {
  it('401 → auth', async () => {
    const { client } = makeClient([response(401)])
    expect((await errorOf(client.ping())).kind).toBe('auth')
  })

  it('404 → not_found', async () => {
    const { client } = makeClient([response(404)])
    expect((await errorOf(client.getScheduleGroup(1))).kind).toBe('not_found')
  })

  it('422 com mensagem de horário → slot_unavailable', async () => {
    const { client } = makeClient([response(422, ['Horário indisponível para o profissional'])])
    const error = await errorOf(
      client.createScheduleGroup({ client_id: 1, date: '2026-11-10', calendars_attributes: [] })
    )
    expect(error.kind).toBe('slot_unavailable')
  })

  it('422 de outra regra → rejected, com as mensagens da API', async () => {
    const { client } = makeClient([response(422, ['Cliente não pode ficar em branco'])])
    const error = await errorOf(
      client.createScheduleGroup({ client_id: 1, date: '2026-11-10', calendars_attributes: [] })
    )
    expect(error.kind).toBe('rejected')
    expect(error.messages).toEqual(['Cliente não pode ficar em branco'])
  })

  it('a mensagem do erro nunca carrega a chave', async () => {
    const { client } = makeClient([response(401)])
    const error = await errorOf(client.ping())
    expect(error.message).not.toContain(TOKEN)
    expect(JSON.stringify(error.detail)).not.toContain(TOKEN)
  })

  describe('429 (sem corpo, até o minuto virar)', () => {
    it('minuto vira logo → espera e tenta de novo uma vez', async () => {
      const { client, sleep, calls } = makeClient([response(429), response(200, [])])

      await client.getEmployeeFreeTimes(7, '2026-11-10')

      expect(calls).toHaveLength(2)
      expect(sleep).toHaveBeenCalledWith(5_300) // 5s até virar + 300ms de folga
    })

    it('minuto longe de virar → desiste na hora (a IA está esperando)', async () => {
      const { client, calls } = makeClient([response(429)], { now: () => Date.UTC(2026, 10, 10, 13, 0, 5) })

      const error = await errorOf(client.getEmployeeFreeTimes(7, '2026-11-10'))

      expect(error.kind).toBe('unavailable')
      expect(calls).toHaveLength(1)
    })

    it('429 em escrita também é seguro de repetir (não foi processado)', async () => {
      const { client, calls } = makeClient([
        response(429),
        response(201, { id: 5, client_id: 1, date: '2026-11-10' }),
      ])

      const group = await client.createScheduleGroup({ client_id: 1, date: '2026-11-10', calendars_attributes: [] })

      expect(group.id).toBe(5)
      expect(calls).toHaveLength(2)
    })
  })

  describe('5xx', () => {
    it('leitura: tenta mais uma vez; persistindo → unavailable', async () => {
      const { client, calls } = makeClient([response(503), response(503)])
      expect((await errorOf(client.getEmployeeFreeTimes(7, '2026-11-10'))).kind).toBe('unavailable')
      expect(calls).toHaveLength(2)
    })

    it('escrita: NÃO repete e devolve uncertain (pode ter gravado)', async () => {
      const { client, calls } = makeClient([response(500)])
      const error = await errorOf(
        client.createScheduleGroup({ client_id: 1, date: '2026-11-10', calendars_attributes: [] })
      )
      expect(error.kind).toBe('uncertain')
      expect(calls).toHaveLength(1)
    })
  })

  describe('rede', () => {
    it('leitura: tenta mais uma vez; persistindo → unavailable', async () => {
      const { client, calls } = makeClient([networkError(), networkError()])
      expect((await errorOf(client.ping())).kind).toBe('unavailable')
      expect(calls).toHaveLength(2)
    })

    it('escrita que nem saiu (conexão recusada) → unavailable: nada gravado', async () => {
      const { client } = makeClient([networkError('ECONNREFUSED')])
      const error = await errorOf(
        client.createScheduleGroup({ client_id: 1, date: '2026-11-10', calendars_attributes: [] })
      )
      expect(error.kind).toBe('unavailable')
    })

    it('escrita que saiu e ficou sem resposta (timeout, conexão caída) → uncertain', async () => {
      const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
      const { client } = makeClient([abort])
      const error = await errorOf(
        client.createScheduleGroup({ client_id: 1, date: '2026-11-10', calendars_attributes: [] })
      )
      expect(error.kind).toBe('uncertain')
    })
  })
})

describe('InMemoryBelasisRateLimiter — cota local de 28/min por chave', () => {
  it('libera até o teto e, cheio, espera se a vaga abre logo', async () => {
    let now = 0
    const sleep = vi.fn(async (ms: number) => {
      now += ms
    })
    const limiter = new InMemoryBelasisRateLimiter({ perMinute: 2, maxWaitMs: 10_000, now: () => now, sleep })

    await limiter.acquire('k')
    now = 55_000
    await limiter.acquire('k')
    await limiter.acquire('k') // a primeira vaga abre em t=60s → espera 5s

    expect(sleep).toHaveBeenCalledWith(5_000)
  })

  it('cheio e a vaga demora → desiste com unavailable', async () => {
    let now = 0
    const limiter = new InMemoryBelasisRateLimiter({ perMinute: 1, maxWaitMs: 10_000, now: () => now, sleep: async () => undefined })

    await limiter.acquire('k')
    now = 1_000

    await expect(limiter.acquire('k')).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('chaves diferentes não dividem cota', async () => {
    const limiter = new InMemoryBelasisRateLimiter({ perMinute: 1, maxWaitMs: 0, now: () => 0, sleep: async () => undefined })

    await limiter.acquire('a')
    await expect(limiter.acquire('b')).resolves.toBeUndefined()
  })
})
