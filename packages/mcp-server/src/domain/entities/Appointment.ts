import { Result, ok, fail } from "../../shared/types"
import { AppointmentStatus } from "../../shared/types/common.types"
import { PastAppointmentError } from "../errors"
import { DateRange } from "../value-objects"

export interface AppointmentProps {
  id: string
  salonId: string
  customerId: string
  professionalId: string
  serviceId: string
  startsAt: Date
  endsAt: Date
  status: AppointmentStatus
  googleEventId?: string | null
  trinksEventId?: string | null
  notes?: string | null
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Entidade que representa um agendamento no sistema
 */
export class Appointment {
  readonly id: string
  readonly salonId: string
  readonly customerId: string
  private _professionalId: string
  private _serviceId: string
  private _startsAt: Date
  private _endsAt: Date
  private _status: AppointmentStatus
  private _googleEventId?: string | null
  private _trinksEventId?: string | null
  private _notes?: string | null
  readonly createdAt: Date
  private _updatedAt: Date

  private constructor(props: AppointmentProps) {
    this.id = props.id
    this.salonId = props.salonId
    this.customerId = props.customerId
    this._professionalId = props.professionalId
    this._serviceId = props.serviceId
    this._startsAt = props.startsAt
    this._endsAt = props.endsAt
    this._status = props.status
    this._googleEventId = props.googleEventId
    this._trinksEventId = props.trinksEventId
    this._notes = props.notes
    this.createdAt = props.createdAt ?? new Date()
    this._updatedAt = props.updatedAt ?? new Date()
  }

  /**
   * Cria uma nova instância de Appointment
   */
  static create(props: AppointmentProps): Appointment {
    return new Appointment(props)
  }

  /**
   * Reconstrói a partir de dados persistidos
   */
  static fromPersistence(props: AppointmentProps): Appointment {
    return new Appointment(props)
  }

  // Getters
  get professionalId(): string {
    return this._professionalId
  }

  get serviceId(): string {
    return this._serviceId
  }

  get startsAt(): Date {
    return this._startsAt
  }

  get endsAt(): Date {
    return this._endsAt
  }

  get status(): AppointmentStatus {
    return this._status
  }

  get googleEventId(): string | null | undefined {
    return this._googleEventId
  }

  get trinksEventId(): string | null | undefined {
    return this._trinksEventId
  }

  get notes(): string | null | undefined {
    return this._notes
  }

  get updatedAt(): Date {
    return this._updatedAt
  }

  /**
   * Retorna o intervalo de tempo do agendamento
   */
  get dateRange(): DateRange {
    return new DateRange(this._startsAt, this._endsAt)
  }

  /**
   * Duração em minutos
   */
  get duration(): number {
    return Math.round(
      (this._endsAt.getTime() - this._startsAt.getTime()) / (60 * 1000)
    )
  }

  /**
   * Verifica se o agendamento é futuro
   */
  isUpcoming(): boolean {
    return this._startsAt.getTime() > Date.now() && this._status !== "cancelled"
  }

  /**
   * Verifica se o agendamento é passado
   */
  isPast(): boolean {
    return this._endsAt.getTime() < Date.now()
  }

  /**
   * Verifica se está em andamento
   */
  isInProgress(): boolean {
    const now = Date.now()
    return this._startsAt.getTime() <= now && this._endsAt.getTime() > now
  }

  /**
   * Verifica se pode ser modificado
   */
  canBeModified(): boolean {
    return !this.isPast() && this._status !== "cancelled" && this._status !== "completed"
  }

  /**
   * Verifica se há sobreposição com outro agendamento
   */
  overlaps(other: Appointment): boolean {
    // Agendamentos cancelados não geram conflito
    if (this._status === "cancelled" || other._status === "cancelled") {
      return false
    }
    return this.dateRange.overlaps(other.dateRange)
  }

  /**
   * Cancela o agendamento
   */
  cancel(): Result<void, PastAppointmentError> {
    if (this.isPast()) {
      return fail(new PastAppointmentError("Não é possível cancelar um agendamento passado"))
    }

    this._status = "cancelled"
    this._updatedAt = new Date()
    return ok(undefined)
  }

  /**
   * Confirma o agendamento
   */
  confirm(): Result<void, PastAppointmentError> {
    if (this.isPast()) {
      return fail(new PastAppointmentError("Não é possível confirmar um agendamento passado"))
    }

    this._status = "confirmed"
    this._updatedAt = new Date()
    return ok(undefined)
  }

  /**
   * Marca como completo
   */
  complete(): void {
    this._status = "completed"
    this._updatedAt = new Date()
  }

  /**
   * Reagenda o agendamento
   */
  reschedule(newStart: Date, newEnd: Date): Result<void, PastAppointmentError> {
    if (this.isPast()) {
      return fail(new PastAppointmentError("Não é possível reagendar um agendamento passado"))
    }

    if (newStart.getTime() < Date.now()) {
      return fail(new PastAppointmentError("Não é possível reagendar para um horário passado"))
    }

    this._startsAt = newStart
    this._endsAt = newEnd
    this._updatedAt = new Date()
    return ok(undefined)
  }

  /**
   * Atualiza o profissional
   */
  changeProfessional(professionalId: string): Result<void, PastAppointmentError> {
    if (!this.canBeModified()) {
      return fail(new PastAppointmentError())
    }

    this._professionalId = professionalId
    this._updatedAt = new Date()
    return ok(undefined)
  }

  /**
   * Atualiza o serviço
   */
  changeService(serviceId: string, newDuration?: number): Result<void, PastAppointmentError> {
    if (!this.canBeModified()) {
      return fail(new PastAppointmentError())
    }

    this._serviceId = serviceId
    if (newDuration) {
      this._endsAt = new Date(this._startsAt.getTime() + newDuration * 60 * 1000)
    }
    this._updatedAt = new Date()
    return ok(undefined)
  }

  /**
   * Atualiza as notas
   */
  updateNotes(notes: string | null): void {
    this._notes = notes
    this._updatedAt = new Date()
  }

  /**
   * Define o ID do evento do Google Calendar
   */
  setGoogleEventId(eventId: string | null): void {
    this._googleEventId = eventId
    this._updatedAt = new Date()
  }

  /**
   * Define o ID do evento do Trinks
   */
  setTrinksEventId(eventId: string | null): void {
    this._trinksEventId = eventId
    this._updatedAt = new Date()
  }

  /**
   * Retorna as propriedades para persistência
   */
  toPersistence(): AppointmentProps {
    return {
      id: this.id,
      salonId: this.salonId,
      customerId: this.customerId,
      professionalId: this._professionalId,
      serviceId: this._serviceId,
      startsAt: this._startsAt,
      endsAt: this._endsAt,
      status: this._status,
      googleEventId: this._googleEventId,
      trinksEventId: this._trinksEventId,
      notes: this._notes,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    }
  }
}
