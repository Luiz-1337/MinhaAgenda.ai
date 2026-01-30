/**
 * Serviço RAG independente - busca de contexto vetorial
 *
 * Sem "use server" para funcionar em qualquer contexto (Next.js, worker tsx, etc.)
 * Usado por: Chat Web, Worker WhatsApp
 */

import { embed } from "ai"
import { openai } from "@ai-sdk/openai"
import { postgresClient } from "@repo/db"

export type RAGContextItem = {
  content: string
  similarity: number
  metadata?: Record<string, unknown>
}

export type FindRelevantContextResult =
  | { success: true; data: RAGContextItem[] }
  | { error: string }

/**
 * Busca contexto relevante para uma query usando similaridade de embeddings
 * @param agentId ID do agente
 * @param query Texto da consulta
 * @param limit Número máximo de resultados (padrão: 3)
 * @param similarityThreshold Threshold de similaridade 0-1 (padrão: 0.7)
 */
export async function findRelevantContext(
  agentId: string,
  query: string,
  limit = 3,
  similarityThreshold = 0.7
): Promise<FindRelevantContextResult> {
  try {
    if (!agentId || !query?.trim()) {
      return { error: "agentId e query são obrigatórios" }
    }

    console.log("🧠 Generating embedding for query...");

    // Gera o embedding da query
    const { embedding: queryEmbedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: query.trim(),
    })

    console.log("✅ Embedding generated:", queryEmbedding.length, "dimensions");

    // Formato PostgreSQL array para o tipo vector
    const embeddingArrayString = `[${queryEmbedding.join(",")}]`

    console.log("🔎 Searching in database with pgvector...");

    // Busca por similaridade usando pgvector
    // <=> = distância cosseno (menor = mais similar)
    // Similaridade = 1 - distância
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

    console.log(`📊 pgvector query returned ${results.length} result(s)`);

    if (results.length === 0) {
      console.log("💡 Tip: Try lowering the similarity threshold (current:", similarityThreshold, ")");
    }

    const formattedResults: RAGContextItem[] = results.map((row) => ({
      content: row.content,
      similarity: row.similarity,
      metadata: row.metadata as Record<string, unknown> | undefined,
    }))

    return { success: true, data: formattedResults }
  } catch (error) {
    console.error("Erro ao buscar contexto relevante:", error)

    // Log detalhado para facilitar debug de problemas com pgvector
    if (error instanceof Error) {
      console.error("Erro detalhado RAG:", {
        message: error.message,
        stack: error.stack,
        agentId,
        queryLength: query.length,
      })

      // Se for erro de tipo vector, sugere solução
      if (error.message.includes("type") && error.message.includes("vector")) {
        console.error(
          "ERRO CRÍTICO: Extensão pgvector não instalada! Execute: CREATE EXTENSION IF NOT EXISTS vector;"
        )
      }
    }

    return {
      error: error instanceof Error ? error.message : "Falha ao buscar contexto relevante.",
    }
  }
}
