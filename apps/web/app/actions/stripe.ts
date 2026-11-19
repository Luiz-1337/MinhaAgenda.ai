'use server'

import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { stripe, TIER_TO_PRICE, CREDIT_PACKS } from '@/lib/stripe'
import { db, profiles, salons, eq, and, isNull } from '@repo/db'
import { decideCheckout, getSubscriptionPeriodEnd } from '@/lib/utils/stripe-billing.utils'

/**
 * Verifica se o usuário autenticado é o dono do salão.
 * Lança erro se o salão não existir ou se o usuário não for o dono.
 */
async function verifySalonOwner(salonId: string, userId: string): Promise<void> {
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { ownerId: true },
  })
  if (!salon) throw new Error('Salão não encontrado')
  if (salon.ownerId !== userId) throw new Error('Não autorizado')
}

async function requireOwner(salonId: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')
  await verifySalonOwner(salonId, user.id)
  return user.id
}

function requireAppUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL is required')
  return appUrl
}

/**
 * Customer do Stripe do dono, criando se faltar.
 *
 * A chave de idempotência faz dois cliques seguidos devolverem o MESMO
 * customer em vez de criar dois; o UPDATE só grava se o perfil ainda estiver
 * sem customer, e o valor final é relido do banco.
 */
async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, userId),
    columns: { id: true, email: true, stripeCustomerId: true, fullName: true },
  })
  if (!profile) throw new Error('Perfil não encontrado')
  if (profile.stripeCustomerId) return profile.stripeCustomerId

  const customer = await stripe.customers.create(
    {
      email: profile.email,
      name: profile.fullName ?? undefined,
      metadata: { profileId: profile.id },
    },
    { idempotencyKey: `customer-create:${profile.id}` },
  )

  await db
    .update(profiles)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(and(eq(profiles.id, profile.id), isNull(profiles.stripeCustomerId)))

  const saved = await db.query.profiles.findFirst({
    where: eq(profiles.id, profile.id),
    columns: { stripeCustomerId: true },
  })
  return saved?.stripeCustomerId ?? customer.id
}

/** Status da assinatura ligada ao salão no Stripe, ou null se não houver
 *  (ou se ela não existir mais lá). */
async function getLinkedSubscriptionStatus(
  subscriptionId: string | null,
): Promise<Stripe.Subscription.Status | null> {
  if (!subscriptionId) return null
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId)
    return sub.status
  } catch (err) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'resource_missing') {
      return null
    }
    throw err
  }
}

/**
 * Assinar um plano. Se o salão já tem assinatura viva (em dia, em atraso ou
 * pendente), devolve o Portal em vez de um Checkout novo: um segundo Checkout
 * criaria uma segunda assinatura cobrando junto com a primeira.
 */
export async function createCheckoutSession(salonId: string, tier: 'SOLO' | 'PRO') {
  const userId = await requireOwner(salonId)

  const priceId = TIER_TO_PRICE[tier]
  if (!priceId) throw new Error('Plano inválido')

  const appUrl = requireAppUrl()

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { stripeSubscriptionId: true },
  })
  const existingStatus = await getLinkedSubscriptionStatus(salon?.stripeSubscriptionId ?? null)

  const customerId = await getOrCreateStripeCustomer(userId)

  if (decideCheckout(existingStatus) === 'portal') {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/${salonId}/billing`,
    })
    return { url: portal.url }
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    client_reference_id: salonId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/${salonId}/billing?checkout=success`,
    cancel_url: `${appUrl}/${salonId}/billing?checkout=canceled`,
    metadata: { salonId, tier },
    subscription_data: {
      metadata: { salonId, tier },
    },
  })

  return { url: session.url }
}

export async function createPortalSession(salonId: string) {
  const userId = await requireOwner(salonId)

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, userId),
    columns: { stripeCustomerId: true },
  })

  if (!profile?.stripeCustomerId) {
    throw new Error('Nenhuma assinatura encontrada')
  }

  const appUrl = requireAppUrl()

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripeCustomerId,
    return_url: `${appUrl}/${salonId}/billing`,
  })

  return { url: session.url }
}

export async function getSubscriptionDetails(salonId: string) {
  await requireOwner(salonId)

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { stripeSubscriptionId: true, subscriptionStatus: true, ownerId: true, extraCredits: true },
  })
  if (!salon) throw new Error('Salão não encontrado')

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, salon.ownerId),
    columns: { tier: true, stripeCustomerId: true },
  })

  let subscription: {
    status: Stripe.Subscription.Status
    currentPeriodEnd: number | null
    cancelAtPeriodEnd: boolean
  } | null = null

  let invoices: Array<{
    id: string
    date: number
    amount: number
    status: string | null
    pdfUrl: string | null
  }> = []

  let paymentMethods: Array<{
    id: string
    brand: string
    last4: string
    expMonth: number
    expYear: number
    isDefault: boolean
  }> = []

  if (salon.stripeSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(salon.stripeSubscriptionId)
      subscription = {
        status: sub.status,
        currentPeriodEnd: getSubscriptionPeriodEnd(sub),
        cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at !== null,
      }
    } catch {
      // Subscription may have been deleted
    }
  }

  if (profile?.stripeCustomerId) {
    try {
      const [inv, pms, customer] = await Promise.all([
        stripe.invoices.list({ customer: profile.stripeCustomerId, limit: 10 }),
        stripe.paymentMethods.list({ customer: profile.stripeCustomerId, type: 'card' }),
        stripe.customers.retrieve(profile.stripeCustomerId),
      ])

      invoices = inv.data.flatMap((i) =>
        i.id
          ? [{
              id: i.id,
              date: i.created,
              amount: i.amount_paid / 100,
              status: i.status,
              pdfUrl: i.invoice_pdf ?? null,
            }]
          : [],
      )

      const defaultPm = customer.deleted ? null : customer.invoice_settings?.default_payment_method ?? null
      const defaultPmId = typeof defaultPm === 'string' ? defaultPm : defaultPm?.id ?? null

      paymentMethods = pms.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand ?? 'card',
        last4: pm.card?.last4 ?? '????',
        expMonth: pm.card?.exp_month ?? 0,
        expYear: pm.card?.exp_year ?? 0,
        isDefault: pm.id === defaultPmId,
      }))
    } catch {
      // Customer may not exist
    }
  }

  return {
    tier: profile?.tier ?? 'SOLO',
    subscriptionStatus: salon.subscriptionStatus,
    subscription,
    invoices,
    paymentMethods,
    extraCredits: salon.extraCredits ?? 0,
  }
}

export async function createCreditPackCheckoutSession(salonId: string, packId: string) {
  const userId = await requireOwner(salonId)

  const pack = CREDIT_PACKS.find((p) => p.id === packId)
  if (!pack) throw new Error('Pacote inválido')

  const customerId = await getOrCreateStripeCustomer(userId)
  const appUrl = requireAppUrl()

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    client_reference_id: salonId,
    line_items: [{ price: pack.priceId, quantity: 1 }],
    success_url: `${appUrl}/${salonId}/billing?credits=success`,
    cancel_url: `${appUrl}/${salonId}/billing?credits=canceled`,
    metadata: { salonId, packId, credits: String(pack.credits), type: 'credit_pack' },
  })

  return { url: session.url }
}

export async function getSalonExtraCredits(salonId: string): Promise<number> {
  await requireOwner(salonId)

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { extraCredits: true },
  })
  return salon?.extraCredits ?? 0
}
