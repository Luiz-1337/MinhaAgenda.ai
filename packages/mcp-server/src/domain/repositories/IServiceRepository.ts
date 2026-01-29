import { Service } from "../entities"

/**
 * Interface para persistência de serviços
 */
export interface IServiceRepository {
  /**
   * Busca um serviço por ID
   */
  findById(id: string): Promise<Service | null>

  /**
   * Busca serviços de um salão
   */
  findBySalon(salonId: string, includeInactive?: boolean): Promise<Service[]>

  /**
   * Busca apenas serviços ativos de um salão
   */
  findActive(salonId: string): Promise<Service[]>

  /**
   * Salva um serviço
   */
  save(service: Service): Promise<void>

  /**
   * Atualiza um serviço
   */
  update(service: Service): Promise<void>
}
