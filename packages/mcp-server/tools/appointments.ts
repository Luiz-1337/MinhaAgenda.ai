import { tool } from "ai"
import { z } from "zod"
import { MinhaAgendaAITools } from "../src/MinhaAgendaAI_tools"
import { checkAvailabilitySchema } from "../src/schemas/tools.schema"
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
 * Cria tools de agendamento básicas (não dependem de integrações externas)
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
  }
}

