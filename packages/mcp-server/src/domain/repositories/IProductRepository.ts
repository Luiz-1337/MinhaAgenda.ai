import { Product } from "../entities"

/**
 * Interface para persistência de produtos
 */
export interface IProductRepository {
  /**
   * Busca um produto por ID
   */
  findById(id: string): Promise<Product | null>

  /**
   * Busca produtos de um salão
   */
  findBySalon(salonId: string, includeInactive?: boolean): Promise<Product[]>

  /**
   * Busca apenas produtos ativos de um salão
   */
  findActive(salonId: string): Promise<Product[]>

  /**
   * Salva um produto
   */
  save(product: Product): Promise<void>

  /**
   * Atualiza um produto
   */
  update(product: Product): Promise<void>
}
