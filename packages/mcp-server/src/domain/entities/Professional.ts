export interface ProfessionalProps {
  id: string
  salonId: string
  userId?: string | null
  name: string
  email?: string | null
  phone?: string | null
  role?: string
  isActive: boolean
  services: string[] // IDs dos serviços
  googleCalendarId?: string | null
  commissionRate?: number | null
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Entidade que representa um profissional do salão
 */
export class Professional {
  readonly id: string
  readonly salonId: string
  readonly userId?: string | null
  private _name: string
  private _email?: string | null
  private _phone?: string | null
  private _role: string
  private _isActive: boolean
  private _services: Set<string>
  private _googleCalendarId?: string | null
  private _commissionRate?: number | null
  readonly createdAt: Date
  private _updatedAt: Date

  private constructor(props: ProfessionalProps) {
    this.id = props.id
    this.salonId = props.salonId
    this.userId = props.userId
    this._name = props.name
    this._email = props.email
    this._phone = props.phone
    this._role = props.role ?? "STAFF"
    this._isActive = props.isActive
    this._services = new Set(props.services)
    this._googleCalendarId = props.googleCalendarId
    this._commissionRate = props.commissionRate
    this.createdAt = props.createdAt ?? new Date()
    this._updatedAt = props.updatedAt ?? new Date()
  }

  /**
   * Cria uma nova instância de Professional
   */
  static create(props: ProfessionalProps): Professional {
    return new Professional(props)
  }

  /**
   * Reconstrói a partir de dados persistidos
   */
  static fromPersistence(props: ProfessionalProps): Professional {
    return new Professional(props)
  }

  // Getters
  get name(): string {
    return this._name
  }

  get email(): string | null | undefined {
    return this._email
  }

  get phone(): string | null | undefined {
    return this._phone
  }

  get role(): string {
    return this._role
  }

  get isActive(): boolean {
    return this._isActive
  }

  get services(): string[] {
    return Array.from(this._services)
  }

  get googleCalendarId(): string | null | undefined {
    return this._googleCalendarId
  }

  get commissionRate(): number | null | undefined {
    return this._commissionRate
  }

  get updatedAt(): Date {
    return this._updatedAt
  }

  /**
   * Verifica se o profissional pode realizar um serviço
   */
  canPerformService(serviceId: string): boolean {
    return this._services.has(serviceId)
  }

  /**
   * Verifica se o profissional está disponível (ativo)
   */
  isAvailable(): boolean {
    return this._isActive
  }

  /**
   * Verifica se tem integração com Google Calendar
   */
  hasGoogleCalendar(): boolean {
    return !!this._googleCalendarId
  }

  /**
   * Adiciona um serviço que o profissional pode realizar
   */
  addService(serviceId: string): void {
    this._services.add(serviceId)
    this._updatedAt = new Date()
  }

  /**
   * Remove um serviço
   */
  removeService(serviceId: string): void {
    this._services.delete(serviceId)
    this._updatedAt = new Date()
  }

  /**
   * Ativa o profissional
   */
  activate(): void {
    this._isActive = true
    this._updatedAt = new Date()
  }

  /**
   * Desativa o profissional
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
   * Define o ID do calendário Google
   */
  setGoogleCalendarId(calendarId: string | null): void {
    this._googleCalendarId = calendarId
    this._updatedAt = new Date()
  }

  /**
   * Retorna as propriedades para persistência
   */
  toPersistence(): ProfessionalProps {
    return {
      id: this.id,
      salonId: this.salonId,
      userId: this.userId,
      name: this._name,
      email: this._email,
      phone: this._phone,
      role: this._role,
      isActive: this._isActive,
      services: Array.from(this._services),
      googleCalendarId: this._googleCalendarId,
      commissionRate: this._commissionRate,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    }
  }
}
