import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as dotenv from 'dotenv'
import postgres from 'postgres'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..', '..', '..')

// Mesma ordem de prioridade do packages/db/src/index.ts
dotenv.config({ path: path.resolve(root, '.env.local'), override: false })
dotenv.config({ path: path.resolve(root, '.env'), override: false })
dotenv.config({ path: path.resolve(root, 'apps/web/.env.local'), override: false })

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, ssl: 'require' })

async function main() {
  const file = path.resolve(__dirname, '..', 'drizzle', '0041_system_alerts.sql')
  const content = fs.readFileSync(file, 'utf8')
  const chunks = content.split('--> statement-breakpoint').map((c) => c.trim()).filter(Boolean)
  for (const chunk of chunks) {
    try {
      await sql.unsafe(chunk)
    } catch (error) {
      // 42P07 relation exists, 42710 duplicate object, 42701 duplicate column,
      // 23505 unique violation, 42P16 invalid table def (constraint já existe)
      if (['42P07', '42710', '42701', '23505', '42P16'].includes(error.code)) {
        console.log(`Ignorando erro (objeto já existe): ${error.code} - ${error.message?.split('\n')[0]}`)
        continue
      }
      throw error
    }
  }
  console.log('migrate-041-ok')
  await sql.end({ timeout: 0 })
}

main().catch((err) => {
  console.error('migrate-041-error', err)
  process.exit(1)
})
