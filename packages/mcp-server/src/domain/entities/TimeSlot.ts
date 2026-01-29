import { formatTime } from "../../shared/utils/date.utils"
import { DateRange } from "../value-objects"

export interface TimeSlotProps {
  start: Date
  end: Date
  available: boolean
  professionalId?: string
}

/**
 * Entidade que representa um intervalo de tempo disponível ou ocupado
 */
export class TimeSlot {
  readonly start: Date
  readonly end: Date
  private _available: boolean
  readonly professionalId?: string

  constructor(props: TimeSlotProps) {
    this.start = props.start
    this.end = props.end
    this._available = props.available
    this.professionalId = props.professionalId
  }

  /**
   * Cria um TimeSlot a partir de strings de hora e uma data base
   */
  static fromTimeStrings(
    baseDate: Date,
    startTime: string,
    endTime: string,
    available = true,
    professionalId?: string
  ): TimeSlot {
    const [startHour, startMin] = startTime.split(":").map(Number)
    const [endHour, endMin] = endTime.split(":").map(Number)

    const start = new Date(baseDate)
    start.setHours(startHour, startMin, 0, 0)

    const end = new Date(baseDate)
    end.setHours(endHour, endMin, 0, 0)

    return new TimeSlot({ start, end, available, professionalId })
  }

  // Getters
  get available(): boolean {
    return this._available
  }

  /**
   * Retorna o intervalo de datas
   */
  get dateRange(): DateRange {
    return new DateRange(this.start, this.end)
  }

  /**
   * Duração em minutos
   */
  duration(): number {
    return Math.round((this.end.getTime() - this.start.getTime()) / (60 * 1000))
  }

  /**
   * Verifica se uma data está contida no slot
   */
  contains(date: Date): boolean {
    return date >= this.start && date < this.end
  }

  /**
   * Verifica se há sobreposição com outro slot
   */
  overlaps(other: TimeSlot): boolean {
    return this.start < other.end && this.end > other.start
  }

  /**
   * Verifica se este slot pode acomodar uma duração
   */
  canFit(durationMinutes: number): boolean {
    return this.duration() >= durationMinutes && this._available
  }

  /**
   * Marca como disponível
   */
  markAvailable(): void {
    this._available = true
  }

  /**
   * Marca como indisponível
   */
  markUnavailable(): void {
    this._available = false
  }

  /**
   * Formata o slot para exibição
   * Ex: "09:00 - 10:00"
   */
  format(): string {
    return `${formatTime(this.start)} - ${formatTime(this.end)}`
  }

  /**
   * Retorna apenas o horário de início formatado
   */
  formatStartTime(): string {
    return formatTime(this.start)
  }

  /**
   * Retorna apenas o horário de fim formatado
   */
  formatEndTime(): string {
    return formatTime(this.end)
  }

  /**
   * Verifica igualdade
   */
  equals(other: TimeSlot): boolean {
    return (
      this.start.getTime() === other.start.getTime() &&
      this.end.getTime() === other.end.getTime()
    )
  }

  /**
   * Retorna representação em string
   */
  toString(): string {
    const status = this._available ? "disponível" : "ocupado"
    return `${this.format()} (${status})`
  }
}
