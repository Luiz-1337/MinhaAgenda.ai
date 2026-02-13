/**
 * Validação de mensagens de chat (DOMAIN LAYER)
 */

import { chatRequestSchema, type CoreMessage, type UIMessage, type UIMessagePart } from "@/lib/schemas/chat.schema"

interface ValidatedMessagesResult {
  messages: CoreMessage[]
  salonId: string | undefined
}

function extractTextFromParts(parts: UIMessagePart[]): string {
  return parts
    .map((part) => {
      if (part.type === "text" && typeof part.text === "string") {
        return part.text
      }

      if (typeof part.text === "string") {
        return part.text
      }

      return ""
    })
    .join("\n")
    .trim()
}

function convertUIToCoreMessages(uiMessages: UIMessage[]): CoreMessage[] {
  return uiMessages
    .map((message): CoreMessage | null => {
      const role = message.role === "developer" ? "system" : message.role
      const content = extractTextFromParts(message.parts)

      if (role === "system") {
        if (!content) return null
        return { role: "system", content, id: message.id }
      }

      if (role === "user") {
        return { role: "user", content, id: message.id }
      }

      return { role: "assistant", content, id: message.id }
    })
    .filter((message): message is CoreMessage => message !== null)
}

/**
 * Valida e converte mensagens de entrada para formato CoreMessage
 */
export class MessageValidator {
  /**
   * Valida mensagens do request, suportando tanto UIMessage[] quanto CoreMessage[]
   */
  static validateRequest(body: unknown): ValidatedMessagesResult {
    if (!body || typeof body !== "object") {
      throw new Error("Body inválido")
    }

    const bodyObj = body as Record<string, unknown>

    // Verifica se são mensagens no formato UIMessage (com parts)
    if (
      bodyObj.messages &&
      Array.isArray(bodyObj.messages) &&
      (bodyObj.messages[0] as UIMessage | undefined)?.parts
    ) {
      const uiMessages = bodyObj.messages as UIMessage[]
      return {
        messages: convertUIToCoreMessages(uiMessages),
        salonId: bodyObj.salonId as string | undefined,
      }
    }

    // Formato CoreMessage direto - valida com schema
    const parsed = chatRequestSchema.parse(bodyObj)
    return {
      messages: parsed.messages as CoreMessage[],
      salonId: parsed.salonId,
    }
  }

  /**
   * Valida que salonId está presente
   */
  static validateSalonId(salonId: string | undefined): void {
    if (!salonId) {
      throw new Error("salonId é obrigatório. Para testes, inclua salonId no body da requisição.")
    }
  }

  /**
   * Extrai a última mensagem do usuário das mensagens
   */
  static getLastUserMessage(messages: CoreMessage[]): CoreMessage | null {
    const lastMessage = messages[messages.length - 1]
    if (
      lastMessage &&
      lastMessage.role === "user" &&
      typeof lastMessage.content === "string"
    ) {
      return lastMessage
    }
    return null
  }
}
