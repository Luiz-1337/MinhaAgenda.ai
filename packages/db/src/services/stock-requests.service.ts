import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import {
  db,
  commissionAdjustments,
  products,
  professionals,
  profiles,
  stockMovements,
  stockRequests,
} from "../index"
import type { StockRequestStatus } from "../schema"
import { brazilToday } from "../domain/finance"
import {
  planStockRequest,
  planStockRequestApproval,
  stockRequestDeleteBlocker,
  stockRequestRejectBlocker,
  type StockRequestDraft,
} from "../domain/stock-requests"
import type { ActionResult } from "./appointments"

/**
 * Solicitações de saída de estoque (docs/ROADMAP.md, fase 4, fatia 4e).
 *
 * Só I/O: carrega o que a regra pura (domain/stock-requests.ts) precisa, deixa ela
 * decidir e grava. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`. Os ids chegam do cliente; o
 * que não aparece na consulta escopada é tratado como inexistente.
 *
 * Aprovar grava a saída no estoque e o débito no extrato de comissões na mesma
 * transação. Excluir desfaz os dois (FK CASCADE a partir da solicitação).
 */

class StockRequestRuleError extends Error {}

function fail(message: string): never {
  throw new StockRequestRuleError(message)
}

function toFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof StockRequestRuleError) return { success: false, error: error.message }
  console.error(fallback, error)
  return { success: false, error: fallback }
}

// ============================================================================
// Leitura
// ============================================================================

export type StockRequestRow = {
  id: string
  createdAt: Date
  productId: string
  /** Nome do produto na hora do pedido. */
  description: string
  professionalId: string
  professionalName: string
  quantity: string
  /** Preço para profissional na hora do pedido. */
  unitPrice: string
  totalAmount: string
  status: StockRequestStatus
  notes: string | null
  /** Quem registrou o pedido. */
  requestedByName: string | null
  decidedAt: Date | null
  /** A aprovação gerou débito no extrato de comissões. */
  hasDebit: boolean
  /** O débito já entrou num pagamento de comissão: a solicitação não se exclui mais. */
  debitPaid: boolean
}

/**
 * Solicitações do salão, da mais recente para a mais antiga. Com `professionalIds`,
 * só as desses profissionais (quem vê só as próprias).
 */
export async function listStockRequestsService(input: {
  salonId: string
  professionalIds?: string[]
  limit: number
}): Promise<{ rows: StockRequestRow[]; truncated: boolean; pending: number }> {
  if (input.professionalIds && input.professionalIds.length === 0) {
    return { rows: [], truncated: false, pending: 0 }
  }

  const scope = and(
    eq(stockRequests.salonId, input.salonId),
    input.professionalIds ? inArray(stockRequests.professionalId, input.professionalIds) : undefined
  )

  const [rows, [pendingRow]] = await Promise.all([
    db
      .select({
        id: stockRequests.id,
        createdAt: stockRequests.createdAt,
        productId: stockRequests.productId,
        description: stockRequests.description,
        professionalId: stockRequests.professionalId,
        professionalName: professionals.name,
        quantity: stockRequests.quantity,
        unitPrice: stockRequests.unitPrice,
        totalAmount: stockRequests.totalAmount,
        status: stockRequests.status,
        notes: stockRequests.notes,
        // Cadastro antigo pode ter só nome e sobrenome, sem o nome completo.
        requestedByName: sql<
          string | null
        >`coalesce(${profiles.fullName}, nullif(trim(concat_ws(' ', ${profiles.firstName}, ${profiles.lastName})), ''))`,
        decidedAt: stockRequests.decidedAt,
        adjustmentId: commissionAdjustments.id,
        adjustmentPaymentId: commissionAdjustments.paymentId,
      })
      .from(stockRequests)
      .innerJoin(professionals, eq(professionals.id, stockRequests.professionalId))
      .leftJoin(profiles, eq(profiles.id, stockRequests.requestedBy))
      .leftJoin(commissionAdjustments, eq(commissionAdjustments.stockRequestId, stockRequests.id))
      .where(scope)
      .orderBy(desc(stockRequests.createdAt), desc(stockRequests.id))
      .limit(input.limit + 1),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(stockRequests)
      .where(and(scope, eq(stockRequests.status, "pending"))),
  ])

  return {
    rows: rows.slice(0, input.limit).map(({ adjustmentId, adjustmentPaymentId, ...row }) => ({
      ...row,
      hasDebit: adjustmentId !== null,
      debitPaid: adjustmentPaymentId !== null,
    })),
    truncated: rows.length > input.limit,
    pending: pendingRow?.count ?? 0,
  }
}

