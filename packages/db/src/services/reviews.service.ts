import { randomBytes } from "node:crypto"
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"

import { db, customers, professionals, reviewSettings, reviews, saleItems, sales, salons } from "../index"
import { brazilToday } from "../domain/finance"
import {
  buildReviewDashboard,
  planReviewResponse,
  planReviewSettings,
  reviewFormTexts,
  shouldRequestReview,
  type ReviewDashboard,
  type ReviewSettingsDraft,
} from "../domain/reviews"
import type { ActionResult } from "./appointments"

/**
 * Avaliações pós-atendimento (docs/ROADMAP.md, fase 6, fatia 6c).
 *
 * Só I/O: carrega o que a regra pura (domain/reviews.ts) precisa, deixa ela decidir
 * e grava. Quem autoriza as telas do salão é a Server Action.
 *
 * Isolamento por salão: toda consulta das telas leva `salon_id`. O FORMULÁRIO
 * PÚBLICO é a exceção de propósito: não há sessão, e a única credencial é o token
 * do pedido — aleatório, de 192 bits, único no sistema. Ele só enxerga o próprio
 * pedido, e só o suficiente para a pessoa saber o que está avaliando.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Executor = typeof db | Tx

function toFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  console.error(fallback, error)
  return { success: false, error: fallback }
}

/** 24 bytes aleatórios em base64url: 32 caracteres, sem símbolo que quebre o link. */
function newReviewToken(): string {
  return randomBytes(24).toString("base64url")
}

// ============================================================================
// Configuração
// ============================================================================

export type ReviewSettingsRow = {
  isEnabled: boolean
  title: string | null
  welcomeText: string | null
  thanksText: string | null
}

const DEFAULT_SETTINGS: ReviewSettingsRow = { isEnabled: false, title: null, welcomeText: null, thanksText: null }

/** A configuração do salão. Sem linha gravada, as avaliações estão desligadas. */
export async function getReviewSettingsService(salonId: string, executor: Executor = db): Promise<ReviewSettingsRow> {
  const [row] = await executor
    .select({
      isEnabled: reviewSettings.isEnabled,
      title: reviewSettings.title,
      welcomeText: reviewSettings.welcomeText,
      thanksText: reviewSettings.thanksText,
    })
    .from(reviewSettings)
    .where(eq(reviewSettings.salonId, salonId))
    .limit(1)
  return row ?? DEFAULT_SETTINGS
}

export async function saveReviewSettingsService(input: {
  salonId: string
  draft: ReviewSettingsDraft
}): Promise<ActionResult<void>> {
  try {
    const plan = planReviewSettings(input.draft)
    if (!plan.ok) return { success: false, error: plan.error }

    await db
      .insert(reviewSettings)
      .values({ ...plan.settings, salonId: input.salonId })
      .onConflictDoUpdate({ target: reviewSettings.salonId, set: { ...plan.settings, updatedAt: new Date() } })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar as configurações de avaliação")
  }
}

// ============================================================================
// Comanda → pedido de avaliação
// ============================================================================

/**
 * Cria o pedido de avaliação de uma comanda que acabou de ser faturada, se o salão
 * pede avaliação e a comanda tem serviço. Roda DENTRO da transação do faturamento.
 *
 * Um pedido por comanda: se já existe (a comanda foi reaberta e faturada de novo),
 * fica o que está — o link que o cliente já recebeu continua valendo.
 */
export async function requestSaleReview(
  tx: Tx,
  input: { salonId: string; saleId: string; customerId: string; saleDate: Date; moduleEnabled: boolean; now: Date }
): Promise<void> {
  if (!input.moduleEnabled) return

  const settings = await getReviewSettingsService(input.salonId, tx)
  if (!settings.isEnabled) return

  const items = await tx
    .selectDistinct({ kind: saleItems.kind })
    .from(saleItems)
    .where(and(eq(saleItems.saleId, input.saleId), eq(saleItems.salonId, input.salonId)))

  const wanted = shouldRequestReview({
    moduleEnabled: true,
    settingsEnabled: true,
    itemKinds: items.map((item) => item.kind),
  })
  if (!wanted) return

  await tx
    .insert(reviews)
    .values({
      salonId: input.salonId,
      saleId: input.saleId,
      customerId: input.customerId,
      token: newReviewToken(),
      serviceDate: brazilToday(input.saleDate),
      requestedAt: input.now,
    })
    .onConflictDoNothing({ target: reviews.saleId })
}

