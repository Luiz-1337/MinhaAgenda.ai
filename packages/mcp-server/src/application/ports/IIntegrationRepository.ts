/**
 * Interface para verificar status de integrações
 */
export interface IIntegrationRepository {
  /**
   * Verifica se a integração com Google Calendar está ativa para o salão
   */
  isGoogleActive(salonId: string): Promise<boolean>

  /**
   * Verifica se a integração com Trinks está ativa para o salão
   */
  isTrinksActive(salonId: string): Promise<boolean>
}
