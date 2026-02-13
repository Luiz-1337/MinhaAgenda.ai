import { chatRequestSchema, type CoreMessage, type UIMessage, type UIMessagePart } from '@/lib/schemas/chat.schema'

/**
 * Validation result for chat messages
 */
export interface MessageValidationResult {
  messages: CoreMessage[]
  salonId: string
}

function extractTextFromParts(parts: UIMessagePart[]): string {
  return parts
    .map((part) => {
      if (part.type === 'text' && typeof part.text === 'string') {
        return part.text
      }

      if (typeof part.text === 'string') {
        return part.text
      }

      return ''
    })
    .join('\n')
    .trim()
}

function convertUIMessageToCoreMessage(uiMessages: UIMessage[]): CoreMessage[] {
  return uiMessages
    .map((uiMessage): CoreMessage | null => {
      const role = uiMessage.role === 'developer' ? 'system' : uiMessage.role
      const textContent = extractTextFromParts(uiMessage.parts)

      if (role === 'system') {
        if (!textContent) return null
        return {
          role: 'system',
          content: textContent,
          id: uiMessage.id,
        }
      }

      if (role === 'user') {
        return {
          role: 'user',
          content: textContent,
          id: uiMessage.id,
        }
      }

      return {
        role: 'assistant',
        content: textContent,
        id: uiMessage.id,
      }
    })
    .filter((message): message is CoreMessage => message !== null)
}

/**
 * Validates and converts chat messages
 * Handles both UIMessage[] payloads (with parts) and CoreMessage[] payloads
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
      messages = convertUIMessageToCoreMessage(uiMessages)
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