/**
 * A comanda foi excluída: o pedido que ninguém respondeu some junto. A avaliação
 * respondida fica — é a opinião do cliente sobre um atendimento que aconteceu.
 */
export async function discardPendingSaleReview(tx: Tx, input: { salonId: string; saleId: string }): Promise<void> {
  await tx
    .delete(reviews)
    .where(and(eq(reviews.saleId, input.saleId), eq(reviews.salonId, input.salonId), isNull(reviews.respondedAt)))
}

// ============================================================================
// Telas do salão
// ============================================================================

export type ReviewRow = {
  id: string
  token: string
  serviceDate: string
  rating: number | null
  comment: string | null
  requestedAt: Date
  respondedAt: Date | null
  customerId: string
  customerName: string
  saleId: string
  saleNumber: number
  professionals: { id: string; name: string }[]
}

/** Quem executou serviço em cada comanda, sem repetição. */
async function saleProfessionals(
  salonId: string,
  saleIds: string[]
): Promise<Map<string, { id: string; name: string }[]>> {
  const result = new Map<string, { id: string; name: string }[]>()
  if (saleIds.length === 0) return result

  const rows = await db
    .selectDistinct({ saleId: saleItems.saleId, id: professionals.id, name: professionals.name })
    .from(saleItems)
    .innerJoin(professionals, eq(professionals.id, saleItems.professionalId))
    .where(
      and(
        eq(saleItems.salonId, salonId),
        eq(professionals.salonId, salonId),
        eq(saleItems.kind, "service"),
        inArray(saleItems.saleId, saleIds)
      )
    )
    .orderBy(asc(professionals.name))

  for (const { saleId, ...professional } of rows) {
    const list = result.get(saleId) ?? []
    list.push(professional)
    result.set(saleId, list)
  }
  return result
}

/**
 * Os pedidos de avaliação do período (pelo dia do atendimento), do mais recente
 * para o mais antigo, e o painel deles.
 */
export async function listReviewsService(input: {
  salonId: string
  from: string
  to: string
  limit: number
}): Promise<{ rows: ReviewRow[]; dashboard: ReviewDashboard; truncated: boolean }> {
  const rows = await db
    .select({
      id: reviews.id,
      token: reviews.token,
      serviceDate: reviews.serviceDate,
      rating: reviews.rating,
      comment: reviews.comment,
      requestedAt: reviews.requestedAt,
      respondedAt: reviews.respondedAt,
      customerId: customers.id,
      customerName: customers.name,
      saleId: sales.id,
      saleNumber: sales.number,
    })
    .from(reviews)
    .innerJoin(customers, eq(customers.id, reviews.customerId))
    .innerJoin(sales, eq(sales.id, reviews.saleId))
    .where(
      and(
        eq(reviews.salonId, input.salonId),
        sql`${reviews.serviceDate} BETWEEN ${input.from}::date AND ${input.to}::date`
      )
    )
    .orderBy(desc(reviews.serviceDate), desc(reviews.requestedAt))
    .limit(input.limit + 1)

  const visible = rows.slice(0, input.limit)
  const professionalsBySale = await saleProfessionals(
    input.salonId,
    visible.map((row) => row.saleId)
  )

  const withProfessionals = visible.map((row) => ({
    ...row,
    professionals: professionalsBySale.get(row.saleId) ?? [],
  }))

  return {
    rows: withProfessionals,
    dashboard: buildReviewDashboard(withProfessionals),
    truncated: rows.length > input.limit,
  }
}

