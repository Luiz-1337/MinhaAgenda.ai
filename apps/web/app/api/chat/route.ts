import { openai } from "@ai-sdk/openai"
import { streamText, type CoreMessage, convertToModelMessages, type UIMessage } from "ai"
import { getAvailableSlots } from "@/lib/availability"
import { chatRequestSchema } from "@/lib/schemas/chat.schema"
import { 
  createAvailabilityTool, 
  createBookAppointmentTool, 
  createGetServicesTool, 
  createGetProfessionalsTool,
  createSaveUserPreferencesTool,
  createSalonAssistantPrompt, 
  getActiveAgentInfo
} from "@/lib/services/ai.service"
import { createClient } from "@/lib/supabase/server"
import { db, salons, chatMessages, agents } from "@repo/db"
import { and, eq } from "drizzle-orm"
import { findRelevantContext } from "@/app/actions/knowledge"

export async function POST(req: Request) {
  const body = await req.json()
  
  // Tenta validar como UIMessage[] primeiro (formato do useChat)
  let messages: CoreMessage[]
  let salonId: string | undefined
  
  // Verifica se são mensagens no formato UIMessage (com parts)
  if (body.messages && Array.isArray(body.messages) && body.messages[0]?.parts) {
    // Formato UIMessage do useChat - converte para CoreMessage
    const uiMessages = body.messages as UIMessage[]
    messages = convertToModelMessages(uiMessages)
    salonId = body.salonId
  } else {
    // Formato CoreMessage direto - valida com schema
    const parsed = chatRequestSchema.parse(body)
    // O schema valida a estrutura correta, então fazemos cast direto para CoreMessage[]
    // O AI SDK aceita CoreMessage[] que é compatível com ModelMessage[]
    messages = parsed.messages as CoreMessage[]
    salonId = parsed.salonId
  }

  // Para testes, se não houver salonId, retorna erro informativo
  if (!salonId) {
    return new Response("salonId é obrigatório. Para testes, inclua salonId no body da requisição.", { status: 400 })
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

  // Preferências do cliente não são mais buscadas via profileId
  // Se necessário, buscar preferências via phone do cliente na tabela customers
  const preferences: Record<string, unknown> | undefined = undefined

  // Busca agente ativo do salão para recuperar contexto de conhecimento
  let knowledgeContext: string | undefined = undefined
  const activeAgent = await db.query.agents.findFirst({
    where: and(eq(agents.salonId, salonId), eq(agents.isActive, true)),
    columns: { id: true },
  })

  // Se houver agente ativo e mensagem do usuário, busca contexto relevante
  if (activeAgent) {
    const lastUserMessage = messages[messages.length - 1]
    if (lastUserMessage && lastUserMessage.role === 'user' && typeof lastUserMessage.content === 'string') {
      try {
        const contextResult = await findRelevantContext(
          activeAgent.id,
          lastUserMessage.content,
          3
        )
        
        if (!("error" in contextResult) && contextResult.data && contextResult.data.length > 0) {
          // Formata o contexto recuperado
          const contextTexts = contextResult.data.map((item) => item.content).join("\n\n")
          knowledgeContext = contextTexts
          console.log(`📚 Contexto RAG recuperado (${contextResult.data.length} itens):`)
          contextResult.data.forEach((item, index) => {
            console.log(`  [${index + 1}] ${item.content}`)
          })
          console.log(`\n📝 Contexto completo que será injetado no prompt:\n${contextTexts}\n`)
        } else {
          console.log("⚠️ Nenhum contexto RAG encontrado ou erro na busca:", contextResult)
        }
      } catch (error) {
        console.error("❌ Erro ao buscar contexto RAG:", error)
        // Continua sem contexto se houver erro
      }
    }
  } else {
    console.log("⚠️ Nenhum agente ativo encontrado para buscar contexto RAG")
  }

  const systemPrompt = await createSalonAssistantPrompt(salonName, salonId, preferences, knowledgeContext)

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

  const agentInfo = await getActiveAgentInfo(salonId)
  const modelName = agentInfo?.model || "gpt-4o-mini";
  const result = streamText({
    model: openai(modelName),
    system: systemPrompt,
    messages: messages,
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
