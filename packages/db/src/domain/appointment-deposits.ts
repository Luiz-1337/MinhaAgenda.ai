/**
 * Sinal do agendamento — regra pura, sem I/O (docs/ROADMAP.md, fase 8, fatia 8a).
 *
 * Sem pagamento online: o cliente paga o sinal por PIX direto ao salão, e alguém
 * do salão marca que recebeu. O sistema só controla — não vê o dinheiro.
 *
 * A configuração do sinal já existia (`salons.settings.advance_payment`, que a IA
 * do WhatsApp usa para pedir o PIX). Aqui ela é lida do mesmo lugar.
 *
 * Fatia 8b: o sinal RECEBIDO é abatido na comanda do atendimento, como um
 * pagamento a mais (`planDepositCredit`). Abatido, ele fica preso à comanda.
 */

import { centsToNumeric } from './sales'

export const DEPOSIT_STATUSES = ['pending', 'received', 'waived'] as const

export type DepositStatus = (typeof DEPOSIT_STATUSES)[number]

export const DEPOSIT_STATUS_LABELS: Record<DepositStatus, string> = {
  pending: 'Aguardando sinal',
  received: 'Sinal recebido',
  waived: 'Sinal dispensado',
}

export type DepositSource = 'online' | 'panel'

/** Teto do sinal, em centavos. É o mesmo do CHECK do banco. */
export const DEPOSIT_MAX_CENTS = 100000 * 100

/** O que o salão configurou para o sinal. */
export type AdvancePaymentConfig = {
  amountCents: number
  pixKey: string
  /** Em nome de quem está a chave. NULL = não informado. */
  pixName: string | null
}

/**
 * Lê o sinal de `salons.settings` cru. NULL = o salão não pede sinal: desligado,
 * sem valor ou sem chave PIX (a mesma condição que a IA usa). Nunca lança.
 */
export function parseAdvancePayment(settings: unknown): AdvancePaymentConfig | null {
  if (!settings || typeof settings !== 'object') return null
  const raw = (settings as Record<string, unknown>).advance_payment
  if (!raw || typeof raw !== 'object') return null
  const config = raw as Record<string, unknown>

  if (config.enabled !== true) return null
  const amount = typeof config.amount === 'number' ? config.amount : Number.NaN
  const amountCents = Math.round(amount * 100)
  if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > DEPOSIT_MAX_CENTS) return null

  const pixKey = typeof config.pix_key === 'string' ? config.pix_key.trim() : ''
  if (!pixKey) return null
  const pixName = typeof config.pix_name === 'string' && config.pix_name.trim() ? config.pix_name.trim() : null

  return { amountCents, pixKey, pixName }
}

export type DepositAmountPlan = { ok: true; amountCents: number } | { ok: false; error: string }

/** Valida o valor de um sinal lançado à mão, em centavos. */
export function planDepositAmount(amountCents: unknown): DepositAmountPlan {
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, error: 'Informe o valor do sinal' }
  }
  if (amountCents > DEPOSIT_MAX_CENTS) return { ok: false, error: 'O valor do sinal é alto demais' }
  return { ok: true, amountCents }
}

export const DEPOSIT_ACTIONS = ['receive', 'waive', 'reopen'] as const

export type DepositAction = (typeof DEPOSIT_ACTIONS)[number]

export type DepositTransition = { ok: true; status: DepositStatus } | { ok: false; error: string }

/**
 * Para onde o sinal vai:
 *   - receber: de "aguardando" ou "dispensado" para "recebido";
 *   - dispensar: só de "aguardando" (o recebido tem que ser reaberto antes);
 *   - reabrir: de "recebido" ou "dispensado" de volta para "aguardando".
 */
export function planDepositTransition(
  current: DepositStatus,
  action: DepositAction,
  /** O sinal já foi abatido numa comanda faturada (fatia 8b). */
  applied = false
): DepositTransition {
  if (applied) {
    return { ok: false, error: 'Este sinal já foi abatido numa comanda. Reabra a comanda antes de mexer nele' }
  }
  if (action === 'receive') {
    if (current === 'received') return { ok: false, error: 'Este sinal já está marcado como recebido' }
    return { ok: true, status: 'received' }
  }
  if (action === 'waive') {
    if (current === 'waived') return { ok: false, error: 'Este sinal já está dispensado' }
    if (current === 'received') {
      return { ok: false, error: 'Este sinal já foi recebido. Reabra antes de dispensar' }
    }
    return { ok: true, status: 'waived' }
  }
  if (current === 'pending') return { ok: false, error: 'Este sinal já está aguardando' }
  return { ok: true, status: 'pending' }
}

export type DepositCreditPlan =
  | {
      ok: true
      /** Os sinais abatidos nesta comanda. Vazio = nada a abater. */
      depositIds: string[]
      /** O pagamento que o abatimento vira. NULL = nada a abater. */
      payment: { paymentMethodId: string; amount: number } | null
      amountCents: number
    }
  | { ok: false; error: string }

/**
 * O abatimento do sinal no faturamento da comanda (fatia 8b).
 *
 * O sinal recebido entra como UM pagamento a mais, na forma que quem fatura
 * escolheu (o dinheiro já chegou, por PIX). Sem forma escolhida, nada é abatido
 * e o sinal continua livre. Abate-se tudo ou nada: sinal maior que o total da
 * comanda é erro — sobraria troco, que não existe aqui.
 */
export function planDepositCredit(input: {
  /** Sinais RECEBIDOS e ainda não abatidos dos agendamentos da comanda. */
  deposits: readonly { id: string; amountCents: number }[]
  totalCents: number
  /** A forma de pagamento escolhida para o abatimento. Vazio = não abater. */
  paymentMethodId: string | null | undefined
}): DepositCreditPlan {
  if (!input.paymentMethodId) return { ok: true, depositIds: [], payment: null, amountCents: 0 }

  if (input.deposits.length === 0) {
    return { ok: false, error: 'Esta comanda não tem sinal recebido para abater' }
  }

  const amountCents = input.deposits.reduce((sum, deposit) => sum + deposit.amountCents, 0)
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, error: 'O sinal desta comanda tem valor inválido' }
  }
  if (amountCents > input.totalCents) {
    const amount = centsToNumeric(amountCents).replace('.', ',')
    return {
      ok: false,
      error: `O sinal recebido (R$ ${amount}) passa do total da comanda. Fature sem abater o sinal`,
    }
  }

  return {
    ok: true,
    depositIds: input.deposits.map((deposit) => deposit.id),
    payment: { paymentMethodId: input.paymentMethodId, amount: amountCents / 100 },
    amountCents,
  }
}
