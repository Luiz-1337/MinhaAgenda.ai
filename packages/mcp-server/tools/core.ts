import { tool } from "ai"
import { z } from "zod"
import { MinhaAgendaAITools } from "../src/MinhaAgendaAI_tools"
import {
  createCustomerSchema,
  getCustomerUpcomingAppointmentsSchema,
  getMyFutureAppointmentsSchema,
  getProfessionalAvailabilityRulesSchema,
  getProfessionalsSchema,
  getProductsSchema,
  getServicesSchema,
  identifyCustomerSchema,
  qualifyLeadSchema,
  saveCustomerPreferenceSchema,
  updateCustomerNameSchema,
} from "../src/schemas/tools.schema"

const SOURCE_FILE = 'packages/mcp-server/tools/core.ts'

/**
 * Logger para execução de tools
 */
function logToolExecution(toolName: string, params: unknown, result: unknown, startTime: number) {
  const duration = Date.now() - startTime
  console.log('\n🔨 [Tool Execution] ' + toolName)
  console.log(`   📁 Arquivo: ${SOURCE_FILE}`)
  console.log(`   📥 Parâmetros: ${JSON.stringify(params, null, 2).split('\n').join('\n      ')}`)
  console.log(`   📤 Resposta: ${JSON.stringify(result, null, 2).split('\n').join('\n      ')}`)
  console.log(`   ⏱️ Duração: ${duration}ms`)
  console.log('')
}

/**
 * Parseia resultado JSON das tools internas
 * Se o resultado já for um objeto, retorna como está
 * Se for string JSON, faz parse - erros de parse DEVEM subir (não são silenciados)
 */
function parseToolResult(result: unknown): unknown {
  if (typeof result !== "string") {
    return result
  }
  // Se é string, DEVE ser JSON válido - erros de parse indicam bug nas tools internas
  return JSON.parse(result)
}

/**
 * Cria tools básicas que sempre estão disponíveis (não dependem de integrações)
 */
