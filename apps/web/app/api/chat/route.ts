import { openai } from "@ai-sdk/openai"
import { streamText, type CoreMessage } from "ai"
import { getAvailableSlots } from "@/lib/availability"
import { chatRequestSchema } from "@/lib/schemas/chat.schema"
import { 
  createAvailabilityTool, 
  createBookAppointmentTool, 
  createGetServicesTool, 
  createGetProfessionalsTool,
  createSaveUserPreferencesTool,
  createSalonAssistantPrompt 
} from "@/lib/services/ai.service"
import { createClient } from "@/lib/supabase/server"
import { db, salons, salonCustomers, chatMessages } from "@repo/db"
import { and, eq } from "drizzle-orm"

export async function POST(req: Request) {
  const body = await req.json()
  const { messages, salonId } = chatRequestSchema.parse(body)

  if (!salonId) {
    return new Response("salonId é obrigatório", { status: 400 })
  }

  // Busca dados do salão para o prompt
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { name: true }
  })
  
  const salonName = salon?.name || "nosso salão"

  // Busca usuário logado
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Usa ID do usuário logado ou undefined se não houver login
  const clientId = user?.id

  // Busca preferências do cliente no CRM
  let preferences: Record<string, unknown> | undefined = undefined
  if (clientId) {
    const customer = await db.query.salonCustomers.findFirst({
      where: and(
        eq(salonCustomers.salonId, salonId),
        eq(salonCustomers.profileId, clientId)
      ),
      columns: { preferences: true },
    })
    preferences = (customer?.preferences as Record<string, unknown>) || undefined
  }

  const systemPrompt = createSalonAssistantPrompt(salonName, preferences)

  const checkAvailability = createAvailabilityTool(
    salonId,
    async ({ date, salonId: toolSalonId, serviceDuration, professionalId }) => {
      return await getAvailableSlots({
        date,
        salonId: toolSalonId,
        serviceDuration,
        professionalId
      })
    }
  )

  const bookAppointment = createBookAppointmentTool(salonId, clientId)
  const getServices = createGetServicesTool(salonId)
  const getProfessionals = createGetProfessionalsTool(salonId)
  const saveUserPreferences = createSaveUserPreferencesTool(salonId, clientId)

  // Salva a última mensagem do usuário antes de iniciar o stream
  const lastUserMessage = messages[messages.length - 1]
  if (lastUserMessage && lastUserMessage.role === 'user' && typeof lastUserMessage.content === 'string') {
    await db.insert(chatMessages).values({
      salonId,
      clientId: clientId || null,
      role: 'user',
      content: lastUserMessage.content,
    }).catch((err) => {
      // Log erro mas não interrompe o fluxo
      console.error('Erro ao salvar mensagem do usuário:', err)
    })
  }

  const modelName = "gpt-4o-mini";
  const result = streamText({
    model: openai(modelName),
    system: systemPrompt,
    messages: messages as CoreMessage[],
    tools: {
      checkAvailability,
      bookAppointment,
      getServices,
      getProfessionals,
      saveUserPreferences
    },
    onFinish: async ({ text, usage }) => {
      // Captura tokens
      // Na versão 5.0 do AI SDK: promptTokens → inputTokens, completionTokens → outputTokens
      const inputTokens = usage?.inputTokens ?? null;
      const outputTokens = usage?.outputTokens ?? null;
      const totalTokens = usage?.totalTokens ?? null;

      console.log(`📊 Tokens usados: input=${inputTokens}, output=${outputTokens}, total=${totalTokens}`);

      // Salva a resposta da IA após o stream terminar
      // Nota: chatMessages não tem campos de tokens, então salvamos apenas o conteúdo
      // Os tokens serão rastreados via messages quando houver integração com chats
      await db.insert(chatMessages).values({
        salonId,
        clientId: clientId || null,
        role: 'assistant',
        content: text,
      }).catch((err) => {
        // Log erro mas não interrompe o fluxo
        console.error('Erro ao salvar mensagem da IA:', err)
      })

      // TODO: Se houver chatId disponível, salvar tokens na tabela messages também
      // Por enquanto, chatMessages não suporta tokens diretamente
    },
  })

  return result.toTextStreamResponse()
}
