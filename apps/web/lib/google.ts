/**
 * Serviço para integração com Google Calendar
 * Re-exporta funções do pacote compartilhado @repo/db
 * 
 * @deprecated Este arquivo mantém compatibilidade com código existente.
 * Use diretamente as funções de @repo/db que agora seguem Clean Architecture
 */
export {
  getOAuth2Client,
  getSalonGoogleClient,
  getRawOAuth2Client,
  ensureProfessionalCalendar,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
} from '@repo/db'

