import { and, eq, inArray, isNull, sql } from "drizzle-orm"

import { db, goals, professionals, saleItems, sales } from "../index"
import {
  EMPTY_GOAL_ACHIEVED,
  buildGoalBoard,
  goalMonthRange,
  isGoalMonth,
  planGoalCopy,
  planGoalTargets,
  type GoalAchieved,
  type GoalBoardRow,
  type GoalMetric,
  type GoalTargetsDraft,
} from "../domain/goals"
import { toCents } from "../domain/sales"
import type { ActionResult } from "./appointments"

/**
 * Metas por mês (docs/ROADMAP.md, fase 6, fatia 6e).
 *
 * Só I/O: carrega o que a regra pura (domain/goals.ts) precisa, deixa ela decidir
 * e grava. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`. O realizado é somado das
 * comandas FATURADAS do mês (pelo dia da comanda, em Brasília) — não há tabela de
 * realizado para ficar desatualizada.
 */

class GoalRuleError extends Error {}

function fail(message: string): never {
  throw new GoalRuleError(message)
}

function toFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof GoalRuleError) return { success: false, error: error.message }
  console.error(fallback, error)
  return { success: false, error: fallback }
}

const saleDay = sql<string>`(${sales.saleDate} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date`

/** `month` da tabela é o dia 1. */
function monthDate(month: string): string {
  return `${month}-01`
}

function ownerIs(professionalId: string | null) {
  return professionalId === null ? isNull(goals.professionalId) : eq(goals.professionalId, professionalId)
}

function toAchieved(row: { revenue: string | null; services: string | null; products: string | null; salesCount: number }): GoalAchieved {
  return {
    revenue: toCents(row.revenue) ?? 0,
    services: toCents(row.services) ?? 0,
    products: toCents(row.products) ?? 0,
    sales_count: Number(row.salesCount) || 0,
  }
}

export type GoalBoard = {
  month: string
  rows: GoalBoardRow[]
  /** O mês tem alguma meta gravada. */
  hasGoals: boolean
}

/** O quadro do mês: o salão e cada profissional, com a meta e o realizado. */
export async function getGoalBoardService(input: { salonId: string; month: string; today: string }): Promise<GoalBoard> {
  const { from, to } = goalMonthRange(input.month)

  const invoicedInMonth = and(
    eq(sales.salonId, input.salonId),
    eq(sales.status, "invoiced"),
    sql`${saleDay} BETWEEN ${from}::date AND ${to}::date`
  )

  const totals = {
    revenue: sql<string | null>`sum(${saleItems.total})`,
    services: sql<string | null>`sum(${saleItems.total}) FILTER (WHERE ${saleItems.kind} = 'service')`,
    products: sql<string | null>`sum(${saleItems.total}) FILTER (WHERE ${saleItems.kind} = 'product')`,
    salesCount: sql<number>`count(DISTINCT ${saleItems.saleId})::int`,
  }

  const [goalRows, professionalRows, [salonTotals], professionalTotals] = await Promise.all([
    db
      .select({ professionalId: goals.professionalId, metric: goals.metric, target: goals.target })
      .from(goals)
      .where(and(eq(goals.salonId, input.salonId), eq(goals.month, monthDate(input.month)))),
    db
      .select({ id: professionals.id, name: professionals.name, isActive: professionals.isActive })
      .from(professionals)
      .where(eq(professionals.salonId, input.salonId)),
    db
      .select(totals)
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(and(eq(saleItems.salonId, input.salonId), invoicedInMonth)),
    db
      .select({ professionalId: saleItems.professionalId, ...totals })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(and(eq(saleItems.salonId, input.salonId), invoicedInMonth, sql`${saleItems.professionalId} IS NOT NULL`))
      .groupBy(saleItems.professionalId),
  ])

  const achieved = new Map<string | null, GoalAchieved>()
  achieved.set(null, salonTotals ? toAchieved(salonTotals) : EMPTY_GOAL_ACHIEVED)
  for (const row of professionalTotals) {
    if (row.professionalId) achieved.set(row.professionalId, toAchieved(row))
  }

  // Aparece quem está ativo, e também quem saiu mas tem meta ou venda no mês.
  const withGoal = new Set(goalRows.map((goal) => goal.professionalId).filter((id): id is string => id !== null))
  const owners: { professionalId: string | null; name: string }[] = [{ professionalId: null, name: "Salão" }]
  for (const professional of professionalRows) {
    if (professional.isActive || withGoal.has(professional.id) || achieved.has(professional.id)) {
      owners.push({ professionalId: professional.id, name: professional.name })
    }
  }

  return {
    month: input.month,
    rows: buildGoalBoard({ month: input.month, today: input.today, owners, goals: goalRows, achieved }),
    hasGoals: goalRows.length > 0,
  }
}

