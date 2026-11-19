import type Stripe from 'stripe'
import { db, profiles, salons, payments, eq, sql } from '@repo/db'
import { stripe, PRICE_TO_TIER } from '@/lib/stripe'
import {
  centsToAmount,
  getInvoiceSubscriptionId,
  isCheckoutPaid,
  mapStripeSubscriptionStatus,
  type LocalSubscriptionStatus,
} from '@/lib/utils/stripe-billing.utils'

/**
 * Tratamento dos eventos do webhook do Stripe (cobrança do SaaS).
 *
 * Princípio: o evento só diz QUE algo mudou. O estado da assinatura é sempre
 * relido no Stripe antes de gravar. Assim a ordem de chegada dos eventos não
 * importa (um `payment_failed` atrasado não rebaixa um salão que já pagou) e o
 * formato do payload — que segue a versão da API configurada no endpoint — só
 * importa para achar o ID da assinatura.
 */

type Tier = 'SOLO' | 'PRO' | 'ENTERPRISE'

function isTier(value: string | undefined | null): value is Tier {
  return value === 'SOLO' || value === 'PRO' || value === 'ENTERPRISE'
}

/** Muda o status e só reinicia o relógio (`subscription_status_changed_at`)
 *  quando o status muda de fato: a carência de 3 dias do PAST_DUE não pode
 *  recomeçar a cada nova tentativa de cobrança do Stripe. */
function statusChange(status: LocalSubscriptionStatus) {
  return {
    subscriptionStatus: status,
    subscriptionStatusChangedAt: sql`CASE WHEN ${salons.subscriptionStatus} = ${status} THEN ${salons.subscriptionStatusChangedAt} ELSE now() END`,
    updatedAt: new Date(),
  }
}

/** Tier do plano base da assinatura (ignora o item de agente extra). */
function tierFromSubscription(subscription: Stripe.Subscription): Tier | null {
  for (const item of subscription.items.data) {
    const tier = PRICE_TO_TIER[item.price.id]
    if (isTier(tier)) return tier
  }
  return null
}

function idOf(ref: string | { id: string } | null): string | null {
  if (!ref) return null
  return typeof ref === 'string' ? ref : ref.id
}

/**
 * Acha o salão da assinatura e liga os dois se ainda não estiverem ligados.
 *
 * - Já ligado pelo `stripe_subscription_id` → esse salão.
 * - Não ligado, mas a assinatura traz `metadata.salonId` (gravado pelo nosso
 *   Checkout) e o salão está sem assinatura ou já aponta para esta → liga.
 *   Cobre o `invoice.paid` que chega antes do `checkout.session.completed`.
 * - O salão aponta para OUTRA assinatura → não é dele (é uma assinatura antiga
 *   ou paralela): não mexe, para o cancelamento da antiga não derrubar a nova.
 */
async function resolveSalonForSubscription(
  subscription: Stripe.Subscription,
): Promise<{ id: string; ownerId: string } | null> {
  const linked = await db.query.salons.findFirst({
    where: eq(salons.stripeSubscriptionId, subscription.id),
    columns: { id: true, ownerId: true },
  })
  if (linked) return linked

  const salonId = subscription.metadata?.salonId
  if (!salonId) return null

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { id: true, ownerId: true, stripeSubscriptionId: true },
  })
  if (!salon) return null
  if (salon.stripeSubscriptionId && salon.stripeSubscriptionId !== subscription.id) {
    console.warn(
      `[Stripe Billing] Assinatura ${subscription.id} aponta para o salão ${salon.id}, que já tem ${salon.stripeSubscriptionId}. Ignorada.`,
    )
    return null
  }

  // Só liga assinatura que ainda vale: uma cancelada não deve ocupar o lugar.
  if (mapStripeSubscriptionStatus(subscription.status) === 'CANCELED') return null

  await db
    .update(salons)
    .set({ stripeSubscriptionId: subscription.id, updatedAt: new Date() })
    .where(eq(salons.id, salon.id))

  return { id: salon.id, ownerId: salon.ownerId }
}

/**
 * Relê a assinatura no Stripe e grava no salão: status, tier do dono e o
 * customer. Devolve o salão afetado (ou null se a assinatura não é de nenhum).
 */
export async function syncSubscriptionById(
  subscriptionId: string,
): Promise<{ id: string; ownerId: string } | null> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const salon = await resolveSalonForSubscription(subscription)
  if (!salon) {
    console.log(`[Stripe Billing] Assinatura ${subscriptionId} sem salão ligado — nada a sincronizar.`)
    return null
  }

  const localStatus = mapStripeSubscriptionStatus(subscription.status)
  const tier = tierFromSubscription(subscription)
  const customerId = idOf(subscription.customer)

  await db.transaction(async (tx) => {
    if (localStatus) {
      await tx.update(salons).set(statusChange(localStatus)).where(eq(salons.id, salon.id))
    }

    // O tier só sobe/muda com a assinatura valendo. Cancelada não rebaixa aqui:
    // o salão fica CANCELED e bloqueado, e o tier mora no dono (pode ter outros
    // salões) — rebaixar é decisão de produto ainda em aberto.
    const profileUpdate: { tier?: Tier; stripeCustomerId?: string; updatedAt: Date } = {
      updatedAt: new Date(),
    }
    if (tier && localStatus === 'PAID') profileUpdate.tier = tier
    if (customerId) profileUpdate.stripeCustomerId = customerId
    if (profileUpdate.tier || profileUpdate.stripeCustomerId) {
      await tx.update(profiles).set(profileUpdate).where(eq(profiles.id, salon.ownerId))
    }
  })

  console.log(
    `[Stripe Billing] Assinatura sincronizada: salon=${salon.id}, stripe=${subscription.status} → ${localStatus ?? 'sem mudança'}, tier=${tier ?? '-'}`,
  )
  return salon
}

