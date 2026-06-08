/**
 * Date-shifter: reescreve datas históricas dos transcripts para o FUTURO.
 *
 * Por quê: o bot ancora datas relativas no relógio real e recusa datas passadas
 * (isPastBooking / getBrazilNow). Os transcripts são de 2024–2026. Para que os
 * agendamentos caiam no futuro, deslocamos as datas ABSOLUTAS por um múltiplo de
 * 7 dias — preservando o dia da semana (sábado continua sábado), o que é crítico
 * porque o salão só atende certos dias e tem regras de sábado.
 *
 * Estratégia (puramente no harness, ZERO mudança em produção):
 *  - âncora = primeiro turno do cliente no episódio.
 *  - offset = menor nº de semanas inteiras que leva a âncora para >= hoje+minLead,
 *    mantendo o mesmo dia da semana.
 *  - reescreve datas absolutas (dd/mm[/aaaa] e "dia N") nos textos.
 *  - NÃO mexe em referências relativas ("amanhã", "sábado", "próxima semana"):
 *    elas já resolvem para o futuro contra o "hoje" real do bot.
 *  - NÃO mexe em horas (só datas).
 */

import type { ReplayEpisode, ReplayExchange } from "../types"

const DAY_MS = 24 * 60 * 60 * 1000

export interface ShiftOptions {
  /** "Agora" de referência (default: new Date()). */
  now?: Date
  /** Folga mínima (dias) entre hoje e a âncora deslocada. Default 2. */
  minLeadDays?: number
}

export interface ShiftPlan {
  /** Múltiplo de 7. Aplicado a toda data do episódio. */
  offsetDays: number
  anchorOriginal: Date
  anchorShifted: Date
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function computeShiftPlan(episode: ReplayEpisode, opts?: ShiftOptions): ShiftPlan {
  const now = opts?.now ?? new Date()
  const minLead = opts?.minLeadDays ?? 2
  const anchorOriginal = episode.startedAt

  const base = new Date(startOfDay(now).getTime() + minLead * DAY_MS)
  const delta = (anchorOriginal.getDay() - base.getDay() + 7) % 7
  const anchorShifted = new Date(base.getTime() + delta * DAY_MS)

  const offsetDays = Math.round(
    (startOfDay(anchorShifted).getTime() - startOfDay(anchorOriginal).getTime()) / DAY_MS
  )
  return { offsetDays, anchorOriginal, anchorShifted }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/** Reescreve datas absolutas no texto, aplicando o offset (múltiplo de 7). */
export function shiftDateReferencesInText(text: string, plan: ShiftPlan): string {
  if (!text) return text
  const anchorYear = plan.anchorOriginal.getFullYear()
  const anchorStart = startOfDay(plan.anchorOriginal).getTime()

  // 1) Datas com barra: dd/mm ou dd/mm/aaaa (não casa horas, que usam ':')
  let out = text.replace(
    /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g,
    (match, dStr: string, moStr: string, yStr?: string) => {
      const day = Number(dStr)
      const month = Number(moStr)
      if (month < 1 || month > 12 || day < 1 || day > 31) return match
      const year = yStr ? (yStr.length === 2 ? 2000 + Number(yStr) : Number(yStr)) : anchorYear
      let orig = new Date(year, month - 1, day)
      // sem ano explícito: se cair bem antes da âncora, assume o próximo ano
      if (!yStr && orig.getTime() < anchorStart - 2 * DAY_MS) {
        orig = new Date(year + 1, month - 1, day)
      }
      const shifted = new Date(orig.getTime() + plan.offsetDays * DAY_MS)
      const dd = pad2(shifted.getDate())
      const mm = pad2(shifted.getMonth() + 1)
      if (yStr) return `${dd}/${mm}/${shifted.getFullYear()}`
      // se o shift cruzou de ano, deixa o ano explícito para evitar ambiguidade
      if (shifted.getFullYear() !== plan.anchorShifted.getFullYear()) {
        return `${dd}/${mm}/${shifted.getFullYear()}`
      }
      return `${dd}/${mm}`
    }
  )

  // 2) "dia N" (só dia, sem barra) — resolve no mês/ano da âncora e desloca
  out = out.replace(/\bdia\s+(\d{1,2})\b(?!\s*[/:])/gi, (match, dStr: string) => {
    const day = Number(dStr)
    if (day < 1 || day > 31) return match
    let orig = new Date(plan.anchorOriginal.getFullYear(), plan.anchorOriginal.getMonth(), day)
    if (orig.getTime() < anchorStart - 2 * DAY_MS) {
      orig = new Date(plan.anchorOriginal.getFullYear(), plan.anchorOriginal.getMonth() + 1, day)
    }
    const shifted = new Date(orig.getTime() + plan.offsetDays * DAY_MS)
    const dd = pad2(shifted.getDate())
    const mm = pad2(shifted.getMonth() + 1)
    // após deslocar semanas inteiras, o dia-do-mês muda → emite dd/mm para clareza
    return `dia ${dd}/${mm}`
  })

  return out
}

const HOLIDAY_RE = /\b(feriado|natal|v[eé]spera|ano novo|carnaval|p[aá]scoa)\b/i

/** Aplica o shift a um episódio (clientText, humanReference e startedAt). */
export function applyShiftToEpisode(episode: ReplayEpisode, opts?: ShiftOptions): ReplayEpisode {
  const plan = computeShiftPlan(episode, opts)

  const hasHoliday = episode.exchanges.some(
    (e) => HOLIDAY_RE.test(e.clientText) || HOLIDAY_RE.test(e.humanReference)
  )
  if (hasHoliday) {
    // eslint-disable-next-line no-console
    console.warn(
      `⚠️  Episódio ${episode.id} menciona feriado — o shift de ${plan.offsetDays} dias ` +
        `pode tirar a data do feriado original. Considere curadoria manual.`
    )
  }

  const exchanges: ReplayExchange[] = episode.exchanges.map((e) => ({
    clientText: shiftDateReferencesInText(e.clientText, plan),
    humanReference: shiftDateReferencesInText(e.humanReference, plan),
    startedAt: new Date(e.startedAt.getTime() + plan.offsetDays * DAY_MS),
  }))

  return {
    ...episode,
    startedAt: plan.anchorShifted,
    exchanges,
  }
}
