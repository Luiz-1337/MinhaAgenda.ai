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
import type {
  CommissionAdjustmentKind,
  CommissionAssistantBase,
  CommissionAssistantDeduct,
  CommissionDateBasis,
  CommissionRateKind,
  CommissionRole,
  CommissionShareMode,
} from '../schema'
import { brazilToday, isCalendarDate } from './finance'
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
// Comissão como auxiliar (fatia 3b)
// ============================================================================

export const COMMISSION_ASSISTANT_BASES: readonly CommissionAssistantBase[] = ['gross', 'commission']
export const COMMISSION_ASSISTANT_DEDUCTS: readonly CommissionAssistantDeduct[] = ['professional', 'salon']

/** Linha de `commission_assistant_rules`. */
export type CommissionAssistantRuleRow = {
  /** NULL = padrão do salão para o serviço. */
  professionalId: string | null
  serviceId: string
  kind: CommissionRateKind
  value: string | number
  base: unknown
  deductFrom: unknown
}

/** Regra de auxiliar já validada. */
export type CommissionAssistantRule = {
  rate: CommissionRate
  base: CommissionAssistantBase
  deductFrom: CommissionAssistantDeduct
}

function isAssistantBase(value: unknown): value is CommissionAssistantBase {
  return typeof value === 'string' && (COMMISSION_ASSISTANT_BASES as readonly string[]).includes(value)
}

function isAssistantDeduct(value: unknown): value is CommissionAssistantDeduct {
  return typeof value === 'string' && (COMMISSION_ASSISTANT_DEDUCTS as readonly string[]).includes(value)
}

function parseAssistantRule(rule: CommissionAssistantRuleRow | null | undefined): CommissionAssistantRule | null {
  if (!rule) return null
  const rate = parseCommissionRate(rule)
  if (!rate || !isAssistantBase(rule.base) || !isAssistantDeduct(rule.deductFrom)) return null
  return { rate, base: rule.base, deductFrom: rule.deductFrom }
}

/**
 * Qual regra vale para quem auxiliou: a dele para aquele serviço → o padrão do
 * salão para o serviço → nenhuma. Não há "percentual geral de auxiliar": sem regra,
 * o auxiliar aparece no extrato com zero.
 */
export function resolveAssistantRule(input: {
  assistantRule?: CommissionAssistantRuleRow | null
  salonRule?: CommissionAssistantRuleRow | null
}): CommissionAssistantRule | null {
  return parseAssistantRule(input.assistantRule) ?? parseAssistantRule(input.salonRule)
}

export type CommissionAssistantRulePlan =
  | { ok: true; kind: CommissionRateKind; value: string; base: CommissionAssistantBase; deductFrom: CommissionAssistantDeduct }
  | { ok: false; error: string }

/** Valida uma regra de auxiliar vinda do formulário e devolve o que gravar. */
export function planAssistantRule(draft: {
  kind: unknown
  value: unknown
  base: unknown
  deductFrom: unknown
}): CommissionAssistantRulePlan {
  const rate = planCommissionRule(draft)
  if (!rate.ok) return rate
  if (!isAssistantDeduct(draft.deductFrom)) return { ok: false, error: 'Informe de quem sai a comissão do auxiliar' }
  // Valor fixo não incide sobre nada: a base gravada é sempre a padrão.
  if (rate.kind === 'fixed') return { ...rate, base: 'gross', deductFrom: draft.deductFrom }
  if (!isAssistantBase(draft.base)) return { ok: false, error: 'Informe sobre o que incide a comissão do auxiliar' }
  return { ...rate, base: draft.base, deductFrom: draft.deductFrom }
}

// ============================================================================
// O cálculo
// ============================================================================

export type CommissionSaleItem = {
  id: string
  serviceId: string | null
  productId: string | null
  professionalId: string | null
  /** Quem auxiliou (só em serviço). */
  assistantId?: string | null
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
  /** Profissionais DESTE salão que aparecem nos itens — quem executou e quem auxiliou. */
  professionals: ReadonlyMap<string, { commissionRate: string | number | null; settings: CommissionSettingsRow | null }>
  rules: readonly CommissionRuleRow[]
  assistantRules?: readonly CommissionAssistantRuleRow[]
}

