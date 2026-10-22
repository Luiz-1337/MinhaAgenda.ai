/**
 * Transporte da API Belasis, escrito contra a documentação oficial
 * (https://belasis-api.readme.io, lida página a página em 15/out/2026):
 *
 * - base `https://api.belasis.com.br`, rotas em `/api/v1/...`;
 * - autenticação: header `ACCESS-TOKEN` com a chave crua (`bpk_...`), sem prefixo;
 * - listagens paginadas `{ data, page, limit, total }`, `limit` máximo 100;
 * - 30 requisições por minuto POR CHAVE, na janela do minuto corrente; estourou,
 *   tudo volta 429 SEM corpo até o minuto virar;
 * - 422 devolve um array de strings (ex.: ["Celular já está em uso"]).
 *
 * Todo erro sai como `BelasisApiError` com o `kind` da agenda oficial — a
 * distinção que importa é "com certeza não gravou" (`unavailable`) × "enviei e
 * não sei" (`uncertain`), porque a primeira permite desfazer a reserva local sem
 * deixar lixo lá.
 */
import { createHash } from 'node:crypto'

import { BelasisApiError } from './belasis-errors'
import type {
  BelasisClientRecord,
  BelasisCreateClientBody,
  BelasisCreateScheduleGroupBody,
  BelasisEmployee,
  BelasisFreeTime,
  BelasisPage,
  BelasisScheduleGroup,
  BelasisScheduleStatus,
  BelasisService,
  BelasisUpdateScheduleGroupBody,
} from './belasis-types'

export const BELASIS_BASE_URL = 'https://api.belasis.com.br'
/** Limite documentado. */
export const BELASIS_REQUESTS_PER_MINUTE = 30

/** A IA espera a Belasis dentro da tool de agendamento: timeout curto. */
const DEFAULT_TIMEOUT_MS = 8_000
const PAGE_LIMIT = 100
const DEFAULT_MAX_PAGES = 20
/** Margem abaixo dos 30: o worker e o painel dividem a mesma chave. */
const LOCAL_BUDGET_PER_MINUTE = 28
/** Espera máxima por vaga no limite antes de desistir (a IA está esperando). */
const DEFAULT_MAX_RATE_LIMIT_WAIT_MS = 10_000
const READ_RETRY_DELAY_MS = 400

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'
type QueryValue = string | number | boolean | undefined

const sleepReal = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Fila local por chave. Não enxerga outros processos — o 429 cobre o resto. */
export interface BelasisRateLimiter {
  /** `maxWaitMs`: quanto quem chama aceita esperar por uma vaga. */
  acquire(key: string, options?: { maxWaitMs?: number }): Promise<void>
}

export class InMemoryBelasisRateLimiter implements BelasisRateLimiter {
  private readonly windows = new Map<string, number[]>()

  constructor(
    private readonly options: {
      perMinute?: number
      maxWaitMs?: number
      now?: () => number
      sleep?: (ms: number) => Promise<void>
    } = {}
  ) {}

  async acquire(key: string, options: { maxWaitMs?: number } = {}): Promise<void> {
    const perMinute = this.options.perMinute ?? LOCAL_BUDGET_PER_MINUTE
    const maxWaitMs = options.maxWaitMs ?? this.options.maxWaitMs ?? DEFAULT_MAX_RATE_LIMIT_WAIT_MS
    const now = this.options.now ?? Date.now
    const sleep = this.options.sleep ?? sleepReal

    for (;;) {
      const at = now()
      const recent = (this.windows.get(key) ?? []).filter((t) => at - t < 60_000)
      if (recent.length < perMinute) {
        recent.push(at)
        this.windows.set(key, recent)
        return
      }
      const waitMs = recent[0] + 60_000 - at
      if (waitMs > maxWaitMs) {
        this.windows.set(key, recent)
        throw new BelasisApiError(
          `Limite de ${BELASIS_REQUESTS_PER_MINUTE} requisições por minuto da Belasis atingido`,
          'unavailable',
          { method: 'LOCAL', path: 'rate-limit' }
        )
      }
      await sleep(waitMs)
    }
  }
}