/** `checkout.session.completed` e `checkout.session.async_payment_succeeded`. */
export async function handleCheckoutSettled(session: Stripe.Checkout.Session): Promise<void> {
  if (!isCheckoutPaid(session)) {
    // Boleto e afins: o dinheiro ainda não veio. Nada é liberado agora; o
    // `async_payment_succeeded` chama esta mesma função quando (e se) pagar.
    console.log(`[Stripe Billing] Checkout ${session.id} concluído sem pagamento (${session.payment_status}). Aguardando.`)
    return
  }

  if (session.mode === 'payment' && session.metadata?.type === 'credit_pack') {
    await creditPackPurchase(session)
    return
  }

  if (session.mode !== 'subscription') return

  const subscriptionId = idOf(session.subscription)
  const salonId = session.metadata?.salonId
  if (!subscriptionId || !salonId) {
    console.error('[Stripe Billing] Checkout de assinatura sem assinatura ou salão:', {
      session: session.id,
      subscriptionId,
      salonId,
    })
    return
  }

  // Liga o salão a esta assinatura. Uma assinatura anterior que ainda estivesse
  // viva já teria barrado o Checkout (decideCheckout), então sobrescrever aqui
  // só troca uma cancelada pela nova.
  await db
    .update(salons)
    .set({ stripeSubscriptionId: subscriptionId, updatedAt: new Date() })
    .where(eq(salons.id, salonId))

  await syncSubscriptionById(subscriptionId)
}

/** `checkout.session.async_payment_failed`: nada foi liberado, só registra. */
export function handleCheckoutAsyncFailed(session: Stripe.Checkout.Session): void {
  console.warn(`[Stripe Billing] Pagamento assíncrono falhou: checkout=${session.id}, salon=${session.metadata?.salonId ?? '-'}`)
}

/** `invoice.paid`: sincroniza a assinatura e registra o pagamento. */
export async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = getInvoiceSubscriptionId(invoice)
  if (!subscriptionId) return

  const salon = await syncSubscriptionById(subscriptionId)
  if (!salon || !invoice.id) return

  await db
    .insert(payments)
    .values({
      userId: salon.ownerId,
      externalId: invoice.id,
      status: 'APPROVED',
      amount: centsToAmount(invoice.amount_paid),
      currency: invoice.currency.toUpperCase(),
      method: 'CARD',
      receiptUrl: invoice.hosted_invoice_url ?? undefined,
      metadata: { stripeInvoiceId: invoice.id, subscriptionId, salonId: salon.id },
    })
    .onConflictDoNothing()
}

/** `invoice.payment_failed`: o status vem do Stripe (past_due, unpaid…), não
 *  é presumido — se outra tentativa já pagou, o salão continua pago. */
export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = getInvoiceSubscriptionId(invoice)
  if (!subscriptionId) return
  await syncSubscriptionById(subscriptionId)
}

/** `customer.subscription.created/updated/deleted`. */
export async function handleSubscriptionChanged(subscription: Stripe.Subscription): Promise<void> {
  await syncSubscriptionById(subscription.id)
}

/**
 * Pacote de créditos avulso. Idempotente pelo banco: o registro em `payments`
 * (`external_id` único) entra primeiro e o saldo só sobe se ele entrou agora.
 * Reenvio do mesmo evento — mesmo depois de a trava do Redis expirar — não
 * credita de novo.
 */
async function creditPackPurchase(session: Stripe.Checkout.Session): Promise<void> {
  const salonId = session.metadata?.salonId
  const credits = Number.parseInt(session.metadata?.credits ?? '', 10)
  if (!salonId || !Number.isFinite(credits) || credits <= 0) {
    console.error('[Stripe Billing] Pacote de créditos sem metadata válida:', { session: session.id, salonId })
    return
  }

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { id: true, ownerId: true },
  })
  if (!salon) {
    console.error(`[Stripe Billing] Pacote de créditos para salão inexistente: ${salonId}`)
    return
  }

  const customerId = idOf(session.customer)

  const credited = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(payments)
      .values({
        userId: salon.ownerId,
        externalId: session.id,
        status: 'APPROVED',
        amount: centsToAmount(session.amount_total),
        currency: (session.currency ?? 'brl').toUpperCase(),
        method: 'CARD',
        metadata: { type: 'credit_pack', credits, sessionId: session.id, salonId },
      })
      .onConflictDoNothing()
      .returning({ id: payments.id })

    if (inserted.length === 0) return false

    await tx
      .update(salons)
      .set({ extraCredits: sql`${salons.extraCredits} + ${credits}`, updatedAt: new Date() })
      .where(eq(salons.id, salonId))

    if (customerId) {
      await tx
        .update(profiles)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(profiles.id, salon.ownerId))
    }
    return true
  })

  console.log(
    credited
      ? `[Stripe Billing] Pacote creditado: salon=${salonId}, créditos=${credits}`
      : `[Stripe Billing] Pacote já creditado antes (checkout ${session.id}) — ignorado.`,
  )
}
