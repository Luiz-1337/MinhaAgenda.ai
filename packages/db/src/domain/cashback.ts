/**
 * Cashback — regra pura, sem I/O (docs/ROADMAP.md, fase 6, fatia 6a).
 *
 * O cliente ganha crédito quando uma comanda é faturada e usa esse crédito para
 * pagar parte de outra. O saldo é a soma do extrato (ganhos positivos, resgates
 * negativos, ajustes com sinal) — não há coluna de saldo para sair de sincronia.
 *
 * Resgate não é pagamento: não gera conta a receber nem taxa. É quanto da comanda
 * o salão deixou de receber.
 *
 * Mesmo desenho dos outros módulos: o serviço busca os dados, estas funções
 * decidem, o serviço grava. Dinheiro em centavos inteiros.
 */
import { centsToNumeric, toCents } from './sales'

export type CashbackRateKind = 'percent' | 'fixed'

const MAX_CASHBACK_VALUE_CENTS = 100_000_000 // R$ 1.000.000,00
const MAX_REASON_LENGTH = 200

// ============================================================================
// Configuração
// ============================================================================

export type CashbackSettingsDraft = {
  isEnabled: boolean
  defaultKind: CashbackRateKind
  /** Percentual (0 a 100) ou valor fixo por unidade, conforme `defaultKind`. */
  defaultValue: number
  /** Saldo mínimo para o cliente poder resgatar. */
  minRedeem: number
}

export type CashbackSettingsPlan =
  | {
      ok: true
      settings: { isEnabled: boolean; defaultKind: CashbackRateKind; defaultValue: string; minRedeem: string }
    }
  | { ok: false; error: string }

function planRate(kind: unknown, value: unknown): { ok: true; kind: CashbackRateKind; value: string } | { ok: false; error: string } {
  if (kind !== 'percent' && kind !== 'fixed') return { ok: false, error: 'Tipo de cashback inválido' }

  const cents = toCents(typeof value === 'number' || typeof value === 'string' ? value : null)
  if (cents === null || cents < 0 || cents > MAX_CASHBACK_VALUE_CENTS) {
    return { ok: false, error: 'Valor de cashback inválido' }
  }
  // Em percentual, "centavos" são centésimos de ponto: 100% = 10000.
  if (kind === 'percent' && cents > 10_000) {
    return { ok: false, error: 'O percentual de cashback vai de 0 a 100' }
  }
  return { ok: true, kind, value: centsToNumeric(cents) }
}

export function planCashbackSettings(draft: CashbackSettingsDraft): CashbackSettingsPlan {
  const rate = planRate(draft.defaultKind, draft.defaultValue)
  if (!rate.ok) return rate

  const minCents = toCents(draft.minRedeem)
  if (minCents === null || minCents < 0 || minCents > MAX_CASHBACK_VALUE_CENTS) {
    return { ok: false, error: 'Valor mínimo para resgate inválido' }
  }

  return {
    ok: true,
    settings: {
      isEnabled: draft.isEnabled === true,
      defaultKind: rate.kind,
      defaultValue: rate.value,
      minRedeem: centsToNumeric(minCents),
    },
  }
}

/** A regra de um serviço ou produto. Valor 0 = usa o padrão do salão. */
export function planCashbackRule(draft: {
  kind: unknown
  value: unknown
  isActive: unknown
}): { ok: true; rule: { kind: CashbackRateKind; value: string; isActive: boolean } } | { ok: false; error: string } {
  const rate = planRate(draft.kind, draft.value)
  if (!rate.ok) return rate
  return { ok: true, rule: { kind: rate.kind, value: rate.value, isActive: draft.isActive !== false } }
}

// ============================================================================
// Ganho
// ============================================================================

export type CashbackRate = { kind: CashbackRateKind; value: string | number }

/**
 * A taxa que vale para um item: a regra dele, se tiver valor; senão o padrão do
 * salão. Regra inativa = o item não dá cashback (NULL).
 */
export function effectiveCashbackRate(
  defaults: CashbackRate,
  rule: { kind: CashbackRateKind; value: string | number; isActive: boolean } | null | undefined
): CashbackRate | null {
  if (rule && !rule.isActive) return null
  if (rule && (toCents(rule.value) ?? 0) > 0) return { kind: rule.kind, value: rule.value }
  return (toCents(defaults.value) ?? 0) > 0 ? defaults : null
}

/**
 * Quanto um item rende de cashback, em centavos.
 *
 * Percentual: sobre a base (o total do item, já sem o desconto e sem a parte paga
 * com cashback). Fixo: o valor por unidade × quantidade — mas nunca mais que a
 * base: item de graça não rende, e não se devolve mais do que se cobrou.
 */
export function cashbackForItem(input: { rate: CashbackRate | null; baseCents: number; quantity: number }): number {
  if (!input.rate || input.baseCents <= 0) return 0
  const valueCents = toCents(input.rate.value) ?? 0
  if (valueCents <= 0) return 0

  if (input.rate.kind === 'percent') {
    return Math.min(input.baseCents, Math.round((input.baseCents * valueCents) / 10_000))
  }

  const quantity = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 0
  return Math.min(input.baseCents, Math.round(valueCents * quantity))
}

export type CashbackSaleItem = {
  id: string
  kind: string
  serviceId: string | null
  productId: string | null
  /** numeric(12,2) e numeric(10,3) do banco. */
  total: string
  quantity: string
}

export type CashbackRuleForItem = { kind: CashbackRateKind; value: string; isActive: boolean }

