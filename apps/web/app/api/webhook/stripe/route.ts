import { NextRequest, NextResponse } from 'next/server'
import { stripe, PRICE_TO_TIER, CREDIT_PACK_BY_PRICE } from '@/lib/stripe'
import { db, profiles, salons, payments, eq, sql } from '@repo/db'
import { getRedisClient } from '@/lib/infra/redis'
import type Stripe from 'stripe'

const PROCESSED_EVENT_TTL = 60 * 60 * 24 // 24 horas em segundos

/** Verifica e marca um evento como processado (idempotência). Retorna true se já foi processado. */
async function isEventAlreadyProcessed(eventId: string): Promise<boolean> {
  const redis = getRedisClient()
  const key = `stripe:event:${eventId}`
  // SET NX retorna null se a chave já existia, "OK" se foi criada
  const result = await redis.set(key, '1', 'EX', PROCESSED_EVENT_TTL, 'NX')
  return result === null
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Idempotência: ignora eventos já processados (Stripe pode reenviar)
  const alreadyProcessed = await isEventAlreadyProcessed(event.id)
  if (alreadyProcessed) {
    console.log(`[Stripe Webhook] Duplicate event ignored: ${event.id} (${event.type})`)
    return NextResponse.json({ received: true })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice)
        break
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      default:
        break
    }
  } catch (err) {
    console.error(`[Stripe Webhook] Error handling ${event.type}:`, err)
    // Retorna 500 para o Stripe reenviar o evento em caso de falha real
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Compra avulsa de créditos (mode: 'payment')
  if (session.mode === 'payment' && session.metadata?.type === 'credit_pack') {
    await handleCreditPackPurchase(session)
    return
  }

  const salonId = session.metadata?.salonId
  const tier = session.metadata?.tier as 'SOLO' | 'PRO' | 'ENTERPRISE' | undefined
  const customerId = session.customer as string
  const subscriptionId = session.subscription as string

  if (!salonId || !tier || !customerId || !subscriptionId) {
    console.error('[Stripe Webhook] checkout.session.completed missing metadata:', { salonId, tier, customerId, subscriptionId })
    return
  }

  // Atualiza salão e perfil em uma única transação atômica
  await db.transaction(async (tx) => {
    await tx
      .update(salons)
      .set({
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: 'PAID',
        updatedAt: new Date(),
      })
      .where(eq(salons.id, salonId))

    const salon = await tx.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { ownerId: true },
    })

    if (salon) {
      await tx
        .update(profiles)
        .set({
          stripeCustomerId: customerId,
          tier,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, salon.ownerId))
    }
  })

  console.log(`[Stripe Webhook] Checkout completed: salon=${salonId}, tier=${tier}`)
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription as string
  if (!subscriptionId) return

  const salon = await db.query.salons.findFirst({
    where: eq(salons.stripeSubscriptionId, subscriptionId),
    columns: { id: true, ownerId: true },
  })

  if (!salon) return

  await db.transaction(async (tx) => {
    await tx
      .update(salons)
      .set({ subscriptionStatus: 'PAID', updatedAt: new Date() })
      .where(eq(salons.id, salon.id))

    // Registra pagamento para auditoria (idempotente via unique constraint em externalId)
    await tx
      .insert(payments)
      .values({
        userId: salon.ownerId,
        externalId: invoice.id,
        status: 'APPROVED',
        amount: (invoice.amount_paid / 100).toFixed(2),
        currency: invoice.currency.toUpperCase(),
        method: 'CARD',
        receiptUrl: invoice.hosted_invoice_url ?? undefined,
        metadata: { stripeInvoiceId: invoice.id, subscriptionId },
      })
      .onConflictDoNothing() // Já registrado — ignora duplicata
  })

  console.log(`[Stripe Webhook] Invoice paid: salon=${salon.id}, invoice=${invoice.id}`)
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription as string
  if (!subscriptionId) return

  await db
    .update(salons)
    .set({ subscriptionStatus: 'PAST_DUE', subscriptionStatusChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(salons.stripeSubscriptionId, subscriptionId))

  console.log(`[Stripe Webhook] Invoice payment failed: subscription=${subscriptionId}`)
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const salon = await db.query.salons.findFirst({
    where: eq(salons.stripeSubscriptionId, subscription.id),
    columns: { id: true, ownerId: true },
  })

  if (!salon) return

  // Mapeamento de status Stripe → status local
  // Statuses não mapeados são ignorados (não sobrescrevemos com valor inválido)
  const statusMap: Record<string, 'PAID' | 'PAST_DUE' | 'CANCELED'> = {
    active: 'PAID',
    trialing: 'PAID',
    past_due: 'PAST_DUE',
    canceled: 'CANCELED',
    unpaid: 'CANCELED',
    incomplete_expired: 'CANCELED',
  }

  const localStatus = statusMap[subscription.status]

  await db.transaction(async (tx) => {
    if (localStatus) {
      await tx
        .update(salons)
        .set({ subscriptionStatus: localStatus, subscriptionStatusChangedAt: new Date(), updatedAt: new Date() })
        .where(eq(salons.id, salon.id))
    }

    // Sincroniza tier se o preço mudou
    const priceId = subscription.items.data[0]?.price?.id
    if (priceId) {
      const newTier = PRICE_TO_TIER[priceId] as 'SOLO' | 'PRO' | 'ENTERPRISE' | undefined
      if (newTier) {
        await tx
          .update(profiles)
          .set({ tier: newTier, updatedAt: new Date() })
          .where(eq(profiles.id, salon.ownerId))
      }
    }
  })

  console.log(`[Stripe Webhook] Subscription updated: salon=${salon.id}, status=${subscription.status} → ${localStatus ?? 'unchanged'}`)
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await db
    .update(salons)
    .set({ subscriptionStatus: 'CANCELED', updatedAt: new Date() })
    .where(eq(salons.stripeSubscriptionId, subscription.id))

  console.log(`[Stripe Webhook] Subscription deleted: subscription=${subscription.id}`)
}

