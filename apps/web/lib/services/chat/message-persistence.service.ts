/**
 * Serviço para persistência de mensagens (APPLICATION LAYER)
 */

import { db, chatMessages } from "@repo/db"
import { saveMessage, findOrCreateWebChat } from "@/lib/services/chat.service"

interface SaveMessageOptions {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  model?: string
}

export class MessagePersistenceService {
  /**
   * Encontra ou cria um chat para o usuário web
   */
  static async findOrCreateChat(
    clientId: string | undefined,
    salonId: string
  ): Promise<string | null> {
    if (!clientId) {
      return null
    }

    try {
      const chat = await findOrCreateWebChat(clientId, salonId)
      return chat.id
    } catch {
      // Continua sem chatId - ainda salva em chatMessages para compatibilidade
      return null
    }
  }

  /**
   * Salva mensagem do usuário
   */
  static async saveUserMessage(
    chatId: string | null,
    salonId: string,
    clientId: string | null,
    content: string
  ): Promise<void> {
    const savePromises: Promise<unknown>[] = []

    if (chatId) {
      savePromises.push(
        saveMessage(chatId, "user", content).catch(() => {
          // Silenciosamente falha - não interrompe o fluxo
        })
      )
    }

    savePromises.push(
      db
        .insert(chatMessages)
        .values({
          salonId,
          clientId,
          role: "user",
          content,
        })
        .catch(() => {
          // Silenciosamente falha - não interrompe o fluxo
        })
    )

    await Promise.all(savePromises)
  }

  /**
   * Salva mensagem do assistente
   */
  static async saveAssistantMessage(
    chatId: string | null,
    salonId: string,
    clientId: string | null,
    content: string,
    options?: SaveMessageOptions
  ): Promise<void> {
    const savePromises: Promise<unknown>[] = []

    if (chatId) {
      savePromises.push(
        saveMessage(chatId, "assistant", content, options).catch(() => {
          // Silenciosamente falha - não interrompe o fluxo
        })
      )
    }

    savePromises.push(
      db
        .insert(chatMessages)
        .values({
          salonId,
          clientId,
          role: "assistant",
          content,
        })
        .catch(() => {
          // Silenciosamente falha - não interrompe o fluxo
        })
    )

    await Promise.all(savePromises)
  }
}
