/**
 * Sinal do agendamento — regra pura, sem I/O (docs/ROADMAP.md, fase 8, fatia 8a).
 *
 * Sem pagamento online: o cliente paga o sinal por PIX direto ao salão, e alguém
 * do salão marca que recebeu. O sistema só controla — não vê o dinheiro.
 *
 * A configuração do sinal já existia (`salons.settings.advance_payment`, que a IA
 * do WhatsApp usa para pedir o PIX). Aqui ela é lida do mesmo lugar.
 */

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
export function planDepositTransition(current: DepositStatus, action: DepositAction): DepositTransition {
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
