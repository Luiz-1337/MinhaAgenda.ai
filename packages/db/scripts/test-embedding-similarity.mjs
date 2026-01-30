/**
 * Script para testar similaridade real entre query e conhecimento
 * Usa a mesma lógica do RAG
 */

import postgres from 'postgres'
import { config } from 'dotenv'
import { resolve } from 'path'
import { embed } from 'ai'
import { openai } from '@ai-sdk/openai'

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

async function testEmbeddingSimilarity() {
  console.log('🧪 Testando Embedding Similarity (Real RAG Test)\n')
  console.log('Agent ID:', AGENT_ID)
  console.log('Query:', TEST_QUERY)
  console.log('')

  try {
    // 1. Gerar embedding da query (igual ao RAG)
    console.log('🧠 Generating embedding for query...')
    const { embedding: queryEmbedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: TEST_QUERY.trim(),
    })
    console.log('✅ Embedding generated:', queryEmbedding.length, 'dimensions\n')

    // 2. Formatar como array PostgreSQL
    const embeddingArrayString = `[${queryEmbedding.join(',')}]`

    // 3. Buscar com diferentes thresholds
    console.log('🔍 Searching with different similarity thresholds...\n')

    const thresholds = [0.5, 0.6, 0.7, 0.8, 0.9]

    for (const threshold of thresholds) {
      const results = await sql`
        SELECT
          content,
          metadata,
          1 - (embedding <=> ${embeddingArrayString}::vector) as similarity
        FROM agent_knowledge_base
        WHERE agent_id = ${AGENT_ID}
          AND (1 - (embedding <=> ${embeddingArrayString}::vector)) >= ${threshold}
        ORDER BY embedding <=> ${embeddingArrayString}::vector
        LIMIT 3
      `

      console.log(`Threshold ${threshold} (${threshold * 100}%): ${results.length} result(s)`)

      if (results.length > 0) {
        results.forEach((item, idx) => {
          const similarity = (item.similarity * 100).toFixed(2)
          console.log(`  [${idx + 1}] Similarity: ${similarity}%`)
          console.log(`      Content: "${item.content.substring(0, 80)}..."`)
        })
      }
      console.log('')
    }

    // 4. Buscar TODOS os itens sem filtro de threshold
    console.log('📊 ALL items with similarity (no threshold filter):\n')
    const allResults = await sql`
      SELECT
        content,
        metadata,
        1 - (embedding <=> ${embeddingArrayString}::vector) as similarity
      FROM agent_knowledge_base
      WHERE agent_id = ${AGENT_ID}
      ORDER BY embedding <=> ${embeddingArrayString}::vector
    `

    allResults.forEach((item, idx) => {
      const similarity = (item.similarity * 100).toFixed(2)
      const emoji = item.similarity >= 0.7 ? '✅' : item.similarity >= 0.5 ? '⚠️' : '❌'
      console.log(`${emoji} [${idx + 1}] Similarity: ${similarity}%`)
      console.log(`    Content: "${item.content.substring(0, 100)}..."`)
      console.log('')
    })

    console.log('💡 Interpretação:')
    console.log('   ✅ >= 70%: Será usado pelo RAG (threshold padrão)')
    console.log('   ⚠️  50-69%: Baixa similaridade, considere reformular')
    console.log('   ❌ < 50%: Não é relevante para a query\n')

  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await sql.end()
  }
}

testEmbeddingSimilarity()
