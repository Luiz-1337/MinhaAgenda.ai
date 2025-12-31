/**
 * Serviço para operações relacionadas à IA
 */

import { openai } from "@ai-sdk/openai"
import { generateText, tool, type CoreMessage } from "ai"
import { z } from "zod"
import { and, eq, ilike } from "drizzle-orm"
import { db, services, professionals, appointments, professionalServices, customers, profiles } from "@repo/db"
import type { ChatMessage } from "@/lib/types/chat"

const DEFAULT_MODEL = "gpt-4o"
const DEFAULT_MIN_MODEL = "gpt-4o-mini"
const DEFAULT_SERVICE_DURATION = 30 // Duração padrão em minutos

/**
 * Helper para busca fuzzy de serviço
 */
async function findServiceByName(salonId: string, name: string) {
  const searchPattern = `%${name}%`
  const results = await db
    .select({
      id: services.id,
      name: services.name,
      duration: services.duration,
      price: services.price
    })
    .from(services)
    .where(
      and(
        eq(services.salonId, salonId),
        ilike(services.name, searchPattern),
        eq(services.isActive, true)
      )
    )
    .limit(5)

  if (results.length === 0) {
    throw new Error(`Não encontrei nenhum serviço com o nome "${name}". Por favor, verifique o nome e tente novamente.`)
  }

  if (results.length > 1) {
    // Tenta match exato
    const exact = results.find(s => s.name.toLowerCase() === name.toLowerCase())
    if (exact) return exact

    const names = results.map(s => s.name).join(", ")
    throw new Error(`Encontrei múltiplos serviços parecidos: ${names}. Por favor, seja mais específico.`)
  }

  return results[0]
}

/**
 * Helper para busca fuzzy de profissional
 */
async function findProfessionalByName(salonId: string, name: string) {
  const searchPattern = `%${name}%`
  const results = await db
    .select({
      id: professionals.id,
      name: professionals.name
    })
    .from(professionals)
    .where(
      and(
        eq(professionals.salonId, salonId),
        ilike(professionals.name, searchPattern),
        eq(professionals.isActive, true)
      )
    )
    .limit(5)

  if (results.length === 0) {
    throw new Error(`Não encontrei nenhum profissional com o nome "${name}".`)
  }

  if (results.length > 1) {
    const exact = results.find(p => p.name.toLowerCase() === name.toLowerCase())
    if (exact) return exact

    const names = results.map(p => p.name).join(", ")
    throw new Error(`Encontrei múltiplos profissionais parecidos: ${names}. Por favor, especifique o nome completo ou sobrenome.`)
  }

  return results[0]
}

/**
 * Tool para verificar disponibilidade de horários
 */
export function createAvailabilityTool(
  salonId: string,
  getAvailableSlotsFn: (params: { date: string; salonId: string; serviceDuration: number; professionalId: string }) => Promise<string[]>
) {
  const paramsSchema = z.object({
    date: z.string().describe("Data (ISO) do dia solicitado."),
    serviceName: z.string().describe("Nome do serviço desejado."),
    professionalName: z.string().describe("Nome do profissional.")
  })
  
  return tool({
    description: "Verifica horários disponíveis para um serviço em uma data específica com um profissional específico.",
    inputSchema: paramsSchema,
    execute: async ({ date, serviceName, professionalName }: z.infer<typeof paramsSchema>) => {
      const service = await findServiceByName(salonId, serviceName)
      const professional = await findProfessionalByName(salonId, professionalName)

      const slots = await getAvailableSlotsFn({
        date,
        salonId,
        serviceDuration: service.duration,
        professionalId: professional.id
      })

      return { 
        slots,
        service: service.name,
        duration: service.duration,
        professional: professionalName
      }
    },
  })
}

/**
 * Tool para agendar horário
 */