export type StockRequestOptions = {
  /** Produtos ativos marcados como disponíveis para solicitação. */
  products: { id: string; name: string; professionalPrice: string | null; trackStock: boolean }[]
  /** Profissionais ativos do salão, com o usuário de cada um (para "só os meus"). */
  professionals: { id: string; name: string; userId: string | null }[]
}

export async function listStockRequestOptionsService(salonId: string): Promise<StockRequestOptions> {
  const [productRows, professionalRows] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        professionalPrice: products.professionalPrice,
        trackStock: products.trackStock,
      })
      .from(products)
      .where(and(eq(products.salonId, salonId), eq(products.isActive, true), eq(products.requestable, true)))
      .orderBy(asc(products.name)),
    db
      .select({ id: professionals.id, name: professionals.name, userId: professionals.userId })
      .from(professionals)
      .where(and(eq(professionals.salonId, salonId), eq(professionals.isActive, true)))
      .orderBy(asc(professionals.name)),
  ])

  return { products: productRows, professionals: professionalRows }
}

// ============================================================================
// Escrita
// ============================================================================

/**
 * Registra uma solicitação, pendente. `allowedProfessionalIds` NULL = pode pedir
 * para qualquer profissional do salão; senão, só para esses.
 */
export async function createStockRequestService(input: {
  salonId: string
  userId: string
  draft: StockRequestDraft
  allowedProfessionalIds: string[] | null
}): Promise<ActionResult<{ requestId: string }>> {
  try {
    const productId = typeof input.draft.productId === "string" ? input.draft.productId : null
    const professionalId = typeof input.draft.professionalId === "string" ? input.draft.professionalId : null

    const [productRows, professionalRows] = await Promise.all([
      productId
        ? db
            .select({
              name: products.name,
              isActive: products.isActive,
              requestable: products.requestable,
              professionalPrice: products.professionalPrice,
            })
            .from(products)
            .where(and(eq(products.id, productId), eq(products.salonId, input.salonId)))
            .limit(1)
        : [],
      professionalId
        ? db
            .select({ isActive: professionals.isActive })
            .from(professionals)
            .where(and(eq(professionals.id, professionalId), eq(professionals.salonId, input.salonId)))
            .limit(1)
        : [],
    ])

    const plan = planStockRequest(input.draft, {
      product: productRows[0] ?? null,
      professional: professionalRows[0] ?? null,
      allowedProfessionalIds: input.allowedProfessionalIds ? new Set(input.allowedProfessionalIds) : null,
    })
    if (!plan.ok) fail(plan.error)

    const [created] = await db
      .insert(stockRequests)
      .values({
        salonId: input.salonId,
        productId: plan.productId,
        professionalId: plan.professionalId,
        description: plan.description,
        quantity: plan.quantity,
        unitPrice: plan.unitPrice,
        totalAmount: plan.totalAmount,
        notes: plan.notes,
        requestedBy: input.userId,
      })
      .returning({ id: stockRequests.id })

    return { success: true, data: { requestId: created.id } }
  } catch (error) {
    return toFailure(error, "Não foi possível registrar a solicitação")
  }
}

/**
 * Aprova ou recusa uma solicitação pendente.
 *
 * Aprovar grava, na mesma transação, a saída no estoque (se o produto tem controle)
 * e o débito no extrato de comissões (se o salão usa comissões e a solicitação tem
 * valor). Quem diz se o salão usa comissões é a action (`commissionsEnabled`).
 */
