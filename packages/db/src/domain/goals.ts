/**
 * Metas por mês — regra pura, sem I/O (docs/ROADMAP.md, fase 6, fatia 6e).
 *
 * O salão define, mês a mês, quanto quer alcançar — no salão inteiro e por
 * profissional — em quatro indicadores. Só a META é gravada: o REALIZADO é somado
 * das comandas faturadas do mês na hora de mostrar.
 *
 * Mesmo desenho dos outros módulos: o serviço busca os dados, estas funções
 * decidem, o serviço grava. Dinheiro em centavos inteiros.
 */
import { brazilToday, isCalendarDate } from './finance'
import { centsToNumeric, toCents } from './sales'

// ============================================================================
// Indicadores
// ============================================================================

/**
 *   revenue      faturamento: a soma dos itens das comandas faturadas
 *   services     a parte dos serviços
 *   products     a parte dos produtos
 *   sales_count  quantas comandas faturadas
 */
export const GOAL_METRICS = ['revenue', 'services', 'products', 'sales_count'] as const
export type GoalMetric = (typeof GOAL_METRICS)[number]

/** O indicador é dinheiro (centavos) ou contagem? */
export function isMoneyGoal(metric: GoalMetric): boolean {
  return metric !== 'sales_count'
}

const MAX_MONEY_TARGET_CENTS = 99_999_999_99
const MAX_COUNT_TARGET = 99_999

// ============================================================================
// O mês
// ============================================================================

/** "YYYY-MM" de um mês que existe, de 2000 a 2100. */
export function isGoalMonth(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  return year >= 2000 && year <= 2100 && isCalendarDate(`${value}-01`)
}

/** O mês corrente em Brasília, "YYYY-MM". */
export function currentGoalMonth(now: Date): string {
  return brazilToday(now).slice(0, 7)
}

/** O mês N meses depois (ou antes, com N negativo). */
export function shiftGoalMonth(month: string, delta: number): string {
  const index = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + delta
  const year = Math.floor(index / 12)
  return `${String(year).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** O primeiro e o último dia do mês, "YYYY-MM-DD". */
export function goalMonthRange(month: string): { from: string; to: string; days: number } {
  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(5, 7))
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(days).padStart(2, '0')}`, days }
}

// ============================================================================
// Gravar as metas
// ============================================================================

/** O que a tela manda para um dono (o salão ou um profissional): em branco = sem meta. */
export type GoalTargetsDraft = Partial<Record<GoalMetric, number | null | undefined>>

export type GoalTargetsPlan =
  | {
      ok: true
      /** O que gravar (numeric como string) e o que apagar. */
      upserts: { metric: GoalMetric; target: string }[]
      deletes: GoalMetric[]
    }
  | { ok: false; error: string }

const METRIC_LABEL: Record<GoalMetric, string> = {
  revenue: 'faturamento',
  services: 'serviços',
  products: 'produtos',
  sales_count: 'comandas',
}

/**
 * As metas de um dono num mês. Indicador ausente do rascunho fica como está;
 * `null` (ou zero) apaga a meta; valor positivo grava.
 */
export function planGoalTargets(draft: GoalTargetsDraft): GoalTargetsPlan {
  const upserts: { metric: GoalMetric; target: string }[] = []
  const deletes: GoalMetric[] = []

  for (const metric of GOAL_METRICS) {
    if (!(metric in draft)) continue
    const value = draft[metric]

    if (value === null || value === undefined || value === 0) {
      deletes.push(metric)
      continue
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return { ok: false, error: `Meta de ${METRIC_LABEL[metric]} inválida` }
    }

    if (isMoneyGoal(metric)) {
      const cents = toCents(value) ?? 0
      if (cents <= 0) {
        deletes.push(metric)
        continue
      }
      if (cents > MAX_MONEY_TARGET_CENTS) return { ok: false, error: `Meta de ${METRIC_LABEL[metric]} alta demais` }
      upserts.push({ metric, target: centsToNumeric(cents) })
    } else {
      if (!Number.isInteger(value)) return { ok: false, error: 'A meta de comandas é um número inteiro' }
      if (value > MAX_COUNT_TARGET) return { ok: false, error: 'Meta de comandas alta demais' }
      upserts.push({ metric, target: String(value) })
    }
  }

  return { ok: true, upserts, deletes }
}

// ============================================================================
// Copiar metas
// ============================================================================

export type GoalToCopy = { professionalId: string | null; metric: GoalMetric; target: string }

/**
 * Copia as metas de um mês para outro SEM passar por cima: o que o mês de destino
 * já tem fica como está. Só entram o salão e os profissionais ainda ativos.
 */
