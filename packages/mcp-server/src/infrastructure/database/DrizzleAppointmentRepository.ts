import { db, appointments, customers, and, eq, gte, lte, ne, or } from "@repo/db"
import { IAppointmentRepository } from "../../domain/repositories"
import { Appointment } from "../../domain/entities"
import { AppointmentMapper } from "../mappers"
import { startOfDay, endOfDay } from "../../shared/utils/date.utils"
import { normalizePhone } from "../../shared/utils/phone.utils"

/**
 * Implementação do repositório de agendamentos usando Drizzle ORM
 */
export class DrizzleAppointmentRepository implements IAppointmentRepository {
  async findById(id: string): Promise<Appointment | null> {
    const row = await db.query.appointments.findFirst({
      where: eq(appointments.id, id),
    })

    if (!row) return null

    return AppointmentMapper.toDomain({
      id: row.id,
      salonId: row.salonId,
      clientId: row.clientId,
      professionalId: row.professionalId,
      serviceId: row.serviceId,
      date: row.date,
      endTime: row.endTime,
      status: row.status,
      googleEventId: row.googleEventId,
      trinksEventId: row.trinksEventId,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  }

  async findByCustomer(customerId: string, salonId: string): Promise<Appointment[]> {
    const rows = await db.query.appointments.findMany({
      where: and(
        eq(appointments.clientId, customerId),
        eq(appointments.salonId, salonId)
      ),
      orderBy: (appointments, { desc }) => [desc(appointments.date)],
    })

    return rows.map((row) =>
      AppointmentMapper.toDomain({
        id: row.id,
        salonId: row.salonId,
        clientId: row.clientId,
        professionalId: row.professionalId,
        serviceId: row.serviceId,
        date: row.date,
        endTime: row.endTime,
        status: row.status,
        googleEventId: row.googleEventId,
        trinksEventId: row.trinksEventId,
        notes: row.notes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
    )
  }

  async findByProfessionalAndDate(professionalId: string, date: Date): Promise<Appointment[]> {
    const dayStart = startOfDay(date)
    const dayEnd = endOfDay(date)

    const rows = await db.query.appointments.findMany({
      where: and(
        eq(appointments.professionalId, professionalId),
        gte(appointments.date, dayStart),
        lte(appointments.date, dayEnd),
        ne(appointments.status, "cancelled")
      ),
      orderBy: (appointments, { asc }) => [asc(appointments.date)],
    })

    return rows.map((row) =>
      AppointmentMapper.toDomain({
        id: row.id,
        salonId: row.salonId,
        clientId: row.clientId,
        professionalId: row.professionalId,
        serviceId: row.serviceId,
        date: row.date,
        endTime: row.endTime,
        status: row.status,
        googleEventId: row.googleEventId,
        trinksEventId: row.trinksEventId,
        notes: row.notes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
    )
  }

  async findUpcoming(customerId: string, salonId: string): Promise<Appointment[]> {
    const now = new Date()

    const rows = await db.query.appointments.findMany({
      where: and(
        eq(appointments.clientId, customerId),
        eq(appointments.salonId, salonId),
        gte(appointments.date, now),
        ne(appointments.status, "cancelled")
      ),
      orderBy: (appointments, { asc }) => [asc(appointments.date)],
    })

    return rows.map((row) =>
      AppointmentMapper.toDomain({
        id: row.id,
        salonId: row.salonId,
        clientId: row.clientId,
        professionalId: row.professionalId,
        serviceId: row.serviceId,
        date: row.date,
        endTime: row.endTime,
        status: row.status,
        googleEventId: row.googleEventId,
        trinksEventId: row.trinksEventId,
        notes: row.notes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
    )
  }

  async findUpcomingByPhone(phone: string, salonId: string): Promise<Appointment[]> {
    const normalizedPhone = normalizePhone(phone)
    const now = new Date()

    // Primeiro encontra o customer
    const customer = await db.query.customers.findFirst({
      where: and(
        eq(customers.salonId, salonId),
        eq(customers.phone, normalizedPhone)
      ),
    })

    if (!customer) {
      return []
    }

    return this.findUpcoming(customer.id, salonId)
  }

  async findConflicting(
    professionalId: string,
    startsAt: Date,
    endsAt: Date,
    excludeAppointmentId?: string
  ): Promise<Appointment[]> {
    const conditions = [
      eq(appointments.professionalId, professionalId),
      ne(appointments.status, "cancelled"),
      // Verifica sobreposição: (start1 < end2) AND (end1 > start2)
      or(
        and(
          lte(appointments.date, startsAt),
          gte(appointments.endTime, startsAt)
        ),
        and(
          gte(appointments.date, startsAt),
          lte(appointments.date, endsAt)
        )
      ),
    ]

    if (excludeAppointmentId) {
      conditions.push(ne(appointments.id, excludeAppointmentId))
    }

    const rows = await db.query.appointments.findMany({
      where: and(...conditions),
    })

    return rows.map((row) =>
      AppointmentMapper.toDomain({
        id: row.id,
        salonId: row.salonId,
        clientId: row.clientId,
        professionalId: row.professionalId,
        serviceId: row.serviceId,
        date: row.date,
        endTime: row.endTime,
        status: row.status,
        googleEventId: row.googleEventId,
        trinksEventId: row.trinksEventId,
        notes: row.notes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
    )
  }

  async save(appointment: Appointment): Promise<void> {
    const data = AppointmentMapper.toPersistence(appointment)

    await db
      .insert(appointments)
      .values({
        id: data.id,
        salonId: data.salonId,
        clientId: data.clientId,
        professionalId: data.professionalId,
        serviceId: data.serviceId,
        date: data.date,
        endTime: data.endTime,
        status: data.status as "pending" | "confirmed" | "cancelled" | "completed",
        googleEventId: data.googleEventId,
        trinksEventId: data.trinksEventId,
        notes: data.notes,
      })
      .onConflictDoUpdate({
        target: appointments.id,
        set: {
          professionalId: data.professionalId,
          serviceId: data.serviceId,
          date: data.date,
          endTime: data.endTime,
          status: data.status as "pending" | "confirmed" | "cancelled" | "completed",
          googleEventId: data.googleEventId,
          trinksEventId: data.trinksEventId,
          notes: data.notes,
          updatedAt: new Date(),
        },
      })
  }

  async delete(id: string): Promise<void> {
    await db.delete(appointments).where(eq(appointments.id, id))
  }
}
