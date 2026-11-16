/**
 * Regra de comissão — pura, sem I/O (docs/ROADMAP.md, fase 3, fatia 3a).
 *
 * O serviço (services/commissions.service.ts) busca a comanda, as regras e os
 * pagamentos, chama `planSaleCommissions` e grava o que ela devolve. Como em
 * domain/sales.ts: não há banco de teste, então o que decide dinheiro fica aqui.
 *
 * A fórmula é a que a auditoria da Belasis confirmou sobre dados reais (RN-COM):
 *
 *   disponível = valor × %comissão − valor × %taxa da comanda × %comissão
 *
 * com as variações de quem arca com a taxa e com o desconto (RN-COM-CFG).
 *
 * DINHEIRO EM CENTAVOS INTEIROS e percentual em centésimos de ponto (50% = 5000),
 * pelo mesmo motivo de domain/sales.ts.
 */
import type { CommissionDateBasis, CommissionRateKind, CommissionShareMode } from '../schema'
import { brazilToday } from './finance'
import { centsToNumeric, toCents } from './sales'

// ============================================================================
// Regras gerais: salão e sobrescrita por profissional
// ============================================================================

export const COMMISSION_DATE_BASES: readonly CommissionDateBasis[] = ['competence', 'availability']
export const COMMISSION_SHARE_MODES: readonly CommissionShareMode[] = ['proportional', 'salon', 'professional', 'split']

export type CommissionSettings = {
  /** Quando a comissão fica disponível. */
  dateBasis: CommissionDateBasis
  /** Quem paga a taxa da forma de pagamento. */
  feeMode: CommissionShareMode
  /** Quem arca com o desconto dado na venda. */
  discountMode: CommissionShareMode
}

/**
 * Padrão do sistema, igual ao que a auditoria encontrou configurado no salão:
 * competência, taxa proporcional à comissão, desconto por conta do salão.
 */
export const DEFAULT_COMMISSION_SETTINGS: CommissionSettings = {
  dateBasis: 'competence',
  feeMode: 'proportional',
  discountMode: 'salon',
}

/** Linha crua de `commission_settings`. NULL em um campo = não define aquele campo. */
export type CommissionSettingsRow = {
  dateBasis: unknown
  feeMode: unknown
  discountMode: unknown
}

export function isCommissionDateBasis(value: unknown): value is CommissionDateBasis {
  return typeof value === 'string' && (COMMISSION_DATE_BASES as readonly string[]).includes(value)
}

export function isCommissionShareMode(value: unknown): value is CommissionShareMode {
  return typeof value === 'string' && (COMMISSION_SHARE_MODES as readonly string[]).includes(value)
}

/**
 * Regras efetivas de um profissional: o que ele define → o que o salão define → o
 * padrão do sistema, campo a campo. Valor desconhecido no banco é tratado como
 * "não define": cai para o próximo nível em vez de quebrar o cálculo.
 */
export function resolveCommissionSettings(
  salon: CommissionSettingsRow | null | undefined,
  professional?: CommissionSettingsRow | null
): CommissionSettings {
  const pick = <T,>(guard: (value: unknown) => value is T, field: keyof CommissionSettingsRow, fallback: T): T => {
    const own = professional?.[field]
    if (guard(own)) return own
    const shared = salon?.[field]
    if (guard(shared)) return shared
    return fallback
  }

  return {
    dateBasis: pick(isCommissionDateBasis, 'dateBasis', DEFAULT_COMMISSION_SETTINGS.dateBasis),
    feeMode: pick(isCommissionShareMode, 'feeMode', DEFAULT_COMMISSION_SETTINGS.feeMode),
    discountMode: pick(isCommissionShareMode, 'discountMode', DEFAULT_COMMISSION_SETTINGS.discountMode),
  }
}

// ============================================================================
// Quanto o item paga: percentual ou valor fixo
// ============================================================================

/** Regra crua (linha de `commission_rules`, ou o que veio do formulário). */
export type CommissionRuleValue = { kind: CommissionRateKind; value: string | number }

/** Regra já validada, em inteiros. */
export type CommissionRate =
  | { kind: 'percent'; basisPoints: number }
  | { kind: 'fixed'; cents: number }

