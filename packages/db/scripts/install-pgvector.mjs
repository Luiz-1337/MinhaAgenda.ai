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
  try {
    console.log('Instalando extensão pgvector...')
    await sql`CREATE EXTENSION IF NOT EXISTS vector`
    console.log('✓ Extensão pgvector instalada com sucesso!')
  } catch (error) {
    if (error.code === '42501') {
      console.error('✗ Erro: Sem permissão para criar extensões. Execute como superusuário:')
      console.error('  psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector"')
    } else {
      console.error('✗ Erro ao instalar extensão:', error.message)
    }
    process.exit(1)
  } finally {
    await sql.end({ timeout: 0 })
  }
}

main()

