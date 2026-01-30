/**
 * Script para verificar se o RAG está configurado corretamente
 *
 * Verifica:
 * 1. Se a extensão pgvector está instalada
 * 2. Se a tabela agent_knowledge_base existe
 * 3. Se há conhecimento cadastrado
 * 4. Se os embeddings estão corretos
 */

import postgres from 'postgres'
import { config } from 'dotenv'
import { resolve } from 'path'

// Carrega variáveis de ambiente
config({ path: resolve(process.cwd(), '../../.env') })

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não encontrada no .env')
  process.exit(1)
}

const sql = postgres(DATABASE_URL, {
  max: 1,
  onnotice: () => {}, // Silencia notices
})

async function checkRAGSetup() {
  console.log('🔍 Verificando configuração do RAG...\n')

  try {
    // 1. Verificar extensão pgvector
    console.log('1️⃣  Verificando extensão pgvector...')
    const extensions = await sql`
      SELECT extname, extversion
      FROM pg_extension
      WHERE extname = 'vector'
    `

    if (extensions.length === 0) {
      console.log('❌ Extensão pgvector NÃO está instalada!')
      console.log('   Execute: CREATE EXTENSION IF NOT EXISTS vector;')
      console.log('   Ou rode: pnpm db:install-pgvector\n')
      return false
    } else {
      console.log(`✅ Extensão pgvector instalada (versão ${extensions[0].extversion})\n`)
    }

    // 2. Verificar se a tabela existe
    console.log('2️⃣  Verificando tabela agent_knowledge_base...')
    const tables = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'agent_knowledge_base'
      ) as exists
    `

    if (!tables[0].exists) {
      console.log('❌ Tabela agent_knowledge_base não existe!')
      console.log('   Execute as migrations: pnpm db:migrate\n')
      return false
    } else {
      console.log('✅ Tabela agent_knowledge_base existe\n')
    }

    // 3. Contar registros de conhecimento
    console.log('3️⃣  Verificando conhecimento cadastrado...')
    const count = await sql`
      SELECT COUNT(*) as total FROM agent_knowledge_base
    `

    const total = parseInt(count[0].total)
    if (total === 0) {
      console.log('⚠️  Nenhum conhecimento cadastrado ainda')
      console.log('   Adicione conhecimento através da interface do agente\n')
    } else {
      console.log(`✅ Total de ${total} item(ns) de conhecimento cadastrado(s)\n`)

      // 4. Verificar embeddings
      console.log('4️⃣  Verificando embeddings...')
      const embeddingCheck = await sql`
        SELECT
          agent_id,
          COUNT(*) as items,
          AVG(array_length(embedding::real[], 1)) as avg_dim
        FROM agent_knowledge_base
        GROUP BY agent_id
      `

      console.log('📊 Resumo por agente:')
      for (const row of embeddingCheck) {
        const avgDim = Math.round(row.avg_dim)
        const status = avgDim === 1536 ? '✅' : '❌'
        console.log(`   ${status} Agent ${row.agent_id}: ${row.items} item(s), dimensão média: ${avgDim}`)
      }

      if (embeddingCheck.some(row => Math.round(row.avg_dim) !== 1536)) {
        console.log('\n⚠️  ATENÇÃO: Alguns embeddings têm dimensão incorreta!')
        console.log('   Esperado: 1536 (text-embedding-3-small)')
      }
    }

    // 5. Testar query de similaridade básica
    if (total > 0) {
      console.log('\n5️⃣  Testando query de similaridade...')
      try {
        // Cria um vetor de teste (1536 dimensões, valores aleatórios)
        const testVector = Array(1536).fill(0).map(() => Math.random())
        const testVectorString = `[${testVector.join(',')}]`

        const similarityTest = await sql`
          SELECT
            agent_id,
            1 - (embedding <=> ${testVectorString}::vector) as similarity
          FROM agent_knowledge_base
          LIMIT 1
        `

        if (similarityTest.length > 0) {
          console.log('✅ Query de similaridade funcionando corretamente\n')
        }
      } catch (error) {
        console.log('❌ Erro ao testar query de similaridade:')
        console.log(`   ${error.message}\n`)
        return false
      }
    }

    console.log('\n🎉 Configuração do RAG está OK!')
    return true

  } catch (error) {
    console.error('❌ Erro durante verificação:')
    console.error(error)
    return false
  } finally {
    await sql.end()
  }
}

// Executa verificação
checkRAGSetup().then(success => {
  process.exit(success ? 0 : 1)
})