export async function decideStockRequestService(input: {
  salonId: string
  userId: string
  requestId: string
  approve: boolean
  commissionsEnabled: boolean
}): Promise<ActionResult<{ debited: boolean; moved: boolean }>> {
  try {
    const result = await db.transaction(async (tx) => {
      const [request] = await tx
        .select({
          id: stockRequests.id,
          status: stockRequests.status,
          productId: stockRequests.productId,
          professionalId: stockRequests.professionalId,
          description: stockRequests.description,
          quantity: stockRequests.quantity,
          totalAmount: stockRequests.totalAmount,
        })
        .from(stockRequests)
        .where(and(eq(stockRequests.id, input.requestId), eq(stockRequests.salonId, input.salonId)))
        .for("update")

      if (!request) fail("Solicitação não encontrada")

      const now = new Date()

      if (!input.approve) {
        const blocker = stockRequestRejectBlocker(request)
        if (blocker) fail(blocker)

        await tx
          .update(stockRequests)
          .set({ status: "rejected", decidedBy: input.userId, decidedAt: now })
          .where(and(eq(stockRequests.id, request.id), eq(stockRequests.salonId, input.salonId)))

        return { debited: false, moved: false }
      }

      const [product] = await tx
        .select({ trackStock: products.trackStock })
        .from(products)
        .where(and(eq(products.id, request.productId), eq(products.salonId, input.salonId)))
        .limit(1)

      const plan = planStockRequestApproval(request, {
        trackStock: product?.trackStock ?? false,
        commissionsEnabled: input.commissionsEnabled,
      })
      if (!plan.ok) fail(plan.error)

      await tx
        .update(stockRequests)
        .set({ status: "approved", decidedBy: input.userId, decidedAt: now })
        .where(and(eq(stockRequests.id, request.id), eq(stockRequests.salonId, input.salonId)))

      if (plan.movementQuantity !== null) {
        await tx.insert(stockMovements).values({
          salonId: input.salonId,
          productId: request.productId,
          kind: "request",
          quantity: plan.movementQuantity,
          stockRequestId: request.id,
          createdBy: input.userId,
        })
      }

      if (plan.debit) {
        await tx.insert(commissionAdjustments).values({
          salonId: input.salonId,
          professionalId: request.professionalId,
          kind: "advance",
          amount: plan.debit.amount,
          // O débito entra no extrato no dia da aprovação.
          referenceDate: brazilToday(now),
          notes: plan.debit.notes,
          stockRequestId: request.id,
          createdBy: input.userId,
        })
      }

      return { debited: plan.debit !== null, moved: plan.movementQuantity !== null }
    })

    return { success: true, data: result }
  } catch (error) {
    return toFailure(error, "Não foi possível decidir a solicitação")
  }
}

/**
 * Exclui uma solicitação. Aprovada: a saída no estoque e o débito no extrato somem
 * com ela (CASCADE) — desde que o débito ainda não tenha entrado num pagamento.
 *
 * `ownPendingOf` restringe quem só pede: apaga apenas solicitação PENDENTE dos
 * profissionais informados.
 */
export async function deleteStockRequestService(input: {
  salonId: string
  requestId: string
  ownPendingOf?: string[]
}): Promise<ActionResult<{ wasApproved: boolean; hadDebit: boolean }>> {
  try {
    const result = await db.transaction(async (tx) => {
      const [request] = await tx
        .select({
          id: stockRequests.id,
          status: stockRequests.status,
          professionalId: stockRequests.professionalId,
        })
        .from(stockRequests)
        .where(and(eq(stockRequests.id, input.requestId), eq(stockRequests.salonId, input.salonId)))
        .for("update")

      if (!request) fail("Solicitação não encontrada")

      if (input.ownPendingOf) {
        if (!input.ownPendingOf.includes(request.professionalId)) fail("Solicitação não encontrada")
        if (request.status !== "pending") fail("Só quem movimenta o estoque exclui solicitação já decidida")
      }

      // Trava o débito antes de olhar se foi pago: um pagamento de comissão em
      // andamento não pode passar entre a conferência e a exclusão.
      const debits = await tx
        .select({ id: commissionAdjustments.id, paymentId: commissionAdjustments.paymentId })
        .from(commissionAdjustments)
        .where(
          and(eq(commissionAdjustments.salonId, input.salonId), eq(commissionAdjustments.stockRequestId, request.id))
        )
        .for("update")

      const blocker = stockRequestDeleteBlocker({
        status: request.status,
        debitPaid: debits.some((debit) => debit.paymentId !== null),
      })
      if (blocker) fail(blocker)

      await tx
        .delete(stockRequests)
        .where(and(eq(stockRequests.id, request.id), eq(stockRequests.salonId, input.salonId)))

      return { wasApproved: request.status === "approved", hadDebit: debits.length > 0 }
    })

    return { success: true, data: result }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir a solicitação")
  }
}

/** Há solicitação pendente no salão? Para o aviso na tela de estoque. */
export async function countPendingStockRequestsService(salonId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stockRequests)
    .where(and(eq(stockRequests.salonId, salonId), eq(stockRequests.status, "pending")))

  return row?.count ?? 0
}
