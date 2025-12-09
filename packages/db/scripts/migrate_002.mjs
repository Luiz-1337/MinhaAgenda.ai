import * as fs from 'node:fs'
import * as path from 'node:path'
import * as dotenv from 'dotenv'
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: '../../.env' })

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, ssl: 'require' })

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const file = path.resolve(__dirname, '..', 'drizzle', '0002_user_tier_and_password.sql')
  const content = fs.readFileSync(file, 'utf8')
  const chunks = content.split(';').map((c) => c.trim()).filter(Boolean)
  for (const chunk of chunks) {
    await sql.unsafe(chunk)
  }
  console.log('manual-migrate-002-ok')
  await sql.end({ timeout: 0 })
}

main().catch((err) => {
  console.error('manual-migrate-002-error', err)
  process.exit(1)
})