/** Compartilhado no processo: todas as instâncias da mesma chave dividem a cota. */
const sharedRateLimiter = new InMemoryBelasisRateLimiter()

/**
 * Ritmo de trabalho em segundo plano (sincronização): no máximo uma chamada a
 * cada `intervalMs` por chave, e ainda contando na cota compartilhada. A cota é
 * de 30/min por chave E a IA usa a mesma chave ao vivo: sem isto, uma
 * sincronização grande deixaria a IA sem vaga para agendar.
 */
export class PacedBelasisRateLimiter implements BelasisRateLimiter {
  private readonly nextSlot = new Map<string, number>()

  constructor(
    private readonly inner: BelasisRateLimiter,
    private readonly options: {
      intervalMs: number
      now?: () => number
      sleep?: (ms: number) => Promise<void>
    }
  ) {}

  async acquire(key: string, options?: { maxWaitMs?: number }): Promise<void> {
    const now = (this.options.now ?? Date.now)()
    const slot = Math.max(now, this.nextSlot.get(key) ?? 0)
    this.nextSlot.set(key, slot + this.options.intervalMs)
    if (slot > now) await (this.options.sleep ?? sleepReal)(slot - now)
    await this.inner.acquire(key, options)
  }
}

/** 15/min: metade da cota fica sempre livre para a IA e o painel. */
const backgroundRateLimiter = new PacedBelasisRateLimiter(sharedRateLimiter, { intervalMs: 4_000 })

/** Configuração do cliente para trabalho em segundo plano (pode esperar, não tem pressa). */
export function belasisBackgroundOptions(): Pick<
  BelasisClientConfig,
  'rateLimiter' | 'maxRateLimitWaitMs' | 'timeoutMs'
> {
  return { rateLimiter: backgroundRateLimiter, maxRateLimitWaitMs: 65_000, timeoutMs: 15_000 }
}

export interface BelasisClientConfig {
  apiKey: string
  baseUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  rateLimiter?: BelasisRateLimiter
  maxRateLimitWaitMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/** Erros de rede que acontecem ANTES de a requisição sair (nada foi enviado). */
const CONNECT_PHASE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
])

function isConnectPhaseError(error: unknown): boolean {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause
  const code = typeof cause?.code === 'string' ? cause.code : ''
  return CONNECT_PHASE_CODES.has(code) || /^(ERR_TLS|CERT_|UNABLE_TO_)/.test(code)
}

/** 422 que diz respeito ao horário (ocupado/indisponível). A doc não lista as mensagens. */
const SLOT_MESSAGE = /indispon[ií]vel|ocupad|conflit|j[aá] (existe|possui|tem) (um )?agendamento|hor[aá]rio n[aã]o dispon/i

function messagesFrom(body: string): string[] {
  if (!body) return []
  try {
    const parsed: unknown = JSON.parse(body)
    if (Array.isArray(parsed)) return parsed.filter((m): m is string => typeof m === 'string')
    if (parsed && typeof parsed === 'object') {
      const values = Object.values(parsed as Record<string, unknown>).flat()
      return values.filter((m): m is string => typeof m === 'string')
    }
  } catch {
    // corpo não-JSON: devolve cru, cortado
  }
  return [body.slice(0, 300)]
}

export class BelasisClient {
  /** Identifica a chave em cache/limite sem guardar a chave em si. */
  readonly fingerprint: string

  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly rateLimiter: BelasisRateLimiter
  private readonly maxRateLimitWaitMs: number
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(config: BelasisClientConfig) {
    const apiKey = config.apiKey?.trim()
    if (!apiKey) {
      throw new BelasisApiError('Token da Belasis ausente', 'auth', { method: 'LOCAL', path: 'config' })
    }
    this.apiKey = apiKey
    this.fingerprint = createHash('sha256').update(apiKey).digest('hex').slice(0, 16)
    this.baseUrl = (config.baseUrl ?? BELASIS_BASE_URL).replace(/\/+$/, '')
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.fetchImpl = config.fetchImpl ?? fetch
    this.rateLimiter = config.rateLimiter ?? sharedRateLimiter
    this.maxRateLimitWaitMs = config.maxRateLimitWaitMs ?? DEFAULT_MAX_RATE_LIMIT_WAIT_MS
    this.now = config.now ?? Date.now
    this.sleep = config.sleep ?? sleepReal
  }

