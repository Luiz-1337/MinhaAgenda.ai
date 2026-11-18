import { and, asc, count, eq, sql } from "drizzle-orm"

import { db, promotions, sales } from "../index"
import { brazilToday } from "../domain/finance"
import {
  normalizeCouponCode,
  planPromotion,
  promotionBlocker,
  promotionDeleteBlocker,
  promotionStatus,
  type PromotionAppliesTo,
  type PromotionDiscountKind,
  type PromotionDraft,
  type PromotionStatus,
} from "../domain/promotions"
import type { ActionResult } from "./appointments"

/**
 * Promoções e cupons (docs/ROADMAP.md, fase 6, fatia 6b).
 *
 * Só I/O: carrega o que a regra pura (domain/promotions.ts) precisa, deixa ela
 * decidir e grava. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`. O cupom é procurado só no
 * salão da comanda — o mesmo código em outro salão é outra promoção.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Executor = typeof db | Tx

class PromotionRuleError extends Error {}

function fail(message: string): never {
  throw new PromotionRuleError(message)
}

function pgErrorCode(error: unknown): { code?: string; constraint?: string } {
  if (typeof error !== "object" || error === null) return {}
  const direct = error as { code?: string; constraint_name?: string; constraint?: string; cause?: unknown }
  const cause = (typeof direct.cause === "object" && direct.cause !== null ? direct.cause : {}) as {
    code?: string
    constraint_name?: string
    constraint?: string
  }
  return {
    code: direct.code ?? cause.code,
    constraint: direct.constraint_name ?? direct.constraint ?? cause.constraint_name ?? cause.constraint,
  }
}

function toFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof PromotionRuleError) return { success: false, error: error.message }

  const pg = pgErrorCode(error)
  if (pg.code === "23505" && pg.constraint === "promotions_salon_code_unique") {
    return { success: false, error: "Já existe uma promoção com esse cupom" }
  }
  // Corrida: a promoção entrou numa comanda entre a conferência e o DELETE.
  if (pg.code === "23503") {
    return { success: false, error: "Esta promoção já foi usada em comanda. Desative-a em vez de excluir" }
  }

  console.error(fallback, error)
  return { success: false, error: fallback }
}

export type PromotionRow = {
  id: string
  name: string
  code: string
  discountKind: PromotionDiscountKind
  discountValue: string
  appliesTo: PromotionAppliesTo
  startsOn: string | null
  endsOn: string | null
  weekdays: number[]
  isActive: boolean
  /** Comandas (não excluídas) com o cupom, e quantas delas faturadas. */
  sales: number
  invoiced: number
  /** Quanto o cupom já descontou nas comandas faturadas — numeric. */
  discounted: string
  status: PromotionStatus
}

/** As promoções do salão, com o uso de cada uma. */
export async function listPromotionsService(input: { salonId: string; now: Date }): Promise<PromotionRow[]> {
  const [rows, usageRows] = await Promise.all([
    db
      .select({
        id: promotions.id,
        name: promotions.name,
        code: promotions.code,
        discountKind: promotions.discountKind,
        discountValue: promotions.discountValue,
        appliesTo: promotions.appliesTo,
        startsOn: promotions.startsOn,
        endsOn: promotions.endsOn,
        weekdays: promotions.weekdays,
        isActive: promotions.isActive,
      })
      .from(promotions)
      .where(eq(promotions.salonId, input.salonId))
      .orderBy(asc(promotions.name)),
    db
      .select({
        promotionId: sales.promotionId,
        sales: sql<number>`count(*) filter (where ${sales.status} <> 'void')::int`,
        invoiced: sql<number>`count(*) filter (where ${sales.status} = 'invoiced')::int`,
        // O desconto do cupom em cada comanda faturada: a soma dos itens dela.
        // `sales.id` vai por extenso: numa consulta de uma tabela só o Drizzle
        // escreve a coluna sem o nome da tabela, e dentro da subconsulta "id"
        // viraria o id do ITEM — a soma daria sempre zero (visto no teste em uso).
        discounted: sql<string>`coalesce(sum((
          select coalesce(sum(si.coupon_discount), 0) from sale_items si where si.sale_id = "sales"."id"
        )) filter (where ${sales.status} = 'invoiced'), 0)::text`,
      })
      .from(sales)
      .where(and(eq(sales.salonId, input.salonId), sql`${sales.promotionId} IS NOT NULL`))
      .groupBy(sales.promotionId),
  ])

  const usage = new Map(usageRows.map((row) => [row.promotionId, row]))
  const today = brazilToday(input.now)

  return rows.map((row) => {
    const used = usage.get(row.id)
    return {
      ...row,
      sales: used?.sales ?? 0,
      invoiced: used?.invoiced ?? 0,
      discounted: used?.discounted ?? "0",
      status: promotionStatus(row, today),
    }
  })
}

