/**
 * DTO returned by FindInactiveCustomersUseCase.
 * Contains the minimum fields needed by the dispatcher to generate
 * the LLM message and persist the campaign_messages row.
 */
export interface InactiveCustomerDTO {
  customerId: string
  salonId: string
  name: string
  phone: string
  lastVisitAt: Date | null
  lastServiceId: string | null
  lastServiceName: string | null
  lastProfessionalId: string | null
  lastProfessionalName: string | null
  /** Cycle days actually used for the cutoff (service.average_cycle_days || default). */
  cycleDaysUsed: number
  /** Days since last completed visit (null if never visited). */
  daysSinceVisit: number | null
}

export interface FindInactiveCustomersInputDTO {
  salonId: string
  daysAfterInactivity: number
  defaultCycleDays: number
  cooldownDays: number
  limit?: number
  cursor?: { lastVisitAt: Date | null; customerId: string }
}

export interface FindInactiveCustomersOutputDTO {
  items: InactiveCustomerDTO[]
  nextCursor?: { lastVisitAt: Date | null; customerId: string }
}
