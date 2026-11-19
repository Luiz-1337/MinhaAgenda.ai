import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { getRedisClient } from '@/lib/infra/redis'
import { interpretEventClaim, type EventClaim } from '@/lib/utils/stripe-billing.utils'
import {
  handleCheckoutAsyncFailed,
  handleCheckoutSettled,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionChanged,
} from '@/lib/services/stripe-billing.service'

/** Enquanto uma entrega processa, a trava segura reentregas paralelas. Se o
 *  processo morrer no meio, ela expira e o próximo reenvio do Stripe processa. */
const PROCESSING_TTL_SECONDS = 5 * 60
/** O Stripe reenvia por até 3 dias; a marca de "feito" dura mais que isso. */
const DONE_TTL_SECONDS = 7 * 24 * 60 * 60

function eventKey(eventId: string): string {
  return `stripe:event:${eventId}`
}

/**
 * Trava de idempotência. O evento só é marcado como feito DEPOIS de processar:
 * se o processamento falha, a trava é solta e o reenvio do Stripe processa de
 * novo — antes, a marca vinha primeiro e o reenvio de um evento que falhou era
 * descartado como "duplicado" (cliente pagava e o salão não virava pago).
 */
async function claimEvent(eventId: string): Promise<EventClaim> {
  const redis = getRedisClient()
  const key = eventKey(eventId)
  const set = await redis.set(key, 'processing', 'EX', PROCESSING_TTL_SECONDS, 'NX')
  const current = set === 'OK' ? null : await redis.get(key)
  return interpretEventClaim(set, current)
}

async function markEventDone(eventId: string): Promise<void> {
  await getRedisClient().set(eventKey(eventId), 'done', 'EX', DONE_TTL_SECONDS)
}

async function releaseEvent(eventId: string): Promise<void> {
  await getRedisClient().del(eventKey(eventId))
}

async function dispatch(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      await handleCheckoutSettled(event.data.object)
      return
    case 'checkout.session.async_payment_failed':
      handleCheckoutAsyncFailed(event.data.object)
      return
    case 'invoice.paid':
      await handleInvoicePaid(event.data.object)
      return
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object)
      return
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionChanged(event.data.object)
      return
    default:
      return
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const claim = await claimEvent(event.id)
  if (claim === 'already_done') {
    console.log(`[Stripe Webhook] Duplicate event ignored: ${event.id} (${event.type})`)
    return NextResponse.json({ received: true })
  }
  if (claim === 'in_progress') {
    // Outra entrega do mesmo evento está rodando. Não confirmar: se ela falhar,
    // este reenvio é que vai processar.
    return NextResponse.json({ error: 'Event in progress' }, { status: 409 })
  }

  try {
    await dispatch(event)
  } catch (err) {
    console.error(`[Stripe Webhook] Error handling ${event.type} (${event.id}):`, err)
    await releaseEvent(event.id).catch((releaseErr) =>
      console.error('[Stripe Webhook] Failed to release event lock:', releaseErr),
    )
    // 500 → o Stripe reenvia, e a trava solta deixa o reenvio processar.
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  await markEventDone(event.id).catch((err) =>
    // O evento já foi aplicado; se a marca falhar, um reenvio reaplica — os
    // handlers releem o Stripe e o crédito avulso é idempotente pelo banco.
    console.error('[Stripe Webhook] Failed to mark event done:', err),
  )
  return NextResponse.json({ received: true })
}
