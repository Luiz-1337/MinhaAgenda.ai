import type { IAppointmentRepository, AppointmentWithRelations } from '../../domain/integrations/interfaces/appointment-repository.interface'
import type { AppointmentId } from '../../domain/integrations/value-objects/appointment-id'
import type { SalonId } from '../../domain/integrations/value-objects/salon-id'
import { db, appointments, professionals, services, profiles, salons } from '../../index'
import { eq } from 'drizzle-orm'
import { createAppointmentId, createSalonId } from '../../domain/integrations/value-objects/index'

/**
 * Appointment repository implementation
 * Encapsulates Drizzle ORM queries
 */
export class AppointmentRepository implements IAppointmentRepository {
  async findByIdWithRelations(appointmentId: AppointmentId): Promise<AppointmentWithRelations | null> {
    const result = await db
      .select({
        id: appointments.id,
        salonId: appointments.salonId,
        professionalId: appointments.professionalId,
        clientId: appointments.clientId,
        serviceId: appointments.serviceId,
        date: appointments.date,
        endTime: appointments.endTime,
        status: appointments.status,
        notes: appointments.notes,
        googleEventId: appointments.googleEventId,
        trinksEventId: appointments.trinksEventId,
        professionalName: professionals.name,
        professionalEmail: professionals.email,
        professionalGoogleCalendarId: professionals.googleCalendarId,
        serviceName: services.name,
        serviceDuration: services.duration,
        clientName: profiles.fullName,
        clientEmail: profiles.email,
        clientPhone: profiles.phone,
      })
      .from(appointments)
      .innerJoin(professionals, eq(appointments.professionalId, professionals.id))
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .innerJoin(profiles, eq(appointments.clientId, profiles.id))
      .where(eq(appointments.id, appointmentId))
      .limit(1)

    const appointment = result[0]
    if (!appointment) {
      return null
    }

    return {
      id: createAppointmentId(appointment.id),
      salonId: createSalonId(appointment.salonId),
      professionalId: appointment.professionalId,
      clientId: appointment.clientId,
      serviceId: appointment.serviceId,
      date: appointment.date,
      endTime: appointment.endTime,
      status: appointment.status,
      notes: appointment.notes,
      googleEventId: appointment.googleEventId,
      trinksEventId: appointment.trinksEventId,
      professionalName: appointment.professionalName,
      professionalEmail: appointment.professionalEmail,
      professionalGoogleCalendarId: appointment.professionalGoogleCalendarId ?? null,
      serviceName: appointment.serviceName,
      serviceDuration: appointment.serviceDuration ? Number(appointment.serviceDuration) : null,
      clientName: appointment.clientName ?? '',
      clientEmail: appointment.clientEmail ?? null,
      clientPhone: appointment.clientPhone ?? null,
    }
  }

  async findById(appointmentId: AppointmentId): Promise<{
    id: AppointmentId
    salonId: SalonId
    professionalId: string
    googleEventId: string | null
    trinksEventId: string | null
  } | null> {
    const appointment = await db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      columns: {
        id: true,
        salonId: true,
        professionalId: true,
        googleEventId: true,
        trinksEventId: true,
      },
    })

    if (!appointment) {
      return null
    }

    return {
      id: createAppointmentId(appointment.id),
      salonId: createSalonId(appointment.salonId),
      professionalId: appointment.professionalId,
      googleEventId: appointment.googleEventId ?? null,
      trinksEventId: appointment.trinksEventId ?? null,
    }
  }

  async updateExternalEventId(
    appointmentId: AppointmentId,
    provider: 'google' | 'trinks',
    eventId: string | null
  ): Promise<void> {
    const updateData = provider === 'google' 
      ? { googleEventId: eventId }
      : { trinksEventId: eventId }

    await db
      .update(appointments)
      .set(updateData)
      .where(eq(appointments.id, appointmentId))
  }

  async findProfessionalById(professionalId: string): Promise<{
    id: string
    name: string
    email: string | null
    googleCalendarId: string | null
  } | null> {
    const professional = await db.query.professionals.findFirst({
      where: eq(professionals.id, professionalId),
      columns: {
        id: true,
        name: true,
        email: true,
        googleCalendarId: true,
      },
    })

    if (!professional) {
      return null
    }

    return {
      id: professional.id,
      name: professional.name,
      email: professional.email ?? null,
      googleCalendarId: professional.googleCalendarId ?? null,
    }
  }

  async isSoloPlan(salonId: SalonId): Promise<boolean> {
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { ownerId: true },
    })
    if (!salon?.ownerId) return false

    const ownerProfile = await db.query.profiles.findFirst({
      where: eq(profiles.id, salon.ownerId),
      columns: { tier: true },
    })
    return ownerProfile?.tier === 'SOLO'
  }

  async updateProfessionalCalendarId(professionalId: string, calendarId: string): Promise<void> {
    await db
      .update(professionals)
      .set({ googleCalendarId: calendarId })
      .where(eq(professionals.id, professionalId))
  }
}