  // ==========================================================================
  // Endpoints
  // ==========================================================================

  /** Valida a chave com a chamada mais barata que existe. */
  async ping(): Promise<void> {
    await this.request<BelasisPage<BelasisEmployee>>('GET', '/api/v1/employees', { query: { limit: 1 } })
  }

  listEmployees(options: { active?: boolean } = {}): Promise<BelasisEmployee[]> {
    return this.listAll<BelasisEmployee>('/api/v1/employees', { active: options.active })
  }

  getEmployeeFreeTimes(employeeId: number, date: string): Promise<BelasisFreeTime[]> {
    return this.request<BelasisFreeTime[]>('GET', `/api/v1/employees/${employeeId}/free_times`, {
      query: { date },
    })
  }

  listServices(options: { active?: boolean } = {}): Promise<BelasisService[]> {
    return this.listAll<BelasisService>('/api/v1/inventory/services', { active: options.active })
  }

  /** Busca parcial em nome, apelido, telefone, celular e CPF. */
  searchClients(search: string): Promise<BelasisClientRecord[]> {
    return this.listAll<BelasisClientRecord>('/api/v1/clients', { search }, 5)
  }

  getClient(id: number): Promise<BelasisClientRecord> {
    return this.request<BelasisClientRecord>('GET', `/api/v1/clients/${id}`)
  }

  createClient(body: BelasisCreateClientBody): Promise<BelasisClientRecord> {
    return this.request<BelasisClientRecord>('POST', '/api/v1/clients', { body })
  }

  listScheduleGroups(filters: {
    startDate?: string
    endDate?: string
    clientId?: number
    status?: BelasisScheduleStatus
  }): Promise<BelasisScheduleGroup[]> {
    return this.listAll<BelasisScheduleGroup>('/api/v1/schedule_groups', {
      start_date: filters.startDate,
      end_date: filters.endDate,
      client_id: filters.clientId,
      status: filters.status,
    })
  }

  getScheduleGroup(id: number): Promise<BelasisScheduleGroup> {
    return this.request<BelasisScheduleGroup>('GET', `/api/v1/schedule_groups/${id}`)
  }

  createScheduleGroup(body: BelasisCreateScheduleGroupBody): Promise<BelasisScheduleGroup> {
    return this.request<BelasisScheduleGroup>('POST', '/api/v1/schedule_groups', { body })
  }

  updateScheduleGroup(id: number, body: BelasisUpdateScheduleGroupBody): Promise<BelasisScheduleGroup> {
    return this.request<BelasisScheduleGroup>('PATCH', `/api/v1/schedule_groups/${id}`, { body })
  }

  /** Cancelar (status `disconfirm`) em vez de remover: o salão mantém o histórico. */
  cancelScheduleGroup(id: number): Promise<BelasisScheduleGroup> {
    return this.request<BelasisScheduleGroup>('PATCH', `/api/v1/schedule_groups/${id}/cancel`)
  }

  // ==========================================================================
  // Transporte
  // ==========================================================================

  private async listAll<T>(
    path: string,
    query: Record<string, QueryValue>,
    maxPages = DEFAULT_MAX_PAGES
  ): Promise<T[]> {
    const items: T[] = []
    for (let page = 1; page <= maxPages; page++) {
      const result = await this.request<BelasisPage<T>>('GET', path, {
        query: { ...query, page, limit: PAGE_LIMIT },
      })
      const data = Array.isArray(result?.data) ? result.data : []
      items.push(...data)
      const limit = result?.limit || PAGE_LIMIT
      if (data.length < limit || page * limit >= (result?.total ?? 0)) return items
    }
    throw new BelasisApiError(`Listagem ${path} passou de ${maxPages} páginas`, 'unavailable', {
      method: 'GET',
      path,
    })
  }