/** Grava as metas de um dono (o salão, com `professionalId` NULL, ou um profissional) num mês. */
export async function saveGoalTargetsService(input: {
  salonId: string
  month: string
  professionalId: string | null
  draft: GoalTargetsDraft
}): Promise<ActionResult<void>> {
  try {
    if (!isGoalMonth(input.month)) return { success: false, error: "Mês inválido" }

    const plan = planGoalTargets(input.draft)
    if (!plan.ok) return { success: false, error: plan.error }

    await db.transaction(async (tx) => {
      // O profissional tem que ser deste salão: o id chega do navegador.
      if (input.professionalId) {
        const [professional] = await tx
          .select({ id: professionals.id })
          .from(professionals)
          .where(and(eq(professionals.id, input.professionalId), eq(professionals.salonId, input.salonId)))
          .limit(1)
        if (!professional) fail("Profissional não encontrado")
      }

      const touched: GoalMetric[] = [...plan.deletes, ...plan.upserts.map((goal) => goal.metric)]
      if (touched.length === 0) return

      // Apaga e regrava: o índice único é parcial (salão × profissional), o que
      // complica o ON CONFLICT; dentro da transação o efeito é o mesmo.
      await tx
        .delete(goals)
        .where(
          and(
            eq(goals.salonId, input.salonId),
            eq(goals.month, monthDate(input.month)),
            ownerIs(input.professionalId),
            inArray(goals.metric, touched)
          )
        )

      if (plan.upserts.length > 0) {
        await tx.insert(goals).values(
          plan.upserts.map((goal) => ({
            salonId: input.salonId,
            month: monthDate(input.month),
            professionalId: input.professionalId,
            metric: goal.metric,
            target: goal.target,
          }))
        )
      }
    })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar as metas")
  }
}

/** Copia as metas de um mês para outro, sem passar por cima do que o destino já tem. */
export async function copyGoalsService(input: {
  salonId: string
  fromMonth: string
  toMonth: string
}): Promise<ActionResult<{ copied: number; skipped: number }>> {
  try {
    if (!isGoalMonth(input.fromMonth) || !isGoalMonth(input.toMonth)) return { success: false, error: "Mês inválido" }

    const result = await db.transaction(async (tx) => {
      const [source, existing, active] = await Promise.all([
        tx
          .select({ professionalId: goals.professionalId, metric: goals.metric, target: goals.target })
          .from(goals)
          .where(and(eq(goals.salonId, input.salonId), eq(goals.month, monthDate(input.fromMonth)))),
        tx
          .select({ professionalId: goals.professionalId, metric: goals.metric })
          .from(goals)
          .where(and(eq(goals.salonId, input.salonId), eq(goals.month, monthDate(input.toMonth)))),
        tx
          .select({ id: professionals.id })
          .from(professionals)
          .where(and(eq(professionals.salonId, input.salonId), eq(professionals.isActive, true))),
      ])

      const plan = planGoalCopy({
        fromMonth: input.fromMonth,
        toMonth: input.toMonth,
        source,
        existing,
        activeProfessionalIds: active.map((professional) => professional.id),
      })
      if (!plan.ok) fail(plan.error)

      if (plan.goals.length > 0) {
        await tx.insert(goals).values(
          plan.goals.map((goal) => ({
            salonId: input.salonId,
            month: monthDate(input.toMonth),
            professionalId: goal.professionalId,
            metric: goal.metric,
            target: goal.target,
          }))
        )
      }

      return { copied: plan.goals.length, skipped: plan.skipped }
    })

    return { success: true, data: result }
  } catch (error) {
    return toFailure(error, "Não foi possível copiar as metas")
  }
}