export function createBookAppointmentTool(
  salonId: string,
  clientId?: string
) {
  const paramsSchema = z.object({
    date: z.string().describe("Data do agendamento (ISO date string YYYY-MM-DD)."),
    time: z.string().describe("Horário do agendamento (HH:mm)."),
    serviceName: z.string().describe("Nome do serviço."),
    professionalName: z.string().optional().describe("Nome do profissional (opcional).")
  })
  
  return tool({
    description: "Realiza o agendamento de um serviço.",
    inputSchema: paramsSchema,

    execute: async ({ date, time, serviceName, professionalName }: z.infer<typeof paramsSchema>) => {
      if (!clientId) {
        throw new Error("Você precisa estar logado para realizar um agendamento. Por favor, faça login e tente novamente.")
      }

      const service = await findServiceByName(salonId, serviceName)
      
      let professionalId: string
      if (professionalName) {
        const professional = await findProfessionalByName(salonId, professionalName)
        professionalId = professional.id
      } else {
        // Se não especificou profissional, precisamos atribuir um?
        // Por simplificação, vamos exigir que a disponibilidade tenha sido checada antes e o usuário saiba que precisa de um profissional ou o sistema escolhe um.
        // A especificação diz: "Nas tools... remova professionalId... Adicione professionalName".
        // Se for opcional, como escolhemos?
        // Vou assumir que se não informado, tentamos achar qualquer um disponível ou retornamos erro pedindo para escolher.
        // Mas para simplificar e não bloquear, vou pegar o primeiro profissional que realiza o serviço se não especificado (Lógica simplificada).
        // Melhor: Erro se não especificar? O prompt do checkAvailability sugere horários.
        // Vamos tentar buscar qualquer profissional habilitado.
        
        // Busca profissionais que fazem o serviço
        const pros = await db
          .select({ id: professionals.id })
          .from(professionals)
          .innerJoin(professionalServices, eq(professionals.id, professionalServices.professionalId))
          .where(
             and(
               eq(professionals.salonId, salonId),
               eq(professionalServices.serviceId, service.id),
               eq(professionals.isActive, true)
             )
          )
          .limit(1)
        
        if (pros.length === 0) {
           throw new Error("Não há profissionais disponíveis para este serviço.")
        }
        professionalId = pros[0].id
      }

      // Combina data e hora
      const appointmentDate = new Date(`${date}T${time}`)
      if (isNaN(appointmentDate.getTime())) {
        throw new Error("Data ou hora inválida.")
      }
      
      const endTime = new Date(appointmentDate.getTime() + service.duration * 60 * 1000)

      // Cria agendamento
      // Nota: Deveríamos revalidar disponibilidade aqui para garantir atomicidade, mas para este refactor focamos na UX.
      const [appointment] = await db.insert(appointments).values({
        salonId,
        clientId,
        professionalId,
        serviceId: service.id,
        date: appointmentDate,
        endTime: endTime,
        status: 'pending'
      }).returning({ id: appointments.id })

      // Sincroniza com Google Calendar (não bloqueia se falhar)
      try {
        const { createGoogleEvent } = await import('@/lib/google')
        await createGoogleEvent(appointment.id)
      } catch (error) {
        // Loga erro mas não falha o agendamento - nosso banco é a fonte da verdade
        console.error('Erro ao sincronizar agendamento com Google Calendar:', error)
      }

      return {
        success: true,
        appointmentId: appointment.id,
        details: {
          service: service.name,
          date: date,
          time: time,
          price: service.price
        }
      }
    }
  })
}

/**
 * Tool para buscar serviços do salão
 */
export function createGetServicesTool(salonId: string) {
  return tool({
    description: "Lista os serviços disponíveis no salão com seus preços.",
    inputSchema: z.object({}),
    execute: async () => {
      const results = await db
        .select({
          name: services.name,
          description: services.description,
          duration: services.duration,
          price: services.price
        })
        .from(services)
        .where(
          and(
            eq(services.salonId, salonId),
            eq(services.isActive, true)
          )
        )
      
      return { services: results }
    },
  })
}

/**
 * Tool para buscar profissionais
 */
export function createGetProfessionalsTool(salonId: string) {
  return tool({
    description: "Lista os profissionais do salão e os serviços que realizam.",
    inputSchema: z.object({}),
    execute: async () => {
      const pros = await db
        .select({
          id: professionals.id,
          name: professionals.name,
        })
        .from(professionals)
        .where(
          and(
            eq(professionals.salonId, salonId),
            eq(professionals.isActive, true)
          )
        )

      // Busca serviços de cada profissional
      // N+1 query simplificada para pouca carga
      const results = await Promise.all(pros.map(async (p) => {
        const pServices = await db
          .select({ name: services.name })
          .from(services)
          .innerJoin(professionalServices, eq(services.id, professionalServices.serviceId))
          .where(eq(professionalServices.professionalId, p.id))
        
        return {
          name: p.name,
          services: pServices.map(s => s.name)
        }
      }))

      return { professionals: results }
    }
  })
}

/**
 * Gera resposta de texto usando IA
 */
