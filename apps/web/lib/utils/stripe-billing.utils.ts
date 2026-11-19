import type Stripe from 'stripe'

/**
 * Regras puras da cobrança do SaaS (Stripe). Sem I/O: o webhook, as actions e
 * a tela leem daqui para decidir o que fazer, e os testes cobrem tudo sem mock.
 */

export type LocalSubscriptionStatus = 'PAID' | 'PAST_DUE' | 'CANCELED'

/**
 * Status do Stripe → status do salão. `null` = não mexer no status local.
 *
 * - `incomplete`: primeira cobrança ainda em aberto (até 23h). Não é pago nem
 *   cancelado: o salão segue como estava até o Stripe decidir.
 * - `paused`: sem cobrança acontecendo, então não pode continuar como pago.
 */
const STATUS_MAP: Record<Stripe.Subscription.Status, LocalSubscriptionStatus | null> = {
  active: 'PAID',
  trialing: 'PAID',
  past_due: 'PAST_DUE',
  unpaid: 'CANCELED',
  canceled: 'CANCELED',
  incomplete_expired: 'CANCELED',
  paused: 'CANCELED',
  incomplete: null,
}

export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): LocalSubscriptionStatus | null {
  return STATUS_MAP[status] ?? null
}

/** Assinatura que ainda existe para efeito de cobrança: não dá para abrir outra por cima. */
export function isSubscriptionLive(status: Stripe.Subscription.Status | string): boolean {
  return status !== 'canceled' && status !== 'incomplete_expired'
}

/**
 * O que fazer quando o dono pede para assinar.
 *
 * - `new_checkout`: não há assinatura viva — abre o Checkout.
 * - `portal`: já existe assinatura viva. Abrir outro Checkout criaria uma
 *   SEGUNDA assinatura cobrando junto da primeira; o Portal é onde se paga a
 *   fatura em atraso, troca o cartão ou muda de plano.
 */
export type CheckoutDecision = 'new_checkout' | 'portal'

export function decideCheckout(
  existingStatus: Stripe.Subscription.Status | null,
): CheckoutDecision {
  if (existingStatus === null) return 'new_checkout'
  return isSubscriptionLive(existingStatus) ? 'portal' : 'new_checkout'
}

/** Campos que a API do Stripe tirou da fatura em 2025 (basil). Só existem em
 *  webhook de endpoint configurado numa versão antiga. */
interface LegacyInvoiceFields {
  subscription?: string | { id: string } | null
}

/**
 * ID da assinatura de uma fatura.
 *
 * Na API atual o campo mora em `invoice.parent.subscription_details`. O payload
 * do webhook segue a versão configurada no endpoint, que pode ser anterior —
 * por isso o campo antigo também é lido.
 */
export function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const current = invoice.parent?.subscription_details?.subscription
  if (current) return typeof current === 'string' ? current : current.id

  const legacy = (invoice as Stripe.Invoice & LegacyInvoiceFields).subscription
  if (legacy) return typeof legacy === 'string' ? legacy : legacy.id

  return null
}

/** Fim do período atual da assinatura (segundos Unix). Na API atual ele mora
 *  em cada item; o da assinatura é o maior deles. */
export function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): number | null {
  const ends = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((end): end is number => typeof end === 'number')
  return ends.length > 0 ? Math.max(...ends) : null
}

/**
 * O Checkout terminou com o dinheiro garantido?
 *
 * Com método assíncrono (boleto, por exemplo) o `checkout.session.completed`
 * chega com `unpaid` e o dinheiro só vem — ou não — no
 * `checkout.session.async_payment_succeeded`. `no_payment_required` é
 * assinatura com período de teste ou cupom de 100%.
 */
export function isCheckoutPaid(session: Pick<Stripe.Checkout.Session, 'payment_status'>): boolean {
  return session.payment_status === 'paid' || session.payment_status === 'no_payment_required'
}

/** Reais com duas casas a partir de centavos inteiros (o Stripe manda centavos). */
export function centsToAmount(cents: number | null | undefined): string {
  const value = Number.isFinite(cents) ? Math.trunc(cents as number) : 0
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * Estado da trava de idempotência do webhook no Redis.
 *
 * - chave ausente → processa;
 * - `processing` → outra entrega do mesmo evento está rodando agora: devolve
 *   erro para o Stripe tentar de novo (se a outra falhar, este reenvio salva);
 * - `done` → já processado: 200 e nada a fazer.
 */
export type EventClaim = 'claimed' | 'in_progress' | 'already_done'

export function interpretEventClaim(setResult: string | null, currentValue: string | null): EventClaim {
  if (setResult === 'OK') return 'claimed'
  return currentValue === 'done' ? 'already_done' : 'in_progress'
}