/** De onde veio a regra usada — aparece na tela de configuração. */
export type CommissionRateSource = 'professional_item' | 'salon_item' | 'professional_default' | 'none'

const MAX_FIXED_COMMISSION_CENTS = 100_000_000 // R$ 1.000.000,00

/** Lê uma regra crua. NULL = regra ausente ou inválida. */
export function parseCommissionRate(rule: CommissionRuleValue | null | undefined): CommissionRate | null {
  if (!rule) return null

  if (rule.kind === 'percent') {
    const basisPoints = Math.round(Number(rule.value) * 100)
    if (!Number.isFinite(basisPoints) || basisPoints < 0 || basisPoints > 10_000) return null
    return { kind: 'percent', basisPoints }
  }

  if (rule.kind === 'fixed') {
    const cents = toCents(rule.value)
    if (cents === null || cents < 0 || cents > MAX_FIXED_COMMISSION_CENTS) return null
    return { kind: 'fixed', cents }
  }

  return null
}

/**
 * Qual regra vale para um item, do mais específico para o mais geral:
 *
 *   1. exceção do profissional para aquele item;
 *   2. padrão do salão para aquele item;
 *   3. percentual geral do profissional (`professionals.commission_rate`);
 *   4. nada: comissão zero.
 *
 * O padrão do item vem ANTES do percentual geral do profissional de propósito: é o
 * que deixa dizer "produto paga 10%" ou "estacionamento não paga comissão" para
 * todo mundo de uma vez. Quem foge disso ganha uma exceção (nível 1).
 */
export function resolveCommissionRate(input: {
  professionalRule?: CommissionRuleValue | null
  salonRule?: CommissionRuleValue | null
  professionalDefaultPercent?: string | number | null
}): { rate: CommissionRate; source: CommissionRateSource } {
  const own = parseCommissionRate(input.professionalRule)
  if (own) return { rate: own, source: 'professional_item' }

  const shared = parseCommissionRate(input.salonRule)
  if (shared) return { rate: shared, source: 'salon_item' }

  const general = parseCommissionRate(
    input.professionalDefaultPercent === null || input.professionalDefaultPercent === undefined
      ? null
      : { kind: 'percent', value: input.professionalDefaultPercent }
  )
  if (general && general.kind === 'percent' && general.basisPoints > 0) {
    return { rate: general, source: 'professional_default' }
  }

  return { rate: { kind: 'percent', basisPoints: 0 }, source: 'none' }
}

/** Como a regra é gravada no extrato e mostrada na tela. */
export function commissionRateToColumns(rate: CommissionRate): { rateKind: CommissionRateKind; rateValue: string } {
  return rate.kind === 'percent'
    ? { rateKind: 'percent', rateValue: (rate.basisPoints / 100).toFixed(2) }
    : { rateKind: 'fixed', rateValue: centsToNumeric(rate.cents) }
}

export type CommissionRulePlan =
  | { ok: true; kind: CommissionRateKind; value: string }
  | { ok: false; error: string }

/** Valida uma regra vinda do formulário e devolve o que gravar. */
export function planCommissionRule(draft: { kind: unknown; value: unknown }): CommissionRulePlan {
  if (draft.kind !== 'percent' && draft.kind !== 'fixed') {
    return { ok: false, error: 'Tipo de comissão inválido' }
  }
  if (typeof draft.value !== 'number' || !Number.isFinite(draft.value) || draft.value < 0) {
    return { ok: false, error: 'Informe um valor de comissão válido' }
  }
  if (draft.kind === 'percent' && draft.value > 100) {
    return { ok: false, error: 'A comissão em percentual vai de 0 a 100' }
  }

  const rate = parseCommissionRate({ kind: draft.kind, value: draft.value })
  if (!rate) return { ok: false, error: 'Informe um valor de comissão válido' }

  const columns = commissionRateToColumns(rate)
  return { ok: true, kind: columns.rateKind, value: columns.rateValue }
}

// ============================================================================
// O cálculo
// ============================================================================

export type CommissionSaleItem = {
  id: string
  serviceId: string | null
  productId: string | null
  professionalId: string | null
  /** numeric(10,3) do banco. */
  quantity: string | number
  discountAmount: string | number
  total: string | number
}

