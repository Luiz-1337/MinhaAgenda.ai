/**
 * Serviço para busca de contexto RAG (APPLICATION LAYER)
 */

import { findRelevantContext } from "@/app/actions/knowledge"
import { RAG_CONSTANTS } from "@/lib/constants/ai.constants"
import { db, agents } from "@repo/db"
import { and, eq } from "drizzle-orm"

export class KnowledgeContextService {
  /**
   * Busca contexto relevante para a última mensagem do usuário
   */
  static async fetchRelevantContext(
    salonId: string,
    userMessage: string
  ): Promise<string | undefined> {
    const activeAgent = await db.query.agents.findFirst({
      where: and(eq(agents.salonId, salonId), eq(agents.isActive, true)),
      columns: { id: true },
    })

    if (!activeAgent) {
      return undefined
    }

    try {
      const contextResult = await findRelevantContext(
        activeAgent.id,
        userMessage,
        RAG_CONSTANTS.DEFAULT_CONTEXT_LIMIT,
        RAG_CONSTANTS.SIMILARITY_THRESHOLD
      )

      if (
        !("error" in contextResult) &&
        contextResult.data &&
        contextResult.data.length > 0
      ) {
        return contextResult.data.map((item) => item.content).join("\n\n")
      }
    } catch {
      // Silenciosamente falha e retorna undefined
      // O sistema deve continuar funcionando sem contexto RAG
    }

    return undefined
  }
}
