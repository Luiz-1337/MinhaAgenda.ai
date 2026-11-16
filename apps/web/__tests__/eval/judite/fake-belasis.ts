/**
 * Belasis de mentira, em memória, para os cenários da Judite.
 *
 * Os cenários rodam o bot DE VERDADE (modelo, tools, banco de um salão de teste),
 * e o bot de verdade grava na agenda oficial do salão. Apontar para a Belasis real
 * criaria cadastros e horários na agenda do Fabiano. Aqui as chamadas a
 * `api.belasis.com.br` são atendidas por este simulador; todo o resto (OpenAI,
 * etc.) segue para a rede.
 *
 * O que ele imita, do que a doc e a API real mostraram:
 * - listagens paginadas `{ data, page, limit, total }`;
 * - busca de clientes PARCIAL, em nome, telefone e celular;
 * - `free_times`: grade de 30 em 30 min; o cancelado (`disconfirm`) continua
 *   ocupando o horário (API real, 03/nov/2026);
 * - `schedule_color_id` na criação; cor que não existe → 422 "Cor de agendamento
 *   não encontrada";
 * - 422 como array de strings; 404 para o que não existe; DELETE → 204.
 *
 * Sem imports de propósito: é testado sozinho (fake-belasis.test.ts) contra o
 * provedor real, sem banco e sem modelo.
 */

export type FakeScheduleStatus = "confirmed" | "unconfirmed" | "disconfirm" | "waiting"

export interface FakeClient {
  id: number
  name: string
  phone?: string
  cellphone?: string
  active?: boolean
}

export interface FakeCalendar {
  id: number
  inventory_product_id: number
  employee_id: number
  start_hour: string
  end_hour: string
  reminder?: boolean
}

export interface FakeGroup {
  id: number
  client_id: number
  status: FakeScheduleStatus
  date: string
  observation?: string
  schedule_color_id?: number | null
  calendars: FakeCalendar[]
}

export interface FakeColor {
  id: number
  name: string
  color: string
  default_for: string | null
}

export interface FakeRequest {
  method: string
  path: string
  query: Record<string, string>
  body?: Record<string, unknown>
}

export interface FakeBelasisOptions {
  clients?: FakeClient[]
  groups?: FakeGroup[]
  colors?: FakeColor[]
  employees?: Array<{ id: number; name: string }>
  services?: Array<{ id: number; description: string; duration?: number; price_cents?: number }>
  /** Expediente da grade `free_times`. Padrão: 09:00 → 18:00. */
  openHour?: number
  closeHour?: number
}

export const BELASIS_HOST = "api.belasis.com.br"

const DEFAULT_COLORS: FakeColor[] = [
  { id: 3, name: "Confirmado", color: "#2196F3", default_for: "confirmed" },
  { id: 17, name: "Marrom", color: "#3E2723", default_for: null },
]

interface Reply {
  status: number
  body?: unknown
}

const page = <T>(items: T[], query: Record<string, string>): Reply => {
  const limit = Math.min(Number(query.limit) || 20, 100)
  const current = Number(query.page) || 1
  const start = (current - 1) * limit
  return { status: 200, body: { data: items.slice(start, start + limit), page: current, limit, total: items.length } }
}

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

const hhmm = (total: number): string =>
  `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`

