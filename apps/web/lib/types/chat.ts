/**
 * Tipos relacionados a chat e mensagens
 */

export interface ChatMessage {
  role: "user" | "assistant" | "system"
  content: string
}

export interface WhatsAppWebhookPayload {
  From: string
  Body: string
  To: string
}

