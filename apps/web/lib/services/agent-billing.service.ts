/**
 * Agent Billing Service
 *
 * Manages Stripe subscription items for extra agents (Enterprise plan).
 * Enterprise includes 3 agents; each additional agent costs R$150/month.
 */

import { db, salons, agents, profiles, eq } from '@repo/db'
import { stripe, STRIPE_PRICE_EXTRA_AGENT } from '../stripe'
import { ENTERPRISE_INCLUDED_AGENTS, getExtraAgentCount } from '../utils/permissions'
import type { PlanTier } from '../types/salon'
import { logger } from '../infra/logger'

/**
 * Sync the extra-agent subscription item on the salon's Stripe subscription.
 * Should be called after creating or deleting an agent for Enterprise salons.
 */
export async function syncExtraAgentBilling(salonId: string): Promise<void> {
  if (!STRIPE_PRICE_EXTRA_AGENT) {
    logger.warn({ salonId }, 'STRIPE_PRICE_EXTRA_AGENT not configured, skipping billing sync')
    return
  }

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: {
      ownerId: true,
      stripeSubscriptionId: true,
    },
  })

  if (!salon?.stripeSubscriptionId) {
    logger.warn({ salonId }, 'No Stripe subscription for salon, skipping billing sync')
    return
  }

  // Check if this is an Enterprise salon
  const ownerProfile = await db.query.profiles.findFirst({
    where: eq(profiles.id, salon.ownerId),
    columns: { tier: true },
  })

  const planTier = (ownerProfile?.tier as PlanTier) || 'SOLO'
  if (planTier !== 'ENTERPRISE') return

  // Count current agents
  const agentList = await db.query.agents.findMany({
    where: eq(agents.salonId, salonId),
    columns: { id: true },
  })

  const extraCount = getExtraAgentCount(planTier, agentList.length)

  try {
    // Get existing subscription items
    const subscription = await stripe.subscriptions.retrieve(salon.stripeSubscriptionId)
    const existingExtraItem = subscription.items.data.find(
      (item) => item.price.id === STRIPE_PRICE_EXTRA_AGENT
    )

    if (extraCount > 0) {
      if (existingExtraItem) {
        // Update quantity
        await stripe.subscriptionItems.update(existingExtraItem.id, {
          quantity: extraCount,
          proration_behavior: 'create_prorations',
        })
        logger.info({ salonId, extraCount, itemId: existingExtraItem.id }, 'Updated extra agent billing')
      } else {
        // Create new subscription item
        await stripe.subscriptionItems.create({
          subscription: salon.stripeSubscriptionId,
          price: STRIPE_PRICE_EXTRA_AGENT,
          quantity: extraCount,
          proration_behavior: 'create_prorations',
        })
        logger.info({ salonId, extraCount }, 'Created extra agent billing item')
      }
    } else if (existingExtraItem) {
      // Remove the extra agent item (back to 3 or fewer)
      await stripe.subscriptionItems.del(existingExtraItem.id, {
        proration_behavior: 'create_prorations',
      })
      logger.info({ salonId }, 'Removed extra agent billing item')
    }
  } catch (error) {
    logger.error({ err: error, salonId, extraCount }, 'Failed to sync extra agent billing')
    throw error
  }
}
