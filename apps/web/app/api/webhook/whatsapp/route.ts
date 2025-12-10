import { generateText } from "ai"
import { db, services } from "@repo/db"
import { eq } from "drizzle-orm"
import { chatRequestSchema } from "@/lib/schemas/chat.schema"
import {
  findOrCreateChat,
  saveMessage,
  getChatHistory,
  getSalonName,
} from "@/lib/services/chat.service"
import {
  createGetServicesTool,
  generateAIResponse,
  createSalonAssistantPrompt,
} from "@/lib/services/ai.service"
import { sendWhatsAppMessage, normalizePhoneNumber } from "@/lib/services/whatsapp.service"
import { extractErrorMessage } from "@/lib/services/error.service"

const DEFAULT_SALON_ID = process.env.DEFAULT_SALON_ID || "00000000-0000-0000-0000-000000000000"

/**
 * Processa webhook do WhatsApp via Twilio
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const from = formData.get("From") as string
    const body = formData.get("Body") as string
    const to = formData.get("To") as string

    if (!from || !body) {
      console.error("Missing required fields: From or Body")
      return new Response("Missing required fields", { status: 400 })
    }

    const clientPhone = normalizePhoneNumber(from)
    const salonId = DEFAULT_SALON_ID

    // Busca nome do salão para o system prompt
    const salonName = await getSalonName(salonId)

    // Encontra ou cria chat
    const chat = await findOrCreateChat(clientPhone, salonId)

    // Salva mensagem do usuário
    await saveMessage(chat.id, "user", body)

    // Busca histórico
    const historyMessages = await getChatHistory(chat.id, 10)

    // Cria tool para buscar serviços
    const getServicesTool = createGetServicesTool(async () => {
      const salonServices = await db.query.services.findMany({
        where: eq(services.salonId, salonId),
        columns: { name: true, price: true },
      })

      const servicesList = salonServices.map(
        (s) => `${s.name}: R$${Number(s.price).toFixed(2)}`
      )

      return { services: servicesList }
    })

    // Gera resposta da IA
    const systemPrompt = createSalonAssistantPrompt(salonName)

    let result = await generateAIResponse({
      systemPrompt,
      messages: historyMessages,
      tools: {
        getServices: getServicesTool,
      },
    })

    let aiResponse = result.text
    const toolResults = result.toolResults

    // Se houver tool results mas resposta vazia, tenta gerar resposta baseada nos resultados
    if (toolResults && toolResults.length > 0 && (!aiResponse || aiResponse.trim().length === 0)) {
      console.warn("⚠️ Tool executada mas resposta vazia. Tentando gerar resposta...")

      // Segunda chamada para forçar geração de texto baseado nos resultados
      const enhancedMessages = [
        ...historyMessages,
        {
          role: "user" as const,
          content: "Por favor, me mostre os resultados da consulta que você acabou de fazer.",
        },
      ]

      result = await generateAIResponse({
        systemPrompt: `${systemPrompt}\n\nIMPORTANTE: Você acabou de executar uma ferramenta. Você DEVE responder ao usuário em texto explicando os resultados de forma clara, amigável e em português brasileiro.`,
        messages: enhancedMessages,
      })

      aiResponse = result.text

      // Fallback manual se ainda estiver vazia
      if (!aiResponse || aiResponse.trim().length === 0) {
        const firstToolResult = toolResults[0]
        if (firstToolResult && "output" in firstToolResult) {
          const output = firstToolResult.output as { services?: string[] }
          const servicesList = output?.services || []
          if (servicesList.length > 0) {
            aiResponse = `Aqui estão os serviços disponíveis:\n\n${servicesList.join("\n")}\n\nComo posso ajudá-lo hoje?`
          }
        }
      }
    }

    // Verifica se temos uma resposta válida
    if (!aiResponse || aiResponse.trim().length === 0) {
      console.warn("⚠️ AI retornou resposta vazia após todas as tentativas")
      return new Response("OK", { status: 200 })
    }

    // Salva mensagem do assistente
    await saveMessage(chat.id, "assistant", aiResponse)

    // Envia resposta via WhatsApp
    await sendWhatsAppMessage(from, aiResponse)

    return new Response("OK", { status: 200 })
  } catch (error) {
    console.error("Error processing WhatsApp webhook:", error)
    const errorMessage = extractErrorMessage(error)
    return new Response(`Error processing webhook: ${errorMessage}`, { status: 500 })
  }
}
