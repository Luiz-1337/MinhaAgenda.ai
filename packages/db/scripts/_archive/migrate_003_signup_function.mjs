import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import fs from 'fs'
import postgres from 'postgres'

dotenv.config({ path: '../../.env' })

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, ssl: 'require' })

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const file = resolve(__dirname, '..', '..', '..', 'supabase', 'migrations', '003_update_profile_on_signup.sql')
  
  if (!fs.existsSync(file)) {
    console.error(`Migration file not found: ${file}`)
    process.exit(1)
  }
  
  const content = fs.readFileSync(file, 'utf8')
  
  console.log('Aplicando migração 003_update_profile_on_signup.sql...')
  
  try {
    await sql.unsafe(content)
    console.log('✓ Migração aplicada com sucesso!')
  } catch (err) {
    // Códigos de erro PostgreSQL:
    // 42P07 = relation already exists (tabela/sequência)
    // 42710 = duplicate object (enum/type já existe)
    // 42701 = duplicate column (coluna já existe)
    // 23505 = unique violation (constraint já existe)
    // 42P16 = invalid table definition (pode ocorrer se constraint já existe)
    // 42883 = function already exists
    if (err.code === '42P07' || err.code === '42710' || err.code === '42701' || err.code === '23505' || err.code === '42P16' || err.code === '42883') {
      console.log(`⚠ Função já existe ou objeto já criado: ${err.code} - ${err.message?.split('\n')[0]}`)
      console.log('✓ Migração já aplicada anteriormente')
    } else {
      console.error('✗ Erro ao aplicar migração:', err.message)
      throw err
    }
  }
  
  await sql.end({ timeout: 0 })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})





