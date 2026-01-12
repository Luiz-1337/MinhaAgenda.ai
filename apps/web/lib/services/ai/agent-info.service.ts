/**
 * Serviço para informações do agente (APPLICATION LAYER)
 */

import { db, agents } from "@repo/db"
import { and, eq } from "drizzle-orm"

export interface AgentInfo {
  id: string
  salonId: string
  name: string
  systemPrompt: string
  model: string
  tone: string
  whatsappNumber: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export class AgentInfoService {
  /**
   * Busca todas as informações do agente ativo de um salão
   */
  static async getActiveAgentInfo(salonId: string): Promise<AgentInfo | null> {
    try {
      const activeAgent = await db.query.agents.findFirst({
        where: and(eq(agents.salonId, salonId), eq(agents.isActive, true)),
      })

      if (!activeAgent) {
        return null
      }

      return {
        id: activeAgent.id,
        salonId: activeAgent.salonId,
        name: activeAgent.name,
        systemPrompt: activeAgent.systemPrompt,
        model: activeAgent.model,
        tone: activeAgent.tone,
        whatsappNumber: activeAgent.whatsappNumber,
        isActive: activeAgent.isActive,
        createdAt: activeAgent.createdAt,
        updatedAt: activeAgent.updatedAt,
      }
    } catch {
      return null
    }
  }
}

// Export function for backward compatibility
export async function getActiveAgentInfo(salonId: string): Promise<AgentInfo | null> {
  return AgentInfoService.getActiveAgentInfo(salonId)
}
