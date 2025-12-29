/**
 * Tipos e utilitários para configuração de tools
 */

/**
 * Status das integrações disponíveis
 */
export interface IntegrationStatus {
  googleCalendar: boolean
}

/**
 * Configuração de quais features estão ativas
 */
export interface ToolConfig {
  integrations?: IntegrationStatus
}

/**
 * Verifica se a integração do Google Calendar está ativa para um salão
 */
export async function checkGoogleCalendarIntegration(salonId: string): Promise<boolean> {
  try {
    const { getSalonGoogleClient } = await import("@repo/db")
    const client = await getSalonGoogleClient(salonId)
    return client !== null
  } catch (error) {
    console.warn("Erro ao verificar integração Google Calendar:", error)
    return false
  }
}

/**
 * Busca o status de todas as integrações para um salão
 */
export async function getIntegrationStatus(salonId: string): Promise<IntegrationStatus> {
  const googleCalendar = await checkGoogleCalendarIntegration(salonId)
  
  return {
    googleCalendar,
  }
}

