import type { CoreMessage } from 'ai'
import { findRelevantContext } from '@/lib/services/ai/rag-context.service'
import { RAG_SIMILARITY_THRESHOLD } from '@repo/db/domain/constants'
import { logger } from '@repo/db/infrastructure/logger'

/**
 * Use case for retrieving relevant knowledge context via RAG
 */
export class RetrieveKnowledgeContextUseCase {
  async execute(
    agentId: string,
    userMessage: string,
    maxResults: number = parseInt(process.env.RAG_MAX_RESULTS || '5'),
    similarityThreshold: number = parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.65')
  ): Promise<string | undefined> {
    try {
      const contextResult = await findRelevantContext(agentId, userMessage, maxResults, similarityThreshold)

      if ('error' in contextResult || !contextResult.data || contextResult.data.length === 0) {
        logger.debug('No relevant RAG context found', {
          agentId,
          threshold: similarityThreshold,
          error: 'error' in contextResult ? contextResult.error : undefined,
        })
        return undefined
      }

      const contextTexts = contextResult.data.map((item) => item.content).join('\n\n')

      logger.debug('Relevant RAG context found', {
        agentId,
        itemsCount: contextResult.data.length,
        threshold: similarityThreshold,
      })

      return contextTexts
    } catch (error) {
      logger.error('Error retrieving RAG context', { agentId, error }, error as Error)
      return undefined
    }
  }

  /**
   * Extracts user message from messages array for RAG search
   */
  static extractUserMessage(messages: CoreMessage[]): string | null {
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== 'user') {
      return null
    }

    if (typeof lastMessage.content === 'string') {
      return lastMessage.content
    }

    return null
  }
}
