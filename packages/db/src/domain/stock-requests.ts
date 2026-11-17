/**
 * Regra das solicitações de saída de estoque — pura, sem I/O (docs/ROADMAP.md,
 * fase 4, fatia 4e).
 *
 * O profissional pede um produto do estoque para uso próprio. O salão aprova, o
 * produto sai e o valor — pelo "preço para profissional" — é debitado no extrato de
 * comissões como um vale.
 *
 * Mesmo desenho dos outros módulos: o serviço busca os dados, estas funções
 * decidem, o serviço grava. Dinheiro em centavos inteiros, quantidade em milésimos.
 */
import { milliToNumeric, toMilli } from './inventory'
import { centsToNumeric, toCents } from './sales'

export const STOCK_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const
export type StockRequestStatusValue = (typeof STOCK_REQUEST_STATUSES)[number]

const MAX_QUANTITY_MILLI = 1_000_000_000 // 1.000.000 unidades
const MAX_PRICE_CENTS = 100_000_000 // R$ 1.000.000,00
const MAX_REQUEST_NOTES = 500

// ============================================================================
// O produto pode ser solicitado, e por quanto
// ============================================================================

export type ProductRequestSettingsPlan =
  | { ok: true; requestable: boolean; professionalPrice: string | null }
  | { ok: false; error: string }

/**
 * Valida "disponível para solicitação" e "preço para profissional".
 *
 * O preço é opcional: produto disponível sem preço sai de graça para o
 * profissional (não gera débito). Zero é um preço — o mesmo que não ter.
 */
export function planProductRequestSettings(draft: {
  requestable: unknown
  professionalPrice?: unknown
}): ProductRequestSettingsPlan {
  if (typeof draft.requestable !== 'boolean') {
    return { ok: false, error: 'Informe se o produto está disponível para solicitação' }
  }

  let professionalPrice: string | null = null
  if (draft.professionalPrice !== null && draft.professionalPrice !== undefined && draft.professionalPrice !== '') {
    const cents = typeof draft.professionalPrice === 'number' ? toCents(draft.professionalPrice) : null
    if (cents === null || cents < 0 || cents > MAX_PRICE_CENTS) {
      return { ok: false, error: 'Preço para profissional inválido' }
    }
    professionalPrice = centsToNumeric(cents)
  }

  return { ok: true, requestable: draft.requestable, professionalPrice }
}

// ============================================================================
// Pedir
// ============================================================================

export type StockRequestDraft = {
  productId: unknown
  professionalId: unknown
  quantity: unknown
  notes?: unknown
}

export type StockRequestRefs = {
  /** O produto pedido, se for do salão. */
  product: { name: string; isActive: boolean; requestable: boolean; professionalPrice: string | null } | null
  /** O profissional que vai levar, se for do salão. */
  professional: { isActive: boolean } | null
  /**
   * Para quem o usuário pode pedir. NULL = qualquer profissional do salão (quem
   * movimenta o estoque). Senão, só os vínculos de profissional dele.
   */
  allowedProfessionalIds: ReadonlySet<string> | null
}

export type StockRequestPlan =
  | {
      ok: true
      productId: string
      professionalId: string
      /** Nome do produto na hora do pedido. */
      description: string
      quantity: string
      /** Preço para profissional na hora do pedido. */
      unitPrice: string
      totalAmount: string
      notes: string | null
    }
  | { ok: false; error: string }

/**
 * Valida uma solicitação.
 *
 *   - Só produto ativo e marcado como "disponível para solicitação".
 *   - Quem não movimenta o estoque só pede para si mesmo.
 *   - O preço é o do produto AGORA, copiado para a solicitação: mudar o preço
 *     depois não muda o que já foi pedido.
 *   - Não confere saldo: quem aprova é quem olha a prateleira.
 */
