import { tool } from "ai"
import { z } from "zod"
import { MinhaAgendaAITools } from "../src/MinhaAgendaAI_tools"
import { 
  checkAvailabilitySchema, 
  createAppointmentSchema,
  updateAppointmentSchema,
  deleteAppointmentSchema,
} from "../src/schemas/tools.schema"
import { assertRateLimit, RATE_LIMITS } from "../src/utils"
import { ensureIsoWithTimezone } from "../src/utils/date-format.utils"

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
      description: `OBJETIVO: Retorna slots de horário disponíveis para agendamento.

QUANDO USAR:
- Cliente pergunta "tem horário disponível?"
- Cliente quer agendar para data específica
- Após identificar profissional E serviço

PRÉ-REQUISITOS:
1. Obter professionalId via tool 'getProfessionals' PRIMEIRO
2. Obter serviceId via tool 'getServices' (opcional, mas recomendado para duração correta)

PARÂMETROS:
- date: Data ISO com timezone (ex: 2025-01-28T14:00:00-03:00) - OBRIGATÓRIO
- professionalId: UUID do profissional - OBRIGATÓRIO
- serviceId: UUID do serviço (opcional)
- serviceDuration: Duração em minutos (opcional, usa 60 se não informado)

RETORNO:
- slots: Array com até 2 melhores horários disponíveis
- totalAvailable: Total de slots disponíveis no dia

ERROS COMUNS:
- "professionalId é obrigatório" -> Chame getProfessionals primeiro para obter o ID
- "Nenhum horário disponível" -> Tente outro dia ou profissional`.trim(),
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
      description: `OBJETIVO: Cria um novo agendamento para o cliente.

QUANDO USAR:
- Cliente confirma que quer agendar em um horário específico
- Após verificar disponibilidade com checkAvailability
- Cliente já está identificado no sistema

PRÉ-REQUISITOS:
1. Cliente DEVE estar identificado (identifyCustomer ou createCustomer)
2. Obter professionalId via getProfessionals
3. Obter serviceId via getServices
4. Verificar disponibilidade com checkAvailability (recomendado)

PARÂMETROS:
- professionalId: UUID do profissional - OBRIGATÓRIO
- serviceId: UUID do serviço - OBRIGATÓRIO
- date: Data/hora ISO com timezone - OBRIGATÓRIO
- notes: Observações (opcional)

RETORNO:
- appointmentId: UUID do agendamento criado
- message: Confirmação com detalhes

VALIDAÇÕES AUTOMÁTICAS:
- Verifica conflito de horário com agendamentos existentes
- Sincroniza com Google Calendar e Trinks se integrados

ERROS COMUNS:
- "Cliente não encontrado" -> Chame identifyCustomer ou createCustomer primeiro
- "APPOINTMENT_CONFLICT" -> Horário já ocupado, use checkAvailability
- "Rate limit excedido" -> Aguarde alguns segundos e tente novamente`.trim(),
      inputSchema: createAppointmentInputSchema,
      execute: async (input: z.infer<typeof createAppointmentInputSchema>) => {
        // Rate limiting: máximo 10 agendamentos por minuto por salão
        assertRateLimit(`${salonId}:createAppointment`, RATE_LIMITS.CREATE_APPOINTMENT)
        
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
      description: `OBJETIVO: Atualiza um agendamento existente (reagendamento).

QUANDO USAR:
- Cliente quer mudar data/hora de um agendamento
- Cliente quer trocar de profissional ou serviço
- Precisa adicionar/alterar observações

PRÉ-REQUISITOS:
1. Obter appointmentId via getMyFutureAppointments PRIMEIRO
2. Se mudar profissional: obter novo professionalId via getProfessionals
3. Se mudar serviço: obter novo serviceId via getServices

PARÂMETROS:
- appointmentId: UUID do agendamento - OBRIGATÓRIO (obter via getMyFutureAppointments)
- professionalId: Novo UUID do profissional (opcional)
- serviceId: Novo UUID do serviço (opcional)
- date: Nova data/hora ISO com timezone (opcional)
- notes: Novas observações (opcional)

RETORNO:
- appointmentId: UUID do agendamento atualizado
- message: Confirmação da atualização

NÃO É POSSÍVEL:
- Atualizar agendamentos com status 'cancelled'

ERROS COMUNS:
- "Agendamento não encontrado" -> Verifique o ID com getMyFutureAppointments
- "Não é possível atualizar agendamento cancelado" -> Crie um novo agendamento`.trim(),
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
      description: `OBJETIVO: Cancela um agendamento existente (soft delete - muda status para 'cancelled').

QUANDO USAR:
- Cliente quer cancelar um agendamento
- Cliente não pode comparecer na data marcada

PRÉ-REQUISITOS:
1. Obter appointmentId via getMyFutureAppointments PRIMEIRO
2. Confirmar com o cliente antes de cancelar (ação irreversível via esta tool)

PARÂMETROS:
- appointmentId: UUID do agendamento - OBRIGATÓRIO (obter via getMyFutureAppointments)

RETORNO:
- message: Confirmação do cancelamento
- appointmentId: UUID do agendamento cancelado
- cancelled: true se cancelado com sucesso
- alreadyCancelled: true se já estava cancelado

COMPORTAMENTO:
- NÃO deleta o registro, apenas muda status para 'cancelled'
- Sincroniza cancelamento com Google Calendar e Trinks se integrados
- Agendamento cancelado não pode ser reativado (criar novo)

ERROS COMUNS:
- "Agendamento não encontrado" -> Verifique o ID com getMyFutureAppointments`.trim(),
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

