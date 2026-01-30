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
  const file = path.resolve(__dirname, '..', 'drizzle', '0024_add_twilio_whatsapp_fields.sql')
  const content = fs.readFileSync(file, 'utf8')
  
  // Split by semicolons but handle $$ blocks for DO statements
  const statements = []
  let current = ''
  let inDoBlock = false
  
  for (const line of content.split('\n')) {
    current += line + '\n'
    
    if (line.includes('DO $$') || line.includes('DO $')) {
      inDoBlock = true
    }
    if (inDoBlock && line.includes('$$;')) {
      inDoBlock = false
      statements.push(current.trim())
      current = ''
    } else if (!inDoBlock && line.trim().endsWith(';') && !line.trim().startsWith('--')) {
      statements.push(current.trim())
      current = ''
    }
  }
  
  if (current.trim()) {
    statements.push(current.trim())
  }
  
  for (const statement of statements) {
    if (!statement || statement.startsWith('--')) continue
    
    try {
      console.log(`Executing: ${statement.substring(0, 60)}...`)
      await sql.unsafe(statement)
      console.log('  OK')
    } catch (error) {
      // Códigos de erro PostgreSQL:
      // 42P07 = relation already exists (tabela/sequência)
      // 42710 = duplicate object (enum/type já existe)
      // 42701 = duplicate column (coluna já existe)
      // 23505 = unique violation (constraint já existe)
      // 42P16 = invalid table definition (pode ocorrer se constraint já existe)
      if (error.code === '42P07' || error.code === '42710' || error.code === '42701' || error.code === '23505' || error.code === '42P16') {
        console.log(`  Ignorando (objeto já existe): ${error.code} - ${error.message?.split('\n')[0]}`)
        continue
      }
      throw error
    }
  }
  
  console.log('\n✅ Migração 0024 (Twilio WhatsApp) concluída com sucesso!')
  await sql.end({ timeout: 0 })
}

main().catch((err) => {
  console.error('❌ Erro na migração:', err)
  process.exit(1)
})
