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
  const file = path.resolve(__dirname, '..', 'drizzle', '0005_dashboard_stats.sql')
  
  if (!fs.existsSync(file)) {
    console.error(`Migration file not found: ${file}`)
    process.exit(1)
  }
  
  const content = fs.readFileSync(file, 'utf8')
  const statements = content.split(';').map((s) => s.trim()).filter(Boolean)
  
  console.log(`Executing ${statements.length} statements from 0005_dashboard_stats.sql...`)
  
  for (const statement of statements) {
    if (statement) {
      try {
        await sql.unsafe(statement)
        console.log('✓ Executed statement')
      } catch (err) {
        // Ignora erros de "already exists" mas mostra outros
        if (err.message && err.message.includes('already exists')) {
          console.log('⚠ Statement already applied (skipping)')
        } else {
          console.error('✗ Error executing statement:', err.message)
          console.error('Statement:', statement.substring(0, 100) + '...')
        }
      }
    }
  }
  
  console.log('✓ Migration 0005 completed')
  await sql.end({ timeout: 0 })
}

main().catch((err) => {
  console.error('✗ Migration error:', err)
  process.exit(1)
})