/**
 * Os ganhos de uma comanda faturada: um por item de serviço ou produto que rende.
 *
 * A parte da comanda paga COM cashback não rende cashback: a base de cada item é
 * reduzida na mesma proporção (comanda de R$ 100 com R$ 20 de cashback rende sobre
 * R$ 80). Item de pacote, de assinatura e item "do pacote" (que vale zero) não
 * rendem.
 */
export function planSaleCashbackEarn(input: {
  defaults: CashbackRate
  items: readonly CashbackSaleItem[]
  serviceRules: ReadonlyMap<string, CashbackRuleForItem>
  productRules: ReadonlyMap<string, CashbackRuleForItem>
  /** Total da comanda e quanto dela foi pago com cashback. */
  totalCents: number
  redeemedCents: number
}): { saleItemId: string; amount: string }[] {
  const total = Math.max(0, input.totalCents)
  const charged = Math.max(0, total - Math.max(0, input.redeemedCents))
  const earned: { saleItemId: string; amount: string }[] = []

  for (const item of input.items) {
    const rule =
      item.kind === 'service' && item.serviceId
        ? input.serviceRules.get(item.serviceId)
        : item.kind === 'product' && item.productId
          ? input.productRules.get(item.productId)
          : undefined
    if (item.kind !== 'service' && item.kind !== 'product') continue

    const itemCents = Math.max(0, toCents(item.total) ?? 0)
    const baseCents = total > 0 ? Math.round((itemCents * charged) / total) : 0

    const cents = cashbackForItem({
      rate: effectiveCashbackRate(input.defaults, rule ?? null),
      baseCents,
      quantity: Number(item.quantity),
    })
    if (cents > 0) earned.push({ saleItemId: item.id, amount: centsToNumeric(cents) })
  }

  return earned
}

// ============================================================================
// Resgate
// ============================================================================

/**
 * available     = tem saldo e ele alcança o mínimo para resgate
 * below_minimum = tem saldo, mas abaixo do mínimo
 * empty         = sem saldo
 */
export type CashbackStatus = 'available' | 'below_minimum' | 'empty'

export function cashbackStatus(input: { balanceCents: number; minRedeemCents: number }): CashbackStatus {
  if (input.balanceCents <= 0) return 'empty'
  return input.balanceCents >= input.minRedeemCents ? 'available' : 'below_minimum'
}

function money(cents: number): string {
  return `R$ ${centsToNumeric(cents).replace('.', ',')}`
}

/**
 * Confere o uso de cashback numa comanda que está sendo faturada.
 *
 * Só com o cashback ligado no salão; o saldo tem de alcançar o mínimo para
 * resgate; e não se usa mais do que o saldo nem mais do que o total da comanda.
 */
export function planCashbackRedeem(input: {
  /** Módulo ligado E cashback ativado nas configurações do salão. */
  enabled: boolean
  requested: number
  balanceCents: number
  minRedeemCents: number
  totalCents: number
}): { ok: true; redeemCents: number } | { ok: false; error: string } {
  const requestedCents = toCents(input.requested)
  if (requestedCents === null || requestedCents < 0) return { ok: false, error: 'Valor de cashback inválido' }
  if (requestedCents === 0) return { ok: true, redeemCents: 0 }

  if (!input.enabled) return { ok: false, error: 'O cashback não está ativo neste salão' }
  if (input.balanceCents <= 0) return { ok: false, error: 'O cliente não tem saldo de cashback' }
  if (input.balanceCents < input.minRedeemCents) {
    return {
      ok: false,
      error: `O saldo de cashback (${money(input.balanceCents)}) está abaixo do mínimo para resgate (${money(input.minRedeemCents)})`,
    }
  }
  if (requestedCents > input.balanceCents) {
    return { ok: false, error: `O cliente só tem ${money(input.balanceCents)} de cashback` }
  }
  if (requestedCents > input.totalCents) {
    return { ok: false, error: 'O cashback usado passa do total da comanda' }
  }
  return { ok: true, redeemCents: requestedCents }
}

/**
 * Por que a comanda não pode ser reaberta: o cashback que ela gerou já foi usado.
 * Reabrir apaga o ganho (e devolve o resgate) dela; se o saldo do cliente ficasse
 * negativo, alguém já gastou esse crédito em outra comanda.
 */
export function cashbackReopenBlocker(input: {
  /** Saldo do cliente hoje. */
  balanceCents: number
  /** O que esta comanda somou ao saldo: ganhos − resgate. */
  saleNetCents: number
}): string | null {
  if (input.balanceCents - input.saleNetCents >= 0) return null
  return 'O cashback gerado por esta comanda já foi usado pelo cliente. Reabra antes a comanda em que ele foi usado, ou ajuste o saldo em Cashback'
}

// ============================================================================
// Ajuste manual
// ============================================================================

/** Crédito (positivo) ou débito (negativo) lançado à mão, com motivo. */
export function planCashbackAdjustment(input: {
  amount: unknown
  reason: unknown
  balanceCents: number
}): { ok: true; amount: string; reason: string } | { ok: false; error: string } {
  const cents = toCents(typeof input.amount === 'number' || typeof input.amount === 'string' ? input.amount : null)
  if (cents === null || cents === 0 || Math.abs(cents) > MAX_CASHBACK_VALUE_CENTS) {
    return { ok: false, error: 'Informe o valor do ajuste' }
  }

  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (!reason) return { ok: false, error: 'Informe o motivo do ajuste' }
  if (reason.length > MAX_REASON_LENGTH) return { ok: false, error: 'Motivo muito longo' }

  if (input.balanceCents + cents < 0) {
    return { ok: false, error: `O cliente só tem ${money(Math.max(0, input.balanceCents))} de cashback` }
  }
  return { ok: true, amount: centsToNumeric(cents), reason }
}
