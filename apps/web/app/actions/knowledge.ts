"use server"

import { embed } from "ai"
import { openai } from "@ai-sdk/openai"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types/common"
import { db, agentKnowledgeBase, agents, postgresClient } from "@repo/db"
import { eq, and, desc, sql } from "drizzle-orm"
import { hasSalonPermission } from "@/lib/services/permissions.service"

export type KnowledgeItem = {
  id: string
  agentId: string
  content: string
  metadata: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Cria um novo item de conhecimento para um agente
 */
export async function createKnowledgeItem(
  agentId: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<ActionResult<KnowledgeItem>> {
  try {
    if (!agentId || !content?.trim()) {
      return { error: "agentId e content são obrigatórios" }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Não autenticado" }
    }

    // Busca o agente para obter o salonId
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
      columns: { salonId: true },
    })

    if (!agent) {
      return { error: "Agente não encontrado" }
    }

    // Verifica permissões
    const hasAccess = await hasSalonPermission(agent.salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // Gera o embedding do conteúdo
    const { embedding: embeddingVector } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: content.trim(),
    })

    // Formata o vetor como string PostgreSQL array para o tipo vector
    // O formato deve ser: [valor1,valor2,...]
    const embeddingString = `[${embeddingVector.join(",")}]`

    // Salva no banco usando SQL raw para o embedding
    // O Drizzle não suporta nativamente o tipo vector, então usamos o cliente postgres diretamente
    const [result] = await postgresClient`
      INSERT INTO agent_knowledge_base (agent_id, content, embedding, metadata)
      VALUES (${agentId}, ${content.trim()}, ${embeddingString}::vector, ${metadata ? JSON.stringify(metadata) : null}::jsonb)
      RETURNING id, agent_id, content, metadata, created_at, updated_at
    ` as Array<{
      id: string
      agent_id: string
      content: string
      metadata: Record<string, unknown> | null
      created_at: Date
      updated_at: Date
    }>

    return {
      success: true,
      data: {
        id: result.id,
        agentId: result.agent_id,
        content: result.content,
        metadata: result.metadata as Record<string, unknown> | null,
        createdAt: result.created_at,
        updatedAt: result.updated_at,
      },
    }
  } catch (error) {
    console.error("Erro ao criar item de conhecimento:", error)
    return {
      error: error instanceof Error ? error.message : "Falha ao criar item de conhecimento.",
    }
  }
}

/**
 * Obtém todos os itens de conhecimento de um agente
 */
export async function getKnowledgeItems(agentId: string): Promise<ActionResult<KnowledgeItem[]>> {
  try {
    if (!agentId) {
      return { error: "agentId é obrigatório" }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Não autenticado" }
    }

    // Busca o agente para obter o salonId
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
      columns: { salonId: true },
    })

    if (!agent) {
      return { error: "Agente não encontrado" }
    }

    // Verifica permissões
    const hasAccess = await hasSalonPermission(agent.salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // Busca os itens
    const items = await db.query.agentKnowledgeBase.findMany({
      where: eq(agentKnowledgeBase.agentId, agentId),
      orderBy: [desc(agentKnowledgeBase.createdAt)],
    })

    const formattedItems: KnowledgeItem[] = items.map((item) => ({
      id: item.id,
      agentId: item.agentId,
      content: item.content,
      metadata: item.metadata as Record<string, unknown> | null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }))

    return { success: true, data: formattedItems }
  } catch (error) {
    console.error("Erro ao buscar itens de conhecimento:", error)
    return { error: "Falha ao buscar itens de conhecimento." }
  }
}

/**
 * Remove um item de conhecimento
 */
export async function deleteKnowledgeItem(
  agentId: string,
  itemId: string
): Promise<ActionResult> {
  try {
    if (!agentId || !itemId) {
      return { error: "agentId e itemId são obrigatórios" }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Não autenticado" }
    }

    // Busca o agente para obter o salonId
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
      columns: { salonId: true },
    })

    if (!agent) {
      return { error: "Agente não encontrado" }
    }

    // Verifica permissões
    const hasAccess = await hasSalonPermission(agent.salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // Verifica se o item pertence ao agente
    const item = await db.query.agentKnowledgeBase.findFirst({
      where: and(eq(agentKnowledgeBase.id, itemId), eq(agentKnowledgeBase.agentId, agentId)),
    })

    if (!item) {
      return { error: "Item não encontrado" }
    }

    // Remove o item
    await db.delete(agentKnowledgeBase).where(eq(agentKnowledgeBase.id, itemId))

    return { success: true }
  } catch (error) {
    console.error("Erro ao remover item de conhecimento:", error)
    return { error: "Falha ao remover item de conhecimento." }
  }
}

/**
 * Busca contexto relevante para uma query usando similaridade de embeddings
 */
export async function findRelevantContext(
  agentId: string,
  query: string,
  limit = 3
): Promise<ActionResult<Array<{ content: string; metadata?: Record<string, unknown> }>>> {
  try {
    if (!agentId || !query?.trim()) {
      return { error: "agentId e query são obrigatórios" }
    }

    // Gera o embedding da query
    const { embedding: queryEmbedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: query.trim(),
    })

    // Busca por similaridade usando SQL raw (pgvector)
    // O operador <=> calcula a distância cosseno (menor = mais similar)
    // Converte o array de embedding para formato PostgreSQL array string
    // O formato correto é: '[0.1,0.2,0.3,...]'::vector
    const embeddingArrayString = `[${queryEmbedding.join(",")}]`
    
    // Usa o cliente postgres diretamente porque o Drizzle não suporta operador <=> do pgvector
    const results = await postgresClient`
      SELECT content, metadata
      FROM agent_knowledge_base
      WHERE agent_id = ${agentId}
      ORDER BY embedding <=> ${embeddingArrayString}::vector
      LIMIT ${limit}
    ` as Array<{
      content: string
      metadata: Record<string, unknown> | null
    }>

    const formattedResults = results.map((row) => ({
      content: row.content,
      metadata: row.metadata as Record<string, unknown> | undefined,
    }))

    return { success: true, data: formattedResults }
  } catch (error) {
    console.error("Erro ao buscar contexto relevante:", error)
    return { error: "Falha ao buscar contexto relevante." }
  }
}

