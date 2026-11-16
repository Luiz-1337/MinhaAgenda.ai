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
  salonId: string // salão do contexto — usado para isolamento multi-tenant
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
  /**
   * Presente quando o salão tem agenda oficial externa (onde a recepção também
   * marca) e ela foi consultada para montar esta lista.
   * - `checked` / `recent`: consultada (agora, ou há instantes) — a lista inclui
   *   o que a recepção marcou;
   * - `failed`: não respondeu — pode haver horário lá que não aparece aqui.
   */
  officialAgenda?: {
    status: "checked" | "recent" | "failed"
    /** Horários que existem lá e não puderam vir para cá: não dá para alterá-los por aqui. */
    unlinked: Array<{ startsAt: string; startsAtISO: string }>
  }
}