export type CommissionRuleRow = {
  /** NULL = padrão do salão para o item. */
  professionalId: string | null
  serviceId: string | null
  productId: string | null
  kind: CommissionRateKind
  value: string | number
}

export type CommissionSaleInput = {
  sale: {
    saleDate: Date
    total: string | number
    amountDue: string | number
  }
  items: readonly CommissionSaleItem[]
  /** Todos os pagamentos gravados da comanda. */
  payments: readonly { feeAmount: string | number; settlesOn: string }[]
  salonSettings: CommissionSettingsRow | null
  /** Profissionais DESTE salão que aparecem nos itens. */
  professionals: ReadonlyMap<string, { commissionRate: string | number | null; settings: CommissionSettingsRow | null }>
  rules: readonly CommissionRuleRow[]
}

export type PlannedCommissionEntry = {
  saleItemId: string
  professionalId: string
  role: 'professional'
  baseAmount: string
  rateKind: CommissionRateKind
  rateValue: string
  grossAmount: string
  feeAmount: string
  amount: string
  competenceDate: string
  releaseDate: string | null
}

function ruleKey(professionalId: string | null, serviceId: string | null, productId: string | null): string {
  return `${professionalId ?? '*'}|${serviceId ? `s:${serviceId}` : `p:${productId}`}`
}

/** Comissão do item antes da taxa, e a base sobre a qual ela foi calculada. */
function grossCommission(input: {
  rate: CommissionRate
  quantity: number
  /** Valor do item antes do desconto. */
  grossCents: number
  discountCents: number
  /** Valor do item depois do desconto — o que o cliente paga. */
  totalCents: number
  discountMode: CommissionShareMode
}): { baseCents: number; commissionCents: number } {
  const { rate, grossCents, discountCents, totalCents, discountMode } = input

  // Cheia = como se não houvesse desconto.
  const full =
    rate.kind === 'percent'
      ? Math.round((grossCents * rate.basisPoints) / 10_000)
      : Math.round(rate.cents * input.quantity)

  switch (discountMode) {
    // O salão absorve o desconto: o profissional recebe sobre o valor cheio.
    case 'salon':
      return { baseCents: grossCents, commissionCents: full }

    // O desconto reduz a comissão na mesma proporção em que reduz o preço.
    case 'proportional': {
      const commissionCents =
        rate.kind === 'percent'
          ? Math.round((totalCents * rate.basisPoints) / 10_000)
          : grossCents > 0
            ? Math.round((full * totalCents) / grossCents)
            : 0
      return { baseCents: totalCents, commissionCents }
    }

    // O desconto sai inteiro da comissão.
    case 'professional':
      return { baseCents: grossCents, commissionCents: Math.max(0, full - discountCents) }

    // Metade do desconto sai da comissão.
    case 'split':
      return { baseCents: grossCents, commissionCents: Math.max(0, full - Math.round(discountCents / 2)) }
  }
}

/** Parcela da taxa da forma de pagamento que cabe ao profissional, em centavos. */
function feeShare(input: {
  rate: CommissionRate
  feeMode: CommissionShareMode
  /** Taxa da comanda atribuída a este item (pode ter fração de centavo). */
  itemFee: number
  totalCents: number
  commissionCents: number
}): number {
  const { rate, feeMode, itemFee, totalCents, commissionCents } = input

  let share: number
  switch (feeMode) {
    case 'salon':
      share = 0
      break
    case 'professional':
      share = itemFee
      break
    case 'split':
      share = itemFee / 2
      break
    case 'proportional': {
      // Mesma fração que a comissão representa do item: 50% de comissão → 50% da taxa.
      const fraction =
        rate.kind === 'percent'
          ? rate.basisPoints / 10_000
          : totalCents > 0
            ? Math.min(1, commissionCents / totalCents)
            : 0
      share = itemFee * fraction
      break
    }
  }

  // A taxa nunca deixa a comissão negativa.
  return Math.min(Math.round(share), commissionCents)
}