  private buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(`${this.baseUrl}${path}`)
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
    return url.toString()
  }

  private async fetchOnce(method: HttpMethod, url: string, body: unknown): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      return await this.fetchImpl(url, {
        method,
        headers: {
          'ACCESS-TOKEN': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  private msUntilNextMinute(): number {
    const now = this.now()
    return 60_000 - (now % 60_000)
  }

  private async request<T>(
    method: HttpMethod,
    path: string,
    options: { query?: Record<string, QueryValue>; body?: unknown } = {}
  ): Promise<T> {
    const isRead = method === 'GET'
    const url = this.buildUrl(path, options.query)
    let readRetried = false
    let rateLimitRetried = false

    for (;;) {
      await this.rateLimiter.acquire(this.fingerprint, { maxWaitMs: this.maxRateLimitWaitMs })

      let response: Response
      try {
        response = await this.fetchOnce(method, url, options.body)
      } catch (error) {
        if (isRead && !readRetried) {
          readRetried = true
          await this.sleep(READ_RETRY_DELAY_MS)
          continue
        }
        // Leitura nunca grava; escrita que nem saiu também não. Escrita que saiu
        // (timeout esperando a resposta, conexão caída no meio) pode ter gravado.
        const nothingWritten = isRead || isConnectPhaseError(error)
        throw new BelasisApiError(
          nothingWritten
            ? `Sem conexão com a Belasis (${method} ${path})`
            : `A Belasis não respondeu a ${method} ${path}; a escrita pode ter sido gravada`,
          nothingWritten ? 'unavailable' : 'uncertain',
          { method, path }
        )
      }

      if (response.status === 429) {
        // 429 = não processado. Vale esperar se o minuto vira logo.
        const waitMs = this.msUntilNextMinute() + 300
        if (!rateLimitRetried && waitMs <= this.maxRateLimitWaitMs) {
          rateLimitRetried = true
          await this.sleep(waitMs)
          continue
        }
        throw new BelasisApiError(
          `Limite de ${BELASIS_REQUESTS_PER_MINUTE} requisições por minuto da Belasis atingido`,
          'unavailable',
          { method, path, httpStatus: 429 }
        )
      }

      if (response.status >= 500) {
        if (isRead && !readRetried) {
          readRetried = true
          await this.sleep(READ_RETRY_DELAY_MS)
          continue
        }
        throw new BelasisApiError(
          `A Belasis respondeu ${response.status} em ${method} ${path}`,
          isRead ? 'unavailable' : 'uncertain',
          { method, path, httpStatus: response.status }
        )
      }

      const text = await response.text()

      if (!response.ok) {
        throw this.errorFrom(response.status, text, method, path)
      }

      if (!text) return undefined as T
      try {
        return JSON.parse(text) as T
      } catch {
        throw new BelasisApiError(
          `Resposta ilegível da Belasis em ${method} ${path}`,
          isRead ? 'unavailable' : 'uncertain',
          { method, path, httpStatus: response.status }
        )
      }
    }
  }

  private errorFrom(status: number, text: string, method: string, path: string): BelasisApiError {
    const messages = messagesFrom(text)
    const detail = { method, path, httpStatus: status, messages }
    const suffix = messages.length > 0 ? `: ${messages.join('; ').slice(0, 300)}` : ''

    if (status === 401 || status === 403) {
      return new BelasisApiError(
        'A Belasis recusou o token (inválido, revogado ou conta sem o recurso de API)',
        'auth',
        detail
      )
    }
    if (status === 404) {
      return new BelasisApiError(`Não encontrado na Belasis (${method} ${path})`, 'not_found', detail)
    }
    if (status === 422 && messages.some((m) => SLOT_MESSAGE.test(m))) {
      return new BelasisApiError(`A Belasis recusou o horário${suffix}`, 'slot_unavailable', detail)
    }
    return new BelasisApiError(`A Belasis recusou ${method} ${path} (${status})${suffix}`, 'rejected', detail)
  }
}