export function createFakeBelasis(options: FakeBelasisOptions = {}) {
  const state = {
    clients: [...(options.clients ?? [])],
    groups: (options.groups ?? []).map((g) => ({ ...g, calendars: g.calendars.map((c) => ({ ...c })) })),
    colors: [...(options.colors ?? DEFAULT_COLORS)],
    employees: [...(options.employees ?? [{ id: 7, name: "Fabiano Eber" }])],
    services: [...(options.services ?? [{ id: 33, description: "Corte feminino", duration: 60, price_cents: 45000 }])],
    requests: [] as FakeRequest[],
  }
  const openHour = options.openHour ?? 9
  const closeHour = options.closeHour ?? 18

  let nextId = 900_000
  const newId = () => ++nextId

  function handle(request: FakeRequest): Reply {
    const { method, path, query, body } = request
    const route = `${method} ${path}`

    if (route === "GET /api/v1/employees") return page(state.employees, query)
    if (route === "GET /api/v1/inventory/services") return page(state.services, query)
    if (route === "GET /api/v1/schedule_colors") return { status: 200, body: state.colors }

    // --- Clientes -----------------------------------------------------------
    if (route === "GET /api/v1/clients") {
      const term = (query.search ?? "").toLowerCase()
      const found = term
        ? state.clients.filter((c) =>
            [c.name, c.phone, c.cellphone].some((field) => (field ?? "").toLowerCase().includes(term))
          )
        : state.clients
      return page(found, query)
    }
    if (route === "POST /api/v1/clients") {
      const name = String(body?.name ?? "").trim()
      const cellphone = String(body?.cellphone ?? body?.phone ?? "").trim()
      if (!name) return { status: 422, body: ["Nome não pode ficar em branco"] }
      if (!/^[\p{L}\s]+$/u.test(name)) {
        return { status: 422, body: ["Nome possui carácter inválido.", "Nickname possui carácter inválido."] }
      }
      if (cellphone && state.clients.some((c) => c.cellphone === cellphone)) {
        return { status: 422, body: ["Celular já está em uso"] }
      }
      const client: FakeClient = { id: newId(), name, phone: String(body?.phone ?? cellphone), cellphone, active: true }
      state.clients.push(client)
      return { status: 201, body: client }
    }
    const clientMatch = path.match(/^\/api\/v1\/clients\/(\d+)$/)
    if (clientMatch && method === "GET") {
      const client = state.clients.find((c) => c.id === Number(clientMatch[1]))
      return client ? { status: 200, body: client } : { status: 404 }
    }

    // --- Grade de horários --------------------------------------------------
    const freeTimes = path.match(/^\/api\/v1\/employees\/(\d+)\/free_times$/)
    if (freeTimes && method === "GET") {
      const employeeId = Number(freeTimes[1])
      const date = query.date ?? ""
      const taken = state.groups
        .filter((g) => g.date === date)
        .flatMap((g) => g.calendars)
        .filter((c) => c.employee_id === employeeId)
        .map((c) => [minutes(c.start_hour), minutes(c.end_hour)] as const)
      const slots: Array<{ hour: string; label: "available" | "unavailable" }> = []
      for (let t = openHour * 60; t < closeHour * 60; t += 30) {
        const busy = taken.some(([start, end]) => t < end && t + 30 > start)
        slots.push({ hour: hhmm(t), label: busy ? "unavailable" : "available" })
      }
      return { status: 200, body: slots }
    }

    // --- Agendamentos -------------------------------------------------------
    if (route === "GET /api/v1/schedule_groups") {
      const found = state.groups.filter(
        (g) =>
          (!query.client_id || g.client_id === Number(query.client_id)) &&
          (!query.status || g.status === query.status) &&
          (!query.start_date || g.date >= query.start_date) &&
          (!query.end_date || g.date <= query.end_date)
      )
      return page(found, query)
    }
    if (route === "POST /api/v1/schedule_groups") {
      const clientId = Number(body?.client_id)
      if (!state.clients.some((c) => c.id === clientId)) return { status: 422, body: ["Cliente não encontrado"] }
      const colorId = body?.schedule_color_id
      if (colorId !== undefined && colorId !== null && !state.colors.some((c) => c.id === Number(colorId))) {
        return { status: 422, body: ["Cor de agendamento não encontrada"] }
      }
      const items = Array.isArray(body?.calendars_attributes) ? (body.calendars_attributes as Record<string, unknown>[]) : []
      if (items.length === 0) return { status: 422, body: ["Calendars não pode ficar em branco"] }
      const group: FakeGroup = {
        id: newId(),
        client_id: clientId,
        status: (body?.status as FakeScheduleStatus) ?? "unconfirmed",
        date: String(body?.date ?? ""),
        observation: typeof body?.observation === "string" ? body.observation : undefined,
        schedule_color_id: colorId === undefined || colorId === null ? null : Number(colorId),
        calendars: items.map((item) => ({
          id: newId(),
          inventory_product_id: Number(item.inventory_product_id),
          employee_id: Number(item.employee_id),
          start_hour: String(item.start_hour),
          end_hour: String(item.end_hour),
          reminder: item.reminder === true,
        })),
      }
      state.groups.push(group)
      return { status: 201, body: group }
    }

    const cancel = path.match(/^\/api\/v1\/schedule_groups\/(\d+)\/cancel$/)
    if (cancel && method === "PATCH") {
      const group = state.groups.find((g) => g.id === Number(cancel[1]))
      if (!group) return { status: 404 }
      group.status = "disconfirm"
      return { status: 200, body: group }
    }

    const groupMatch = path.match(/^\/api\/v1\/schedule_groups\/(\d+)$/)
    if (groupMatch) {
      const id = Number(groupMatch[1])
      const group = state.groups.find((g) => g.id === id)
      if (!group) return { status: 404 }

      if (method === "GET") return { status: 200, body: group }
      if (method === "DELETE") {
        state.groups = state.groups.filter((g) => g.id !== id)
        return { status: 204 }
      }
      if (method === "PATCH") {
        const items = Array.isArray(body?.calendars_attributes) ? (body.calendars_attributes as Record<string, unknown>[]) : []
        for (const item of items) {
          const calendar = group.calendars.find((c) => c.id === Number(item.id))
          if (!calendar) continue
          if (item._destroy === true) {
            group.calendars = group.calendars.filter((c) => c.id !== calendar.id)
            continue
          }
          // Como a API real (03/nov): mudar a hora sem mandar o serviço é recusado.
          if ((item.start_hour || item.end_hour) && item.inventory_product_id === undefined) {
            return { status: 422, body: ["Calendars calendar products product é obrigatório(a)"] }
          }
          if (typeof item.start_hour === "string") calendar.start_hour = item.start_hour
          if (typeof item.end_hour === "string") calendar.end_hour = item.end_hour
        }
        if (typeof body?.status === "string") group.status = body.status as FakeScheduleStatus
        if (typeof body?.observation === "string") group.observation = body.observation
        return { status: 200, body: group }
      }
    }

    return { status: 404, body: [`rota não simulada: ${route}`] }
  }

  /** `fetch` que atende a Belasis daqui e deixa todo o resto ir para a rede. */
  function wrapFetch(realFetch: typeof fetch): typeof fetch {
    return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url)
      if (url.host !== BELASIS_HOST) return realFetch(input, init)

      const request: FakeRequest = {
        method: (init?.method ?? "GET").toUpperCase(),
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
      }
      state.requests.push(request)
      const reply = handle(request)
      const text = reply.body === undefined ? "" : JSON.stringify(reply.body)
      return {
        ok: reply.status >= 200 && reply.status < 300,
        status: reply.status,
        text: async () => text,
      } as unknown as Response
    }) as typeof fetch
  }

  return {
    state,
    wrapFetch,
    /** Agendamentos que ainda ocupam a agenda de uma cliente (cancelado não conta). */
    activeGroupsOf(clientId: number): FakeGroup[] {
      return state.groups.filter((g) => g.client_id === clientId && g.status !== "disconfirm")
    },
    /** Só as escritas (o que mudou lá). */
    writes(): FakeRequest[] {
      return state.requests.filter((r) => r.method !== "GET")
    },
  }
}

export type FakeBelasis = ReturnType<typeof createFakeBelasis>