export function planGoalCopy(input: {
  fromMonth: string
  toMonth: string
  source: readonly GoalToCopy[]
  existing: readonly { professionalId: string | null; metric: GoalMetric }[]
  activeProfessionalIds: readonly string[]
}): { ok: true; goals: GoalToCopy[]; skipped: number } | { ok: false; error: string } {
  if (!isGoalMonth(input.fromMonth) || !isGoalMonth(input.toMonth)) return { ok: false, error: 'Mês inválido' }
  if (input.fromMonth === input.toMonth) return { ok: false, error: 'Escolha um mês diferente para copiar' }
  if (input.source.length === 0) return { ok: false, error: 'O mês escolhido não tem metas para copiar' }

  const key = (goal: { professionalId: string | null; metric: GoalMetric }) => `${goal.professionalId ?? ''}:${goal.metric}`
  const taken = new Set(input.existing.map(key))
  const active = new Set(input.activeProfessionalIds)

  const goals = input.source.filter(
    (goal) => !taken.has(key(goal)) && (goal.professionalId === null || active.has(goal.professionalId))
  )

  return { ok: true, goals, skipped: input.source.length - goals.length }
}

// ============================================================================
// O andamento
// ============================================================================

export type GoalPace =
  /** Meta batida. */
  | 'reached'
  /** Mês em curso, no ritmo (ou acima) do que os dias corridos pedem. */
  | 'on_track'
  /** Mês em curso, abaixo do ritmo. */
  | 'behind'
  /** Mês encerrado sem bater. */
  | 'missed'
  /** Mês que ainda não começou. */
  | 'upcoming'

export type GoalProgress = {
  /** Na unidade do indicador: centavos ou contagem. */
  target: number
  achieved: number
  /** Quanto falta (0 quando bateu). */
  remaining: number
  /** 0 a 999, inteiro, arredondado para baixo: 99,9% não é 100%. */
  percent: number
  /** Onde o realizado deveria estar hoje, pelos dias corridos do mês. */
  expected: number
  pace: GoalPace
}

/**
 * O andamento de uma meta. O "esperado" é linear pelos dias corridos: no dia 10 de
 * um mês de 30, um terço da meta. É régua simples — não conhece dia fechado nem
 * sazonalidade.
 */
export function goalProgress(input: { target: number; achieved: number; month: string; today: string }): GoalProgress {
  const { from, to, days } = goalMonthRange(input.month)
  const target = Math.max(0, input.target)
  const achieved = Math.max(0, input.achieved)
  const remaining = Math.max(0, target - achieved)
  const percent = target > 0 ? Math.min(999, Math.floor((achieved * 100) / target)) : 0

  let elapsed = 0
  if (input.today > to) elapsed = days
  else if (input.today >= from) elapsed = Number(input.today.slice(8, 10))
  const expected = Math.round((target * elapsed) / days)

  let pace: GoalPace
  if (target > 0 && achieved >= target) pace = 'reached'
  else if (input.today > to) pace = 'missed'
  else if (input.today < from) pace = 'upcoming'
  else pace = achieved >= expected ? 'on_track' : 'behind'

  return { target, achieved, remaining, percent, expected, pace }
}

// ============================================================================
// O quadro do mês
// ============================================================================

/** O realizado de um dono no mês, na unidade de cada indicador. */
export type GoalAchieved = Record<GoalMetric, number>

export const EMPTY_GOAL_ACHIEVED: GoalAchieved = { revenue: 0, services: 0, products: 0, sales_count: 0 }

export type GoalBoardRow = {
  /** NULL = o salão. */
  professionalId: string | null
  name: string
  /** NULL = sem meta para o indicador (o realizado aparece mesmo assim). */
  metrics: Record<GoalMetric, { achieved: number; progress: GoalProgress | null }>
}

/**
 * Junta metas e realizado numa linha por dono: o salão primeiro, depois os
 * profissionais em ordem alfabética. Meta em reais vira centavos aqui.
 */
export function buildGoalBoard(input: {
  month: string
  today: string
  owners: readonly { professionalId: string | null; name: string }[]
  goals: readonly GoalToCopy[]
  achieved: ReadonlyMap<string | null, GoalAchieved>
}): GoalBoardRow[] {
  const targets = new Map<string, number>()
  for (const goal of input.goals) {
    const target = isMoneyGoal(goal.metric) ? (toCents(goal.target) ?? 0) : Math.round(Number(goal.target))
    targets.set(`${goal.professionalId ?? ''}:${goal.metric}`, target)
  }

  const rows = input.owners.map((owner) => {
    const achieved = input.achieved.get(owner.professionalId) ?? EMPTY_GOAL_ACHIEVED
    const metrics = {} as GoalBoardRow['metrics']
    for (const metric of GOAL_METRICS) {
      const target = targets.get(`${owner.professionalId ?? ''}:${metric}`)
      metrics[metric] = {
        achieved: achieved[metric],
        progress:
          target === undefined
            ? null
            : goalProgress({ target, achieved: achieved[metric], month: input.month, today: input.today }),
      }
    }
    return { professionalId: owner.professionalId, name: owner.name, metrics }
  })

  return rows.sort((a, b) => {
    if (a.professionalId === null) return -1
    if (b.professionalId === null) return 1
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}
