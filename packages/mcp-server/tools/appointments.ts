import { tool } from "ai"
import { z } from "zod"
import { MinhaAgendaAITools } from "../src/MinhaAgendaAI_tools"
import { 
  checkAvailabilitySchema, 
  createAppointmentSchema,
  updateAppointmentSchema,
  deleteAppointmentSchema,
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
 * Garante que uma string de data ISO tenha timezone.
 * Se não tiver, adiciona o timezone padrão -03:00 (Brasil).
 */
function ensureIsoWithTimezone(input: unknown): unknown {
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
 * Cria tools de agendamento
 */
export function createAppointmentTools(salonId: string, clientPhone: string) {
  const impl = new MinhaAgendaAITools()

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

  const updateAppointmentInputSchema = updateAppointmentSchema.extend({
    date: z
      .string()
      .min(1)
      .describe("Data/hora ISO (ex: 2025-12-27T09:00:00-03:00). Se faltar timezone, será normalizado.")
      .optional(),
  })

  return {
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

    addAppointment: tool({
      description:
        "Adiciona um novo agendamento no sistema. Sincroniza automaticamente com sistemas externos se a integração estiver ativa.",
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

    updateAppointment: tool({
      description:
        "Atualiza um agendamento existente. Pode atualizar profissional, serviço, data/hora ou notas. Sincroniza automaticamente com sistemas externos se a integração estiver ativa.",
      inputSchema: updateAppointmentInputSchema,
      execute: async (input: z.infer<typeof updateAppointmentInputSchema>) => {
        const result = await impl.updateAppointment(
          input.appointmentId,
          input.professionalId,
          input.serviceId,
          input.date ? String(ensureIsoWithTimezone(input.date)) : undefined,
          input.notes
        )
        return maybeParseJson(result)
      },
    }),

    removeAppointment: tool({
      description:
        "Remove um agendamento do sistema. Sincroniza automaticamente com sistemas externos se a integração estiver ativa.",
      inputSchema: deleteAppointmentSchema,
      execute: async (input: z.infer<typeof deleteAppointmentSchema>) => {
        const result = await impl.deleteAppointment(input.appointmentId)
        return maybeParseJson(result)
      },
    }),
  }
}

