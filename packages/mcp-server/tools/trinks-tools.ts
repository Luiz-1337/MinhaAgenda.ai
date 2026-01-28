import { tool } from "ai"
import { z } from "zod"
import { MinhaAgendaAITools } from "../src/MinhaAgendaAI_tools"
import {
  checkAvailabilitySchema,
  createAppointmentSchema,
  updateAppointmentSchema,
  deleteAppointmentSchema,
} from "../src/schemas/tools.schema"
import {
  db,
  services,
  professionals,
  profiles,
  appointments,
  domainServices as sharedServices,
  getTrinksBusySlots,
  createTrinksAppointment,
  updateTrinksAppointment,
  deleteTrinksAppointment,
} from "@repo/db"
import { eq } from "drizzle-orm"
import { ensureIsoWithTimezone } from "../src/utils/date-format.utils"

const SOURCE_FILE = 'packages/mcp-server/tools/trinks-tools.ts'

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
 * Cria tools específicas do Trinks
 * Estas tools consultam a API do Trinks para disponibilidade e sincronizam agendamentos
 */
export function createTrinksTools(salonId: string, clientPhone: string) {
  const impl = new MinhaAgendaAITools()

  // Schema para checkAvailability
  const checkAvailabilityInputSchema = checkAvailabilitySchema
    .omit({ salonId: true })
    .extend({
      date: z
        .string()
        .min(1)
        .describe("Data/hora ISO (ex: 2025-12-27T09:00:00-03:00). Se faltar timezone, será normalizado."),
    })

  // Schema para createAppointment
  const createAppointmentInputSchema = createAppointmentSchema
    .omit({ salonId: true, phone: true })
    .extend({
      date: z
        .string()
        .min(1)
        .describe("Data/hora ISO (ex: 2025-12-27T09:00:00-03:00). Se faltar timezone, será normalizado."),
    })

  // Schema para updateAppointment
  const updateAppointmentInputSchema = updateAppointmentSchema.extend({
    date: z
      .string()
      .min(1)
      .describe("Data/hora ISO (ex: 2025-12-27T09:00:00-03:00). Se faltar timezone, será normalizado.")
      .optional(),
  })

  return {
    trinks_checkAvailability: tool({
      description:
        "Verifica horários disponíveis consultando o sistema Trinks. Combina disponibilidade do banco com agendamentos do Trinks para excluir slots já ocupados.",
      inputSchema: checkAvailabilityInputSchema,
      execute: async (input: z.infer<typeof checkAvailabilityInputSchema>) => {
        const startTime = Date.now()

        if (!input.professionalId?.trim()) {
          throw new Error("professionalId é obrigatório para verificar disponibilidade")
        }

        const dateStr = String(ensureIsoWithTimezone(input.date))
        const dateOnly = dateStr.slice(0, 10)

        let serviceDuration = input.serviceDuration ?? 60
        if (input.serviceId && !input.serviceDuration) {
          const service = await db.query.services.findFirst({
            where: eq(services.id, input.serviceId),
            columns: { duration: true },
          })
          if (service) serviceDuration = service.duration
        }

        const dayStart = new Date(`${dateOnly}T00:00:00-03:00`)
        const dayEnd = new Date(`${dateOnly}T23:59:59.999-03:00`)

        const dbSlots = await sharedServices.getAvailableSlots({
          date: dateStr,
          salonId,
          serviceDuration,
          professionalId: input.professionalId,
        })

        let trinksBusySlots: { start: Date; end: Date }[] = []
        let trinksError: string | null = null
        try {
          trinksBusySlots = await getTrinksBusySlots(
            salonId,
            input.professionalId,
            dayStart,
            dayEnd
          )
        } catch (err: unknown) {
          trinksError = err instanceof Error ? err.message : "Erro ao consultar Trinks"
          console.warn("⚠️ Falha ao consultar Trinks:", trinksError)
        }

        const filteredSlots = dbSlots.filter((slot) => {
          const slotStart = new Date(`${dateOnly}T${slot}:00-03:00`)
          const slotEnd = new Date(slotStart.getTime() + serviceDuration * 60 * 1000)
          const hasOverlap = trinksBusySlots.some(
            (b) => slotStart < b.end && slotEnd > b.start
          )
          return !hasOverlap
        })

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ac7031ef-f4cf-4a4b-a2e4-8f976eb78084',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'trinks-tools.ts:trinks_checkAvailability:afterFilter',message:'after filter',data:{dbSlotsLength:dbSlots.length,trinksBusySlotsCount:trinksBusySlots.length,filteredSlotsLength:filteredSlots.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
        // #endregion

        const slots = filteredSlots.slice(0, 2)
        const source = trinksBusySlots.length > 0 ? "trinks_combined" : "database_only"

        let message: string
        if (slots.length > 0) {
          message =
            slots.length === 2
              ? `Encontrados ${slots.length} horários disponíveis (mostrando os 2 melhores)${trinksBusySlots.length > 0 ? " (verificado com Trinks)" : ""}`
              : `Encontrado ${slots.length} horário disponível${trinksBusySlots.length > 0 ? " (verificado com Trinks)" : ""}`
        } else {
          message = "Nenhum horário disponível para esta data"
        }

        const result: Record<string, unknown> = {
          source,
          slots,
          totalAvailable: filteredSlots.length,
          trinksBusySlotsCount: trinksBusySlots.length,
          message,
        }
        if (trinksError) result.trinksError = trinksError
        if (process.env.NODE_ENV === "development") {
          result.debug = {
            dbSlotsCount: dbSlots.length,
            filteredAfterTrinks: filteredSlots.length,
            trinksBusySlots: trinksBusySlots.map((b) => ({
              start: b.start.toISOString(),
              end: b.end.toISOString(),
            })),
          }
        }

        logToolExecution("trinks_checkAvailability", input, result, startTime)
        return result
      },
    }),

    trinks_createAppointment: tool({
      description:
        "Cria um novo agendamento e sincroniza com o sistema Trinks. O evento é criado tanto no banco de dados quanto no Trinks.",
      inputSchema: createAppointmentInputSchema,
      execute: async (input: z.infer<typeof createAppointmentInputSchema>) => {
        const startTime = Date.now()
        
        // Busca cliente pelo telefone
        const client = await db.query.profiles.findFirst({
          where: eq(profiles.phone, clientPhone),
          columns: { id: true, fullName: true },
        })

        if (!client) {
          throw new Error(`Cliente com telefone ${clientPhone} não encontrado. Por favor, identifique o cliente primeiro.`)
        }

        // Cria agendamento no banco usando serviço centralizado
        const createResult = await sharedServices.createAppointmentService({
          salonId,
          professionalId: input.professionalId,
          clientId: client.id,
          serviceId: input.serviceId,
          date: String(ensureIsoWithTimezone(input.date)),
          notes: input.notes,
        })

        if (!createResult.success) {
          throw new Error(createResult.error)
        }

        const appointmentId = createResult.data.appointmentId

        // Sincroniza com Trinks
        let trinksEventId: string | null = null
        let trinksSyncError: string | null = null

        try {
          const trinksResult = await createTrinksAppointment(appointmentId, salonId)
          if (trinksResult) {
            trinksEventId = trinksResult.eventId
          }
        } catch (error: any) {
          trinksSyncError = error?.message || "Erro ao sincronizar com Trinks"
          console.error("❌ Erro ao sincronizar criação de agendamento com Trinks:", {
            error: trinksSyncError,
            appointmentId,
          })
        }

        // Busca info para retorno
        const [professional, service] = await Promise.all([
          db.query.professionals.findFirst({
            where: eq(professionals.id, input.professionalId),
            columns: { name: true },
          }),
          db.query.services.findFirst({
            where: eq(services.id, input.serviceId),
            columns: { name: true },
          }),
        ])

        const dateObj = new Date(String(ensureIsoWithTimezone(input.date)))

        const result = {
          appointmentId,
          trinksEventId,
          trinksSyncSuccess: !!trinksEventId,
          trinksSyncError,
          message: `Agendamento criado com sucesso para ${client.fullName || "cliente"} com ${professional?.name} às ${dateObj.toLocaleString("pt-BR")}${trinksEventId ? " (sincronizado com Trinks)" : ""}`,
        }
        logToolExecution('trinks_createAppointment', input, result, startTime)
        return result
      },
    }),

    trinks_updateAppointment: tool({
      description:
        "Atualiza um agendamento existente e sincroniza a alteração com o sistema Trinks.",
      inputSchema: updateAppointmentInputSchema,
      execute: async (input: z.infer<typeof updateAppointmentInputSchema>) => {
        const startTime = Date.now()
        
        // Busca agendamento existente
        const existingAppointment = await db.query.appointments.findFirst({
          where: eq(appointments.id, input.appointmentId),
          columns: { id: true, status: true, salonId: true },
        })

        if (!existingAppointment) {
          throw new Error(`Agendamento com ID ${input.appointmentId} não encontrado`)
        }

        if (existingAppointment.status === "cancelled") {
          throw new Error("Não é possível atualizar um agendamento cancelado")
        }

        // Atualiza no banco
        const updateResult = await sharedServices.updateAppointmentService({
          appointmentId: input.appointmentId,
          professionalId: input.professionalId,
          serviceId: input.serviceId,
          date: input.date ? String(ensureIsoWithTimezone(input.date)) : undefined,
          notes: input.notes,
        })

        if (!updateResult.success) {
          throw new Error(updateResult.error)
        }

        // Sincroniza com Trinks
        let trinksSyncSuccess = false
        let trinksSyncError: string | null = null

        try {
          await updateTrinksAppointment(input.appointmentId, salonId)
          trinksSyncSuccess = true
        } catch (error: any) {
          trinksSyncError = error?.message || "Erro ao sincronizar com Trinks"
          console.error("❌ Erro ao sincronizar atualização com Trinks:", {
            error: trinksSyncError,
            appointmentId: input.appointmentId,
          })
        }

        const result = {
          appointmentId: input.appointmentId,
          trinksSyncSuccess,
          trinksSyncError,
          message: `Agendamento atualizado com sucesso${trinksSyncSuccess ? " (sincronizado com Trinks)" : ""}`,
        }
        logToolExecution('trinks_updateAppointment', input, result, startTime)
        return result
      },
    }),

    trinks_deleteAppointment: tool({
      description:
        "Remove um agendamento do sistema e deleta o registro correspondente do Trinks.",
      inputSchema: deleteAppointmentSchema,
      execute: async (input: z.infer<typeof deleteAppointmentSchema>) => {
        const startTime = Date.now()
        
        // Busca dados do agendamento ANTES de deletar
        const existingAppointment = await db.query.appointments.findFirst({
          where: eq(appointments.id, input.appointmentId),
          columns: { id: true, salonId: true, trinksEventId: true },
        })

        if (!existingAppointment) {
          throw new Error(`Agendamento com ID ${input.appointmentId} não encontrado`)
        }

        // Sincroniza deleção com Trinks ANTES de deletar no banco
        let trinksSyncSuccess = false
        let trinksSyncError: string | null = null

        if (existingAppointment.trinksEventId) {
          try {
            await deleteTrinksAppointment(input.appointmentId, salonId)
            trinksSyncSuccess = true
          } catch (error: any) {
            if (error?.message?.includes('não encontrado')) {
              // Agendamento já foi deletado no Trinks
              trinksSyncSuccess = true
            } else {
              trinksSyncError = error?.message || "Erro ao sincronizar com Trinks"
              console.error("❌ Erro ao sincronizar deleção com Trinks:", {
                error: trinksSyncError,
                appointmentId: input.appointmentId,
              })
            }
          }
        }

        // Deleta do banco
        const deleteResult = await sharedServices.deleteAppointmentService({
          appointmentId: input.appointmentId,
        })

        if (!deleteResult.success) {
          throw new Error(deleteResult.error)
        }

        const result = {
          trinksSyncSuccess: existingAppointment.trinksEventId ? trinksSyncSuccess : true,
          trinksSyncError,
          message: `Agendamento removido com sucesso${trinksSyncSuccess || !existingAppointment.trinksEventId ? " (removido do Trinks)" : ""}`,
        }
        logToolExecution('trinks_deleteAppointment', input, result, startTime)
        return result
      },
    }),
  }
}
