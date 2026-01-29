import { Appointment, AppointmentProps } from "../../domain/entities"
import { AppointmentStatus } from "../../shared/types/common.types"

/**
 * Tipo representando uma linha do banco de dados
 */
export interface AppointmentRow {
  id: string
  salonId: string
  clientId: string
  professionalId: string
  serviceId: string
  date: Date
  endTime: Date
  status: string
  googleEventId?: string | null
  trinksEventId?: string | null
  notes?: string | null
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Mapper para conversão entre formato do banco e entidade Appointment
 */
export class AppointmentMapper {
  /**
   * Converte uma linha do banco para entidade de domínio
   */
  static toDomain(row: AppointmentRow): Appointment {
    const props: AppointmentProps = {
      id: row.id,
      salonId: row.salonId,
      customerId: row.clientId,
      professionalId: row.professionalId,
      serviceId: row.serviceId,
      startsAt: new Date(row.date),
      endsAt: new Date(row.endTime),
      status: row.status as AppointmentStatus,
      googleEventId: row.googleEventId,
      trinksEventId: row.trinksEventId,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
    return Appointment.fromPersistence(props)
  }

  /**
   * Converte uma entidade para formato de persistência
   */
  static toPersistence(entity: Appointment): AppointmentRow {
    const props = entity.toPersistence()
    return {
      id: props.id,
      salonId: props.salonId,
      clientId: props.customerId,
      professionalId: props.professionalId,
      serviceId: props.serviceId,
      date: props.startsAt,
      endTime: props.endsAt,
      status: props.status,
      googleEventId: props.googleEventId,
      trinksEventId: props.trinksEventId,
      notes: props.notes,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    }
  }

  /**
   * Converte uma entidade para formato de inserção (sem campos automáticos)
   */
  static toInsert(entity: Appointment): Omit<AppointmentRow, "createdAt" | "updatedAt"> {
    const row = this.toPersistence(entity)
    const { createdAt, updatedAt, ...insertData } = row
    return insertData
  }

  /**
   * Converte múltiplas linhas para entidades
   */
  static toDomainList(rows: AppointmentRow[]): Appointment[] {
    return rows.map((row) => this.toDomain(row))
  }
}
