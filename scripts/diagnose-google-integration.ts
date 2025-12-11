/**
 * Script de diagnóstico para integração Google Calendar
 * Verifica se a tabela existe e se há integrações salvas
 */

import * as dotenv from 'dotenv'
import postgres from 'postgres'

dotenv.config({ path: '../.env' })

const url = process.env.DATABASE_URL
if (!url) {
  console.error('❌ DATABASE_URL não configurado')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, ssl: 'require' })

async function main() {
  console.log('🔍 Diagnosticando integração Google Calendar...\n')

  try {
    // 1. Verifica se a tabela existe
    console.log('1️⃣ Verificando se a tabela salon_integrations existe...')
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'salon_integrations'
      )
    `
    
    if (!tableExists[0]?.exists) {
      console.log('❌ Tabela salon_integrations NÃO existe!')
      console.log('   Execute: pnpm db:push ou aplique a migração manualmente')
      await sql.end()
      process.exit(1)
    }
    console.log('✅ Tabela existe\n')

    // 2. Verifica estrutura da tabela
    console.log('2️⃣ Verificando estrutura da tabela...')
    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'salon_integrations'
      ORDER BY ordinal_position
    `
    console.log('   Colunas encontradas:')
    columns.forEach((col: any) => {
      console.log(`   - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`)
    })
    console.log()

    // 3. Verifica se há integrações salvas
    console.log('3️⃣ Verificando integrações salvas...')
    const integrations = await sql`
      SELECT 
        id,
        salon_id,
        provider,
        email,
        created_at,
        updated_at,
        CASE 
          WHEN refresh_token IS NOT NULL THEN '✅' 
          ELSE '❌' 
        END as has_refresh_token,
        CASE 
          WHEN access_token IS NOT NULL THEN '✅' 
          ELSE '❌' 
        END as has_access_token,
        expires_at
      FROM salon_integrations
    `
    
    if (integrations.length === 0) {
      console.log('⚠️  Nenhuma integração encontrada no banco')
      console.log('   Isso significa que:')
      console.log('   - A autenticação não foi completada, OU')
      console.log('   - Houve um erro ao salvar no banco')
      console.log('\n   Verifique os logs do servidor ao fazer a autenticação')
    } else {
      console.log(`✅ Encontradas ${integrations.length} integração(ões):\n`)
      integrations.forEach((int: any) => {
        console.log(`   ID: ${int.id}`)
        console.log(`   Salon ID: ${int.salon_id}`)
        console.log(`   Provider: ${int.provider}`)
        console.log(`   Email: ${int.email || 'N/A'}`)
        console.log(`   Refresh Token: ${int.has_refresh_token}`)
        console.log(`   Access Token: ${int.has_access_token}`)
        console.log(`   Expires At: ${int.expires_at ? new Date(int.expires_at * 1000).toLocaleString('pt-BR') : 'N/A'}`)
        console.log(`   Criado em: ${new Date(int.created_at).toLocaleString('pt-BR')}`)
        console.log(`   Atualizado em: ${new Date(int.updated_at).toLocaleString('pt-BR')}`)
        console.log()
      })
    }

    // 4. Verifica salões disponíveis
    console.log('4️⃣ Verificando salões disponíveis...')
    const salons = await sql`
      SELECT id, name, owner_id, created_at
      FROM salons
      ORDER BY created_at DESC
      LIMIT 5
    `
    
    if (salons.length === 0) {
      console.log('⚠️  Nenhum salão encontrado')
    } else {
      console.log(`✅ Encontrados ${salons.length} salão(ões):\n`)
      salons.forEach((salon: any) => {
        console.log(`   ID: ${salon.id}`)
        console.log(`   Nome: ${salon.name}`)
        console.log(`   Owner ID: ${salon.owner_id}`)
        console.log()
      })
    }

    console.log('\n✅ Diagnóstico completo!')
  } catch (error: any) {
    console.error('❌ Erro durante diagnóstico:', error.message)
    console.error(error)
  } finally {
    await sql.end()
  }
}

main()

