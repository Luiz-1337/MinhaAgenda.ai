import { z } from "zod"
import { isoDateTimeSchema, isoDateTimeOptionalSchema, uuidSchema, uuidOptionalSchema } from "./common.schema"

/**
 * Schema para criação de agendamento
 */
export const createAppointmentSchema = z.object({
  professionalId: uuidSchema.describe("ID do profissional"),
  serviceId: uuidSchema.describe("ID do serviço"),
  date: isoDateTimeSchema.describe("Data/hora do agendamento"),
  notes: z.string().optional().describe("Observações do agendamento"),
})

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>

/**
 * Schema para atualização de agendamento
 */
export const updateAppointmentSchema = z.object({
  appointmentId: uuidSchema.describe(
    "ID do agendamento. Obtenha via getMyFutureAppointments"
  ),
  professionalId: uuidOptionalSchema.describe("ID do profissional"),
  serviceId: uuidOptionalSchema.describe("ID do serviço"),
  date: isoDateTimeOptionalSchema.describe("Nova data/hora do agendamento"),
  notes: z.string().optional().describe("Observações"),
})

export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>

/**
 * Schema para remoção de agendamento
 */
export const deleteAppointmentSchema = z.object({
  appointmentId: uuidSchema.describe(
    "ID do agendamento. Obtenha via getMyFutureAppointments"
  ),
})

export type DeleteAppointmentInput = z.infer<typeof deleteAppointmentSchema>

/**
 * Schema para busca de agendamentos futuros
 */
export const getMyFutureAppointmentsSchema = z.object({
  clientId: uuidOptionalSchema.describe("ID do cliente (opcional)"),
  phone: z
    .string()
    .optional()
    .describe("Telefone do cliente (se clientId não fornecido)"),
})

export type GetMyFutureAppointmentsInput = z.infer<typeof getMyFutureAppointmentsSchema>
