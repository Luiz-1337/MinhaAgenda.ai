import * as dotenv from 'dotenv'
import postgres from 'postgres'

const env = dotenv.config({ path: '../../.env' })
const url = (env.parsed && env.parsed.DATABASE_URL) ? env.parsed.DATABASE_URL : process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, ssl: 'require' })

async function truncateAll() {
  // Use TRUNCATE ... CASCADE to clear all data respecting FKs
  await sql`
    truncate table 
      schedule_overrides,
      professional_services,
      campaign_recipients,
      campaigns,
      messages,
      chat_messages,
      chats,
      appointments,
      availability,
      integrations,
      salon_integrations,
      leads,
      salon_customers,
      customers,
      embeddings,
      agents,
      agent_stats,
      ai_usage_stats,
      professionals,
      services,
      salons,
      profiles
    restart identity cascade
  `
}

async function main() {
  console.log('resetting database at', url.replace(/:[^@]*@/, ':****@'))
  await truncateAll()
  await sql.end({ timeout: 0 })
  console.log('truncate-ok')
  // Opcionalmente rodar o seed se quiser popular dados iniciais
  // await import('./seed.mjs')
  console.log('reset-ok')
}

main().catch((err) => {
  console.error('reset-error', err)
  process.exit(1)
})
