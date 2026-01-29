import { Salon, SalonIntegration } from "../entities"

/**
 * Interface para persistência de salões
 */
export interface ISalonRepository {
  /**
   * Busca um salão por ID
   */
  findById(id: string): Promise<Salon | null>

  /**
   * Busca um salão por slug
   */
  findBySlug(slug: string): Promise<Salon | null>

  /**
   * Busca um salão por ID do proprietário
   */
  findByOwner(ownerId: string): Promise<Salon | null>

  /**
   * Busca as integrações de um salão
   */
  getIntegrations(salonId: string): Promise<SalonIntegration[]>

  /**
   * Verifica se um salão tem uma integração ativa
   */
  hasIntegration(salonId: string, provider: "google" | "trinks"): Promise<boolean>

  /**
   * Salva um salão
   */
  save(salon: Salon): Promise<void>

  /**
   * Atualiza um salão
   */
  update(salon: Salon): Promise<void>
}