export function createCoreTools(salonId: string, clientPhone: string) {
  const impl = new MinhaAgendaAITools()

  const identifyCustomerInputSchema = identifyCustomerSchema
    .partial({ phone: true })
    .describe("Identificação de cliente (phone é opcional; padrão = telefone do WhatsApp)")

  const createCustomerInputSchema = createCustomerSchema
    .omit({ phone: true })
    .extend({
      phone: createCustomerSchema.shape.phone
        .optional()
        .describe("Telefone do cliente (opcional; padrão = telefone do WhatsApp)"),
    })

  const getServicesInputSchema = getServicesSchema.omit({ salonId: true })
  const getProductsInputSchema = getProductsSchema.omit({ salonId: true })
  const saveCustomerPreferenceInputSchema = saveCustomerPreferenceSchema
    .omit({ salonId: true })
    .extend({
      customerId: saveCustomerPreferenceSchema.shape.customerId
        .optional()
        .describe("ID do cliente (opcional; padrão = cliente do WhatsApp, se já existir)"),
    })
  const qualifyLeadInputSchema = qualifyLeadSchema
    .omit({ salonId: true })
    .extend({
      phoneNumber: qualifyLeadSchema.shape.phoneNumber
        .optional()
        .describe("Número do lead (opcional; padrão = telefone do WhatsApp)"),
    })

  const getCustomerUpcomingAppointmentsInputSchema = getCustomerUpcomingAppointmentsSchema
    .omit({ salonId: true, customerPhone: true })
    .extend({
      customerPhone: getCustomerUpcomingAppointmentsSchema.shape.customerPhone
        .optional()
        .describe("Telefone do cliente (opcional; padrão = telefone do WhatsApp)"),
    })
  const getMyFutureAppointmentsInputSchema = getMyFutureAppointmentsSchema.omit({ salonId: true })
  const getProfessionalsInputSchema = getProfessionalsSchema.omit({ salonId: true })
  const getProfessionalAvailabilityRulesInputSchema = getProfessionalAvailabilityRulesSchema.omit({ salonId: true })

  return {
    identifyCustomer: tool({
      description:
        "Identifica um cliente pelo telefone. Se não encontrar e um nome for fornecido, cria um novo cliente. Retorna { id, name, found: true/false, created: true/false }.",
      inputSchema: identifyCustomerInputSchema,
      execute: async ({ phone, name }: z.infer<typeof identifyCustomerInputSchema>) => {
        const startTime = Date.now()
        const params = { phone: phone || clientPhone, name }
        const resolvedPhone = (phone || clientPhone).trim()
        const result = await impl.identifyCustomer(resolvedPhone, name, salonId)
        const parsed = parseToolResult(result)
        logToolExecution('identifyCustomer', params, parsed, startTime)
        return parsed
      },
    }),

    createCustomer: tool({
      description:
        "Cria um novo cliente no sistema explicitamente. Se o cliente já existir, retorna os dados do cliente existente. Retorna { id, name, phone, created: true/false, alreadyExists: true/false }.",
      inputSchema: createCustomerInputSchema,
      execute: async ({ phone, name }: z.infer<typeof createCustomerInputSchema>) => {
        const startTime = Date.now()
        const params = { phone: phone || clientPhone, name }
        const resolvedPhone = (phone || clientPhone).trim()
        if (!name || name.trim() === "") {
          throw new Error("Nome é obrigatório para criar um cliente")
        }
        const result = await impl.createCustomer(resolvedPhone, name.trim(), salonId)
        const parsed = parseToolResult(result)
        logToolExecution('createCustomer', params, parsed, startTime)
        return parsed
      },
    }),

    getServices: tool({
      description: "Busca lista de serviços disponíveis em um salão com preços e durações.",
      inputSchema: getServicesInputSchema,
      execute: async (input: z.infer<typeof getServicesInputSchema>) => {
        const startTime = Date.now()
        const result = await impl.getServices(salonId, input.includeInactive)
        const parsed = parseToolResult(result)
        logToolExecution('getServices', input, parsed, startTime)
        return parsed
      },
    }),

    getProducts: tool({
      description: "Busca lista de produtos disponíveis em um salão com preços.",
      inputSchema: getProductsInputSchema,
      execute: async (input: z.infer<typeof getProductsInputSchema>) => {
        const startTime = Date.now()
        const result = await impl.getProducts(salonId, input.includeInactive)
        const parsed = parseToolResult(result)
        logToolExecution('getProducts', input, parsed, startTime)
        return parsed
      },
    }),

    saveCustomerPreference: tool({
      description:
        "Salva uma preferência do cliente no CRM do salão. Útil para armazenar informações extraídas da conversa (ex: alergias, preferências).",
      inputSchema: saveCustomerPreferenceInputSchema,
      execute: async (input: z.infer<typeof saveCustomerPreferenceInputSchema>) => {
        const startTime = Date.now()
        let resolvedCustomerId = input.customerId
        if (!resolvedCustomerId) {
          const identified = await impl.identifyCustomer(clientPhone, undefined, salonId)
          const parsedId = parseToolResult(identified) as { id?: string }
          resolvedCustomerId = parsedId?.id
        }
        if (!resolvedCustomerId) {
          throw new Error("Não foi possível identificar o cliente. Chame identifyCustomer primeiro (ou forneça customerId).")
        }
        const result = await impl.saveCustomerPreference(salonId, resolvedCustomerId, input.key, input.value)
        const parsed = parseToolResult(result)
        logToolExecution('saveCustomerPreference', { ...input, resolvedCustomerId }, parsed, startTime)
        return parsed
      },
    }),

    qualifyLead: tool({
      description: "Qualifica um lead baseado no nível de interesse demonstrado.",
      inputSchema: qualifyLeadInputSchema,
      execute: async (input: z.infer<typeof qualifyLeadInputSchema>) => {
        const startTime = Date.now()
        const result = await impl.qualifyLead(salonId, input.phoneNumber || clientPhone, input.interest, input.notes)
        const parsed = parseToolResult(result)
        logToolExecution('qualifyLead', input, parsed, startTime)
        return parsed
      },
    }),

    getMyFutureAppointments: tool({
      description:
        "Lista agendamentos futuros do cliente atual. Use esta tool SEMPRE antes de cancelar ou reagendar agendamentos para obter os IDs necessários.",
      inputSchema: getMyFutureAppointmentsInputSchema,
      execute: async (input: z.infer<typeof getMyFutureAppointmentsInputSchema>) => {
        const startTime = Date.now()
        const result = await impl.getMyFutureAppointments(salonId, input.clientId, input.phone || clientPhone)
        const parsed = parseToolResult(result)
        logToolExecution('getMyFutureAppointments', input, parsed, startTime)
        return parsed
      },
    }),

    getProfessionals: tool({
      description: "Retorna lista de profissionais (barbeiros) do salão para mapear nomes a IDs.",
      inputSchema: getProfessionalsInputSchema,
      execute: async (input: z.infer<typeof getProfessionalsInputSchema>) => {
        const startTime = Date.now()
        const result = await impl.getProfessionals(salonId, input.includeInactive)
        const parsed = parseToolResult(result)
        logToolExecution('getProfessionals', input, parsed, startTime)
        return parsed
      },
    }),

    getProfessionalAvailabilityRules: tool({
      description:
        "Verifica os turnos de trabalho de um profissional específico (ex: 'João trabalha terças e quintas?').",
      inputSchema: getProfessionalAvailabilityRulesInputSchema,
      execute: async (input: z.infer<typeof getProfessionalAvailabilityRulesInputSchema>) => {
        const startTime = Date.now()
        const result = await impl.getProfessionalAvailabilityRules(salonId, input.professionalName)
        const parsed = parseToolResult(result)
        logToolExecution('getProfessionalAvailabilityRules', input, parsed, startTime)
        return parsed
      },
    }),

    updateCustomerName: tool({
      description:
        "Atualiza o nome de um cliente no sistema. Use esta tool quando o cliente fornecer seu nome ou quando quiser corrigir o nome cadastrado. IMPORTANTE: Se o nome atual do cliente for apenas um número de telefone formatado (ex: '(11) 98604-9295'), pergunte o nome ao cliente e use esta tool para atualizar.",
      inputSchema: updateCustomerNameSchema,
      execute: async (input: z.infer<typeof updateCustomerNameSchema>) => {
        const startTime = Date.now()
        const result = await impl.updateCustomerName(input.customerId, input.name)
        const parsed = parseToolResult(result)
        logToolExecution('updateCustomerName', input, parsed, startTime)
        return parsed
      },
    }),
  }
}
