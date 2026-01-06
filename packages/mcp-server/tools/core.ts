import { tool } from "ai"
import { z } from "zod"
import { MinhaAgendaAITools } from "../src/MinhaAgendaAI_tools"
import {
  createCustomerSchema,
  getCustomerUpcomingAppointmentsSchema,
  getMyFutureAppointmentsSchema,
  getProfessionalAvailabilityRulesSchema,
  getProfessionalsSchema,
  getServicesSchema,
  identifyCustomerSchema,
  qualifyLeadSchema,
  saveCustomerPreferenceSchema,
  updateCustomerNameSchema,
} from "../src/schemas/tools.schema"

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[]

function maybeParseJson(value: unknown): JsonValue | unknown {
  if (typeof value !== "string") return value
  const text = value.trim()
  if (!text) return value
  try {
    return JSON.parse(text) as JsonValue
  } catch {
    return value
  }
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
        const resolvedPhone = (phone || clientPhone).trim()
        const result = await impl.identifyCustomer(resolvedPhone, name, salonId)
        return maybeParseJson(result)
      },
    }),

    createCustomer: tool({
      description:
        "Cria um novo cliente no sistema explicitamente. Se o cliente já existir, retorna os dados do cliente existente. Retorna { id, name, phone, created: true/false, alreadyExists: true/false }.",
      inputSchema: createCustomerInputSchema,
      execute: async ({ phone, name }: z.infer<typeof createCustomerInputSchema>) => {
        const resolvedPhone = (phone || clientPhone).trim()
        if (!name || name.trim() === "") {
          throw new Error("Nome é obrigatório para criar um cliente")
        }
        const result = await impl.createCustomer(resolvedPhone, name.trim(), salonId)
        return maybeParseJson(result)
      },
    }),

    getServices: tool({
      description: "Busca lista de serviços disponíveis em um salão com preços e durações.",
      inputSchema: getServicesInputSchema,
      execute: async (input: z.infer<typeof getServicesInputSchema>) => {
        const result = await impl.getServices(salonId, input.includeInactive)
        return maybeParseJson(result)
      },
    }),

    saveCustomerPreference: tool({
      description:
        "Salva uma preferência do cliente no CRM do salão. Útil para armazenar informações extraídas da conversa (ex: alergias, preferências).",
      inputSchema: saveCustomerPreferenceInputSchema,
      execute: async (input: z.infer<typeof saveCustomerPreferenceInputSchema>) => {
        let resolvedCustomerId = input.customerId
        if (!resolvedCustomerId) {
          const identified = await impl.identifyCustomer(clientPhone, undefined, salonId)
          const parsed = maybeParseJson(identified) as any
          resolvedCustomerId = parsed?.id
        }
        if (!resolvedCustomerId) {
          throw new Error("Não foi possível identificar o cliente. Chame identifyCustomer primeiro (ou forneça customerId).")
        }
        const result = await impl.saveCustomerPreference(salonId, resolvedCustomerId, input.key, input.value)
        return maybeParseJson(result)
      },
    }),

    qualifyLead: tool({
      description: "Qualifica um lead baseado no nível de interesse demonstrado.",
      inputSchema: qualifyLeadInputSchema,
      execute: async (input: z.infer<typeof qualifyLeadInputSchema>) => {
        const result = await impl.qualifyLead(salonId, input.phoneNumber || clientPhone, input.interest, input.notes)
        return maybeParseJson(result)
      },
    }),

    getMyFutureAppointments: tool({
      description:
        "Lista agendamentos futuros do cliente atual. Use esta tool SEMPRE antes de cancelar ou reagendar agendamentos para obter os IDs necessários.",
      inputSchema: getMyFutureAppointmentsInputSchema,
      execute: async (input: z.infer<typeof getMyFutureAppointmentsInputSchema>) => {
        const result = await impl.getMyFutureAppointments(salonId, input.clientId, input.phone || clientPhone)
        return maybeParseJson(result)
      },
    }),

    getProfessionals: tool({
      description: "Retorna lista de profissionais (barbeiros) do salão para mapear nomes a IDs.",
      inputSchema: getProfessionalsInputSchema,
      execute: async (input: z.infer<typeof getProfessionalsInputSchema>) => {
        const result = await impl.getProfessionals(salonId, input.includeInactive)
        return maybeParseJson(result)
      },
    }),

    getProfessionalAvailabilityRules: tool({
      description:
        "Verifica os turnos de trabalho de um profissional específico (ex: 'João trabalha terças e quintas?').",
      inputSchema: getProfessionalAvailabilityRulesInputSchema,
      execute: async (input: z.infer<typeof getProfessionalAvailabilityRulesInputSchema>) => {
        const result = await impl.getProfessionalAvailabilityRules(salonId, input.professionalName)
        return maybeParseJson(result)
      },
    }),

    updateCustomerName: tool({
      description:
        "Atualiza o nome de um cliente no sistema. Use esta tool quando o cliente fornecer seu nome ou quando quiser corrigir o nome cadastrado. IMPORTANTE: Se o nome atual do cliente for apenas um número de telefone formatado (ex: '(11) 98604-9295'), pergunte o nome ao cliente e use esta tool para atualizar.",
      inputSchema: updateCustomerNameSchema,
      execute: async (input: z.infer<typeof updateCustomerNameSchema>) => {
        const result = await impl.updateCustomerName(input.customerId, input.name)
        return maybeParseJson(result)
      },
    }),
  }
}

