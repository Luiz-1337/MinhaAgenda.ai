/**
 * Regra dos lotes e validades — pura, sem I/O (docs/ROADMAP.md, fase 4, fatia 4c).
 *
 * O lote guarda o que ENTROU com ele. O que RESTA de cada lote não é gravado em
 * lugar nenhum: é calculado a partir do saldo do produto, supondo que sai primeiro
 * o que vence primeiro (PVPS). Consequências:
 *
 *   - a venda em comanda não escolhe lote e não muda de comportamento;
 *   - um acerto de inventário corrige os lotes junto com o saldo;
 *   - a soma do que resta nos lotes nunca passa do saldo do produto.
 *
 * É uma suposição, e a tela diz isso. Se o salão usou primeiro o lote mais novo, o
 * caminho é editar ou excluir o lote.
 *
 * Datas são DIAS DE CALENDÁRIO ("YYYY-MM-DD"), como no financeiro.
 */
import { brazilToday, isCalendarDate } from './finance'
import { milliToNumeric, toMilli } from './inventory'

/** Com quantos dias de antecedência um lote passa a "vencendo". */
export const EXPIRY_WARNING_DAYS = 30

const MAX_QUANTITY_MILLI = 1_000_000_000 // 1.000.000 unidades
const MAX_BATCH_CODE = 60
const MAX_BATCH_NOTES = 500

// ============================================================================
// Cadastro do lote
// ============================================================================

export type BatchDraft = {
  code?: unknown
  manufacturedOn?: unknown
  expiresOn?: unknown
  quantity: unknown
  notes?: unknown
}

export type BatchPlan =
  | {
      ok: true
      code: string | null
      manufacturedOn: string | null
      expiresOn: string | null
      quantity: string
      notes: string | null
    }
  | { ok: false; error: string }

function optionalDate(value: unknown): string | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null
  return isCalendarDate(value) ? value : 'invalid'
}

/**
 * Valida um lote.
 *
 *   - Tem que ter código ou validade: lote sem os dois não diz nada.
 *   - A fabricação não pode ser futura nem depois da validade.
 *   - A validade pode já ter passado: registrar um lote vencido que ainda está na
 *     prateleira é justamente o que faz ele aparecer como vencido.
 *   - A quantidade é o que entrou com o lote, sempre maior que zero.
 */
export function planBatch(draft: BatchDraft, now: Date): BatchPlan {
  const code = typeof draft.code === 'string' ? draft.code.trim() : ''
  if (code.length > MAX_BATCH_CODE) {
    return { ok: false, error: `O código do lote aceita no máximo ${MAX_BATCH_CODE} caracteres` }
  }

  const manufacturedOn = optionalDate(draft.manufacturedOn)
  if (manufacturedOn === 'invalid') return { ok: false, error: 'Data de fabricação inválida' }

  const expiresOn = optionalDate(draft.expiresOn)
  if (expiresOn === 'invalid') return { ok: false, error: 'Data de validade inválida' }

  if (!code && !expiresOn) return { ok: false, error: 'Informe o código do lote ou a validade' }

  if (manufacturedOn && manufacturedOn > brazilToday(now)) {
    return { ok: false, error: 'A fabricação não pode ter data futura' }
  }
  if (manufacturedOn && expiresOn && manufacturedOn > expiresOn) {
    return { ok: false, error: 'A validade não pode ser antes da fabricação' }
  }

  const quantityMilli = typeof draft.quantity === 'number' ? toMilli(draft.quantity) : null
  if (quantityMilli === null || quantityMilli <= 0 || quantityMilli > MAX_QUANTITY_MILLI) {
    return { ok: false, error: 'Informe uma quantidade maior que zero' }
  }

  const notes = typeof draft.notes === 'string' ? draft.notes.trim() : ''
  if (notes.length > MAX_BATCH_NOTES) {
    return { ok: false, error: `A observação aceita no máximo ${MAX_BATCH_NOTES} caracteres` }
  }

  return {
    ok: true,
    code: code || null,
    manufacturedOn,
    expiresOn,
    quantity: milliToNumeric(quantityMilli),
    notes: notes || null,
  }
}

/** O lote informado junto de uma entrada ou de um item de compra tem algum dado? */
export function hasBatchData(draft: { code?: unknown; manufacturedOn?: unknown; expiresOn?: unknown } | null | undefined): boolean {
  if (!draft) return false
  const filled = (value: unknown) => typeof value === 'string' && value.trim().length > 0
  return filled(draft.code) || filled(draft.manufacturedOn) || filled(draft.expiresOn)
}

// ============================================================================
// O que resta em cada lote
// ============================================================================

export type BatchForBalance = {
  id: string
  /** O que entrou com o lote, em milésimos. */
  quantityMilli: number
  expiresOn: string | null
  createdAt: Date
}

/**
 * A ordem em que os lotes são consumidos: vence primeiro, sai primeiro. Lote sem
 * validade não vence — sai por último. No empate, o que foi registrado antes.
 */
export function compareBatchesByConsumption(a: BatchForBalance, b: BatchForBalance): number {
  if (a.expiresOn !== b.expiresOn) {
    if (a.expiresOn === null) return 1
    if (b.expiresOn === null) return -1
    return a.expiresOn < b.expiresOn ? -1 : 1
  }
  const byCreation = a.createdAt.getTime() - b.createdAt.getTime()
  if (byCreation !== 0) return byCreation
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Distribui o saldo de UM produto pelos lotes dele.
 *
 * O que ainda está na prateleira é o que sai por último: o saldo enche os lotes de
 * trás para a frente (do que vence mais tarde para o que vence mais cedo). Lote que
 * fica sem nada foi consumido.
 *
 * Saldo maior que a soma dos lotes: a sobra é estoque sem lote (`unbatchedMilli`) —
 * entrou antes de o salão registrar lotes, ou entrou sem lote. Saldo zerado ou
 * negativo: nenhum lote tem nada.
 */
export function distributeBalance(
  balanceMilli: number,
  batches: readonly BatchForBalance[]
): { remaining: Map<string, number>; unbatchedMilli: number } {
  const remaining = new Map<string, number>()
  let left = Math.max(0, balanceMilli)

  const lastToLeave = [...batches].sort(compareBatchesByConsumption).reverse()
  for (const batch of lastToLeave) {
    const kept = Math.min(left, Math.max(0, batch.quantityMilli))
    remaining.set(batch.id, kept)
    left -= kept
  }

  return { remaining, unbatchedMilli: left }
}

// ============================================================================
// Situação do lote
// ============================================================================

/**
 * depleted  = não resta nada (já saiu)
 * expired   = resta produto e a validade já passou
 * expiring  = resta produto e vence dentro do aviso (hoje inclusive)
 * ok        = resta produto e a validade está longe
 * no_expiry = resta produto e o lote não tem validade
 */
export type BatchStatus = 'depleted' | 'expired' | 'expiring' | 'ok' | 'no_expiry'

/** Dias de calendário de `from` até `to` (negativo = `to` já passou). */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

export function batchStatus(
  input: { remainingMilli: number; expiresOn: string | null },
  today: string,
  warningDays: number = EXPIRY_WARNING_DAYS
): BatchStatus {
  if (input.remainingMilli <= 0) return 'depleted'
  if (input.expiresOn === null) return 'no_expiry'

  // Vence no dia: até o fim do dia da validade o produto ainda vale.
  const days = daysBetween(today, input.expiresOn)
  if (days < 0) return 'expired'
  if (days <= warningDays) return 'expiring'
  return 'ok'
}
