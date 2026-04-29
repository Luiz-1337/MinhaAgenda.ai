/**
 * Seed inactive customers + completed appointments for a target salon, so the
 * AI retention dispatcher has data to find on the next /api/cron/marketing-dispatcher run.
 *
 * Usage:
 *   pnpm --filter @repo/db tsx scripts/seed-inactive-customers.mjs <salonId>
 *
 * The script picks up the first active service + first active professional of the salon
 * and creates 5 customers whose last completed appointment was 35-95 days ago.
 *
 * Idempotent on phone: re-running with the same SALON_ID will not duplicate customers
 * (uses ON CONFLICT DO NOTHING on the (salon_id, phone) unique index).
 */

import * as dotenv from 'dotenv'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootPath = resolve(__dirname, '../../..')

dotenv.config({ path: resolve(rootPath, '.env.local'), override: false })
dotenv.config({ path: resolve(rootPath, '.env'), override: false })
dotenv.config({ path: resolve(rootPath, 'apps/web/.env.local'), override: false })

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const salonId = process.argv[2]
if (!salonId) {
  console.error('Usage: tsx seed-inactive-customers.mjs <salonId>')
  process.exit(1)
}

const sql = postgres(url, { prepare: false })

const FIXTURES = [
  { name: 'Maria Aparecida', phone: '+5511900000001', daysAgo: 35 },
  { name: 'Joana Mendes', phone: '+5511900000002', daysAgo: 48 },
  { name: 'Beatriz Souza', phone: '+5511900000003', daysAgo: 60 },
  { name: 'Camila Rocha', phone: '+5511900000004', daysAgo: 75 },
  { name: 'Larissa Pinto', phone: '+5511900000005', daysAgo: 95 },
]

async function main() {
  console.log(`Seeding inactive customers for salon ${salonId}`)

  const [salon] = await sql`select id, name from salons where id = ${salonId}`
  if (!salon) {
    console.error(`Salon not found: ${salonId}`)
    process.exit(1)
  }

  const [service] = await sql`
    select id, name from services where salon_id = ${salonId} and is_active = true limit 1
  `
  if (!service) {
    console.error('No active service for this salon — create one first')
    process.exit(1)
  }

  const [professional] = await sql`
    select id, name from professionals where salon_id = ${salonId} and is_active = true limit 1
  `
  if (!professional) {
    console.error('No active professional for this salon — create one first')
    process.exit(1)
  }

  console.log(`Salon: ${salon.name}`)
  console.log(`Service: ${service.name}`)
  console.log(`Professional: ${professional.name}`)

  for (const fx of FIXTURES) {
    const customerId = randomUUID()

    // Insert customer (idempotent on (salon_id, phone))
    const inserted = await sql`
      insert into customers (id, salon_id, name, phone)
      values (${customerId}, ${salonId}, ${fx.name}, ${fx.phone})
      on conflict (salon_id, phone) do nothing
      returning id
    `
    let actualCustomerId = inserted[0]?.id
    if (!actualCustomerId) {
      const [existing] = await sql`
        select id from customers where salon_id = ${salonId} and phone = ${fx.phone}
      `
      actualCustomerId = existing.id
    }

    const lastVisitDate = new Date()
    lastVisitDate.setDate(lastVisitDate.getDate() - fx.daysAgo)
    const endTime = new Date(lastVisitDate.getTime() + 60 * 60 * 1000)

    // Insert completed appointment with that historical date
    await sql`
      insert into appointments (
        id, salon_id, professional_id, client_id, service_id,
        date, end_time, status, sync_status
      )
      values (
        ${randomUUID()}, ${salonId}, ${professional.id}, ${actualCustomerId}, ${service.id},
        ${lastVisitDate.toISOString()}, ${endTime.toISOString()}, 'completed', 'synced'
      )
    `

    console.log(`  + ${fx.name} (${fx.phone}) — last visit ${fx.daysAgo} days ago`)
  }

  console.log('Done. Run /api/cron/marketing-dispatcher to enqueue AI messages.')
  await sql.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