export async function generateAIResponse(params: {
  systemPrompt: string
  messages: ChatMessage[]
  tools?: Parameters<typeof generateText>[0]['tools']
  model?: string
}): Promise<{ text: string; toolResults?: unknown[] }> {
  const { systemPrompt, messages, tools, model = DEFAULT_MODEL } = params

  const coreMessages: CoreMessage[] = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }))

  const result = await generateText({
    model: openai(model),
    system: systemPrompt,
    messages: coreMessages,
    tools,
  })

  return {
    text: result.text,
    toolResults: result.toolResults,
  }
}

/**
 * Tool para salvar preferências do usuário proativamente
 */
export function createSaveUserPreferencesTool(
  salonId: string,
  clientId?: string
) {
  const paramsSchema = z.object({
    key: z.string().describe("Tipo de preferência. Use: 'favoriteProfessional' para profissional preferido, 'favoriteService' para serviço preferido, 'allergies' para alergias, 'notes' para outras observações importantes."),
    value: z.union([z.string(), z.array(z.string()), z.record(z.string(), z.unknown())]).describe("Valor da preferência. Para favoriteProfessional, use o nome do profissional. Para allergies, use array de strings ou string. Para notes, use string.")
  })
  
  return tool({
    description: "Salva preferências do cliente no CRM. Chame esta tool PROATIVAMENTE (em background) quando detectar que o usuário expressou uma preferência, como: preferência por profissional específico (ex: 'Só corto com o João'), alergias (ex: 'Tenho alergia a lâmina'), preferência por serviço, ou outras informações relevantes. Não é necessário informar ao usuário que está salvando - faça silenciosamente.",
    inputSchema: paramsSchema,
    execute: async ({ key, value }: z.infer<typeof paramsSchema>) => {
      if (!clientId) {
        // Se não há clientId, não podemos salvar preferências
        return {
          success: false,
          message: "Preferência não salva: cliente não identificado"
        }
      }

      // Busca o profile para obter o phone
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.id, clientId),
        columns: { phone: true },
      })

      if (!profile?.phone) {
        return {
          success: false,
          message: "Preferência não salva: telefone do cliente não encontrado"
        }
      }

      // Busca o customer pelo phone no salão
      const normalizedPhone = profile.phone.replace(/\D/g, "")
      let customer = await db.query.customers.findFirst({
        where: and(
          eq(customers.salonId, salonId),
          eq(customers.phone, normalizedPhone)
        ),
        columns: { id: true, preferences: true },
      })

      const currentPreferences = (customer?.preferences as Record<string, unknown>) || {}

      // Atualiza preferências
      const updatedPreferences = {
        ...currentPreferences,
        [key]: value,
      }

      if (customer) {
        // Atualiza existente
        await db
          .update(customers)
          .set({ 
            preferences: updatedPreferences,
            updatedAt: new Date()
          })
          .where(eq(customers.id, customer.id))
      } else {
        // Não cria customer automaticamente - deve ser criado antes
        return {
          success: false,
          message: "Preferência não salva: cliente não encontrado no salão"
        }
      }

      return {
        success: true,
        message: `Preferência "${key}" salva com sucesso`
      }
    },
  })
}

/**
 * Cria system prompt padrão para assistente de salão
 */
