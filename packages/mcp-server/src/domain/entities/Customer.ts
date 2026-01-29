import { Phone } from "../value-objects"

export interface CustomerProps {
  id: string
  salonId: string
  phone: string
  name: string
  email?: string | null
  preferences?: Record<string, unknown> | null
  aiPreferences?: string | null
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Entidade que representa um cliente do salão
 */
export class Customer {
  readonly id: string
  readonly salonId: string
  private _phone: Phone
  private _name: string
  private _email?: string | null
  private _preferences: Record<string, unknown>
  private _aiPreferences?: string | null
  readonly createdAt: Date
  private _updatedAt: Date

  private constructor(props: CustomerProps) {
    this.id = props.id
    this.salonId = props.salonId
    this._phone = Phone.fromPersistence(props.phone)
    this._name = props.name
    this._email = props.email
    this._preferences = props.preferences ?? {}
    this._aiPreferences = props.aiPreferences
    this.createdAt = props.createdAt ?? new Date()
    this._updatedAt = props.updatedAt ?? new Date()
  }

  /**
   * Cria uma nova instância de Customer
   */
  static create(props: CustomerProps): Customer {
    return new Customer(props)
  }

  /**
   * Reconstrói a partir de dados persistidos
   */
  static fromPersistence(props: CustomerProps): Customer {
    return new Customer(props)
  }

  // Getters
  get phone(): Phone {
    return this._phone
  }

  get phoneNumber(): string {
    return this._phone.normalize()
  }

  get name(): string {
    return this._name
  }

  get email(): string | null | undefined {
    return this._email
  }

  get preferences(): Record<string, unknown> {
    return { ...this._preferences }
  }

  get aiPreferences(): string | null | undefined {
    return this._aiPreferences
  }

  get updatedAt(): Date {
    return this._updatedAt
  }

  /**
   * Verifica se o cliente está identificado (tem nome real, não apenas telefone)
   */
  isIdentified(): boolean {
    // Se o nome for igual ao telefone formatado, não está identificado
    const phoneFormatted = this._phone.format()
    return this._name !== phoneFormatted && this._name.trim() !== ""
  }

  /**
   * Atualiza o nome do cliente
   */
  updateName(name: string): void {
    if (!name || name.trim() === "") {
      throw new Error("Nome não pode estar vazio")
    }
    this._name = name.trim()
    this._updatedAt = new Date()
  }

  /**
   * Atualiza o email do cliente
   */
  updateEmail(email: string | null): void {
    this._email = email
    this._updatedAt = new Date()
  }

  /**
   * Define uma preferência do cliente
   */
  setPreference(key: string, value: unknown): void {
    this._preferences[key] = value
    this._updatedAt = new Date()
  }

  /**
   * Obtém uma preferência do cliente
   */
  getPreference<T>(key: string): T | undefined {
    return this._preferences[key] as T | undefined
  }

  /**
   * Remove uma preferência do cliente
   */
  removePreference(key: string): void {
    delete this._preferences[key]
    this._updatedAt = new Date()
  }

  /**
   * Atualiza as preferências de IA
   */
  updateAiPreferences(aiPreferences: string | null): void {
    this._aiPreferences = aiPreferences
    this._updatedAt = new Date()
  }

  /**
   * Retorna as propriedades para persistência
   */
  toPersistence(): CustomerProps {
    return {
      id: this.id,
      salonId: this.salonId,
      phone: this._phone.normalize(),
      name: this._name,
      email: this._email,
      preferences: this._preferences,
      aiPreferences: this._aiPreferences,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    }
  }
}
