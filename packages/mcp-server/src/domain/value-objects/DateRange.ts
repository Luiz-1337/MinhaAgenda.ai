/**
 * Value Object imutável que representa um intervalo de datas
 */
export class DateRange {
  constructor(
    readonly start: Date,
    readonly end: Date
  ) {
    if (start > end) {
      throw new Error("Data de início deve ser anterior à data de fim")
    }
  }

  /**
   * Cria um DateRange a partir de timestamps
   */
  static fromTimestamps(startMs: number, endMs: number): DateRange {
    return new DateRange(new Date(startMs), new Date(endMs))
  }

  /**
   * Cria um DateRange a partir de strings ISO
   */
  static fromIsoStrings(start: string, end: string): DateRange {
    return new DateRange(new Date(start), new Date(end))
  }

  /**
   * Verifica se uma data está contida no intervalo (inclusivo)
   */
  contains(date: Date): boolean {
    return date >= this.start && date <= this.end
  }

  /**
   * Verifica se há sobreposição com outro intervalo
   */
  overlaps(other: DateRange): boolean {
    return this.start < other.end && this.end > other.start
  }

  /**
   * Verifica se este intervalo contém completamente outro
   */
  containsRange(other: DateRange): boolean {
    return this.start <= other.start && this.end >= other.end
  }

  /**
   * Retorna a duração em minutos
   */
  duration(): number {
    return Math.round((this.end.getTime() - this.start.getTime()) / (60 * 1000))
  }

  /**
   * Retorna a duração em horas
   */
  durationInHours(): number {
    return this.duration() / 60
  }

  /**
   * Verifica igualdade com outro DateRange
   */
  equals(other: DateRange): boolean {
    return (
      this.start.getTime() === other.start.getTime() &&
      this.end.getTime() === other.end.getTime()
    )
  }

  /**
   * Retorna representação em string
   */
  toString(): string {
    return `${this.start.toISOString()} - ${this.end.toISOString()}`
  }
}
