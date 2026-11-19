/**
 * Análise com IA nas telas de relatório — regra pura, sem I/O (docs/ROADMAP.md,
 * fase 9, fatia 9h).
 *
 * Duas pontas:
 *   - o que SAI para a IA: os números da tela, enxutos e sem dado pessoal de
 *     cliente (`planReportInsightInput`);
 *   - o que VOLTA: a resposta da IA conferida e aparada (`parseReportInsights`).
 *
 * Quem chama a OpenAI é o app (apps/web/lib/services/reports), porque a IA mora
 * lá. Este arquivo não sabe de modelo nem de prompt.
 */

// ============================================================================
// As telas
// ============================================================================

export const REPORT_INSIGHT_SCREENS = ['finance', 'appointments', 'customers', 'sales', 'professionals'] as const

export type ReportInsightScreen = (typeof REPORT_INSIGHT_SCREENS)[number]

export const REPORT_INSIGHT_SCREEN_LABELS: Record<ReportInsightScreen, string> = {
  finance: 'Relatórios financeiros',
  appointments: 'Relatórios de agendamentos',
  customers: 'Relatórios de clientes',
  sales: 'Relatórios de vendas',
  professionals: 'Painel dos profissionais',
}

export function parseReportInsightScreen(value: unknown): ReportInsightScreen | null {
  return typeof value === 'string' && (REPORT_INSIGHT_SCREENS as readonly string[]).includes(value)
    ? (value as ReportInsightScreen)
    : null
}

// ============================================================================
// O que sai para a IA
// ============================================================================

/**
 * Chaves que NUNCA saem: contato, documento, identificador interno e texto livre
 * (observação, descrição e motivo podem trazer nome de cliente — o histórico do
 * financeiro, por exemplo, escreve "Comanda #35 — Fulana").
 */
const ALWAYS_DROPPED = /phone|email|whatsapp|cpf|document|token|address|note|observ|description|reason|comment|^id$|Id$|Ids$|^key$/i

/** Nome de cliente com a chave dizendo de quem é. O `name` solto depende da tela (`dropKeys`). */
const CUSTOMER_NAME = /^(customer|client)(Name)?$|(customer|client)Name$/i

/** Texto mais longo que isto é cortado: a IA não precisa de parágrafo. */
const MAX_TEXT = 80
/** Lista de valores simples (não de linhas) maior que isto é cortada. */
const MAX_PRIMITIVE_LIST = 30
/** Quantos valores mais frequentes de cada coluna de texto entram no resumo. */
const TOP_VALUES = 8
/** Profundidade máxima: os relatórios não passam de 4 níveis. */
const MAX_DEPTH = 6

/** O tamanho máximo dos dados mandados à IA, em caracteres de JSON. */
export const MAX_REPORT_INSIGHT_INPUT = 14_000

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

type Plain = string | number | boolean
type Json = Plain | Json[] | { [key: string]: Json }

const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/
const CLOCK_TIME = /^\d{2}:\d{2}$/

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

type WalkContext = { dropKeys: ReadonlySet<string>; sampleRows: number }

function dropped(key: string, ctx: WalkContext): boolean {
  return ALWAYS_DROPPED.test(key) || CUSTOMER_NAME.test(key) || ctx.dropKeys.has(key)
}

/** `fooCents: 12345` → `fooReais: 123.45`. Dinheiro em centavos confunde a IA. */
function renameMoney(key: string, value: Json): [string, Json] {
  if (/Cents$/.test(key) && typeof value === 'number') return [key.replace(/Cents$/, 'Reais'), round2(value / 100)]
  return [key, value]
}

function walkPrimitive(value: unknown): Plain | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? round2(value) : undefined
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return undefined
    // O banco devolve dinheiro como texto ("123.45").
    if (NUMERIC_TEXT.test(text)) return round2(Number(text))
    return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 16)
  return undefined
}

