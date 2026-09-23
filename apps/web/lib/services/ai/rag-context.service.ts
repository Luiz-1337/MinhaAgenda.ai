/**
 * Serviço RAG independente - busca de contexto vetorial
 *
 * Sem "use server" para funcionar em qualquer contexto (Next.js, worker tsx, etc.)
 * Usado por: Chat Web, Worker WhatsApp
 */

import { postgresClient } from "@repo/db"
import { getOpenAIClient } from "./openai-client"

export type RAGContextItem = {
  id: string
  content: string
  similarity: number
  metadata?: Record<string, unknown>
}

/** Um dos itens mais parecidos com a mensagem, tenha ou não passado do corte. */
export type RAGCandidate = {
  id: string
  similarity: number
  included: boolean
}

export type RAGFailureReason = "sem_mensagem" | "sem_embedding" | "erro_busca"

export type FindRelevantContextResult =
  | { success: true; data: RAGContextItem[]; candidates: RAGCandidate[] }
  | { error: string; reason: RAGFailureReason }

/**
 * O que o RAG fez numa mensagem. Vai para messages.rag_context (migration 033) e
 * para o log, para calibrar o corte com mensagens reais em vez de chute. Só ids e
 * notas de semelhança, nunca o conteúdo dos itens.
 */
export type RagTrace = {
  outcome: "ok" | "abaixo_do_corte" | RAGFailureReason
  threshold: number
  limit: number
  candidates: RAGCandidate[]
}

export const RAG_DEFAULT_THRESHOLD = 0.65
export const RAG_DEFAULT_LIMIT = 5
const RAG_MAX_LIMIT = 20

/**
 * Corte e teto do RAG a partir das envs (RAG_SIMILARITY_THRESHOLD / RAG_MAX_RESULTS).
 * Valor inválido cai no padrão e é devolvido em `invalid` para quem chama avisar:
 * parseFloat("0,6") dava 0, que deixava TUDO passar do corte; "65" fazia nada
 * passar; e um top-k inválido virava LIMIT NaN — erro de SQL engolido em silêncio.
 */
export function resolveRagSettings(
  rawThreshold: string | undefined,
  rawLimit: string | undefined
): { threshold: number; limit: number; invalid: string[] } {
  const invalid: string[] = []

  let threshold = rawThreshold === undefined ? RAG_DEFAULT_THRESHOLD : Number(rawThreshold)
  if (!(threshold > 0 && threshold < 1)) {
    invalid.push(`RAG_SIMILARITY_THRESHOLD=${rawThreshold}`)
    threshold = RAG_DEFAULT_THRESHOLD
  }

  let limit = rawLimit === undefined ? RAG_DEFAULT_LIMIT : Number(rawLimit)
  if (!(Number.isInteger(limit) && limit >= 1 && limit <= RAG_MAX_LIMIT)) {
    invalid.push(`RAG_MAX_RESULTS=${rawLimit}`)
    limit = RAG_DEFAULT_LIMIT
  }

  return { threshold, limit, invalid }
}

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
 *
 * Traz os `limit` itens mais parecidos SEM o corte no SQL e aplica o corte aqui.
 * Para quem usa `data`, o resultado é o mesmo de antes: quem passa do corte está
 * sempre entre os mais parecidos. A diferença é que os que ficaram de fora voltam
 * em `candidates`, com a nota — sem eles não há como saber se o corte está alto
 * demais.
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
      SELECT id, content, metadata, 1 - (embedding <=> ${embeddingArrayString}::vector) as similarity
      FROM agent_knowledge_base
      WHERE agent_id = ${agentId}
      ORDER BY embedding <=> ${embeddingArrayString}::vector
      LIMIT ${limit}
    ` as Array<{
      id: string
      content: string
      metadata: Record<string, unknown> | null
      similarity: number
    }>

    const candidates: RAGCandidate[] = results.map((row) => ({
      id: row.id,
      similarity: Number(row.similarity),
      included: Number(row.similarity) >= similarityThreshold,
    }))

    const formattedResults: RAGContextItem[] = results
      .filter((_, i) => candidates[i].included)
      .map((row) => ({
        id: row.id,
        content: row.content,
        similarity: Number(row.similarity),
        metadata: row.metadata as Record<string, unknown> | undefined,
      }))

    return { success: true, data: formattedResults, candidates }
  } catch (error) {
    if (AI_DEBUG && error instanceof Error) {
      console.error("[RAG] Erro na busca pgvector:", error.message)
    }
    return {
      error: error instanceof Error ? error.message : "Falha ao buscar contexto relevante.",
      reason: "erro_busca",
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
      return { error: "agentId e query são obrigatórios", reason: "sem_mensagem" }
    }

    const embedding = precomputedEmbedding ?? await generateQueryEmbedding(query)

    if (!embedding) {
      return { error: "Falha ao gerar embedding da query", reason: "sem_embedding" }
    }

    return searchWithEmbedding(agentId, embedding, limit, similarityThreshold)
  } catch (error) {
    if (AI_DEBUG && error instanceof Error) {
      console.error("[RAG] Erro detalhado:", { message: error.message, agentId })
    }
    return {
      error: error instanceof Error ? error.message : "Falha ao buscar contexto relevante.",
      reason: "erro_busca",
    }
  }
}
