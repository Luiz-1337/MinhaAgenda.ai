import * as dotenv from 'dotenv'
import postgres from 'postgres'

const env = dotenv.config({ path: '../../.env' })
const url = (env.parsed && env.parsed.DATABASE_URL) ? env.parsed.DATABASE_URL : process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, ssl: 'require' })

async function tableExists(schema, tableName) {
  const result = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = ${schema} 
      AND table_name = ${tableName}
    ) as exists
  `
  return result[0]?.exists || false
}

async function truncateAll() {
  console.log('🗑️  Limpando todas as tabelas do banco de dados...')
  
  // Lista de todas as tabelas possíveis (na ordem correta para respeitar FKs)
  const publicTables = [
    'schedule_overrides',
    'professional_services',
    'campaign_recipients',
    'campaigns',
    'messages',
    'chat_messages',
    'chats',
    'appointments',
    'availability',
    'integrations',
    'salon_integrations',
    'leads',
    'customers',
    'embeddings',
    'agents',
    'agent_stats',
    'ai_usage_stats',
    'professionals',
    'services',
    'payments', // Pode não existir ainda
    'salons',
    'profiles'
  ]
  
  // Verificar e coletar apenas tabelas que existem
  console.log('📋 Verificando tabelas existentes no schema public...')
  const existingPublicTables = []
  for (const table of publicTables) {
    if (await tableExists('public', table)) {
      existingPublicTables.push(table)
      console.log(`   ✅ ${table}`)
    } else {
      console.log(`   ⚠️  ${table} (não existe, pulando)`)
    }
  }
  
  // Truncar tabelas do schema public que existem
  if (existingPublicTables.length > 0) {
    console.log(`\n🗑️  Limpando ${existingPublicTables.length} tabelas do schema public...`)
    const tableList = existingPublicTables.join(', ')
    await sql.unsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`)
    console.log('✅ Tabelas do schema public limpas com sucesso!')
  } else {
    console.log('⚠️  Nenhuma tabela encontrada no schema public')
  }
  
  // Depois, limpar tabelas do Supabase Auth
  console.log('\n🔐 Verificando tabelas do Supabase Auth...')
  try {
    const authTables = ['identities', 'users']
    const existingAuthTables = []
    
    for (const table of authTables) {
      if (await tableExists('auth', table)) {
        existingAuthTables.push(`auth.${table}`)
        console.log(`   ✅ auth.${table}`)
      } else {
        console.log(`   ⚠️  auth.${table} (não existe, pulando)`)
      }
    }
    
    if (existingAuthTables.length > 0) {
      // Limpar auth.identities primeiro (tem FK para auth.users)
      if (existingAuthTables.includes('auth.identities')) {
        await sql`truncate table auth.identities restart identity cascade`
      }
      
      // Limpar auth.users (isso também limpará os profiles via trigger)
      if (existingAuthTables.includes('auth.users')) {
        await sql`truncate table auth.users restart identity cascade`
      }
      
      console.log('✅ Tabelas do Auth limpas com sucesso')
    } else {
      console.log('⚠️  Nenhuma tabela do Auth encontrada')
    }
  } catch (authError) {
    console.warn('⚠️  Aviso ao limpar tabelas do Auth (pode ser normal se não houver permissões):', authError.message)
    // Não falhar completamente se não conseguir limpar auth (pode ser questão de permissões)
  }
  
  console.log('\n✅ Limpeza concluída!')
}

async function main() {
  console.log('🔄 Iniciando reset completo do banco de dados...')
  console.log('📍 Banco:', url.replace(/:[^@]*@/, ':****@'))
  console.log('')
  
  await truncateAll()
  
  await sql.end({ timeout: 0 })
  console.log('')
  console.log('✨ Reset completo concluído!')
  console.log('💡 O banco de dados está zerado e pronto para novos testes.')
  console.log('')
  console.log('💭 Dica: Execute "pnpm db:seed" se quiser popular dados de teste.')
}

main().catch((err) => {
  console.error('❌ Erro ao resetar banco de dados:', err)
  process.exit(1)
})