/**
 * Calcula a comissão de cada item de uma comanda FATURADA.
 *
 * Uma linha por item que tem profissional — inclusive quando a comissão dá zero
 * (item de cortesia, regra de 0%): a linha no extrato é o que mostra que o
 * atendimento foi contado.
 *
 * A taxa da comanda é a soma das taxas dos pagamentos, repartida entre os itens
 * pelo valor de cada um. Com mais de uma forma de pagamento a taxa efetiva é a
 * média ponderada — é o "% entre parênteses" do extrato da Belasis.
 *
 * Disponibilidade:
 *   - 'competence': no dia da comanda (calendário de Brasília);
 *   - 'availability': quando o salão recebe — o último dia de recebimento entre os
 *     pagamentos. Enquanto houver valor em aberto (fiado), fica sem data.
 */
export function planSaleCommissions(input: CommissionSaleInput): PlannedCommissionEntry[] {
  const saleTotalCents = toCents(input.sale.total) ?? 0
  const amountDueCents = toCents(input.sale.amountDue) ?? 0
  const saleFeeCents = input.payments.reduce((sum, payment) => sum + (toCents(payment.feeAmount) ?? 0), 0)

  const competenceDate = brazilToday(input.sale.saleDate)
  const lastSettlement = input.payments.reduce<string | null>(
    (latest, payment) => (latest === null || payment.settlesOn > latest ? payment.settlesOn : latest),
    null
  )

  const rules = new Map<string, CommissionRuleRow>()
  for (const rule of input.rules) {
    rules.set(ruleKey(rule.professionalId, rule.serviceId, rule.productId), rule)
  }

  const entries: PlannedCommissionEntry[] = []

  for (const item of input.items) {
    if (!item.professionalId) continue
    if (!item.serviceId && !item.productId) continue

    const professional = input.professionals.get(item.professionalId)
    // Profissional fora do salão não deveria existir num item; sem ele não há regra.
    if (!professional) continue

    const settings = resolveCommissionSettings(input.salonSettings, professional.settings)
    const { rate } = resolveCommissionRate({
      professionalRule: rules.get(ruleKey(item.professionalId, item.serviceId, item.productId)),
      salonRule: rules.get(ruleKey(null, item.serviceId, item.productId)),
      professionalDefaultPercent: professional.commissionRate,
    })

    const totalCents = Math.max(0, toCents(item.total) ?? 0)
    const discountCents = Math.max(0, toCents(item.discountAmount) ?? 0)
    const quantity = Number(item.quantity)

    const { baseCents, commissionCents } = grossCommission({
      rate,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
      grossCents: totalCents + discountCents,
      discountCents,
      totalCents,
      discountMode: settings.discountMode,
    })

    const feeCents = feeShare({
      rate,
      feeMode: settings.feeMode,
      itemFee: saleTotalCents > 0 ? (totalCents * saleFeeCents) / saleTotalCents : 0,
      totalCents,
      commissionCents,
    })

    const releaseDate =
      settings.dateBasis === 'competence'
        ? competenceDate
        : amountDueCents > 0
          ? null
          : (lastSettlement ?? competenceDate)

    entries.push({
      saleItemId: item.id,
      professionalId: item.professionalId,
      role: 'professional',
      baseAmount: centsToNumeric(baseCents),
      ...commissionRateToColumns(rate),
      grossAmount: centsToNumeric(commissionCents),
      feeAmount: centsToNumeric(feeCents),
      amount: centsToNumeric(commissionCents - feeCents),
      competenceDate,
      releaseDate,
    })
  }

  return entries
}

// ============================================================================
// Totais do extrato
// ============================================================================

export type CommissionTotals = {
  /** Soma das bases — o "valor bruto" do rodapé. */
  baseCents: number
  /** Comissões antes da taxa. */
  grossCents: number
  feeCents: number
  /** O que há a receber. */
  amountCents: number
  count: number
}

export function commissionTotals(
  rows: readonly {
    baseAmount: string | number
    grossAmount: string | number
    feeAmount: string | number
    amount: string | number
  }[]
): CommissionTotals {
  const totals: CommissionTotals = { baseCents: 0, grossCents: 0, feeCents: 0, amountCents: 0, count: 0 }

  for (const row of rows) {
    totals.baseCents += toCents(row.baseAmount) ?? 0
    totals.grossCents += toCents(row.grossAmount) ?? 0
    totals.feeCents += toCents(row.feeAmount) ?? 0
    totals.amountCents += toCents(row.amount) ?? 0
    totals.count += 1
  }

  return totals
}
