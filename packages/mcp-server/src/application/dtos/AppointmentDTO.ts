/**
 * DTO para transferência de dados de agendamento
 */
export interface AppointmentDTO {
  id: string
  customerName: string
  customerId: string
  serviceName: string
  serviceId: string
  professionalName: string
  professionalId: string
  startsAt: string // formatado para exibição
  endsAt: string // formatado para exibição
  startsAtISO: string // ISO para processamento
  endsAtISO: string // ISO para processamento
  status: string
  notes?: string | null
}

/**
 * DTO para criação de agendamento
 */
export interface CreateAppointmentDTO {
  salonId: string
  customerId: string
  professionalId: string
  serviceId: string
  startsAt: string // ISO datetime
  notes?: string
}

/**
 * DTO para atualização de agendamento
 */
export interface UpdateAppointmentDTO {
  appointmentId: string
  professionalId?: string
  serviceId?: string
  startsAt?: string // ISO datetime
  notes?: string
}

/**
 * DTO para lista de agendamentos
 */
export interface AppointmentListDTO {
  appointments: AppointmentDTO[]
  total: number
  message: string
}
