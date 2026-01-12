import type { ICalendarIntegration } from '../../../domain/integrations/interfaces/calendar-integration.interface'
import type { IAppointmentRepository } from '../../../domain/integrations/interfaces/appointment-repository.interface'
import type { ILogger } from '../../../infrastructure/logger'
import type { SalonId } from '../../../domain/integrations/value-objects/salon-id'
import { DomainError } from '../../../domain/errors/domain-error'

/**
 * Use case for ensuring a professional has a calendar
 * Idempotent: if calendar exists, returns existing ID
 */
export class EnsureProfessionalCalendarUseCase {
  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly calendarIntegration: ICalendarIntegration,
    private readonly logger: ILogger
  ) {}

  async execute(professionalId: string, salonId: SalonId): Promise<string | null> {
    this.logger.debug('Ensuring professional calendar', { professionalId, salonId })

    const professional = await this.appointmentRepository.findProfessionalById(professionalId)

    if (!professional) {
      this.logger.error('Professional not found', { professionalId })
      throw new DomainError(`Professional ${professionalId} not found`, 'PROFESSIONAL_NOT_FOUND', {
        professionalId,
      })
    }

    if (professional.googleCalendarId) {
      this.logger.debug('Professional already has calendar', {
        professionalId,
        calendarId: professional.googleCalendarId,
      })
      return professional.googleCalendarId
    }

    this.logger.debug('Creating new calendar for professional', {
      professionalId,
      professionalName: professional.name,
    })

    const calendarId = await this.calendarIntegration.ensureProfessionalCalendar(
      professionalId,
      salonId
    )

    if (!calendarId) {
      this.logger.warn('Calendar creation returned null - integration may not be configured', {
        professionalId,
        salonId,
      })
      return null
    }

    await this.appointmentRepository.updateProfessionalCalendarId(professionalId, calendarId)

    this.logger.info('Professional calendar created and saved', {
      professionalId,
      calendarId,
    })

    return calendarId
  }
}
