/**
 * Serviço para integração com Google Calendar
 * Re-exporta funções do pacote compartilhado @repo/db
 * 
 * @deprecated Este arquivo mantém compatibilidade com código existente.
 * Use diretamente as funções de @repo/db/services/google-calendar
 */
export {
  getOAuth2Client,
  getSalonGoogleClient,
  ensureProfessionalCalendar,
  createGoogleEvent,
} from '@repo/db'