/** O pedido de avaliação de uma comanda — o link que a tela da comanda mostra. */
export async function getSaleReviewService(input: {
  salonId: string
  saleId: string
}): Promise<{ token: string; rating: number | null; respondedAt: Date | null } | null> {
  const [row] = await db
    .select({ token: reviews.token, rating: reviews.rating, respondedAt: reviews.respondedAt })
    .from(reviews)
    .where(and(eq(reviews.saleId, input.saleId), eq(reviews.salonId, input.salonId)))
    .limit(1)
  return row ?? null
}

/** Apaga uma avaliação (ou um pedido pendente) do salão. */
export async function deleteReviewService(input: { salonId: string; reviewId: string }): Promise<ActionResult<void>> {
  try {
    const deleted = await db
      .delete(reviews)
      .where(and(eq(reviews.id, input.reviewId), eq(reviews.salonId, input.salonId)))
      .returning({ id: reviews.id })
    if (deleted.length === 0) return { success: false, error: "Avaliação não encontrada" }
    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir a avaliação")
  }
}

// ============================================================================
// Formulário público
// ============================================================================

export type PublicReview = {
  salonName: string
  serviceDate: string
  texts: { title: string; welcome: string; thanks: string }
  /** A nota já dada. NULL = ainda não respondeu. */
  rating: number | null
}

/** Token com cara de token: evita mandar ao banco qualquer coisa que venha na URL. */
function isReviewToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(token)
}

/**
 * O que o formulário público mostra para um token: o nome do salão, o dia do
 * atendimento e os textos. NULL = token desconhecido (mesma resposta para
 * "não existe" e "malformado").
 *
 * De propósito NÃO devolve nome do cliente, comanda, itens nem valores: quem tem o
 * link só precisa saber de qual atendimento se trata.
 */
export async function getPublicReviewService(token: unknown): Promise<PublicReview | null> {
  if (!isReviewToken(token)) return null

  const [row] = await db
    .select({
      salonName: salons.name,
      serviceDate: reviews.serviceDate,
      rating: reviews.rating,
      title: reviewSettings.title,
      welcomeText: reviewSettings.welcomeText,
      thanksText: reviewSettings.thanksText,
    })
    .from(reviews)
    .innerJoin(salons, eq(salons.id, reviews.salonId))
    .leftJoin(reviewSettings, eq(reviewSettings.salonId, reviews.salonId))
    .where(eq(reviews.token, token))
    .limit(1)

  if (!row) return null

  return {
    salonName: row.salonName,
    serviceDate: row.serviceDate,
    rating: row.rating,
    texts: reviewFormTexts({ title: row.title, welcomeText: row.welcomeText, thanksText: row.thanksText }),
  }
}

/**
 * Grava a resposta do cliente. Uma vez só: a segunda tentativa é recusada, mesmo
 * que duas cheguem juntas (a linha é travada antes de decidir).
 */
export async function submitPublicReviewService(input: {
  token: unknown
  rating: unknown
  comment: unknown
  now: Date
}): Promise<ActionResult<void>> {
  if (!isReviewToken(input.token)) return { success: false, error: "Link de avaliação inválido" }
  const token = input.token

  try {
    const error = await db.transaction(async (tx) => {
      const [review] = await tx
        .select({ id: reviews.id, respondedAt: reviews.respondedAt })
        .from(reviews)
        .where(eq(reviews.token, token))
        .for("update")
      if (!review) return "Link de avaliação inválido"

      const plan = planReviewResponse({
        rating: input.rating,
        comment: input.comment,
        alreadyResponded: review.respondedAt !== null,
      })
      if (!plan.ok) return plan.error

      await tx
        .update(reviews)
        .set({ rating: plan.rating, comment: plan.comment, respondedAt: input.now })
        .where(eq(reviews.id, review.id))
      return null
    })

    return error ? { success: false, error } : { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível registrar a sua avaliação")
  }
}
