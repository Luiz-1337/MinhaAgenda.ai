import { Duration, Money } from "../value-objects"

export interface ServiceProps {
  id: string
  salonId: string
  name: string
  description?: string | null
  duration: number // em minutos
  price: number
  priceType?: string
  priceMin?: number | null
  priceMax?: number | null
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Entidade que representa um serviço oferecido pelo salão
 */
export class Service {
  readonly id: string
  readonly salonId: string
  private _name: string
  private _description?: string | null
  private _duration: Duration
  private _price: Money
  private _priceType: string
  private _priceMin?: Money | null
  private _priceMax?: Money | null
  private _isActive: boolean
  readonly createdAt: Date
  private _updatedAt: Date

  private constructor(props: ServiceProps) {
    this.id = props.id
    this.salonId = props.salonId
    this._name = props.name
    this._description = props.description
    this._duration = Duration.fromMinutes(props.duration)
    this._price = new Money(props.price)
    this._priceType = props.priceType ?? "fixed"
    this._priceMin = props.priceMin ? new Money(props.priceMin) : null
    this._priceMax = props.priceMax ? new Money(props.priceMax) : null
    this._isActive = props.isActive
    this.createdAt = props.createdAt ?? new Date()
    this._updatedAt = props.updatedAt ?? new Date()
  }

  /**
   * Cria uma nova instância de Service
   */
  static create(props: ServiceProps): Service {
    return new Service(props)
  }

  /**
   * Reconstrói a partir de dados persistidos
   */
  static fromPersistence(props: ServiceProps): Service {
    return new Service(props)
  }

  // Getters
  get name(): string {
    return this._name
  }

  get description(): string | null | undefined {
    return this._description
  }

  get duration(): Duration {
    return this._duration
  }

  get durationMinutes(): number {
    return this._duration.toMinutes()
  }

  get price(): Money {
    return this._price
  }

  get priceAmount(): number {
    return this._price.amount
  }

  get priceType(): string {
    return this._priceType
  }

  get priceMin(): Money | null | undefined {
    return this._priceMin
  }

  get priceMax(): Money | null | undefined {
    return this._priceMax
  }

  get isActive(): boolean {
    return this._isActive
  }

  get updatedAt(): Date {
    return this._updatedAt
  }

  /**
   * Verifica se o serviço está disponível para agendamento
   */
  isBookable(): boolean {
    return this._isActive
  }

  /**
   * Verifica se tem preço variável
   */
  hasVariablePrice(): boolean {
    return this._priceType === "range" && this._priceMin != null && this._priceMax != null
  }

  /**
   * Formata o preço para exibição
   */
  formatPrice(): string {
    if (this.hasVariablePrice() && this._priceMin && this._priceMax) {
      return `${this._priceMin.format()} - ${this._priceMax.format()}`
    }
    return this._price.format()
  }

  /**
   * Formata a duração para exibição
   */
  formatDuration(): string {
    return this._duration.format()
  }

  /**
   * Ativa o serviço
   */
  activate(): void {
    this._isActive = true
    this._updatedAt = new Date()
  }

  /**
   * Desativa o serviço
   */
  deactivate(): void {
    this._isActive = false
    this._updatedAt = new Date()
  }

  /**
   * Atualiza o nome
   */
  updateName(name: string): void {
    this._name = name
    this._updatedAt = new Date()
  }

  /**
   * Atualiza a duração
   */
  updateDuration(minutes: number): void {
    this._duration = Duration.fromMinutes(minutes)
    this._updatedAt = new Date()
  }

  /**
   * Atualiza o preço
   */
  updatePrice(amount: number): void {
    this._price = new Money(amount)
    this._updatedAt = new Date()
  }

  /**
   * Retorna as propriedades para persistência
   */
  toPersistence(): ServiceProps {
    return {
      id: this.id,
      salonId: this.salonId,
      name: this._name,
      description: this._description,
      duration: this._duration.toMinutes(),
      price: this._price.amount,
      priceType: this._priceType,
      priceMin: this._priceMin?.amount ?? null,
      priceMax: this._priceMax?.amount ?? null,
      isActive: this._isActive,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    }
  }
}
