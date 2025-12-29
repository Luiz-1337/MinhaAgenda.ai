import { tool } from "ai"
import { z } from "zod"
import { MinhaAgendaAITools } from "../src/MinhaAgendaAI_tools"
import {
  cancelAppointmentSchema,
  createAppointmentSchema,
  rescheduleAppointmentSchema,
} from "../src/schemas/tools.schema"
import { ensureIsoWithTimezone } from "@/lib/services/ai.service"
import { checkGoogleCalendarIntegration } from "./types"

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
 * Cria tools que REQUEREM integração com Google Calendar
 * Estas tools só estarão disponíveis se a integração estiver ativa
 */
export function createGoogleCalendarTools(salonId: string, clientPhone: string) {
  const impl = new MinhaAgendaAITools()

  const createAppointmentInputSchema = createAppointmentSchema
    .omit({ salonId: true, phone: true })
    .extend({
      date: z
        .string()
        .min(1)
        .describe("Data/hora ISO (ex: 2025-12-27T09:00:00-03:00). Se faltar timezone, será normalizado."),
    })

  const rescheduleAppointmentInputSchema = rescheduleAppointmentSchema.extend({
    newDate: z
      .string()
      .min(1)
      .describe("Nova data/hora ISO (ex: 2025-12-27T09:00:00-03:00). Se faltar timezone, será normalizado."),
  })

  const cancelAppointmentInputSchema = cancelAppointmentSchema
    .describe("Schema para cancelar agendamento. IMPORTANTE: SEMPRE chame getMyFutureAppointments primeiro para obter o appointmentId.")

  return {
    createAppointment: tool({
      description:
        "Cria um novo agendamento no sistema e sincroniza com Google Calendar. REQUER integração Google Calendar ativa.",
      inputSchema: createAppointmentInputSchema,
      execute: async (input: z.infer<typeof createAppointmentInputSchema>) => {
        // Verifica se Google Calendar está ativo
        const hasIntegration = await checkGoogleCalendarIntegration(salonId)
        if (!hasIntegration) {
          throw new Error(
            "Integração com Google Calendar não está ativa. Por favor, configure a integração no painel do salão antes de criar agendamentos."
          )
        }

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
        "Cancela um agendamento existente e remove do Google Calendar. REQUER integração Google Calendar ativa. IMPORTANTE: SEMPRE chame getMyFutureAppointments primeiro para obter o appointmentId.",
      inputSchema: cancelAppointmentInputSchema,
      execute: async (input: z.infer<typeof cancelAppointmentSchema>) => {
        // Verifica se Google Calendar está ativo
        const hasIntegration = await checkGoogleCalendarIntegration(salonId)
        if (!hasIntegration) {
          throw new Error(
            "Integração com Google Calendar não está ativa. Por favor, configure a integração no painel do salão antes de cancelar agendamentos."
          )
        }

        const result = await impl.cancelAppointment(input.appointmentId, input.reason)
        return maybeParseJson(result)
      },
    }),

    rescheduleAppointment: tool({
      description:
        "Reagenda um agendamento existente para uma nova data e atualiza no Google Calendar. REQUER integração Google Calendar ativa. IMPORTANTE: SEMPRE chame getMyFutureAppointments primeiro para obter o appointmentId.",
      inputSchema: rescheduleAppointmentInputSchema,
      execute: async (input: z.infer<typeof rescheduleAppointmentInputSchema>) => {
        // Verifica se Google Calendar está ativo
        const hasIntegration = await checkGoogleCalendarIntegration(salonId)
        if (!hasIntegration) {
          throw new Error(
            "Integração com Google Calendar não está ativa. Por favor, configure a integração no painel do salão antes de reagendar agendamentos."
          )
        }

        const result = await impl.rescheduleAppointment(input.appointmentId, String(ensureIsoWithTimezone(input.newDate)))
        return maybeParseJson(result)
      },
    }),
  }
}

