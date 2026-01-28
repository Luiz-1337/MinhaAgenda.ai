import { tool } from "ai"
import { z } from "zod"
import { MinhaAgendaAITools } from "../src/MinhaAgendaAI_tools"
import { 
  checkAvailabilitySchema, 
  createAppointmentSchema,
  updateAppointmentSchema,
  deleteAppointmentSchema,
} from "../src/schemas/tools.schema"

const SOURCE_FILE = 'packages/mcp-server/tools/appointments.ts'

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[]

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
        const startTime = Date.now()
        const result = await impl.checkAvailability(
          salonId,
          String(ensureIsoWithTimezone(input.date)),
          input.professionalId,
          input.serviceId,
          input.serviceDuration
        )
        const parsed = maybeParseJson(result)
        logToolExecution('checkAvailability', input, parsed, startTime)
        return parsed
      },
    }),

    addAppointment: tool({
      description:
        "Adiciona um novo agendamento no sistema. Sincroniza automaticamente com sistemas externos se a integração estiver ativa.",
      inputSchema: createAppointmentInputSchema,
      execute: async (input: z.infer<typeof createAppointmentInputSchema>) => {
        const startTime = Date.now()
        const result = await impl.createAppointment(
          salonId,
          input.professionalId,
          clientPhone,
          input.serviceId,
          String(ensureIsoWithTimezone(input.date)),
          input.notes
        )
        const parsed = maybeParseJson(result)
        logToolExecution('addAppointment', input, parsed, startTime)
        return parsed
      },
    }),

    updateAppointment: tool({
      description:
        "Atualiza um agendamento existente. Pode atualizar profissional, serviço, data/hora ou notas. Sincroniza automaticamente com sistemas externos se a integração estiver ativa.",
      inputSchema: updateAppointmentInputSchema,
      execute: async (input: z.infer<typeof updateAppointmentInputSchema>) => {
        const startTime = Date.now()
        const result = await impl.updateAppointment(
          input.appointmentId,
          input.professionalId,
          input.serviceId,
          input.date ? String(ensureIsoWithTimezone(input.date)) : undefined,
          input.notes
        )
        const parsed = maybeParseJson(result)
        logToolExecution('updateAppointment', input, parsed, startTime)
        return parsed
      },
    }),

    removeAppointment: tool({
      description:
        "Remove um agendamento do sistema. Sincroniza automaticamente com sistemas externos se a integração estiver ativa.",
      inputSchema: deleteAppointmentSchema,
      execute: async (input: z.infer<typeof deleteAppointmentSchema>) => {
        const startTime = Date.now()
        const result = await impl.deleteAppointment(input.appointmentId)
        const parsed = maybeParseJson(result)
        logToolExecution('removeAppointment', input, parsed, startTime)
        return parsed
      },
    }),
  }
}