export type PlannedCommissionEntry = {
  saleItemId: string
  /** Quem recebe: o profissional, ou o auxiliar quando `role` é 'assistant'. */
  professionalId: string
  role: CommissionRole
  baseAmount: string
  rateKind: CommissionRateKind
  rateValue: string
  grossAmount: string
  feeAmount: string
  /** Quanto da comissão do profissional foi para o auxiliar. Zero na linha do auxiliar. */
  assistantDeduction: string
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
 *
 * Auxiliar (fatia 3b): o serviço com auxiliar ganha uma segunda linha, a dele. A
 * regra diz quanto (percentual sobre o valor do serviço ou sobre a comissão do
 * profissional, ou valor fixo por unidade) e de quem sai. Saindo do profissional, é
 * o "desconto de auxiliar" da Belasis, conferido na auditoria: R$ 600, 50%, taxa
 * R$ 8,76, auxiliar R$ 60 → R$ 231,24.
 *   - O auxiliar não paga taxa: a do profissional já é calculada sobre a comissão
 *     inteira, antes do desconto.
 *   - O auxiliar recebe o valor da regra mesmo que a comissão do profissional não
 *     cubra: o profissional vai a zero e a diferença fica por conta do salão.
 *   - A data segue a regra de QUEM RECEBE (o auxiliar pode ter exceção própria).
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

  const assistantRules = new Map<string, CommissionAssistantRuleRow>()
  for (const rule of input.assistantRules ?? []) {
    assistantRules.set(`${rule.professionalId ?? '*'}|${rule.serviceId}`, rule)
  }

  const releaseDateFor = (settings: CommissionSettings): string | null =>
    settings.dateBasis === 'competence'
      ? competenceDate
      : amountDueCents > 0
        ? null
        : (lastSettlement ?? competenceDate)

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
    const rawQuantity = Number(item.quantity)
    const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : 0
    const grossCents = totalCents + discountCents

    const { baseCents, commissionCents } = grossCommission({
      rate,
      quantity,
      grossCents,
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

    // Auxiliar: só em serviço, só quem é do salão e nunca o próprio profissional.
    const assistantId =
      item.serviceId && item.assistantId && item.assistantId !== item.professionalId ? item.assistantId : null
    const assistant = assistantId ? input.professionals.get(assistantId) : undefined

    let assistantEntry: PlannedCommissionEntry | null = null
    let deductionCents = 0

    if (assistantId && assistant && item.serviceId) {
      const rule = resolveAssistantRule({
        assistantRule: assistantRules.get(`${assistantId}|${item.serviceId}`),
        salonRule: assistantRules.get(`*|${item.serviceId}`),
      })

      // Sem regra o auxiliar entra com zero: a linha mostra que ele participou.
      const assistantRate: CommissionRate = rule?.rate ?? { kind: 'percent', basisPoints: 0 }
      const assistantBaseCents = rule?.base === 'commission' ? commissionCents : grossCents
      const assistantCents =
        assistantRate.kind === 'percent'
          ? Math.round((assistantBaseCents * assistantRate.basisPoints) / 10_000)
          : Math.round(assistantRate.cents * quantity)

      if (rule?.deductFrom === 'professional') {
        // O desconto nunca deixa a comissão do profissional negativa.
        deductionCents = Math.min(assistantCents, commissionCents - feeCents)
      }

      assistantEntry = {
        saleItemId: item.id,
        professionalId: assistantId,
        role: 'assistant',
        baseAmount: centsToNumeric(assistantBaseCents),
        ...commissionRateToColumns(assistantRate),
        grossAmount: centsToNumeric(assistantCents),
        feeAmount: centsToNumeric(0),
        assistantDeduction: centsToNumeric(0),
        amount: centsToNumeric(assistantCents),
        competenceDate,
        releaseDate: releaseDateFor(resolveCommissionSettings(input.salonSettings, assistant.settings)),
      }
    }

    entries.push({
      saleItemId: item.id,
      professionalId: item.professionalId,
      role: 'professional',
      baseAmount: centsToNumeric(baseCents),
      ...commissionRateToColumns(rate),
      grossAmount: centsToNumeric(commissionCents),
      feeAmount: centsToNumeric(feeCents),
      assistantDeduction: centsToNumeric(deductionCents),
      amount: centsToNumeric(commissionCents - feeCents - deductionCents),
      competenceDate,
      releaseDate: releaseDateFor(settings),
    })

    if (assistantEntry) entries.push(assistantEntry)
  }

  return entries
}

// ============================================================================
// Vales e bonificações (fatia 3c)
// ============================================================================

export const COMMISSION_ADJUSTMENT_KINDS: readonly CommissionAdjustmentKind[] = ['advance', 'bonus']

const MAX_ADJUSTMENT_CENTS = 100_000_000 // R$ 1.000.000,00
const MAX_ADJUSTMENT_NOTES = 500

export type CommissionAdjustmentPlan =
  | { ok: true; kind: CommissionAdjustmentKind; amount: string; referenceDate: string; notes: string | null }
  | { ok: false; error: string }

/**
 * Valida um vale ou uma bonificação vindos do formulário e devolve o que gravar.
 *
 * O valor é sempre positivo — quem diz se soma ou abate é o tipo. Valor zero não é
 * lançamento: é engano de digitação.
 */
export function planCommissionAdjustment(draft: {
  kind: unknown
  amount: unknown
  referenceDate: unknown
  notes?: unknown
}): CommissionAdjustmentPlan {
  if (draft.kind !== 'advance' && draft.kind !== 'bonus') {
    return { ok: false, error: 'Escolha vale ou bonificação' }
  }

  const cents = typeof draft.amount === 'number' ? toCents(draft.amount) : null
  if (cents === null || cents <= 0 || cents > MAX_ADJUSTMENT_CENTS) {
    return { ok: false, error: 'Informe um valor maior que zero' }
  }

  if (!isCalendarDate(draft.referenceDate)) {
    return { ok: false, error: 'Informe a data em que o lançamento entra no extrato' }
  }

  const notes = typeof draft.notes === 'string' ? draft.notes.trim() : ''
  if (notes.length > MAX_ADJUSTMENT_NOTES) {
    return { ok: false, error: `A observação aceita no máximo ${MAX_ADJUSTMENT_NOTES} caracteres` }
  }

  return {
    ok: true,
    kind: draft.kind,
    amount: centsToNumeric(cents),
    referenceDate: draft.referenceDate,
    notes: notes || null,
  }
}

/**
 * O líquido do extrato: comissões a receber − vales + bonificações.
 *
 * Pode ficar NEGATIVO: vale maior que a comissão do período quer dizer que o
 * profissional está devendo — e esconder isso em zero faria o salão pagar de novo.
 */
export function commissionNetCents(input: { amountCents: number; advanceCents: number; bonusCents: number }): number {
  return input.amountCents - input.advanceCents + input.bonusCents
}

// ============================================================================
// Pagamento de comissão (fatia 3d)
// ============================================================================

/** O mesmo item, a mesma pessoa, o mesmo papel: a identidade de uma linha do extrato. */
export function commissionEntryKey(entry: {
  saleItemId: string
  professionalId: string
  role: CommissionRole
}): string {
  return `${entry.saleItemId}|${entry.professionalId}|${entry.role}`
}

/**
 * Das linhas recalculadas de uma comanda, só as que ainda NÃO foram pagas.
 *
 * Comissão paga é fotografia: o recibo já foi assinado por aquele valor. Regra
 * nova, taxa nova ou débito recebido depois não mexem nela — para mudar, estorna-se
 * o pagamento primeiro.
 */
export function unpaidPlannedEntries(
  planned: readonly PlannedCommissionEntry[],
  paidKeys: ReadonlySet<string>
): PlannedCommissionEntry[] {
  return planned.filter((entry) => !paidKeys.has(commissionEntryKey(entry)))
}

const MAX_PAYMENT_NOTES = 500
/** Profissionais num mesmo lote. */
export const MAX_PAYMENT_BATCH = 200

export type CommissionPaymentBatchPlan =
  | { ok: true; cutoffDate: string; paidOn: string; notes: string | null }
  | { ok: false; error: string }

/**
 * Valida o que é comum ao lote: até quando quitar, o dia do pagamento e a observação.
 *
 * O dia do pagamento não pode ser futuro — é o dia em que o dinheiro FOI entregue.
 * A data de corte pode: é escolha de quem paga adiantar o que ainda vai liberar.
 */
export function planCommissionPaymentBatch(
  draft: { cutoffDate: unknown; paidOn: unknown; notes?: unknown; professionals: number },
  now: Date
): CommissionPaymentBatchPlan {
  if (!isCalendarDate(draft.cutoffDate)) return { ok: false, error: 'Informe até que dia pagar' }
  if (!isCalendarDate(draft.paidOn)) return { ok: false, error: 'Informe o dia do pagamento' }
  if (draft.paidOn > brazilToday(now)) return { ok: false, error: 'O pagamento não pode ter data futura' }

  if (!Number.isInteger(draft.professionals) || draft.professionals < 1) {
    return { ok: false, error: 'Escolha ao menos um profissional' }
  }
  if (draft.professionals > MAX_PAYMENT_BATCH) {
    return { ok: false, error: `Pague no máximo ${MAX_PAYMENT_BATCH} profissionais por vez` }
  }

  const notes = typeof draft.notes === 'string' ? draft.notes.trim() : ''
  if (notes.length > MAX_PAYMENT_NOTES) {
    return { ok: false, error: `A observação aceita no máximo ${MAX_PAYMENT_NOTES} caracteres` }
  }

  return { ok: true, cutoffDate: draft.cutoffDate, paidOn: draft.paidOn, notes: notes || null }
}

export type CommissionPaymentPlan =
  | {
      ok: true
      entriesAmount: string
      advancesAmount: string
      bonusesAmount: string
      amount: string
      amountCents: number
    }
  | { ok: false; error: string }

/**
 * Quanto pagar a UM profissional: tudo o que está em aberto, de uma vez.
 *
 *   valor pago = comissões − vales + bonificações
 *
 *   - Nada em aberto não é pagamento.
 *   - Líquido NEGATIVO não se paga nem se quita: o profissional está devendo, e o
 *     que está em aberto continua em aberto até um pagamento futuro cobrir.
 *   - Líquido ZERO quita (comissão e vale se anulam) sem sair dinheiro.
 *   - `expectedCents` é o líquido que a tela mostrou. Se outro lançamento entrou
 *     nesse meio-tempo, o pagamento é recusado em vez de sair por um valor que
 *     ninguém conferiu.
 */
export function planCommissionPayment(input: {
  entries: readonly { amount: string | number }[]
  adjustments: readonly { kind: CommissionAdjustmentKind; amount: string | number }[]
  expectedCents?: number | null
}): CommissionPaymentPlan {
  if (input.entries.length === 0 && input.adjustments.length === 0) {
    return { ok: false, error: 'Nada em aberto para pagar' }
  }

  let entriesCents = 0
  for (const entry of input.entries) entriesCents += toCents(entry.amount) ?? 0

  let advanceCents = 0
  let bonusCents = 0
  for (const adjustment of input.adjustments) {
    const cents = toCents(adjustment.amount) ?? 0
    if (adjustment.kind === 'advance') advanceCents += cents
    else bonusCents += cents
  }

  const netCents = commissionNetCents({ amountCents: entriesCents, advanceCents, bonusCents })

  if (typeof input.expectedCents === 'number' && input.expectedCents !== netCents) {
    return { ok: false, error: 'Os valores mudaram desde que a tela foi aberta. Atualize e confira de novo' }
  }

  if (netCents < 0) {
    return {
      ok: false,
      error: 'Os vales passam do que há a receber: o saldo fica em aberto para o próximo pagamento',
    }
  }

  return {
    ok: true,
    entriesAmount: centsToNumeric(entriesCents),
    advancesAmount: centsToNumeric(advanceCents),
    bonusesAmount: centsToNumeric(bonusCents),
    amount: centsToNumeric(netCents),
    amountCents: netCents,
  }
}

/**
 * O dia em que o dinheiro de um vale saiu, para o financeiro.
 *
 * A data do vale é o dia em que ele entra no EXTRATO, e pode ser futura (vale dado
 * hoje para descontar no mês que vem). O dinheiro, porém, saiu no máximo hoje: data
 * passada ou de hoje vale como está, data futura vira hoje.
 */
export function advancePaidDate(referenceDate: string, now: Date): string {
  const today = brazilToday(now)
  return referenceDate <= today ? referenceDate : today
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
  /** Quanto das comissões foi para auxiliares ("desconto de auxiliar"). */
  assistantCents: number
  /** O que há a receber: comissões − taxas − desconto de auxiliar. */
  amountCents: number
  count: number
}

export function commissionTotals(
  rows: readonly {
    baseAmount: string | number
    grossAmount: string | number
    feeAmount: string | number
    assistantDeduction?: string | number
    amount: string | number
  }[]
): CommissionTotals {
  const totals: CommissionTotals = {
    baseCents: 0,
    grossCents: 0,
    feeCents: 0,
    assistantCents: 0,
    amountCents: 0,
    count: 0,
  }

  for (const row of rows) {
    totals.baseCents += toCents(row.baseAmount) ?? 0
    totals.grossCents += toCents(row.grossAmount) ?? 0
    totals.feeCents += toCents(row.feeAmount) ?? 0
    totals.assistantCents += toCents(row.assistantDeduction ?? 0) ?? 0
    totals.amountCents += toCents(row.amount) ?? 0
    totals.count += 1
  }

  return totals
}