function walkObject(value: Record<string, unknown>, depth: number, ctx: WalkContext): Record<string, Json> | undefined {
  const out: Record<string, Json> = {}
  for (const [key, child] of Object.entries(value)) {
    if (dropped(key, ctx)) continue
    const walked = walk(child, depth + 1, ctx)
    if (walked === undefined) continue
    const [name, renamed] = renameMoney(key, walked)
    out[name] = renamed
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Resume uma lista de linhas: total, e por coluna — soma, média, mínimo e
 * máximo dos números; os valores mais frequentes dos textos; e, para datas, a
 * contagem por dia da semana e o intervalo.
 */
function summarizeRows(rows: Record<string, Json>[]): Record<string, Json> {
  const numbers = new Map<string, number[]>()
  const texts = new Map<string, Map<string, number>>()
  const booleans = new Map<string, number>()

  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === 'number') {
        const list = numbers.get(key) ?? []
        list.push(value)
        numbers.set(key, list)
      } else if (typeof value === 'string') {
        const counts = texts.get(key) ?? new Map<string, number>()
        counts.set(value, (counts.get(value) ?? 0) + 1)
        texts.set(key, counts)
      } else if (typeof value === 'boolean') {
        booleans.set(key, (booleans.get(key) ?? 0) + (value ? 1 : 0))
      }
    }
  }

  const columns: Record<string, Json> = {}

  for (const [key, list] of numbers) {
    const sum = list.reduce((total, n) => total + n, 0)
    columns[key] = {
      soma: round2(sum),
      media: round2(sum / list.length),
      min: round2(Math.min(...list)),
      max: round2(Math.max(...list)),
    }
  }

  for (const [key, counts] of texts) {
    const values = [...counts.keys()]
    if (values.every((value) => CALENDAR_DAY.test(value))) {
      const byWeekday: Record<string, number> = {}
      for (const [day, count] of counts) {
        const [year, month, date] = day.split('-').map(Number)
        const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, date)).getUTCDay()]
        byWeekday[weekday] = (byWeekday[weekday] ?? 0) + count
      }
      const sorted = [...values].sort()
      columns[key] = { de: sorted[0], ate: sorted[sorted.length - 1], porDiaDaSemana: byWeekday }
      continue
    }
    if (values.every((value) => CLOCK_TIME.test(value))) {
      const byHour: Record<string, number> = {}
      for (const [time, count] of counts) {
        const hour = `${time.slice(0, 2)}h`
        byHour[hour] = (byHour[hour] ?? 0) + count
      }
      columns[key] = { porHora: byHour }
      continue
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TOP_VALUES)
    columns[key] = {
      valoresDiferentes: counts.size,
      maisFrequentes: Object.fromEntries(top),
    }
  }

  for (const [key, trueCount] of booleans) columns[key] = { verdadeiros: trueCount }

  return { total: rows.length, colunas: columns }
}

function walkArray(value: unknown[], depth: number, ctx: WalkContext): Json | undefined {
  if (value.length === 0) return undefined

  const objects = value.filter(isPlainObject)
  if (objects.length === 0) {
    const plain = value.map(walkPrimitive).filter((item): item is Plain => item !== undefined)
    if (plain.length === 0) return undefined
    return plain.length > MAX_PRIMITIVE_LIST ? plain.slice(0, MAX_PRIMITIVE_LIST) : plain
  }

  const rows = objects
    .map((row) => walkObject(row, depth, ctx))
    .filter((row): row is Record<string, Json> => row !== undefined)
  if (rows.length === 0) return undefined

  // Poucas linhas vão inteiras: já são o resumo.
  if (rows.length <= Math.max(ctx.sampleRows, 12)) return rows

  const flatRows = rows.map((row) =>
    Object.fromEntries(Object.entries(row).filter(([, child]) => typeof child !== 'object'))
  ) as Record<string, Json>[]
  const summary = summarizeRows(flatRows)
  return ctx.sampleRows > 0 ? { ...summary, amostra: rows.slice(0, ctx.sampleRows) } : summary
}

function walk(value: unknown, depth: number, ctx: WalkContext): Json | undefined {
  if (depth > MAX_DEPTH) return undefined
  if (Array.isArray(value)) return walkArray(value, depth, ctx)
  if (isPlainObject(value)) return walkObject(value, depth, ctx)
  return walkPrimitive(value)
}

export type ReportInsightInputPlan = { ok: true; json: string } | { ok: false; error: string }

/**
 * Os dados de uma tela de relatório prontos para a IA: sem contato nem nome de
 * cliente, dinheiro em reais, listas longas resumidas, até
 * MAX_REPORT_INSIGHT_INPUT caracteres.
 *
 * `dropKeys`: chaves a mais que a tela manda tirar — `name` quando as linhas são
 * clientes.
 */
