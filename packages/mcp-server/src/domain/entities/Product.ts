import { Money } from "../value-objects"

export interface ProductProps {
  id: string
  salonId: string
  name: string
  description?: string | null
  price: number
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Entidade que representa um produto à venda no salão
 */
export class Product {
  readonly id: string
  readonly salonId: string
  private _name: string
  private _description?: string | null
  private _price: Money
  private _isActive: boolean
  readonly createdAt: Date
  private _updatedAt: Date

  private constructor(props: ProductProps) {
    this.id = props.id
    this.salonId = props.salonId
    this._name = props.name
    this._description = props.description
    this._price = new Money(props.price)
    this._isActive = props.isActive
    this.createdAt = props.createdAt ?? new Date()
    this._updatedAt = props.updatedAt ?? new Date()
  }

  /**
   * Cria uma nova instância de Product
   */
  static create(props: ProductProps): Product {
    return new Product(props)
  }

  /**
   * Reconstrói a partir de dados persistidos
   */
  static fromPersistence(props: ProductProps): Product {
    return new Product(props)
  }

  // Getters
  get name(): string {
    return this._name
  }

  get description(): string | null | undefined {
    return this._description
  }

  get price(): Money {
    return this._price
  }

  get priceAmount(): number {
    return this._price.amount
  }

  get isActive(): boolean {
    return this._isActive
  }

  get updatedAt(): Date {
    return this._updatedAt
  }

  /**
   * Verifica se o produto está disponível
   */
  isAvailable(): boolean {
    return this._isActive
  }

  /**
   * Formata o preço para exibição
   */
  formatPrice(): string {
    return this._price.format()
  }

  /**
   * Ativa o produto
   */
  activate(): void {
    this._isActive = true
    this._updatedAt = new Date()
  }

  /**
   * Desativa o produto
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
   * Atualiza o preço
   */
  updatePrice(amount: number): void {
    this._price = new Money(amount)
    this._updatedAt = new Date()
  }

  /**
   * Retorna as propriedades para persistência
   */
  toPersistence(): ProductProps {
    return {
      id: this.id,
      salonId: this.salonId,
      name: this._name,
      description: this._description,
      price: this._price.amount,
      isActive: this._isActive,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    }
  }
}
