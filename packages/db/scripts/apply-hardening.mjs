import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as dotenv from 'dotenv'
import postgres from 'postgres'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Tenta carregar .env da raiz do monorepo (3 níveis acima: scripts -> db -> packages -> root)
const rootEnvPath = path.resolve(__dirname, '../../../.env')
dotenv.config({ path: rootEnvPath })

// Fallback: Tenta carregar localmente se a raiz falhar ou variavel nao existir
if (!process.env.DATABASE_URL) {
    dotenv.config({ path: path.resolve(__dirname, '../../.env') })
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('ERRO: DATABASE_URL não encontrada.')
  console.error('Verifique se o arquivo .env existe em:', rootEnvPath)
  process.exit(1)
}

const sql = postgres(url, { prepare: false, ssl: 'require' })

async function main() {
  const file = path.resolve(__dirname, '../../../supabase/migrations/999_security_hardening.sql')
  
  if (!fs.existsSync(file)) {
      console.error('Arquivo de migração não encontrado:', file)
      process.exit(1)
  }

  console.log('Lendo arquivo de migração:', file)
  const content = fs.readFileSync(file, 'utf8')
  
  console.log('Aplicando hardening de segurança...')
  
  try {
    // Executa o SQL completo
    await sql.unsafe(content)
    console.log('✅ SUCESSO: Todas as políticas de segurança (RLS) foram aplicadas!')
  } catch (error) {
    console.error('❌ ERRO ao aplicar hardening:')
    // Melhora a visualização do erro
    if (error.message) console.error('Mensagem:', error.message)
    if (error.code) console.error('Código PG:', error.code) 
    // Erros comuns: 
    // 42P07 (relation already exists) - se as policies já existirem
    // 42710 (duplicate object)
    
    // Se o erro for de "Policy already exists", podemos considerar sucesso parcial ou ignorar
    if (error.code === '42710') {
        console.log('⚠️ Aviso: Algumas políticas já existiam e não foram recriadas.')
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error('Erro fatal no script:', err)
  process.exit(1)
})


