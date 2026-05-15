import { logger } from '@repo/db'
import { db, salonIntegrations, customers, eq, and } from '@repo/db'
import { requireCronAuth } from '@/lib/services/admin-auth.service'
import { enqueueTrinksProfileSync } from '@/lib/queues/trinks-sync-queue'
import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

/**
 * Trinks Customer Profile Sync Cron
 *
 * Runs daily (configured in vercel.json). For each salon with an active Trinks
 * integration, lists their customers and enqueues a profile-sync job per
 * customer. The actual API calls happen in the worker (rate-limited via the
 * BullMQ queue's limiter), keeping this route fast.
 *
 * Skips:
 *   - Salons without Trinks integration or with isActive=false
 *   - Customers whose profile is already fresh (handled inside the use case)
 *
 * Returns aggregate counters per salon for observability.
 */
export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request.headers)
  if (authError) return authError

  const startedAt = Date.now()

  try {
    // 1. Find all salons with active Trinks integration.
    const activeSalons = await db
      .select({ salonId: salonIntegrations.salonId })
      .from(salonIntegrations)
      .where(
        and(
          eq(salonIntegrations.provider, 'trinks'),
          eq(salonIntegrations.isActive, true)
        )
      )

    let salonsProcessed = 0
    let totalEnqueued = 0
    const perSalon: Array<{ salonId: string; enqueued: number; error?: string }> = []

    // 2. For each salon, list customers and enqueue sync jobs.
    for (const { salonId } of activeSalons) {
      try {
        const salonCustomers = await db
          .select({ id: customers.id, phone: customers.phone })
          .from(customers)
          .where(eq(customers.salonId, salonId))
          .limit(500) // safety cap per salon per cron run

        let enqueued = 0
        for (const c of salonCustomers) {
          const job = await enqueueTrinksProfileSync({
            salonId,
            customerId: c.id,
            customerPhone: c.phone,
          })
          if (job) enqueued++
        }

        salonsProcessed++
        totalEnqueued += enqueued
        perSalon.push({ salonId, enqueued })
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        logger.error('Failed to enqueue Trinks profile sync for salon', { salonId, error: errMsg })
        perSalon.push({ salonId, enqueued: 0, error: errMsg })
      }
    }

    const durationMs = Date.now() - startedAt

    logger.info('Trinks profile sync cron executed', {
      salonsProcessed,
      totalEnqueued,
      durationMs,
    })

    return Response.json({
      ok: true,
      salonsProcessed,
      totalEnqueued,
      durationMs,
      perSalon,
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.error('Trinks profile sync cron failed', { error: errMsg }, error as Error)
    return new Response('Trinks profile sync cron failed', { status: 500 })
  }
}
