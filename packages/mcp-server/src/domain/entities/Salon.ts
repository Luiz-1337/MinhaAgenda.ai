import { WeeklyWorkingHours, IntegrationProvider } from "../../shared/types/common.types"
import { TIMEZONE } from "../../shared/constants"

export interface SalonProps {
  id: string
  ownerId: string
  name: string
  slug?: string | null
  address?: string | null
  phone?: string | null
  whatsapp?: string | null
  description?: string | null
  timezone?: string
  workingHours?: WeeklyWorkingHours | null
  settings?: Record<string, unknown> | null
  subscriptionStatus?: string
  createdAt?: Date
  updatedAt?: Date
}

export interface SalonIntegration {
  provider: IntegrationProvider
  isActive: boolean
  email?: string
}

/**
 * Entidade que representa um estabelecimento (salão)
 */
export class Salon {
  readonly id: string
  readonly ownerId: string
  private _name: string
  private _slug?: string | null
  private _address?: string | null
  private _phone?: string | null
  private _whatsapp?: string | null
  private _description?: string | null
  private _timezone: string
  private _workingHours: WeeklyWorkingHours
  private _settings: Record<string, unknown>
  private _subscriptionStatus: string
  private _integrations: Map<IntegrationProvider, SalonIntegration> = new Map()
  readonly createdAt: Date
  private _updatedAt: Date

  private constructor(props: SalonProps) {
    this.id = props.id
    this.ownerId = props.ownerId
    this._name = props.name
    this._slug = props.slug
    this._address = props.address
    this._phone = props.phone
    this._whatsapp = props.whatsapp
    this._description = props.description
    this._timezone = props.timezone ?? TIMEZONE
    this._workingHours = props.workingHours ?? {}
    this._settings = props.settings ?? {}
    this._subscriptionStatus = props.subscriptionStatus ?? "active"
    this.createdAt = props.createdAt ?? new Date()
    this._updatedAt = props.updatedAt ?? new Date()
  }

  /**
   * Cria uma nova instância de Salon
   */
  static create(props: SalonProps): Salon {
    return new Salon(props)
  }

  /**
   * Reconstrói a partir de dados persistidos
   */
  static fromPersistence(props: SalonProps): Salon {
    return new Salon(props)
  }

  // Getters
  get name(): string {
    return this._name
  }

  get slug(): string | null | undefined {
    return this._slug
  }

  get address(): string | null | undefined {
    return this._address
  }

  get phone(): string | null | undefined {
    return this._phone
  }

  get whatsapp(): string | null | undefined {
    return this._whatsapp
  }

  get description(): string | null | undefined {
    return this._description
  }

  get timezone(): string {
    return this._timezone
  }

  get workingHours(): WeeklyWorkingHours {
    return { ...this._workingHours }
  }

  get settings(): Record<string, unknown> {
    return { ...this._settings }
  }

  get subscriptionStatus(): string {
    return this._subscriptionStatus
  }

  get updatedAt(): Date {
    return this._updatedAt
  }

  /**
   * Verifica se o salão está aberto em uma determinada data/hora
   */
  isOpen(date: Date): boolean {
    const dayOfWeek = date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6
    const hours = this._workingHours[dayOfWeek]

    if (!hours) {
      return false
    }

    const timeStr = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
    return timeStr >= hours.start && timeStr < hours.end
  }

  /**
   * Retorna os horários de funcionamento para um dia da semana
   */
  getWorkingHoursForDay(dayOfWeek: number): { start: string; end: string } | null {
    const day = dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6
    return this._workingHours[day] ?? null
  }

  /**
   * Verifica se tem uma integração ativa
   */
  hasIntegration(provider: IntegrationProvider): boolean {
    const integration = this._integrations.get(provider)
    return integration?.isActive ?? false
  }

  /**
   * Obtém uma integração
   */
  getIntegration(provider: IntegrationProvider): SalonIntegration | undefined {
    return this._integrations.get(provider)
  }

  /**
   * Define uma integração
   */
  setIntegration(integration: SalonIntegration): void {
    this._integrations.set(integration.provider, integration)
    this._updatedAt = new Date()
  }

  /**
   * Obtém uma configuração
   */
  getSetting<T>(key: string): T | undefined {
    return this._settings[key] as T | undefined
  }

  /**
   * Define uma configuração
   */
  setSetting(key: string, value: unknown): void {
    this._settings[key] = value
    this._updatedAt = new Date()
  }

  /**
   * Obtém a política de cancelamento
   */
  getCancellationPolicy(): string | undefined {
    return this.getSetting<string>("cancellation_policy")
  }

  /**
   * Verifica se é plano SOLO (único profissional)
   */
  isSoloPlan(): boolean {
    return this._subscriptionStatus === "solo" || this.getSetting<boolean>("is_solo") === true
  }

  /**
   * Atualiza o nome
   */
  updateName(name: string): void {
    this._name = name
    this._updatedAt = new Date()
  }

  /**
   * Atualiza os horários de funcionamento
   */
  updateWorkingHours(workingHours: WeeklyWorkingHours): void {
    this._workingHours = workingHours
    this._updatedAt = new Date()
  }

  /**
   * Retorna as propriedades para persistência
   */
  toPersistence(): SalonProps {
    return {
      id: this.id,
      ownerId: this.ownerId,
      name: this._name,
      slug: this._slug,
      address: this._address,
      phone: this._phone,
      whatsapp: this._whatsapp,
      description: this._description,
      timezone: this._timezone,
      workingHours: this._workingHours,
      settings: this._settings,
      subscriptionStatus: this._subscriptionStatus,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    }
  }
}
