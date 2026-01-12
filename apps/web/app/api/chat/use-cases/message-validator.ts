import type { CoreMessage, UIMessage } from 'ai'
import { convertToModelMessages } from 'ai'
import { chatRequestSchema } from '@/lib/schemas/chat.schema'

/**
 * Validation result for chat messages
 */
export interface MessageValidationResult {
  messages: CoreMessage[]
  salonId: string
}

/**
 * Validates and converts chat messages
 * Handles both UIMessage[] (from useChat) and CoreMessage[] (direct format)
 */
export class MessageValidator {
  static validate(body: unknown): MessageValidationResult {
    if (!body || typeof body !== 'object') {
      throw new Error('Request body must be an object')
    }

    const bodyObj = body as Record<string, unknown>
    let messages: CoreMessage[]
    let salonId: string | undefined

    if (bodyObj.messages && Array.isArray(bodyObj.messages) && bodyObj.messages[0]?.parts) {
      const uiMessages = bodyObj.messages as UIMessage[]
      messages = convertToModelMessages(uiMessages)
      salonId = bodyObj.salonId as string | undefined
    } else {
      const parsed = chatRequestSchema.parse(body)
      messages = parsed.messages as CoreMessage[]
      salonId = parsed.salonId
    }

    if (!salonId) {
      throw new Error('salonId é obrigatório. Para testes, inclua salonId no body da requisição.')
    }

    return {
      messages,
      salonId,
    }
  }
}
