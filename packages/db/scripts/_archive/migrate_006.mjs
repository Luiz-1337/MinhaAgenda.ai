import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as dotenv from 'dotenv'
import postgres from 'postgres'

dotenv.config({ path: '../../.env' })

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, ssl: 'require' })

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const file = path.resolve(__dirname, '..', 'drizzle', '0006_flat_jack_power.sql')
  
  if (!fs.existsSync(file)) {
    console.error(`Migration file not found: ${file}`)
    process.exit(1)
  }
  
  const content = fs.readFileSync(file, 'utf8')
  const chunks = content.split('--> statement-breakpoint').map((c) => c.trim()).filter(Boolean)
  
  for (const chunk of chunks) {
    try {
      await sql.unsafe(chunk)
    } catch (error) {
      // Códigos de erro PostgreSQL:
      // 42P07 = relation already exists (tabela/sequência)
      // 42710 = duplicate object (enum/type já existe)
      // 42701 = duplicate column (coluna já existe)
      // 23505 = unique violation (constraint já existe)
      // 42P16 = invalid table definition (pode ocorrer se constraint já existe)
      if (error.code === '42P07' || error.code === '42710' || error.code === '42701' || error.code === '23505' || error.code === '42P16') {
        console.log(`Ignorando erro (objeto já existe): ${error.code} - ${error.message?.split('\n')[0]}`)
        continue
      }
      throw error
    }
  }
  console.log('manual-migrate-006-ok')
  await sql.end({ timeout: 0 })
}

main().catch((err) => {
  console.error('manual-migrate-006-error', err)
  process.exit(1)
})

