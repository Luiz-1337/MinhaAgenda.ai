import { config } from 'dotenv';
import { resolve } from 'path';
import postgres from 'postgres'

config({ path: resolve(process.cwd(), '../../.env') });

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, ssl: 'require' })

async function main() {
  const rows = await sql`select 1 as ok`
  console.log('db-ok', rows[0].ok)
  await sql.end({ timeout: 0 })
}

main().catch((err) => {
  console.error('db-error', err)
  process.exit(1)
})
