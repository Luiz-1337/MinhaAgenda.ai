import type { CoreMessage } from '@/lib/schemas/chat.schema'
import { db, domainServices } from '@repo/db'
import { logger } from '@repo/db/infrastructure/logger'
import { findOrCreateWebChat, saveMessage } from '@/lib/services/chat.service'

/**
 * Options for saving chat messages
 */
export interface SaveMessageOptions {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  model?: string
  requiresResponse?: boolean
}

/**
 * Use case for saving chat messages
 * Consolidates logic for saving to both messages and chatMessages tables
 */
export class SaveChatMessageUseCase {
  async executeUserMessage(
    salonId: string,
    clientId: string | undefined,
    message: string
  ): Promise<void> {
    let chatId: string | null = null

    if (clientId) {
      try {
        const chat = await findOrCreateWebChat(clientId, salonId)
        chatId = chat.id
        logger.debug('Chat ID found/created', { chatId, salonId, clientId })

        await saveMessage(chatId, 'user', message).catch((err) => {
          logger.error('Error saving user message to messages table', {
            chatId,
            error: err instanceof Error ? err.message : String(err),
          }, err as Error)
        })
      } catch (err) {
        logger.error('Error finding/creating chat', {
          salonId,
          clientId,
          error: err instanceof Error ? err.message : String(err),
        }, err as Error)
      }
    }
  }

  async executeAssistantMessage(
    salonId: string,
    clientId: string | undefined,
    chatId: string | null,
    text: string,
    options?: SaveMessageOptions
  ): Promise<void> {
    const requiresResponse = domainServices.analyzeMessageRequiresResponse(text)

    if (chatId) {
      await saveMessage(chatId, 'assistant', text, {
        inputTokens: options?.inputTokens,
        outputTokens: options?.outputTokens,
        totalTokens: options?.totalTokens,
        model: options?.model,
        requiresResponse,
      }).catch((err) => {
        logger.error('Error saving assistant message to messages table', {
          chatId,
          error: err instanceof Error ? err.message : String(err),
        }, err as Error)
      })
    }
  }

  async findOrCreateChat(clientId: string, salonId: string): Promise<string | null> {
    try {
      const chat = await findOrCreateWebChat(clientId, salonId)
      return chat.id
    } catch (err) {
      logger.error('Error finding/creating chat', {
        salonId,
        clientId,
        error: err instanceof Error ? err.message : String(err),
      }, err as Error)
      return null
    }
  }

  /**
   * Extracts the last user message from messages array
   */
  static extractLastUserMessage(messages: CoreMessage[]): string | null {
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
