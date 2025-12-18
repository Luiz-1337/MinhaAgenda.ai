/**
 * Serviço para operações relacionadas a chats e mensagens
 */

import { and, asc, desc, eq } from "drizzle-orm"
import { db, chats, messages, salons } from "@repo/db"
import type { ChatMessage } from "@/lib/types/chat"

/**
 * Encontra ou cria um chat ativo para um cliente
 */
export async function findOrCreateChat(
  clientPhone: string,
  salonId: string
): Promise<{ id: string }> {
  // Busca chat existente
  let chat = await db.query.chats.findFirst({
    where: and(
      eq(chats.clientPhone, clientPhone),
      eq(chats.salonId, salonId),
      eq(chats.status, "active")
    ),
  })

  // Cria novo chat se não existir
  if (!chat) {
    const inserted = await db
      .insert(chats)
      .values({
        salonId,
        clientPhone,
        status: "active",
      })
      .returning({ id: chats.id })

    if (!inserted[0]) {
      throw new Error("Falha ao criar chat")
    }

    const newChat = await db.query.chats.findFirst({
      where: eq(chats.id, inserted[0].id),
    })

    if (!newChat) {
      throw new Error("Falha ao recuperar chat criado")
    }

    chat = newChat
  }

  return { id: chat.id }
}

/**
 * Salva uma mensagem no banco de dados
 */
export async function saveMessage(
  chatId: string,
  role: "user" | "assistant" | "system",
  content: string
): Promise<void> {
  await db.insert(messages).values({
    chatId,
    role,
    content,
  })
}

/**
 * Obtém o histórico de mensagens de um chat
 */
export async function getChatHistory(chatId: string, limit = 10): Promise<ChatMessage[]> {
  // Importante: queremos as mensagens MAIS RECENTES, mas retornadas em ordem cronológica (asc)
  const latestMessages = await db.query.messages.findMany({
    where: eq(messages.chatId, chatId),
    orderBy: desc(messages.createdAt),
    limit,
  })

  // Reverte para ficar do mais antigo -> mais novo dentro do recorte
  return latestMessages.reverse().map((msg) => ({
    role: msg.role as "user" | "assistant" | "system",
    content: msg.content || "",
  }))
}

/**
 * Obtém o nome do salão
 */
export async function getSalonName(salonId: string): Promise<string> {
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { name: true },
  })

  return salon?.name || "Salão"
}