export function planStockRequest(draft: StockRequestDraft, refs: StockRequestRefs): StockRequestPlan {
  if (typeof draft.productId !== 'string' || !refs.product) return { ok: false, error: 'Escolha o produto' }
  if (!refs.product.isActive) return { ok: false, error: 'Produto inativo' }
  if (!refs.product.requestable) return { ok: false, error: 'Este produto não está disponível para solicitação' }

  if (typeof draft.professionalId !== 'string' || !refs.professional) {
    return { ok: false, error: 'Escolha o profissional' }
  }
  if (!refs.professional.isActive) return { ok: false, error: 'Profissional inativo' }
  if (refs.allowedProfessionalIds && !refs.allowedProfessionalIds.has(draft.professionalId)) {
    return { ok: false, error: 'Você só pode solicitar para você mesmo' }
  }

  const quantityMilli = typeof draft.quantity === 'number' ? toMilli(draft.quantity) : null
  if (quantityMilli === null || quantityMilli <= 0 || quantityMilli > MAX_QUANTITY_MILLI) {
    return { ok: false, error: 'Informe uma quantidade maior que zero' }
  }

  const notes = typeof draft.notes === 'string' ? draft.notes.trim() : ''
  if (notes.length > MAX_REQUEST_NOTES) {
    return { ok: false, error: `A observação aceita no máximo ${MAX_REQUEST_NOTES} caracteres` }
  }

  const priceCents = Math.max(0, toCents(refs.product.professionalPrice) ?? 0)
  const totalCents = Math.round((quantityMilli * priceCents) / 1000)

  return {
    ok: true,
    productId: draft.productId,
    professionalId: draft.professionalId,
    description: refs.product.name,
    quantity: milliToNumeric(quantityMilli),
    unitPrice: centsToNumeric(priceCents),
    totalAmount: centsToNumeric(totalCents),
    notes: notes || null,
  }
}

// ============================================================================
// Decidir
// ============================================================================

export type StockRequestState = {
  status: StockRequestStatusValue
  /** numeric(12,3). */
  quantity: string
  /** numeric(12,2). */
  totalAmount: string
  description: string
}

export type StockRequestApproval =
  | {
      ok: true
      /**
       * A saída no estoque, negativa. NULL = o produto não tem controle de estoque:
       * a aprovação só gera o débito.
       */
      movementQuantity: string | null
      /**
       * O débito no extrato de comissões (vale). NULL = solicitação sem valor, ou o
       * salão não usa comissões: nada a debitar.
       */
      debit: { amount: string; notes: string } | null
    }
  | { ok: false; error: string }

/**
 * O que a aprovação de uma solicitação gera.
 *
 * Aprovar não confere saldo: como na venda, o produto já saiu da prateleira — o
 * saldo fica negativo e a tela avisa.
 */
export function planStockRequestApproval(
  request: StockRequestState,
  context: { trackStock: boolean; commissionsEnabled: boolean }
): StockRequestApproval {
  if (request.status !== 'pending') return { ok: false, error: 'Esta solicitação já foi decidida' }

  const quantityMilli = toMilli(request.quantity) ?? 0
  if (quantityMilli <= 0) return { ok: false, error: 'Solicitação sem quantidade' }

  const totalCents = toCents(request.totalAmount) ?? 0

  return {
    ok: true,
    movementQuantity: context.trackStock ? milliToNumeric(-quantityMilli) : null,
    debit:
      context.commissionsEnabled && totalCents > 0
        ? { amount: centsToNumeric(totalCents), notes: requestDebitNotes(request) }
        : null,
  }
}

/** "Retirada de produto: 2 × Shampoo 1L". É o texto do vale no extrato. */
export function requestDebitNotes(request: { quantity: string; description: string }): string {
  const quantity = Number(request.quantity).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
  return `Retirada de produto: ${quantity} × ${request.description}`.slice(0, 500)
}

/** Recusar. Devolve o motivo se não pode. */
export function stockRequestRejectBlocker(request: { status: StockRequestStatusValue }): string | null {
  return request.status === 'pending' ? null : 'Esta solicitação já foi decidida'
}

/**
 * Excluir a solicitação. Pendente e recusada saem sem deixar nada. Aprovada desfaz
 * a saída no estoque e o débito — por isso não pode quando o débito já entrou num
 * pagamento de comissão: o profissional já foi descontado. Devolve o motivo se não
 * pode.
 */
export function stockRequestDeleteBlocker(request: {
  status: StockRequestStatusValue
  /** O débito desta solicitação já foi quitado num pagamento de comissão. */
  debitPaid: boolean
}): string | null {
  if (request.status === 'approved' && request.debitPaid) {
    return 'O débito desta retirada já entrou num pagamento de comissão. Estorne o pagamento antes de excluir'
  }
  return null
}
