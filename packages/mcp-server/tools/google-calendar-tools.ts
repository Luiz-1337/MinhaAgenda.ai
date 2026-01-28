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
  getGoogleFreeBusyForProfessional,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
} from "@repo/db"
import { eq } from "drizzle-orm"
import { ensureIsoWithTimezone } from "../src/utils/date-format.utils"

const SOURCE_FILE = 'packages/mcp-server/tools/google-calendar-tools.ts'

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
 * Gera slots disponíveis baseado nos períodos de trabalho e busy slots
 */
function generateAvailableSlots(
  workStart: Date,
  workEnd: Date,
  busySlots: { start: Date; end: Date }[],
  serviceDuration: number,
  maxSlots: number = 2
): string[] {
  const SLOT_INTERVAL = 15 * 60 * 1000 // 15 minutos
  const slots: string[] = []
  const now = new Date()

  let currentTime = workStart.getTime()
  const endTime = workEnd.getTime()
  const durationMs = serviceDuration * 60 * 1000

  while (currentTime + durationMs <= endTime && slots.length < maxSlots) {
    const slotStart = new Date(currentTime)
    const slotEnd = new Date(currentTime + durationMs)

    // Verifica se o slot está no passado
    if (slotStart < now) {
      currentTime += SLOT_INTERVAL
      continue
    }

    // Verifica se o slot conflita com algum período ocupado
    const hasConflict = busySlots.some(busy => {
      return slotStart < busy.end && slotEnd > busy.start
    })

    if (!hasConflict) {
      // Formata o horário em pt-BR
      const timeStr = slotStart.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
      slots.push(timeStr)
    }

    currentTime += SLOT_INTERVAL
  }

  return slots
}

/**
 * Cria tools específicas do Google Calendar
 * Estas tools consultam a API do Google para disponibilidade e sincronizam eventos
 */
