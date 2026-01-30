/**
 * Script para testar similaridade do RAG com uma query específica
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
  onnotice: () => {},
})

const AGENT_ID = 'a07f8247-e953-4973-a577-67f4c1a864ff'
const TEST_QUERY = 'Aoba, bão ?'

async function testRAGSimilarity() {
  console.log('🧪 Testando RAG Similarity...\n')
  console.log('Agent ID:', AGENT_ID)
  console.log('Test Query:', TEST_QUERY)
  console.log('')

  try {
    // 1. Ver todo o conhecimento do agente
    console.log('📚 Knowledge base content:')
    const allItems = await sql`
      SELECT id, content, metadata, created_at
      FROM agent_knowledge_base
      WHERE agent_id = ${AGENT_ID}
      ORDER BY created_at DESC
    `

    if (allItems.length === 0) {
      console.log('❌ Nenhum conhecimento encontrado para este agente!')
      console.log('   Adicione conhecimento pela interface do agente.\n')
      return
    }

    console.log(`\nTotal items: ${allItems.length}\n`)
    allItems.forEach((item, idx) => {
      console.log(`[${idx + 1}] Length: ${item.content.length} chars`)
      console.log(`    Full Content: "${item.content}"`)
      console.log(`    Metadata:`, item.metadata)
      console.log(`    Created:`, item.created_at.toISOString())
      console.log('')
    })

    // 2. Criar um embedding de teste (simulando o que o RAG faz)
    console.log('🧠 Nota: Para testar a similaridade real, precisamos do OpenAI API.')
    console.log('   O RAG usa text-embedding-3-small para gerar embeddings.')
    console.log('')
    console.log('💡 Dica: Para ver o RAG em ação:')
    console.log('   1. Envie a mensagem pelo chat')
    console.log('   2. Observe os logs no console')
    console.log('   3. Veja se "✅ RAG: Found X relevant item(s)" aparece')
    console.log('')

    // 3. Verificar se os embeddings existem
    console.log('🔍 Verificando embeddings...')
    const embeddingCheck = await sql`
      SELECT
        COUNT(*) as total,
        AVG(array_length(embedding::real[], 1)) as avg_dim
      FROM agent_knowledge_base
      WHERE agent_id = ${AGENT_ID}
    `

    const avgDim = Math.round(embeddingCheck[0].avg_dim)
    console.log(`✅ Embeddings: ${embeddingCheck[0].total} item(s), dimensão média: ${avgDim}`)

    if (avgDim !== 1536) {
      console.log('⚠️  ATENÇÃO: Dimensão incorreta! Esperado: 1536 (text-embedding-3-small)')
    }

    console.log('\n✅ Knowledge base está configurada!')
    console.log('\n📝 Próximo passo:')
    console.log('   Envie a mensagem "' + TEST_QUERY + '" pelo chat')
    console.log('   e observe os logs no console do servidor.\n')

  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await sql.end()
  }
}

testRAGSimilarity()
