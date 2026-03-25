import Stripe from 'stripe'

let _stripe: Stripe | null = null

function getStripeClient(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set')
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { typescript: true })
  }
  return _stripe
}

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return getStripeClient()[prop as keyof Stripe]
  },
})

const STRIPE_PRICE_SOLO = process.env.STRIPE_PRICE_SOLO!
const STRIPE_PRICE_PRO = process.env.STRIPE_PRICE_PRO!
const STRIPE_PRICE_ENTERPRISE = process.env.STRIPE_PRICE_ENTERPRISE ?? ''

export const TIER_TO_PRICE: Record<string, string> = {
  SOLO: STRIPE_PRICE_SOLO,
  PRO: STRIPE_PRICE_PRO,
  ...(STRIPE_PRICE_ENTERPRISE ? { ENTERPRISE: STRIPE_PRICE_ENTERPRISE } : {}),
}

export const PRICE_TO_TIER: Record<string, string> = {
  [STRIPE_PRICE_SOLO]: 'SOLO',
  [STRIPE_PRICE_PRO]: 'PRO',
  ...(STRIPE_PRICE_ENTERPRISE ? { [STRIPE_PRICE_ENTERPRISE]: 'ENTERPRISE' } : {}),
}

export interface CreditPack {
  id: string
  priceId: string
  label: string
  credits: number
  price: number // em reais
  highlight?: boolean
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: 'basic',
    priceId: 'price_1TEgaECknWqIQpwvIbH7jX2G',
    label: 'Básico',
    credits: 500_000,
    price: 49,
  },
  {
    id: 'pro',
    priceId: 'price_1TEgaFCknWqIQpwvpCKZFbpB',
    label: 'Profissional',
    credits: 1_000_000,
    price: 89,
    highlight: true,
  },
  {
    id: 'premium',
    priceId: 'price_1TEgaGCknWqIQpwvDEF577ox',
    label: 'Premium',
    credits: 2_000_000,
    price: 149,
  },
]

export const CREDIT_PACK_BY_PRICE: Record<string, CreditPack> = Object.fromEntries(
  CREDIT_PACKS.map((p) => [p.priceId, p])
)
