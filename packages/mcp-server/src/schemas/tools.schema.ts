import { z } from "zod";
/**
 * Schema para verificar disponibilidade
 */
export const checkAvailabilitySchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido"),
  professionalId: z.uuid("professionalId deve ser um UUID válido").optional(),
  date: z.iso.datetime("date deve ser uma data ISO válida"),
  serviceId: z.uuid("serviceId deve ser um UUID válido").optional(),
  serviceDuration: z.number().int().positive("serviceDuration deve ser um número positivo").optional(),
})

export type CheckAvailabilityInput = z.infer<typeof checkAvailabilitySchema>

/**
 * Schema para criar agendamento
 */
export const createAppointmentSchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido"),
  professionalId: z.uuid("professionalId deve ser um UUID válido"),
  phone: z.string().min(1, "phone é obrigatório"),
  serviceId: z.uuid("serviceId deve ser um UUID válido"),
  date: z.iso.datetime("date deve ser uma data ISO válida"),
  notes: z.string().optional(),
})

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>

/**
 * Schema para cancelar agendamento
 * IMPORTANTE: Sempre chame getMyFutureAppointments primeiro para obter o appointmentId.
 * O appointmentId deve ser obtido da lista retornada por getMyFutureAppointments.
 */
export const cancelAppointmentSchema = z.object({
  appointmentId: z.uuid("appointmentId deve ser um UUID válido. Obtenha-o chamando getMyFutureAppointments primeiro."),
  reason: z.string().optional(),
})

export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>

/**
 * Schema para buscar serviços
 */
export const getServicesSchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido"),
  includeInactive: z.boolean().default(false).optional(),
})

export type GetServicesInput = z.infer<typeof getServicesSchema>

/**
 * Schema para salvar preferência do cliente
 */
export const saveCustomerPreferenceSchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido"),
  customerId: z.uuid("customerId deve ser um UUID válido"),
  key: z.string().min(1, "key é obrigatória"),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean()
  ]).describe("Valor da preferência (texto, número ou booleano)"),
})

export type SaveCustomerPreferenceInput = z.infer<typeof saveCustomerPreferenceSchema>

/**
 * Schema para buscar informações do salão
 * salonId é opcional - se não fornecido, será obtido do contexto
 */
export const getSalonInfoSchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido").optional(),
})

export type GetSalonInfoInput = z.infer<typeof getSalonInfoSchema>

/**
 * Schema para buscar profissionais
 */
export const getProfessionalsSchema = z.object({
  salonId: z.string().uuid("salonId deve ser um UUID válido"),
  includeInactive: z.boolean().default(false).optional(),
})

export type GetProfessionalsInput = z.infer<typeof getProfessionalsSchema>

/**
 * Schema para qualificar lead
 */
export const qualifyLeadSchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido"),
  phoneNumber: z.string().min(1, "phoneNumber é obrigatório"),
  interest: z.enum(["high", "medium", "low", "none"]),
  notes: z.string().optional(),
})

export type QualifyLeadInput = z.infer<typeof qualifyLeadSchema>

/**
 * Schema para reagendar agendamento
 * IMPORTANTE: Sempre chame getMyFutureAppointments primeiro para obter o appointmentId.
 * O appointmentId deve ser obtido da lista retornada por getMyFutureAppointments.
 */
export const rescheduleAppointmentSchema = z.object({
  appointmentId: z.uuid("appointmentId deve ser um UUID válido. Obtenha-o chamando getMyFutureAppointments primeiro."),
  newDate: z.iso.datetime("newDate deve ser uma data ISO válida"),
})

export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>

/**
 * Schema para identificar/criar cliente
 */
export const identifyCustomerSchema = z.object({
  phone: z.string().min(1, "phone é obrigatório").describe("Telefone do cliente"),
  name: z.string().optional().describe("Nome do cliente (opcional, usado para criar se não existir)"),
})

export type IdentifyCustomerInput = z.infer<typeof identifyCustomerSchema>

/**
 * Schema para criar cliente explicitamente
 */
export const createCustomerSchema = z.object({
  phone: z.string().min(1, "phone é obrigatório").describe("Telefone do cliente"),
  name: z.string().min(1, "name é obrigatório").describe("Nome completo do cliente"),
})

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>

/**
 * Schema para atualizar nome do cliente
 */
export const updateCustomerNameSchema = z.object({
  customerId: z.string().uuid("customerId deve ser um UUID válido"),
  name: z.string().min(1, "name é obrigatório").describe("Novo nome completo do cliente"),
})

export type UpdateCustomerNameInput = z.infer<typeof updateCustomerNameSchema>

/**
 * Schema para buscar agendamentos futuros do cliente
 */
export const getCustomerUpcomingAppointmentsSchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido"),
  customerPhone: z.string().min(1, "customerPhone é obrigatório"),
})

export type GetCustomerUpcomingAppointmentsInput = z.infer<typeof getCustomerUpcomingAppointmentsSchema>

/**
 * Schema para buscar meus agendamentos futuros
 * Aceita clientId (injetado) ou phone (fornecido via contexto)
 */
export const getMyFutureAppointmentsSchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido"),
  clientId: z.uuid("clientId deve ser um UUID válido").optional(),
  phone: z.string().min(1, "phone deve ser fornecido se clientId não estiver disponível").optional(),
})

export type GetMyFutureAppointmentsInput = z.infer<typeof getMyFutureAppointmentsSchema>

/**
 * Schema para buscar regras de disponibilidade de um profissional
 */
export const getProfessionalAvailabilityRulesSchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido"),
  professionalName: z.string().min(1, "professionalName é obrigatório"),
})

export type GetProfessionalAvailabilityRulesInput = z.infer<typeof getProfessionalAvailabilityRulesSchema>