/** Cria (sem `promotionId`) ou altera uma promoção. */
export async function savePromotionService(input: {
  salonId: string
  promotionId?: string | null
  draft: PromotionDraft
}): Promise<ActionResult<{ promotionId: string }>> {
  try {
    const plan = planPromotion(input.draft)
    if (!plan.ok) return { success: false, error: plan.error }

    if (input.promotionId) {
      const [updated] = await db
        .update(promotions)
        .set({ ...plan.promotion, updatedAt: new Date() })
        .where(and(eq(promotions.id, input.promotionId), eq(promotions.salonId, input.salonId)))
        .returning({ id: promotions.id })
      if (!updated) return { success: false, error: "Promoção não encontrada" }
      return { success: true, data: { promotionId: updated.id } }
    }

    const [created] = await db
      .insert(promotions)
      .values({ ...plan.promotion, salonId: input.salonId })
      .returning({ id: promotions.id })
    return { success: true, data: { promotionId: created.id } }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar a promoção")
  }
}

/** Apaga uma promoção que nunca entrou em comanda (nem em comanda excluída). */
export async function deletePromotionService(input: {
  salonId: string
  promotionId: string
}): Promise<ActionResult<void>> {
  try {
    await db.transaction(async (tx) => {
      const [promotion] = await tx
        .select({ id: promotions.id })
        .from(promotions)
        .where(and(eq(promotions.id, input.promotionId), eq(promotions.salonId, input.salonId)))
        .for("update")
      if (!promotion) fail("Promoção não encontrada")

      const [used] = await tx
        .select({ total: count() })
        .from(sales)
        .where(and(eq(sales.salonId, input.salonId), eq(sales.promotionId, promotion.id)))

      const blocker = promotionDeleteBlocker({ sales: used?.total ?? 0 })
      if (blocker) fail(blocker)

      await tx.delete(promotions).where(and(eq(promotions.id, promotion.id), eq(promotions.salonId, input.salonId)))
    })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir a promoção")
  }
}

export type SaleCoupon = {
  id: string
  code: string
  name: string
  discountKind: PromotionDiscountKind
  discountValue: string
  appliesTo: PromotionAppliesTo
}

/**
 * O cupom de uma comanda: procura o código no salão e confere se vale no dia da
 * comanda. Usado ao salvar a comanda e pela tela, para mostrar o desconto antes de
 * salvar.
 */
export async function loadSaleCoupon(
  executor: Executor,
  input: { salonId: string; code: string; saleDay: string }
): Promise<{ ok: true; promotion: SaleCoupon } | { ok: false; error: string }> {
  const code = normalizeCouponCode(input.code)
  if (!code) return { ok: false, error: "Informe o cupom" }

  const [row] = await executor
    .select({
      id: promotions.id,
      code: promotions.code,
      name: promotions.name,
      discountKind: promotions.discountKind,
      discountValue: promotions.discountValue,
      appliesTo: promotions.appliesTo,
      startsOn: promotions.startsOn,
      endsOn: promotions.endsOn,
      weekdays: promotions.weekdays,
      isActive: promotions.isActive,
    })
    .from(promotions)
    .where(and(eq(promotions.salonId, input.salonId), sql`lower(${promotions.code}) = ${code.toLowerCase()}`))
    .limit(1)

  if (!row) return { ok: false, error: "Cupom não encontrado" }

  const blocker = promotionBlocker(row, input.saleDay)
  if (blocker) return { ok: false, error: blocker }

  const { startsOn: _startsOn, endsOn: _endsOn, weekdays: _weekdays, isActive: _isActive, ...promotion } = row
  return { ok: true, promotion }
}
