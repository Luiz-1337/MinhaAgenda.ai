/**
 * Promoções e cupons — regra pura, sem I/O (docs/ROADMAP.md, fase 6, fatia 6b).
 *
 * Uma promoção é um desconto com código (o cupom), vigência e dias da semana. O
 * cupom é digitado na comanda; o servidor confere se vale no dia da comanda e
 * reparte o desconto entre os itens.
 *
 * O desconto do cupom SOMA ao desconto dado à mão em cada item: total, comissão e
 * cashback continuam lendo um desconto só (`discount_amount`). `couponDiscount`
 * guarda quanto dele veio do cupom.
 *
 * Mesmo desenho dos outros módulos: o serviço busca os dados, estas funções
 * decidem, o serviço grava. Dinheiro em centavos inteiros.
 */
import { isCalendarDate } from './finance'
import { centsToNumeric, toCents, type PlannedSaleItem } from './sales'

export type PromotionDiscountKind = 'percent' | 'fixed'
export type PromotionAppliesTo = 'all' | 'services' | 'products'

const MAX_NAME_LENGTH = 120
const MAX_DISCOUNT_CENTS = 100_000_000 // R$ 1.000.000,00
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,29}$/

// ============================================================================
// Cadastro
// ============================================================================

export type PromotionDraft = {
  name: string
  code: string
  discountKind: PromotionDiscountKind
  /** Percentual (até 100) ou valor em reais, conforme `discountKind`. */
  discountValue: number
  appliesTo: PromotionAppliesTo
  /** "YYYY-MM-DD" ou NULL (sem começo / sem fim). */
  startsOn: string | null
  endsOn: string | null
  /** 0 = domingo … 6 = sábado. Vazio = todos os dias. */
  weekdays: readonly number[]
  isActive: boolean
}

export type PlannedPromotion = {
  name: string
  code: string
  discountKind: PromotionDiscountKind
  discountValue: string
  appliesTo: PromotionAppliesTo
  startsOn: string | null
  endsOn: string | null
  weekdays: number[]
  isActive: boolean
}

/** " primavera10 " → "PRIMAVERA10": tira espaço das pontas e põe em maiúsculas. */
export function normalizeCouponCode(code: unknown): string {
  return typeof code === 'string' ? code.trim().toUpperCase() : ''
}

export function planPromotion(
  draft: PromotionDraft
): { ok: true; promotion: PlannedPromotion } | { ok: false; error: string } {
  const name = (draft.name ?? '').trim()
  if (!name) return { ok: false, error: 'Informe o nome da promoção' }
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: 'Nome da promoção muito longo' }

  const code = normalizeCouponCode(draft.code)
  if (!code) return { ok: false, error: 'Informe o cupom' }
  if (!CODE_PATTERN.test(code)) {
    return { ok: false, error: 'O cupom tem de 3 a 30 caracteres: letras sem acento, números, hífen ou sublinhado' }
  }

  if (draft.discountKind !== 'percent' && draft.discountKind !== 'fixed') {
    return { ok: false, error: 'Tipo de desconto inválido' }
  }
  const valueCents = toCents(draft.discountValue)
  if (valueCents === null || valueCents <= 0 || valueCents > MAX_DISCOUNT_CENTS) {
    return { ok: false, error: 'Informe o valor do desconto' }
  }
  // Em percentual, "centavos" são centésimos de ponto: 100% = 10000.
  if (draft.discountKind === 'percent' && valueCents > 10_000) {
    return { ok: false, error: 'O desconto percentual vai até 100' }
  }

  if (draft.appliesTo !== 'all' && draft.appliesTo !== 'services' && draft.appliesTo !== 'products') {
    return { ok: false, error: 'Escolha em quais itens o desconto vale' }
  }

  const startsOn = draft.startsOn || null
  const endsOn = draft.endsOn || null
  if ((startsOn && !isCalendarDate(startsOn)) || (endsOn && !isCalendarDate(endsOn))) {
    return { ok: false, error: 'Data de vigência inválida' }
  }
  if (startsOn && endsOn && endsOn < startsOn) {
    return { ok: false, error: 'O fim da vigência é antes do começo' }
  }

  const weekdays = Array.from(new Set(draft.weekdays ?? [])).sort((a, b) => a - b)
  if (weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    return { ok: false, error: 'Dia da semana inválido' }
  }

  return {
    ok: true,
    promotion: {
      name,
      code,
      discountKind: draft.discountKind,
      discountValue: centsToNumeric(valueCents),
      appliesTo: draft.appliesTo,
      startsOn,
      endsOn,
      // Os sete dias marcados são "todos os dias": guarda vazio.
      weekdays: weekdays.length === 7 ? [] : weekdays,
      isActive: draft.isActive === true,
    },
  }
}

/** Por que uma promoção não pode ser apagada: a que já entrou em comanda fica, inativa. */
export function promotionDeleteBlocker(input: { sales: number }): string | null {
  if (input.sales > 0) return 'Esta promoção já foi usada em comanda. Desative-a em vez de excluir'
  return null
}

// ============================================================================
// Vigência
// ============================================================================

export type PromotionValidity = {
  isActive: boolean
  startsOn: string | null
  endsOn: string | null
  weekdays: readonly number[]
}

/** Dia da semana de um dia de calendário ("YYYY-MM-DD"): 0 = domingo … 6 = sábado. */
export function weekdayOf(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay()
}

function formatDay(day: string): string {
  const [year, month, date] = day.split('-')
  return `${date}/${month}/${year}`
}

const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/**
 * O cupom vale no dia da comanda? NULL = vale; senão, o motivo.
 *
 * Vale pelo DIA DA COMANDA (em Brasília), não pelo dia em que alguém digitou: a
 * comanda de terça com o cupom de terça continua valendo se for salva na quarta.
 */