export function planReportInsightInput(
  data: unknown,
  options: { dropKeys?: readonly string[] } = {}
): ReportInsightInputPlan {
  const dropKeys = new Set(options.dropKeys ?? [])

  // Começa com amostra de linhas e vai tirando até caber.
  for (const sampleRows of [10, 4, 0]) {
    const walked = walk(data, 0, { dropKeys, sampleRows })
    if (walked === undefined) return { ok: false, error: 'Não há números nesta tela para analisar' }
    const json = JSON.stringify(walked)
    if (json.length <= MAX_REPORT_INSIGHT_INPUT) return { ok: true, json }
  }

  return { ok: false, error: 'Esta tela tem dados demais para a análise. Escolha um período menor' }
}

// ============================================================================
// O que volta da IA
// ============================================================================

export const REPORT_INSIGHT_IMPACTS = ['alto', 'medio', 'baixo'] as const
export type ReportInsightImpact = (typeof REPORT_INSIGHT_IMPACTS)[number]

export type ReportInsightItem = { title: string; detail: string }

export type ReportInsights = {
  /** Uma ou duas frases sobre o período. */
  summary: string
  /** O que está indo bem. */
  highlights: ReportInsightItem[]
  /** O que pede atenção. */
  warnings: ReportInsightItem[]
  /** O que fazer, do mais ao menos importante. */
  actions: (ReportInsightItem & { impact: ReportInsightImpact })[]
}

/** Quantos itens de cada lista são mostrados. */
export const MAX_REPORT_INSIGHT_ITEMS = 5

const MAX_TITLE = 120
const MAX_DETAIL = 600
const MAX_SUMMARY = 600

const item = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'detail'],
  properties: {
    title: { type: 'string', description: 'Frase curta, até 12 palavras.' },
    detail: { type: 'string', description: 'Até 3 frases, com os números que sustentam o ponto.' },
  },
} as const

/**
 * O formato que a IA tem de devolver (JSON Schema no modo estrito da OpenAI:
 * todo campo obrigatório, nada além deles).
 */
export const REPORT_INSIGHTS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'highlights', 'warnings', 'actions'],
  properties: {
    summary: { type: 'string', description: 'Uma ou duas frases sobre o período, com o número mais importante.' },
    highlights: { type: 'array', description: 'O que está indo bem. De 0 a 3 itens.', items: item },
    warnings: { type: 'array', description: 'O que pede atenção. De 0 a 3 itens.', items: item },
    actions: {
      type: 'array',
      description: 'O que o salão pode fazer para melhorar, do mais ao menos importante. De 1 a 4 itens.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'detail', 'impact'],
        properties: {
          ...item.properties,
          impact: { type: 'string', enum: [...REPORT_INSIGHT_IMPACTS], description: 'O impacto esperado.' },
        },
      },
    },
  },
} as const

function clip(value: unknown, max: number): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function parseItems(value: unknown): ReportInsightItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isPlainObject)
    .map((entry) => ({ title: clip(entry.title, MAX_TITLE), detail: clip(entry.detail, MAX_DETAIL) }))
    .filter((entry) => entry.title !== '')
    .slice(0, MAX_REPORT_INSIGHT_ITEMS)
}

export type ReportInsightsParse = { ok: true; insights: ReportInsights } | { ok: false; error: string }

/**
 * Confere a resposta da IA. O modo estrito da OpenAI já garante o formato; aqui
 * se apara o que passar do tamanho e se recusa o que vier sem resumo nem ação.
 */
export function parseReportInsights(raw: string): ReportInsightsParse {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'A resposta da IA veio num formato inesperado' }
  }
  if (!isPlainObject(parsed)) return { ok: false, error: 'A resposta da IA veio num formato inesperado' }

  const summary = clip(parsed.summary, MAX_SUMMARY)
  const actions = (Array.isArray(parsed.actions) ? parsed.actions : [])
    .filter(isPlainObject)
    .map((entry) => ({
      title: clip(entry.title, MAX_TITLE),
      detail: clip(entry.detail, MAX_DETAIL),
      impact: (REPORT_INSIGHT_IMPACTS as readonly unknown[]).includes(entry.impact)
        ? (entry.impact as ReportInsightImpact)
        : 'medio',
    }))
    .filter((entry) => entry.title !== '')
    .slice(0, MAX_REPORT_INSIGHT_ITEMS)

  if (!summary && actions.length === 0) return { ok: false, error: 'A IA não devolveu análise' }

  return {
    ok: true,
    insights: {
      summary,
      highlights: parseItems(parsed.highlights),
      warnings: parseItems(parsed.warnings),
      actions,
    },
  }
}
