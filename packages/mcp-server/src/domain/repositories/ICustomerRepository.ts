import { Customer } from "../entities"

/**
 * Interface para persistência de clientes
 */
export interface ICustomerRepository {
  /**
   * Busca um cliente por ID
   */
  findById(id: string): Promise<Customer | null>

  /**
   * Busca um cliente por telefone em um salão
   */
  findByPhone(phone: string, salonId: string): Promise<Customer | null>

  /**
   * Busca clientes de um salão
   */
  findBySalon(salonId: string): Promise<Customer[]>

  /**
   * Salva um cliente (cria)
   */
  save(customer: Customer): Promise<void>

  /**
   * Atualiza um cliente existente
   */
  update(customer: Customer): Promise<void>

  /**
   * Remove um cliente
   */
  delete(id: string): Promise<void>
}
