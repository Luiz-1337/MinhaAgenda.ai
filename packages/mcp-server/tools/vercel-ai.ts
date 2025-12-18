import { tool } from "ai"
import { z } from "zod"
import { MinhaAgendaAITools } from "../src/MinhaAgendaAI_tools"
import {
  cancelAppointmentSchema,
  checkAvailabilitySchema,
  createAppointmentSchema,
  getCustomerUpcomingAppointmentsSchema,
  getMyFutureAppointmentsSchema,
  getProfessionalAvailabilityRulesSchema,
  getProfessionalsSchema,
  getServicesSchema,
  identifyCustomerSchema,
  qualifyLeadSchema,
  rescheduleAppointmentSchema,
  saveCustomerPreferenceSchema,
} from "../src/schemas/tools.schema"
import { ensureIsoWithTimezone } from "@/lib/services/ai.service"

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
 * Adapter de tools para o AI SDK (Vercel AI SDK).
 *
 * Opção A: tools locais (o `apps/web` atua como host chamando o modelo e executando tools),
 * sem necessidade de rodar um MCP server HTTP/stdio em produção.
 */
export function createMCPTools(salonId: string, clientPhone: string) {
  const impl = new MinhaAgendaAITools()

  const identifyCustomerInputSchema = identifyCustomerSchema
    .partial({ phone: true })
    .describe("Identificação de cliente (phone é opcional; padrão = telefone do WhatsApp)")

  // Relaxa date-time para evitar tool calls inválidas (o modelo às vezes manda ISO sem offset).
  const checkAvailabilityInputSchema = checkAvailabilitySchema
    .omit({ salonId: true })
    .extend({
      date: z
        .string()
        .min(1)
        .describe("Data/hora ISO (ex: 2025-12-27T09:00:00-03:00). Se faltar timezone, será normalizado."),
    })

  const createAppointmentInputSchema = createAppointmentSchema
    .omit({ salonId: true, phone: true })
    .extend({
      date: z
        .string()
        .min(1)
        .describe("Data/hora ISO (ex: 2025-12-27T09:00:00-03:00). Se faltar timezone, será normalizado."),
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
  const rescheduleAppointmentInputSchema = rescheduleAppointmentSchema.extend({
    newDate: z
      .string()
      .min(1)
      .describe("Nova data/hora ISO (ex: 2025-12-27T09:00:00-03:00). Se faltar timezone, será normalizado."),
  })

  return {
    identifyCustomer: tool({
      description:
        "Identifica um cliente pelo telefone. Se não encontrar e um nome for fornecido, cria um novo cliente. Retorna { id, name, found: true/false, created: true/false }.",
      inputSchema: identifyCustomerInputSchema,
      execute: async ({ phone, name }: z.infer<typeof identifyCustomerInputSchema>) => {
        const resolvedPhone = (phone || clientPhone).trim()
        const result = await impl.identifyCustomer(resolvedPhone, name)
        return maybeParseJson(result)
      },
    }),

    getColorHairCuts: tool({
      description: "Retorna lista de cortes de cabelo disponíveis no salão.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = "Cortes de cabelo disponíveis: COR A, COR J E COR K"
        return maybeParseJson(result)
      },
    }),

    checkAvailability: tool({
      description:
        "Verifica horários disponíveis para agendamento em um salão. Considera horários de trabalho, agendamentos existentes e duração do serviço.",
      inputSchema: checkAvailabilityInputSchema,
      execute: async (input: z.infer<typeof checkAvailabilityInputSchema>) => {
        const result = await impl.checkAvailability(
          salonId,
          String(ensureIsoWithTimezone(input.date)),
          input.professionalId,
          input.serviceId,
          input.serviceDuration
        )
        return maybeParseJson(result)
      },
    }),

    createAppointment: tool({
      description:
        "Cria um novo agendamento no sistema. Também cria evento no Google Calendar se houver integração ativa.",
      inputSchema: createAppointmentInputSchema,
      execute: async (input: z.infer<typeof createAppointmentInputSchema>) => {
        const result = await impl.createAppointment(
          salonId,
          input.professionalId,
          clientPhone,
          input.serviceId,
          String(ensureIsoWithTimezone(input.date)),
          input.notes
        )
        return maybeParseJson(result)
      },
    }),

    cancelAppointment: tool({
      description:
        "Cancela um agendamento existente. Remove do Google Calendar se houver integração. IMPORTANTE: SEMPRE chame getMyFutureAppointments primeiro para obter o appointmentId.",
      inputSchema: cancelAppointmentSchema,
      execute: async (input: z.infer<typeof cancelAppointmentSchema>) => {
        const result = await impl.cancelAppointment(input.appointmentId, input.reason)
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
          const identified = await impl.identifyCustomer(clientPhone)
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

    rescheduleAppointment: tool({
      description:
        "Reagenda um agendamento existente para uma nova data. IMPORTANTE: SEMPRE chame getMyFutureAppointments primeiro para obter o appointmentId.",
      inputSchema: rescheduleAppointmentInputSchema,
      execute: async (input: z.infer<typeof rescheduleAppointmentInputSchema>) => {
        const result = await impl.rescheduleAppointment(input.appointmentId, String(ensureIsoWithTimezone(input.newDate)))
        return maybeParseJson(result)
      },
    }),

    getCustomerUpcomingAppointments: tool({
      description: "Lista agendamentos futuros de um cliente pelo número de telefone.",
      inputSchema: getCustomerUpcomingAppointmentsInputSchema,
      execute: async (input: z.infer<typeof getCustomerUpcomingAppointmentsInputSchema>) => {
        const result = await impl.getCustomerUpcomingAppointments(salonId, input.customerPhone || clientPhone)
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
  }
}


