'use server'

import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { stripe, TIER_TO_PRICE, CREDIT_PACKS } from '@/lib/stripe'
import { db, profiles, salons, eq, sql } from '@repo/db'

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

export async function createCheckoutSession(salonId: string, tier: 'SOLO' | 'PRO') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')
  await verifySalonOwner(salonId, user.id)

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, user.id),
    columns: { id: true, email: true, stripeCustomerId: true, fullName: true },
  })
  if (!profile) throw new Error('Perfil não encontrado')

  // Get or create Stripe customer
  let customerId = profile.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email,
      name: profile.fullName ?? undefined,
      metadata: { profileId: profile.id, salonId },
    })
    customerId = customer.id
    await db
      .update(profiles)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(profiles.id, profile.id))
  }

  const priceId = TIER_TO_PRICE[tier]
  if (!priceId) throw new Error('Plano inválido')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')
  await verifySalonOwner(salonId, user.id)

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, user.id),
    columns: { stripeCustomerId: true },
  })

  if (!profile?.stripeCustomerId) {
    throw new Error('Nenhuma assinatura encontrada')
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripeCustomerId,
    return_url: `${appUrl}/${salonId}/billing`,
  })

  return { url: session.url }
}

export async function getSubscriptionDetails(salonId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')
  await verifySalonOwner(salonId, user.id)

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
    status: string
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
        currentPeriodEnd: (sub as any).current_period_end ?? null,
        cancelAtPeriodEnd: (sub as any).cancel_at_period_end ?? false,
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

      invoices = inv.data.map((i) => ({
        id: i.id,
        date: i.created,
        amount: i.amount_paid / 100,
        status: i.status as string | null,
        pdfUrl: i.invoice_pdf ?? null,
      }))

      const defaultPmId =
        ((customer as Stripe.Customer).invoice_settings?.default_payment_method as string | null) ??
        null

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')
  await verifySalonOwner(salonId, user.id)

  const pack = CREDIT_PACKS.find((p) => p.id === packId)
  if (!pack) throw new Error('Pacote inválido')

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, user.id),
    columns: { id: true, email: true, stripeCustomerId: true, fullName: true },
  })
  if (!profile) throw new Error('Perfil não encontrado')

  // Get or create Stripe customer
  let customerId = profile.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email,
      name: profile.fullName ?? undefined,
      metadata: { profileId: profile.id, salonId },
    })
    customerId = customer.id
    await db.update(profiles).set({ stripeCustomerId: customerId, updatedAt: new Date() }).where(eq(profiles.id, profile.id))
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    line_items: [{ price: pack.priceId, quantity: 1 }],
    success_url: `${appUrl}/${salonId}/billing?credits=success`,
    cancel_url: `${appUrl}/${salonId}/billing?credits=canceled`,
    metadata: { salonId, packId, credits: String(pack.credits), type: 'credit_pack' },
  })

  return { url: session.url }
}

export async function getSalonExtraCredits(salonId: string): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')
  await verifySalonOwner(salonId, user.id)

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { extraCredits: true },
  })
  return salon?.extraCredits ?? 0
}
