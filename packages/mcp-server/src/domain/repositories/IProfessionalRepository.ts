import { Professional } from "../entities"

/**
 * Interface para persistência de profissionais
 */
export interface IProfessionalRepository {
  /**
   * Busca um profissional por ID
   */
  findById(id: string): Promise<Professional | null>

  /**
   * Busca um profissional por nome em um salão
   */
  findByName(name: string, salonId: string): Promise<Professional | null>

  /**
   * Busca profissionais de um salão
   */
  findBySalon(salonId: string, includeInactive?: boolean): Promise<Professional[]>

  /**
   * Busca profissionais disponíveis em uma data
   */
  findAvailable(salonId: string, date: Date): Promise<Professional[]>

  /**
   * Busca profissionais que realizam um serviço
   */
  findByService(serviceId: string, salonId: string): Promise<Professional[]>

  /**
   * Salva um profissional
   */
  save(professional: Professional): Promise<void>

  /**
   * Atualiza um profissional
   */
  update(professional: Professional): Promise<void>
}