export function createGoogleCalendarTools(salonId: string, clientPhone: string) {
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
    google_checkAvailability: tool({
      description:
        "Verifica horários disponíveis consultando o Google Calendar. Combina disponibilidade do banco com a API FreeBusy do Google para excluir slots ocupados no calendário do profissional.",
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

        let googleBusySlots: { start: Date; end: Date }[] = []
        let googleError: string | null = null
        try {
          googleBusySlots = await getGoogleFreeBusyForProfessional(
            salonId,
            input.professionalId,
            dayStart,
            dayEnd
          )
        } catch (err: unknown) {
          googleError = err instanceof Error ? err.message : "Erro ao consultar Google FreeBusy"
          console.warn("⚠️ Falha ao consultar Google FreeBusy:", googleError)
        }

        const filteredSlots = dbSlots.filter((slot) => {
          const slotStart = new Date(`${dateOnly}T${slot}:00-03:00`)
          const slotEnd = new Date(slotStart.getTime() + serviceDuration * 60 * 1000)
          const hasOverlap = googleBusySlots.some(
            (b) => slotStart < b.end && slotEnd > b.start
          )
          return !hasOverlap
        })

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ac7031ef-f4cf-4a4b-a2e4-8f976eb78084',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'google-calendar-tools.ts:google_checkAvailability:afterFilter',message:'after filter',data:{dbSlotsLength:dbSlots.length,googleBusySlotsCount:googleBusySlots.length,filteredSlotsLength:filteredSlots.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
        // #endregion

        const slots = filteredSlots.slice(0, 2)
        const source =
          googleBusySlots.length > 0 ? "google_calendar_combined" : "database_only"

        let message: string
        if (slots.length > 0) {
          message =
            slots.length === 2
              ? `Encontrados ${slots.length} horários disponíveis (mostrando os 2 melhores)${googleBusySlots.length > 0 ? " (verificado com Google Calendar)" : ""}`
              : `Encontrado ${slots.length} horário disponível${googleBusySlots.length > 0 ? " (verificado com Google Calendar)" : ""}`
        } else {
          message = "Nenhum horário disponível para esta data"
        }

        const result: Record<string, unknown> = {
          source,
          slots,
          totalAvailable: filteredSlots.length,
          googleBusySlotsCount: googleBusySlots.length,
          message,
        }
        if (googleError) result.googleError = googleError
        if (process.env.NODE_ENV === "development") {
          result.debug = {
            dbSlotsCount: dbSlots.length,
            filteredAfterGoogle: filteredSlots.length,
            googleBusySlots: googleBusySlots.map((b) => ({
              start: b.start.toISOString(),
              end: b.end.toISOString(),
            })),
          }
        }

        logToolExecution("google_checkAvailability", input, result, startTime)
        return result
      },
    }),

    google_createAppointment: tool({
      description:
        "Cria um novo agendamento e sincroniza com o Google Calendar. O evento é criado tanto no banco de dados quanto no calendário do Google.",
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

        // Sincroniza com Google Calendar
        let googleEventId: string | null = null
        let googleSyncError: string | null = null

        try {
          const googleResult = await createGoogleEvent(appointmentId)
          if (googleResult) {
            googleEventId = googleResult.eventId
          }
        } catch (error: any) {
          googleSyncError = error?.message || "Erro ao sincronizar com Google Calendar"
          console.error("❌ Erro ao sincronizar criação de agendamento com Google Calendar:", {
            error: googleSyncError,
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
          googleEventId,
          googleSyncSuccess: !!googleEventId,
          googleSyncError,
          message: `Agendamento criado com sucesso para ${client.fullName || "cliente"} com ${professional?.name} às ${dateObj.toLocaleString("pt-BR")}${googleEventId ? " (sincronizado com Google Calendar)" : ""}`,
        }
        logToolExecution('google_createAppointment', input, result, startTime)
        return result
      },
    }),

    google_updateAppointment: tool({
      description:
        "Atualiza um agendamento existente e sincroniza a alteração com o Google Calendar.",
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

        // Sincroniza com Google Calendar
        let googleSyncSuccess = false
        let googleSyncError: string | null = null

        try {
          await updateGoogleEvent(input.appointmentId)
          googleSyncSuccess = true
        } catch (error: any) {
          googleSyncError = error?.message || "Erro ao sincronizar com Google Calendar"
          console.error("❌ Erro ao sincronizar atualização com Google Calendar:", {
            error: googleSyncError,
            appointmentId: input.appointmentId,
          })
        }

        const result = {
          appointmentId: input.appointmentId,
          googleSyncSuccess,
          googleSyncError,
          message: `Agendamento atualizado com sucesso${googleSyncSuccess ? " (sincronizado com Google Calendar)" : ""}`,
        }
        logToolExecution('google_updateAppointment', input, result, startTime)
        return result
      },
    }),

    google_deleteAppointment: tool({
      description:
        "Remove um agendamento do sistema e deleta o evento correspondente do Google Calendar.",
      inputSchema: deleteAppointmentSchema,
      execute: async (input: z.infer<typeof deleteAppointmentSchema>) => {
        const startTime = Date.now()
        
        // Busca dados do agendamento ANTES de deletar
        const existingAppointment = await db.query.appointments.findFirst({
          where: eq(appointments.id, input.appointmentId),
          columns: { id: true, salonId: true, googleEventId: true },
        })

        if (!existingAppointment) {
          throw new Error(`Agendamento com ID ${input.appointmentId} não encontrado`)
        }

        // Sincroniza deleção com Google Calendar ANTES de deletar no banco
        let googleSyncSuccess = false
        let googleSyncError: string | null = null

        if (existingAppointment.googleEventId) {
          try {
            await deleteGoogleEvent(input.appointmentId)
            googleSyncSuccess = true
          } catch (error: any) {
            googleSyncError = error?.message || "Erro ao sincronizar com Google Calendar"
            console.error("❌ Erro ao sincronizar deleção com Google Calendar:", {
              error: googleSyncError,
              appointmentId: input.appointmentId,
            })
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
          googleSyncSuccess: existingAppointment.googleEventId ? googleSyncSuccess : true,
          googleSyncError,
          message: `Agendamento removido com sucesso${googleSyncSuccess || !existingAppointment.googleEventId ? " (removido do Google Calendar)" : ""}`,
        }
        logToolExecution('google_deleteAppointment', input, result, startTime)
        return result
      },
    }),
  }
}