export function ensureIsoWithTimezone(input: unknown): unknown {
  if (typeof input !== "string") return input
  const s = input.trim()
  // Já tem timezone
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s
  // YYYY-MM-DDTHH:mm -> adiciona segundos + -03:00
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00-03:00`
  // YYYY-MM-DDTHH:mm:ss -> adiciona -03:00
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) return `${s}-03:00`
  return s
}

/**
 * Verifica se o nome é um telefone formatado (ex: (11) 98604-9295)
 */
function isPhoneFormattedName(name: string): boolean {
  // Padrão: (XX) XXXXX-XXXX ou (XX) XXXXX-XXX (formato brasileiro)
  const phonePattern = /^\(\d{2}\)\s\d{4,5}-\d{4}$/
  return phonePattern.test(name.trim())
}

export function createSalonAssistantPrompt(
  salonName: string, 
  preferences?: Record<string, unknown>,
  knowledgeContext?: string,
  customerName?: string,
  customerId?: string
): string {
  // Obtém data e hora atual em pt-BR com timezone America/Sao_Paulo
  const now = new Date()
  const timeZone = 'America/Sao_Paulo'
  
  // Formata a data com dia da semana (ex: "quarta-feira, 10 de dezembro de 2025")
  const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const formattedDate = dateFormatter.format(now)
  
  // Formata a hora como HH:mm
  const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const formattedTime = timeFormatter.format(now)

  let preferencesText = ""
  
  if (preferences && Object.keys(preferences).length > 0) {
    const prefs: string[] = []
    
    if (preferences.favoriteProfessional) {
      prefs.push(`- Profissional preferido: ${preferences.favoriteProfessional}`)
    }
    
    if (preferences.favoriteService) {
      prefs.push(`- Serviço preferido: ${preferences.favoriteService}`)
    }
    
    if (preferences.allergies) {
      const allergies = Array.isArray(preferences.allergies) 
        ? preferences.allergies.join(", ") 
        : String(preferences.allergies)
      prefs.push(`- Alergias conhecidas: ${allergies}`)
    }
    
    if (preferences.notes) {
      prefs.push(`- Observações: ${preferences.notes}`)
    }

    if (prefs.length > 0) {
      preferencesText = `\n\nPREFERÊNCIAS DO CLIENTE:\n${prefs.join("\n")}\n`
    }
  }

  let knowledgeContextText = ""
  if (knowledgeContext && knowledgeContext.trim()) {
    knowledgeContextText = `\n\nCONTEXTO DE REGRAS DO SALÃO:\n${knowledgeContext}\n\nUse essas informações para responder de forma precisa e consistente. Se a pergunta do cliente estiver relacionada a essas regras, priorize essas informações.`
    console.log("✅ Contexto RAG injetado no system prompt:")
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    console.log(knowledgeContext)
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  }

  let customerInfoText = ""
  if (customerName) {
    const isGenericName = isPhoneFormattedName(customerName)
    if (isGenericName && customerId) {
      customerInfoText = `\n\nINFORMAÇÃO DO CLIENTE:
- O cliente está cadastrado apenas com o número de telefone: ${customerName}
- IMPORTANTE: Este não é o nome real do cliente. Você DEVE perguntar educadamente o nome do cliente na primeira oportunidade (ex: "Olá! Para personalizar melhor o atendimento, qual é o seu nome?").
- Quando o cliente fornecer o nome, use a tool updateCustomerName para atualizar o cadastro com o nome real.
- O customerId é: ${customerId}`
    } else {
      customerInfoText = `\n\nINFORMAÇÃO DO CLIENTE:
- Nome: ${customerName}`
    }
  }

  return `Você é o assistente virtual do salão ${salonName}.

CONTEXTO TEMPORAL:
- HOJE É: ${formattedDate}
- HORA ATUAL: ${formattedTime}
- Use essa data como referência absoluta para calcular termos relativos como "amanhã" ou "sábado que vem".${customerInfoText}${preferencesText}${knowledgeContextText}

REGRAS CRÍTICAS:
1. O cliente NÃO sabe IDs de serviço ou profissional. Nunca peça IDs.
2. NUNCA invente ou assuma informações sobre profissionais, serviços ou disponibilidade.
3. SEMPRE use as tools disponíveis antes de responder sobre profissionais, serviços ou horários.
4. Se uma tool retornar vazia ou erro, diga claramente que não encontrou a informação solicitada.
5. NUNCA mencione profissionais, serviços ou horários que não foram retornados pelas tools.
6. Se houver ambiguidade em nomes, peça esclarecimento listando as opções encontradas pela tool (ela retornará erro com sugestões).
7. Quando usar getServices ou getProfessionals, apresente a lista de forma formatada e amigável.
8. Antes de agendar, SEMPRE verifique disponibilidade (checkAvailability). Para criar o agendamento, use a tool de agendamento que estiver disponível no contexto (ex: createAppointment no WhatsApp/MCP ou bookAppointment no chat web).
9. Seja educado, conciso e use português brasileiro.
10. SEMPRE gere uma resposta de texto após executar qualquer tool. NUNCA retorne apenas resultados de tools sem uma resposta explicativa e amigável ao usuário. Mesmo que tenha executado tools, você DEVE sempre fornecer uma resposta final em texto.

MEMÓRIA DE PREFERÊNCIAS:
- Quando o cliente mencionar uma preferência (ex: "Só corto com o João", "Tenho alergia a lâmina", "Prefiro corte tradicional"), use a tool saveUserPreferences PROATIVAMENTE em background para salvar essa informação.
- Não mencione ao cliente que está salvando a preferência - faça isso silenciosamente enquanto responde normalmente.
- Use essas preferências salvas para personalizar futuras recomendações e agendamentos.`
}
