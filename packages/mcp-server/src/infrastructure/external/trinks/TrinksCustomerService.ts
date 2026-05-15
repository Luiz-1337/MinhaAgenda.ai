import { normalizePhone } from "../../../shared/utils/phone.utils"
import {
  ITrinksCustomerService,
  TrinksClientHistory,
  TrinksClientRaw,
} from "../../../application/ports/ITrinksCustomerService"

const HISTORY_LOOKBACK_DAYS = 365
const RECENT_SERVICES_LIMIT = 5
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

interface TrinksClientPayload {
  id?: string | number
  codigo?: string | number
  nome?: string
  email?: string
  telefones?: Array<{ ddd?: string; numero?: string; tipo?: string }>
  etiquetas?: Array<{ nome?: string } | string>
  dataCadastro?: string
  dataPrimeiroAtendimento?: string
}

interface TrinksAppointmentRaw {
  dataInicio?: string
  status?: string
  servico?: { nome?: string }
  profissional?: { nome?: string }
  valor?: number | string
  valorTotal?: number | string
}

interface TrinksHelpers {
  findTrinksClientByPhone: (salonId: string, phoneSuffix: string) => Promise<TrinksClientPayload | null>
  getTrinksClientAppointments: (
    salonId: string,
    trinksClientId: string,
    startDate: Date,
    endDate: Date
  ) => Promise<TrinksAppointmentRaw[]>
}

// Lazy-loaded helpers from @repo/db. Pattern matches TrinksSchedulerService —
// keeps mcp-server free of a hard dependency on @repo/db when Trinks is unused.
let trinksHelpers: TrinksHelpers | null | undefined = undefined

async function loadHelpers(): Promise<TrinksHelpers | null> {
  if (trinksHelpers !== undefined) return trinksHelpers
  try {
    const mod = (await import("@repo/db")) as unknown as Partial<TrinksHelpers>
    if (mod.findTrinksClientByPhone && mod.getTrinksClientAppointments) {
      trinksHelpers = {
        findTrinksClientByPhone: mod.findTrinksClientByPhone,
        getTrinksClientAppointments: mod.getTrinksClientAppointments,
      }
    } else {
      trinksHelpers = null
    }
  } catch {
    trinksHelpers = null
  }
  return trinksHelpers
}

function isCompletedStatus(status: string | undefined): boolean {
  if (!status) return false
  const s = status.toLowerCase().trim()
  return (
    s.includes("realizad") ||
    s.includes("finalizad") ||
    s.includes("conclu") ||
    s === "atendido"
  )
}

function parseAmount(value: number | string | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = parseFloat(value.replace(",", "."))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function extractTags(payload: TrinksClientPayload): string[] {
  if (!Array.isArray(payload.etiquetas)) return []
  return payload.etiquetas
    .map((t) => (typeof t === "string" ? t : t?.nome ?? ""))
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
}

function extractClientId(payload: TrinksClientPayload): string | null {
  const raw = payload.id ?? payload.codigo
  if (raw === undefined || raw === null) return null
  return String(raw)
}

/**
 * Implementation of ITrinksCustomerService — bridges mcp-server use cases to
 * the @repo/db Trinks helpers (which own the TrinksApiClient and token lookup).
 *
 * Defensive against missing fields: returns zeros / null rather than throwing
 * when payload shape is unexpected, so a single bad customer record can't fail
 * the whole sync batch.
 */
export class TrinksCustomerService implements ITrinksCustomerService {
  async findClientByPhone(salonId: string, phone: string): Promise<TrinksClientRaw | null> {
    const helpers = await loadHelpers()
    if (!helpers) return null

    const normalized = normalizePhone(phone)
    if (normalized.length < 8) return null

    // Trinks /clientes responds best to last-11 digits search; fall back to last-10.
    const searchSuffix = normalized.slice(-11)

    const match = await helpers.findTrinksClientByPhone(salonId, searchSuffix)
    if (!match) return null

    const trinksClientId = extractClientId(match)
    if (!trinksClientId) return null

    return {
      trinksClientId,
      name: match.nome ?? null,
      email: match.email ?? null,
      phone: normalized,
      tags: extractTags(match),
      firstVisitAt: parseDate(match.dataPrimeiroAtendimento ?? match.dataCadastro),
    }
  }

  async fetchClientHistory(salonId: string, trinksClientId: string): Promise<TrinksClientHistory> {
    const helpers = await loadHelpers()
    if (!helpers) return emptyHistory()

    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - HISTORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

    const list = await helpers.getTrinksClientAppointments(salonId, trinksClientId, startDate, endDate)

    const completed = list.filter((a) => isCompletedStatus(a.status))

    let totalSpent = 0
    let visitCount90Days = 0
    let visitCount365Days = 0
    let lastVisit: Date | null = null
    let firstVisit: Date | null = null
    const recentList: Array<{ date: Date; raw: TrinksAppointmentRaw }> = []

    const now = Date.now()
    for (const a of completed) {
      const start = parseDate(a.dataInicio)
      if (!start) continue

      const amount = parseAmount(a.valorTotal ?? a.valor)
      totalSpent += amount
      visitCount365Days++
      if (now - start.getTime() <= NINETY_DAYS_MS) visitCount90Days++

      if (!lastVisit || start.getTime() > lastVisit.getTime()) lastVisit = start
      if (!firstVisit || start.getTime() < firstVisit.getTime()) firstVisit = start

      recentList.push({ date: start, raw: a })
    }

    const averageTicket = visitCount365Days > 0 ? totalSpent / visitCount365Days : 0

    const recentServices = recentList
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, RECENT_SERVICES_LIMIT)
      .map(({ date, raw }) => ({
        serviceName: raw.servico?.nome ?? "Serviço",
        professionalName: raw.profissional?.nome,
        date: date.toISOString(),
        amount: parseAmount(raw.valorTotal ?? raw.valor) || undefined,
      }))

    return {
      totalSpent,
      averageTicket,
      visitCount90Days,
      visitCount365Days,
      lastVisitAt: lastVisit,
      firstVisitAt: firstVisit,
      recentServices,
    }
  }
}

function emptyHistory(): TrinksClientHistory {
  return {
    totalSpent: 0,
    averageTicket: 0,
    visitCount90Days: 0,
    visitCount365Days: 0,
    lastVisitAt: null,
    firstVisitAt: null,
    recentServices: [],
  }
}
