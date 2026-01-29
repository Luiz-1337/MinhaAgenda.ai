import {
  IAppointmentRepository,
  ICustomerRepository,
  IProfessionalRepository,
  IServiceRepository,
} from "../../domain/repositories"
import { ICalendarService, IExternalScheduler } from "../ports"

/**
 * Serviço de sincronização entre sistemas
 */
export class SyncService {
  constructor(
    private appointmentRepo: IAppointmentRepository,
    private customerRepo: ICustomerRepository,
    private professionalRepo: IProfessionalRepository,
    private serviceRepo: IServiceRepository,
    private calendarService?: ICalendarService,
    private externalScheduler?: IExternalScheduler
  ) {}

  /**
   * Sincroniza um agendamento com o Google Calendar
   */
  async syncAppointmentToGoogle(appointmentId: string): Promise<boolean> {
    if (!this.calendarService) {
      return false
    }

    try {
      const appointment = await this.appointmentRepo.findById(appointmentId)
      if (!appointment) {
        console.warn(`Agendamento ${appointmentId} não encontrado para sincronização`)
        return false
      }

      const professional = await this.professionalRepo.findById(appointment.professionalId)
      if (!professional?.googleCalendarId) {
        console.debug("Profissional sem calendário Google configurado")
        return false
      }

      const customer = await this.customerRepo.findById(appointment.customerId)
      const service = await this.serviceRepo.findById(appointment.serviceId)

      const summary = `${service?.name ?? "Serviço"} - ${customer?.name ?? "Cliente"}`

      if (appointment.googleEventId) {
        // Atualizar evento existente
        await this.calendarService.updateEvent(professional.googleCalendarId, {
          id: appointment.googleEventId,
          start: appointment.startsAt,
          end: appointment.endsAt,
          summary,
          description: appointment.notes ?? undefined,
        })
      } else {
        // Criar novo evento
        const eventId = await this.calendarService.createEvent(
          professional.googleCalendarId,
          {
            start: appointment.startsAt,
            end: appointment.endsAt,
            summary,
            description: appointment.notes ?? undefined,
          }
        )

        // Salvar ID do evento no agendamento
        appointment.setGoogleEventId(eventId)
        await this.appointmentRepo.save(appointment)
      }

      console.info(`Agendamento ${appointmentId} sincronizado com Google Calendar`)
      return true
    } catch (error) {
      console.error("Erro ao sincronizar com Google Calendar:", error)
      return false
    }
  }

  /**
   * Remove um evento do Google Calendar
   */
  async removeFromGoogle(appointmentId: string): Promise<boolean> {
    if (!this.calendarService) {
      return false
    }

    try {
      const appointment = await this.appointmentRepo.findById(appointmentId)
      if (!appointment?.googleEventId) {
        return false
      }

      const professional = await this.professionalRepo.findById(appointment.professionalId)
      if (!professional?.googleCalendarId) {
        return false
      }

      await this.calendarService.deleteEvent(
        professional.googleCalendarId,
        appointment.googleEventId
      )

      // Limpar ID do evento
      appointment.setGoogleEventId(null)
      await this.appointmentRepo.save(appointment)

      console.info(`Evento do Google Calendar removido para agendamento ${appointmentId}`)
      return true
    } catch (error) {
      console.error("Erro ao remover do Google Calendar:", error)
      return false
    }
  }

  /**
   * Sincroniza um agendamento com o Trinks
   */
  async syncAppointmentToTrinks(appointmentId: string): Promise<boolean> {
    if (!this.externalScheduler) {
      return false
    }

    try {
      const appointment = await this.appointmentRepo.findById(appointmentId)
      if (!appointment) {
        console.warn(`Agendamento ${appointmentId} não encontrado para sincronização`)
        return false
      }

      if (appointment.trinksEventId) {
        // Atualizar agendamento existente
        await this.externalScheduler.updateBooking(appointment.trinksEventId, {
          professionalId: appointment.professionalId,
          serviceId: appointment.serviceId,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
        })
      } else {
        // Criar novo agendamento
        const bookingId = await this.externalScheduler.createBooking({
          professionalId: appointment.professionalId,
          customerId: appointment.customerId,
          serviceId: appointment.serviceId,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          notes: appointment.notes ?? undefined,
        })

        // Salvar ID do booking no agendamento
        appointment.setTrinksEventId(bookingId)
        await this.appointmentRepo.save(appointment)
      }

      console.info(`Agendamento ${appointmentId} sincronizado com Trinks`)
      return true
    } catch (error) {
      console.error("Erro ao sincronizar com Trinks:", error)
      return false
    }
  }

  /**
   * Remove um agendamento do Trinks
   */
  async removeFromTrinks(appointmentId: string): Promise<boolean> {
    if (!this.externalScheduler) {
      return false
    }

    try {
      const appointment = await this.appointmentRepo.findById(appointmentId)
      if (!appointment?.trinksEventId) {
        return false
      }

      await this.externalScheduler.cancelBooking(appointment.trinksEventId)

      // Limpar ID do booking
      appointment.setTrinksEventId(null)
      await this.appointmentRepo.save(appointment)

      console.info(`Agendamento removido do Trinks: ${appointmentId}`)
      return true
    } catch (error) {
      console.error("Erro ao remover do Trinks:", error)
      return false
    }
  }

  /**
   * Sincroniza um agendamento com todos os sistemas externos
   */
  async syncAppointment(appointmentId: string): Promise<{
    google: boolean
    trinks: boolean
  }> {
    const [google, trinks] = await Promise.all([
      this.syncAppointmentToGoogle(appointmentId),
      this.syncAppointmentToTrinks(appointmentId),
    ])

    return { google, trinks }
  }

  /**
   * Remove um agendamento de todos os sistemas externos
   */
  async removeAppointment(appointmentId: string): Promise<{
    google: boolean
    trinks: boolean
  }> {
    const [google, trinks] = await Promise.all([
      this.removeFromGoogle(appointmentId),
      this.removeFromTrinks(appointmentId),
    ])

    return { google, trinks }
  }
}
