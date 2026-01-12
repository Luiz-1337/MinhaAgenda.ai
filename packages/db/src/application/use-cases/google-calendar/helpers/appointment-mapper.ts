import type { AppointmentWithRelations } from '../../../../domain/integrations/interfaces/appointment-repository.interface'
import { formatEventTitle, formatEventDescription, buildEventReminders } from './event-formatter'
import { GOOGLE_TIMEZONE_DEFAULT } from '../../../../domain/constants'

/**
 * Google Calendar event structure
 */
export interface GoogleEvent {
  summary: string
  description: string
  start: {
    dateTime: string
    timeZone: string
  }
  end: {
    dateTime: string
    timeZone: string
  }
  attendees?: Array<{ email: string }>
  reminders: {
    useDefault: boolean
    overrides: Array<{ method: 'email' | 'popup'; minutes: number }>
  }
}

/**
 * Maps appointment data to Google Calendar event format
 */
export function mapAppointmentToGoogleEvent(
  appointment: AppointmentWithRelations,
  timeZone: string = GOOGLE_TIMEZONE_DEFAULT
): GoogleEvent {
  const summary = formatEventTitle(
    appointment.professionalName,
    appointment.serviceName,
    appointment.clientName
  )

  const description = formatEventDescription(
    appointment.serviceName,
    appointment.clientName,
    appointment.notes
  )

  const attendees: Array<{ email: string }> = []
  if (appointment.professionalEmail) {
    attendees.push({ email: appointment.professionalEmail })
  }

  return {
    summary,
    description,
    start: {
      dateTime: appointment.date.toISOString(),
      timeZone,
    },
    end: {
      dateTime: appointment.endTime.toISOString(),
      timeZone,
    },
    attendees: attendees.length > 0 ? attendees : undefined,
    reminders: {
      useDefault: false,
      overrides: buildEventReminders(),
    },
  }
}
