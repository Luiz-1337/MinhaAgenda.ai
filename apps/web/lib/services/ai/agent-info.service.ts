/**
 * Serviço para informações do agente (APPLICATION LAYER)
 */

import { db, agents, agentKnowledgeBase } from "@repo/db"
import { and, eq, sql } from "drizzle-orm"

export interface AgentInfo {
  id: string
  salonId: string
  name: string
  systemPrompt: string
  model: string
  tone: string
  whatsappNumber: string | null
  isActive: boolean
  hasKnowledgeBase: boolean // Indica se tem conhecimento configurado
  createdAt: Date
  updatedAt: Date
}

// Cache simples em memória para info do agente (TTL: 60s)
const agentCache = new Map<string, { data: AgentInfo; timestamp: number }>();
const CACHE_TTL_MS = 60000; // 60 segundos

export class AgentInfoService {
  /**
   * Busca todas as informações do agente ativo de um salão
   * OTIMIZADO: Com cache e verificação de knowledge base
   */
  static async getActiveAgentInfo(salonId: string): Promise<AgentInfo | null> {
    try {
      // Verificar cache
      const cached = agentCache.get(salonId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
      }

      const activeAgent = await db.query.agents.findFirst({
        where: and(eq(agents.salonId, salonId), eq(agents.isActive, true)),
      })

      if (!activeAgent) {
        return null
      }

      // Verificar se tem knowledge base (query rápida com LIMIT 1)
      const hasKb = await db.query.agentKnowledgeBase.findFirst({
        where: eq(agentKnowledgeBase.agentId, activeAgent.id),
        columns: { id: true },
      });

      const agentInfo: AgentInfo = {
        id: activeAgent.id,
        salonId: activeAgent.salonId,
        name: activeAgent.name,
        systemPrompt: activeAgent.systemPrompt,
        model: activeAgent.model,
        tone: activeAgent.tone,
        whatsappNumber: activeAgent.whatsappNumber,
        isActive: activeAgent.isActive,
        hasKnowledgeBase: !!hasKb,
        createdAt: activeAgent.createdAt,
        updatedAt: activeAgent.updatedAt,
      }

      // Salvar no cache
      agentCache.set(salonId, { data: agentInfo, timestamp: Date.now() });

      return agentInfo;
    } catch {
      return null
    }
  }

  /**
   * Invalida o cache do agente (chamar quando agente for atualizado)
   */
  static invalidateCache(salonId: string): void {
    agentCache.delete(salonId);
  }
}

// Export function for backward compatibility
export async function getActiveAgentInfo(salonId: string): Promise<AgentInfo | null> {
  return AgentInfoService.getActiveAgentInfo(salonId)
}
