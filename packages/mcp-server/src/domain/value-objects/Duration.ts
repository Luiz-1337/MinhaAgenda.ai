/**
 * Value Object imutável para durações de tempo
 */
export class Duration {
  private constructor(private readonly minutes: number) {}

  /**
   * Cria uma Duration a partir de minutos
   */
  static fromMinutes(minutes: number): Duration {
    if (minutes < 0) {
      throw new Error("Duração não pode ser negativa")
    }
    return new Duration(minutes)
  }

  /**
   * Cria uma Duration a partir de horas
   */
  static fromHours(hours: number): Duration {
    return Duration.fromMinutes(hours * 60)
  }

  /**
   * Cria uma Duration zero
   */
  static zero(): Duration {
    return new Duration(0)
  }

  /**
   * Retorna a duração em minutos
   */
  toMinutes(): number {
    return this.minutes
  }

  /**
   * Retorna a duração em horas
   */
  toHours(): number {
    return this.minutes / 60
  }

  /**
   * Adiciona outra Duration
   */
  add(other: Duration): Duration {
    return new Duration(this.minutes + other.minutes)
  }

  /**
   * Subtrai outra Duration
   */
  subtract(other: Duration): Duration {
    const result = this.minutes - other.minutes
    if (result < 0) {
      throw new Error("Resultado da subtração não pode ser negativo")
    }
    return new Duration(result)
  }

  /**
   * Multiplica a duração
   */
  multiply(factor: number): Duration {
    return new Duration(Math.round(this.minutes * factor))
  }

  /**
   * Verifica se é maior que outra Duration
   */
  isGreaterThan(other: Duration): boolean {
    return this.minutes > other.minutes
  }

  /**
   * Verifica se é menor que outra Duration
   */
  isLessThan(other: Duration): boolean {
    return this.minutes < other.minutes
  }

  /**
   * Verifica igualdade
   */
  equals(other: Duration): boolean {
    return this.minutes === other.minutes
  }

  /**
   * Formata para exibição
   * Ex: 90 minutos -> "1h30min"
   */
  format(): string {
    if (this.minutes === 0) {
      return "0min"
    }

    const hours = Math.floor(this.minutes / 60)
    const mins = this.minutes % 60

    if (hours === 0) {
      return `${mins}min`
    }

    if (mins === 0) {
      return `${hours}h`
    }

    return `${hours}h${mins}min`
  }

  /**
   * Retorna representação em string
   */
  toString(): string {
    return this.format()
  }
}
