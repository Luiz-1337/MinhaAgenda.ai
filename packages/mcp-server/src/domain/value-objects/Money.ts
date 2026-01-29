/**
 * Value Object imutável para valores monetários
 */
export class Money {
  constructor(
    readonly amount: number,
    readonly currency: string = "BRL"
  ) {
    if (amount < 0) {
      throw new Error("Valor monetário não pode ser negativo")
    }
  }

  /**
   * Cria Money a partir de centavos
   */
  static fromCents(cents: number, currency = "BRL"): Money {
    return new Money(cents / 100, currency)
  }

  /**
   * Cria Money zero
   */
  static zero(currency = "BRL"): Money {
    return new Money(0, currency)
  }

  /**
   * Retorna o valor em centavos
   */
  toCents(): number {
    return Math.round(this.amount * 100)
  }

  /**
   * Adiciona outro valor
   */
  add(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this.amount + other.amount, this.currency)
  }

  /**
   * Subtrai outro valor
   */
  subtract(other: Money): Money {
    this.assertSameCurrency(other)
    const result = this.amount - other.amount
    if (result < 0) {
      throw new Error("Resultado da subtração não pode ser negativo")
    }
    return new Money(result, this.currency)
  }

  /**
   * Multiplica o valor
   */
  multiply(factor: number): Money {
    return new Money(this.amount * factor, this.currency)
  }

  /**
   * Verifica se é maior que outro valor
   */
  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other)
    return this.amount > other.amount
  }

  /**
   * Verifica se é menor que outro valor
   */
  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other)
    return this.amount < other.amount
  }

  /**
   * Verifica igualdade
   */
  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency
  }

  /**
   * Verifica se é zero
   */
  isZero(): boolean {
    return this.amount === 0
  }

  /**
   * Formata para exibição no padrão brasileiro
   * Ex: 50.00 -> "R$ 50,00"
   */
  format(): string {
    const formatter = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: this.currency,
    })
    return formatter.format(this.amount)
  }

  /**
   * Formata como número decimal
   * Ex: 50.00 -> "50,00"
   */
  formatDecimal(): string {
    return this.amount.toFixed(2).replace(".", ",")
  }

  /**
   * Retorna representação em string
   */
  toString(): string {
    return this.format()
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Não é possível operar valores de moedas diferentes: ${this.currency} e ${other.currency}`
      )
    }
  }
}
