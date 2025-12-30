"use server"

import { and, desc, eq, inArray } from "drizzle-orm"
import { db, chats, messages, profiles } from "@repo/db"
import { createClient } from "@/lib/supabase/server"
import { sendWhatsAppMessage } from "@/lib/services/whatsapp.service"
import { saveMessage } from "@/lib/services/chat.service"

export interface ChatConversation {
  id: string
  customer: {
    name: string
    phone: string
  }
  lastMessageAt: string
  preview: string
  status: "Ativo" | "Finalizado" | "Aguardando humano"
  assignedTo: string
  isManual: boolean
}

export interface ChatMessage {
  id: string
  from: "cliente" | "agente"
  text: string
  time: string
}

/**
 * Formata data para exibição
 */
function formatMessageTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Agora"
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays === 1) return "Ontem"
  if (diffDays < 7) return `${diffDays}d`
  
  // Formato completo para datas mais antigas
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

/**
 * Formata data para preview (última mensagem)
 */
function formatPreviewTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 60) {
    return `${diffMins}m`
  }
  if (diffHours < 24) {
    return `${diffHours}h`
  }
  if (diffDays === 1) {
    return "Ontem"
  }
  if (diffDays < 7) {
    return `${diffDays}d`
  }
  
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

/**
 * Busca todas as conversas (chats) de um salão
 */
export async function getChatConversations(salonId: string): Promise<ChatConversation[] | { error: string }> {
  if (!salonId) {
    return { error: "salonId é obrigatório" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  try {
    // Busca todos os chats do salão
    const salonChats = await db.query.chats.findMany({
      where: eq(chats.salonId, salonId),
      orderBy: desc(chats.updatedAt),
      limit: 100,
    })

    // Busca a última mensagem de cada chat para o preview
    const chatIds = salonChats.map((chat) => chat.id)
    const lastMessageByChat = new Map<string, typeof messages.$inferSelect>()
    
    if (chatIds.length > 0) {
      // Busca mensagens de todos os chats do salão
      const allMessages = await db.query.messages.findMany({
        where: inArray(messages.chatId, chatIds),
        orderBy: desc(messages.createdAt),
        limit: 1000, // Limite alto para garantir que pegamos as últimas de cada chat
      })
      
      // Agrupa mensagens por chat e pega a última de cada
      for (const msg of allMessages) {
        if (!lastMessageByChat.has(msg.chatId)) {
          lastMessageByChat.set(msg.chatId, msg)
        }
      }
    }

    // Busca perfis dos clientes pelos telefones
    const phoneNumbers = salonChats.map((chat) => chat.clientPhone)
    const profileByPhone = new Map<string, { id: string; fullName: string | null; phone: string | null }>()
    
    if (phoneNumbers.length > 0) {
      // Busca todos os perfis e filtra pelos telefones
      const allProfiles = await db.query.profiles.findMany({
        columns: {
          id: true,
          fullName: true,
          phone: true,
        },
      })
      
      for (const profile of allProfiles) {
        if (profile.phone && phoneNumbers.includes(profile.phone)) {
          profileByPhone.set(profile.phone, profile)
        }
      }
    }

    // Monta as conversas - FILTRA apenas chats que têm mensagens
    const conversations: ChatConversation[] = salonChats
      .filter((chat) => lastMessageByChat.has(chat.id)) // Só mostra chats com mensagens
      .map((chat) => {
        const profile = profileByPhone.get(chat.clientPhone)
        const lastMessage = lastMessageByChat.get(chat.id)!
        
        // Formata telefone para exibição
        const phone = chat.clientPhone.replace(/\D/g, "")
        const formattedPhone = phone.length === 11
          ? `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`
          : chat.clientPhone

        return {
          id: chat.id,
          customer: {
            name: profile?.fullName || formattedPhone,
            phone: formattedPhone,
          },
          lastMessageAt: formatPreviewTime(lastMessage.createdAt),
          preview: lastMessage.content?.substring(0, 50) || "Sem mensagens",
          status: (chat.status === "active" ? "Ativo" : "Finalizado") as "Ativo" | "Finalizado" | "Aguardando humano",
          assignedTo: "IA Assistente",
          isManual: chat.isManual || false,
        }
      })

    return conversations
  } catch (error) {
    console.error("Erro ao buscar conversas:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

/**
 * Busca mensagens de um chat específico
 */
export async function getChatMessages(chatId: string): Promise<ChatMessage[] | { error: string }> {
  if (!chatId) {
    return { error: "chatId é obrigatório" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  try {
    // Busca todas as mensagens do chat (exceto system)
    const allChatMessages = await db.query.messages.findMany({
      where: eq(messages.chatId, chatId),
      orderBy: desc(messages.createdAt),
      limit: 100,
    })
    
    // Filtra apenas user e assistant (remove system) e mensagens vazias
    const validMessages = allChatMessages.filter(
      (msg) => 
        (msg.role === "user" || msg.role === "assistant") &&
        msg.content &&
        msg.content.trim().length > 0
    )

    // Reverte para ordem cronológica (mais antiga primeiro)
    const chatMessagesList: ChatMessage[] = validMessages
      .reverse()
      .map((msg) => ({
        id: msg.id,
        from: (msg.role === "user" ? "cliente" : "agente") as "cliente" | "agente",
        text: msg.content || "",
        time: formatMessageTime(msg.createdAt),
      }))

    return chatMessagesList
  } catch (error) {
    console.error("Erro ao buscar mensagens:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

/**
 * Atualiza o modo manual de um chat
 */
export async function setChatManualMode(
  chatId: string,
  isManual: boolean
): Promise<{ success: true } | { error: string }> {
  if (!chatId) {
    return { error: "chatId é obrigatório" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  try {
    await db
      .update(chats)
      .set({ 
        isManual,
        updatedAt: new Date()
      })
      .where(eq(chats.id, chatId))

    return { success: true }
  } catch (error) {
    console.error("Erro ao atualizar modo manual do chat:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

/**
 * Envia uma mensagem manual do humano via WhatsApp
 */
export async function sendManualMessage(
  chatId: string,
  content: string
): Promise<{ success: true } | { error: string }> {
  if (!chatId || !content.trim()) {
    return { error: "chatId e content são obrigatórios" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  try {
    // Busca o chat para obter o clientPhone e salonId
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      columns: {
        id: true,
        clientPhone: true,
        salonId: true,
        isManual: true,
      },
    })

    if (!chat) {
      return { error: "Chat não encontrado" }
    }

    if (!chat.isManual) {
      return { error: "Chat não está em modo manual" }
    }

    // Salva a mensagem como assistant (mensagem do agente humano)
    await saveMessage(chat.id, "assistant", content.trim())

    // Envia via WhatsApp usando o número do agente ativo
    await sendWhatsAppMessage(chat.clientPhone, content.trim(), chat.salonId)

    // Atualiza updatedAt do chat
    await db
      .update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, chatId))

    return { success: true }
  } catch (error) {
    console.error("Erro ao enviar mensagem manual:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

