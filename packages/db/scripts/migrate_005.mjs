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
        // Códigos de erro PostgreSQL:
        // 42P07 = relation already exists (tabela/sequência)
        // 42710 = duplicate object (enum/type já existe)
        // 42701 = duplicate column (coluna já existe)
        // 23505 = unique violation (constraint já existe)
        // 42P16 = invalid table definition (pode ocorrer se constraint já existe)
        if (err.code === '42P07' || err.code === '42710' || err.code === '42701' || err.code === '23505' || err.code === '42P16') {
          console.log(`⚠ Ignorando erro (objeto já existe): ${err.code} - ${err.message?.split('\n')[0]}`)
        } else {
          console.error('✗ Error executing statement:', err.message)
          console.error('Statement:', statement.substring(0, 100) + '...')
          throw err
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

