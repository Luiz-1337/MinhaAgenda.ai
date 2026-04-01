/**
 * Serviço RAG independente - busca de contexto vetorial
 *
 * Sem "use server" para funcionar em qualquer contexto (Next.js, worker tsx, etc.)
 * Usado por: Chat Web, Worker WhatsApp
 */

import { postgresClient } from "@repo/db"
import { getOpenAIClient } from "./openai-client"

export type RAGContextItem = {
  content: string
  similarity: number
  metadata?: Record<string, unknown>
}

export type FindRelevantContextResult =
  | { success: true; data: RAGContextItem[] }
  | { error: string }

const AI_DEBUG = process.env.AI_DEBUG === "true"

/**
 * Gera embedding para uma query (passo caro - chamada OpenAI API).
 * Pode ser iniciado especulativamente antes de saber se RAG é necessário.
 */
export async function generateQueryEmbedding(query: string): Promise<number[] | null> {
  try {
    if (!query?.trim()) return null

    const openai = getOpenAIClient()
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query.trim(),
    })
    return embeddingResponse.data[0]?.embedding ?? null
  } catch (error) {
    if (AI_DEBUG) console.error("[RAG] Erro ao gerar embedding:", error)
    return null
  }
}

/**
 * Busca documentos similares usando um embedding pré-gerado.
 */
export async function searchWithEmbedding(
  agentId: string,
  embedding: number[],
  limit = 3,
  similarityThreshold = 0.7
): Promise<FindRelevantContextResult> {
  try {
    const embeddingArrayString = `[${embedding.join(",")}]`

    const results = await postgresClient`
      SELECT content, metadata, 1 - (embedding <=> ${embeddingArrayString}::vector) as similarity
      FROM agent_knowledge_base
      WHERE agent_id = ${agentId}
        AND (1 - (embedding <=> ${embeddingArrayString}::vector)) >= ${similarityThreshold}
      ORDER BY embedding <=> ${embeddingArrayString}::vector
      LIMIT ${limit}
    ` as Array<{
      content: string
      metadata: Record<string, unknown> | null
      similarity: number
    }>

    const formattedResults: RAGContextItem[] = results.map((row) => ({
      content: row.content,
      similarity: row.similarity,
      metadata: row.metadata as Record<string, unknown> | undefined,
    }))

    return { success: true, data: formattedResults }
  } catch (error) {
    if (AI_DEBUG && error instanceof Error) {
      console.error("[RAG] Erro na busca pgvector:", error.message)
    }
    return {
      error: error instanceof Error ? error.message : "Falha ao buscar contexto relevante.",
    }
  }
}

/**
 * Busca contexto relevante para uma query usando similaridade de embeddings.
 * Aceita um embedding pré-gerado (especulativo) ou gera um novo.
 */
export async function findRelevantContext(
  agentId: string,
  query: string,
  limit = 3,
  similarityThreshold = 0.7,
  precomputedEmbedding?: number[] | null
): Promise<FindRelevantContextResult> {
  try {
    if (!agentId || !query?.trim()) {
      return { error: "agentId e query são obrigatórios" }
    }

    const embedding = precomputedEmbedding ?? await generateQueryEmbedding(query)

    if (!embedding) {
      return { error: "Falha ao gerar embedding da query" }
    }

    return searchWithEmbedding(agentId, embedding, limit, similarityThreshold)
  } catch (error) {
    if (AI_DEBUG && error instanceof Error) {
      console.error("[RAG] Erro detalhado:", { message: error.message, agentId })
    }
    return {
      error: error instanceof Error ? error.message : "Falha ao buscar contexto relevante.",
    }
  }
}
