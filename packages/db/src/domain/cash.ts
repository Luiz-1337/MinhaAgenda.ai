/**
 * Regra do caixa — pura, sem I/O (docs/ROADMAP.md, fase 2, fatia 2e).
 *
 * O caixa responde a uma pergunta de operação: o dinheiro vivo que está na gaveta
 * bate com o que deveria estar? É separado das contas financeiras (domain/
 * finance.ts), que dizem quanto o salão TEM em cada lugar.
 *
 * Mesmo desenho das outras regras: o serviço busca, estas funções decidem, o
 * serviço grava. Dinheiro em centavos inteiros.
 */
import { centsToNumeric, toCents } from './sales'

const MAX_AMOUNT_CENTS = 10_000_000_000 // R$ 100.000.000,00 — cabe em numeric(12,2)

export type CashTotals = {
  openingCents: number
  /** Suprimentos: dinheiro colocado na gaveta (troco, reforço). */
  supplyCents: number
  /** Vendas recebidas em dinheiro durante o período. */
  saleCents: number
  /** Sangrias: dinheiro retirado da gaveta. */
  withdrawalCents: number
}

/** O que deveria estar na gaveta: inicial + suprimentos + vendas − sangrias. */
export function expectedCashCents(totals: CashTotals): number {
  return totals.openingCents + totals.supplyCents + totals.saleCents - totals.withdrawalCents
}

/** Soma os movimentos de um caixa por tipo. `opening` e `amount` vêm como string do banco. */
export function cashTotals(
  openingAmount: string,
  movements: readonly { kind: 'supply' | 'withdrawal' | 'sale'; amount: string }[]
): CashTotals {
  const totals: CashTotals = {
    openingCents: toCents(openingAmount) ?? 0,
    supplyCents: 0,
    saleCents: 0,
    withdrawalCents: 0,
  }

  for (const movement of movements) {
    const cents = toCents(movement.amount) ?? 0
    if (movement.kind === 'supply') totals.supplyCents += cents
    else if (movement.kind === 'sale') totals.saleCents += cents
    else totals.withdrawalCents += cents
  }

  return totals
}

// ============================================================================
// Abrir
// ============================================================================

export type OpenCashPlan = { ok: true; openingAmount: string } | { ok: false; error: string }

/** Abertura: o saldo inicial é o troco que já está na gaveta. Pode ser zero. */
export function planOpenCash(openingAmount: number): OpenCashPlan {
  const cents = toCents(openingAmount)
  if (cents === null || cents < 0 || cents > MAX_AMOUNT_CENTS) {
    return { ok: false, error: 'Informe o saldo inicial do caixa' }
  }
  return { ok: true, openingAmount: centsToNumeric(cents) }
}

// ============================================================================
// Suprimento e sangria
// ============================================================================

export type CashMovementPlan =
  | { ok: true; kind: 'supply' | 'withdrawal'; amount: string; description: string | null }
  | { ok: false; error: string }

/**
 * Suprimento (entra dinheiro) ou sangria (sai dinheiro).
 *
 * Sangria maior que o esperado na gaveta é barrada: não dá para tirar o que não
 * está lá, e deixar passar tornaria o esperado negativo — que não significa nada.
 */
export function planCashMovement(
  input: { kind: 'supply' | 'withdrawal'; amount: number; description?: string | null },
  totals: CashTotals
): CashMovementPlan {
  if (input.kind !== 'supply' && input.kind !== 'withdrawal') {
    return { ok: false, error: 'Tipo de movimento inválido' }
  }

  const cents = toCents(input.amount)
  if (cents === null || cents <= 0 || cents > MAX_AMOUNT_CENTS) {
    return { ok: false, error: 'Informe um valor maior que zero' }
  }

  if (input.kind === 'withdrawal') {
    const available = expectedCashCents(totals)
    if (cents > available) {
      return {
        ok: false,
        error: `A sangria é maior que o dinheiro em caixa (R$ ${centsToNumeric(Math.max(0, available)).replace('.', ',')})`,
      }
    }
  }

  const description = (input.description ?? '').trim().slice(0, 200) || null

  return { ok: true, kind: input.kind, amount: centsToNumeric(cents), description }
}

// ============================================================================
// Fechar
// ============================================================================

export type CloseCashPlan =
  | { ok: true; expectedAmount: string; countedAmount: string; difference: string }
  | { ok: false; error: string }

/**
 * Fechamento: quem fecha conta o dinheiro e informa. A diferença é contado −
 * esperado: positiva é sobra, negativa é falta. Diferença não impede fechar — o
 * objetivo é registrar, não travar a pessoa no fim do dia.
 */
export function planCloseCash(countedAmount: number, totals: CashTotals): CloseCashPlan {
  const countedCents = toCents(countedAmount)
  if (countedCents === null || countedCents < 0 || countedCents > MAX_AMOUNT_CENTS) {
    return { ok: false, error: 'Informe o valor contado no caixa' }
  }

  const expectedCents = expectedCashCents(totals)

  return {
    ok: true,
    expectedAmount: centsToNumeric(expectedCents),
    countedAmount: centsToNumeric(countedCents),
    difference: centsToNumeric(countedCents - expectedCents),
  }
}