export function promotionBlocker(promotion: PromotionValidity, saleDay: string): string | null {
  if (!promotion.isActive) return 'Este cupom está desativado'
  if (promotion.startsOn && saleDay < promotion.startsOn) {
    return `Este cupom só vale a partir de ${formatDay(promotion.startsOn)}`
  }
  if (promotion.endsOn && saleDay > promotion.endsOn) {
    return `Este cupom valeu até ${formatDay(promotion.endsOn)}`
  }
  if (promotion.weekdays.length > 0 && !promotion.weekdays.includes(weekdayOf(saleDay))) {
    const days = promotion.weekdays.map((day) => WEEKDAY_NAMES[day]).join(', ')
    return `Este cupom só vale em: ${days}`
  }
  return null
}

/**
 * active    = ativa e dentro da vigência hoje (o dia da semana não entra: é detalhe)
 * scheduled = ativa, ainda não começou
 * expired   = ativa, mas a vigência acabou
 * inactive  = desativada
 */
export type PromotionStatus = 'active' | 'scheduled' | 'expired' | 'inactive'

export function promotionStatus(promotion: PromotionValidity, today: string): PromotionStatus {
  if (!promotion.isActive) return 'inactive'
  if (promotion.startsOn && today < promotion.startsOn) return 'scheduled'
  if (promotion.endsOn && today > promotion.endsOn) return 'expired'
  return 'active'
}

// ============================================================================
// O desconto na comanda
// ============================================================================

export type CouponRule = {
  discountKind: PromotionDiscountKind
  discountValue: string | number
  appliesTo: PromotionAppliesTo
}

export type CouponItem = {
  kind: string
  /** O que o item custa depois do desconto dado à mão, em centavos. */
  baseCents: number
  /** Item "do pacote" não é cobrado: não recebe desconto. */
  fromPackage?: boolean
}

/** O cupom vale para este item? Só serviço e produto; pacote e assinatura ficam de fora. */
function couponCovers(rule: CouponRule, item: CouponItem): boolean {
  if (item.fromPackage || item.baseCents <= 0) return false
  if (item.kind === 'service') return rule.appliesTo !== 'products'
  if (item.kind === 'product') return rule.appliesTo !== 'services'
  return false
}

/**
 * Quanto o cupom desconta de cada item, em centavos, na ordem dos itens.
 *
 * Percentual: sobre cada item que vale. Fixo: o valor é abatido da comanda e
 * repartido entre os itens que valem, na proporção de cada um — com o resto pelas
 * maiores frações, para a soma ser exata. Nunca passa do que o item custa: cupom
 * de R$ 50 numa comanda de R$ 30 desconta R$ 30.
 */
export function splitCouponDiscount(rule: CouponRule, items: readonly CouponItem[]): number[] {
  const valueCents = Math.max(0, toCents(rule.discountValue) ?? 0)
  const bases = items.map((item) => (couponCovers(rule, item) ? Math.max(0, Math.round(item.baseCents)) : 0))
  if (valueCents <= 0) return bases.map(() => 0)

  if (rule.discountKind === 'percent') {
    return bases.map((base) => Math.min(base, Math.round((base * valueCents) / 10_000)))
  }

  const eligible = bases.reduce((sum, base) => sum + base, 0)
  if (eligible <= 0) return bases.map(() => 0)

  const target = Math.min(valueCents, eligible)
  const exact = bases.map((base) => (target * base) / eligible)
  const shares = exact.map(Math.floor)
  let rest = target - shares.reduce((sum, share) => sum + share, 0)

  // Maior fração primeiro; empate fica com o item de cima.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (const { index } of order) {
    if (rest <= 0) break
    if (shares[index] < bases[index]) {
      shares[index] += 1
      rest -= 1
    }
  }

  return shares
}

/**
 * Aplica o cupom aos itens já validados da comanda (planSaleItems): soma o
 * desconto do cupom ao desconto de cada item e refaz os totais.
 */
export function applyCouponToSale(
  rule: CouponRule,
  plan: { items: readonly PlannedSaleItem[]; subtotalCents: number; discountCents: number }
): { items: PlannedSaleItem[]; subtotalCents: number; discountCents: number; totalCents: number; couponCents: number } {
  const shares = splitCouponDiscount(
    rule,
    plan.items.map((item) => ({
      kind: item.kind,
      baseCents: toCents(item.total) ?? 0,
      fromPackage: item.customerPackageItemId !== null,
    }))
  )

  let couponCents = 0
  const items = plan.items.map((item, index) => {
    const coupon = shares[index] ?? 0
    if (coupon <= 0) return item
    couponCents += coupon
    return {
      ...item,
      discountAmount: centsToNumeric((toCents(item.discountAmount) ?? 0) + coupon),
      total: centsToNumeric(Math.max(0, (toCents(item.total) ?? 0) - coupon)),
      couponDiscount: centsToNumeric(coupon),
    }
  })

  const discountCents = plan.discountCents + couponCents
  return {
    items,
    subtotalCents: plan.subtotalCents,
    discountCents,
    totalCents: plan.subtotalCents - discountCents,
    couponCents,
  }
}

/** "10.00" + percent → "10%"; fixed → "R$ 10,00". */
export function describeCouponDiscount(rule: Pick<CouponRule, 'discountKind' | 'discountValue'>): string {
  const cents = toCents(rule.discountValue) ?? 0
  if (rule.discountKind === 'percent') return `${String(cents / 100).replace('.', ',')}%`
  return `R$ ${centsToNumeric(cents).replace('.', ',')}`
}