async function handleCreditPackPurchase(session: Stripe.Checkout.Session) {
  const salonId = session.metadata?.salonId
  const creditsStr = session.metadata?.credits
  const customerId = session.customer as string

  if (!salonId || !creditsStr) {
    console.error('[Stripe Webhook] credit_pack missing metadata:', { salonId, creditsStr })
    return
  }

  const creditsToAdd = parseInt(creditsStr, 10)
  if (!creditsToAdd || creditsToAdd <= 0) return

  await db.transaction(async (tx) => {
    // Incrementa créditos extras do salão
    await tx
      .update(salons)
      .set({
        extraCredits: sql`extra_credits + ${creditsToAdd}`,
        updatedAt: new Date(),
      })
      .where(eq(salons.id, salonId))

    // Registra pagamento para auditoria
    const salon = await tx.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { ownerId: true },
    })

    if (salon) {
      await tx
        .insert(payments)
        .values({
          userId: salon.ownerId,
          externalId: session.id,
          status: 'APPROVED',
          amount: ((session.amount_total ?? 0) / 100).toFixed(2),
          currency: (session.currency ?? 'brl').toUpperCase(),
          method: 'CARD',
          metadata: { type: 'credit_pack', credits: creditsToAdd, sessionId: session.id },
        })
        .onConflictDoNothing()

      // Salva stripeCustomerId se ainda não tem
      if (customerId) {
        await tx
          .update(profiles)
          .set({ stripeCustomerId: customerId, updatedAt: new Date() })
          .where(eq(profiles.id, salon.ownerId))
      }
    }
  })

  console.log(`[Stripe Webhook] Credit pack purchased: salon=${salonId}, credits=${creditsToAdd}`)
}
