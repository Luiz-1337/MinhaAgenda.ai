import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import * as dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Para ES modules, precisamos obter __dirname usando import.meta.url
// Fallback para process.cwd() se import.meta.url não estiver disponível
let rootPath: string
try {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)
  rootPath = resolve(__dirname, '../../..')
} catch {
  // Fallback: assume que estamos na raiz ou use process.cwd()
  rootPath = resolve(process.cwd(), process.cwd().includes('packages/db') ? '../..' : '.')
}

// Tenta carregar variáveis de ambiente de múltiplas fontes
// Ordem de prioridade: .env.local (raiz) > .env (raiz) > apps/web/.env.local
dotenv.config({ path: resolve(rootPath, '.env.local'), override: false })
dotenv.config({ path: resolve(rootPath, '.env'), override: false })
dotenv.config({ path: resolve(rootPath, 'apps/web/.env.local'), override: false }) 

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const connectionString = process.env.DATABASE_URL
const client = postgres(connectionString, { prepare: false })
export const db = drizzle(client, { schema })
export { client as postgresClient }
export * from './schema'

// Re-export drizzle-orm helpers for convenience
export { and, eq, gt, lt, gte, lte, ne, or, like, ilike, inArray, notInArray, isNull, isNotNull, desc, asc, sql } from 'drizzle-orm'

// Re-export domain services
export * as domainServices from './services'

// Re-export timezone utilities
export { fromBrazilTime, toBrazilTime, getBrazilNow, formatBrazilTime, BRAZIL_TIMEZONE } from './utils/timezone.utils'

// Re-export date parsing utilities
export { 
  parseBrazilianDateTime, 
  parseBrazilianDateTimeString, 
  parseBrazilianDateTimeObject,
  createBrazilDateTimeFromComponents,
  type DateComponents,
  type ParseDateResult 
} from './utils/date-parsing.utils'

// Re-export infrastructure
export { logger, LoggerFactory, StructuredLogger, type ILogger, type LogLevel } from './infrastructure/logger'
export { AppointmentRepository } from './infrastructure/repositories/appointment-repository'

// Re-export domain
export * from './domain/constants'
export * from './domain/errors/domain-error'
export * from './domain/errors/integration-error'
export * from './domain/integrations/enums/appointment-status.enum'
export * from './domain/integrations/enums/integration-provider.enum'
export * from './domain/integrations/value-objects/appointment-id'
export * from './domain/integrations/value-objects/salon-id'
export * from './domain/integrations/value-objects/event-id'
export * from './domain/integrations/interfaces/calendar-integration.interface'
export * from './domain/integrations/interfaces/external-sync.interface'
export * from './domain/integrations/interfaces/oauth2-client.interface'
export * from './domain/integrations/interfaces/appointment-repository.interface'

// Re-export use cases - Trinks integration
export { CreateTrinksAppointmentUseCase } from './application/use-cases/trinks/create-trinks-appointment.use-case'
export { UpdateTrinksAppointmentUseCase } from './application/use-cases/trinks/update-trinks-appointment.use-case'
export { DeleteTrinksAppointmentUseCase } from './application/use-cases/trinks/delete-trinks-appointment.use-case'
export { FetchTrinksResourcesUseCase } from './application/use-cases/trinks/fetch-trinks-resources.use-case'

// Helper functions for Trinks integration
export { 
  createTrinksAppointment, 
  updateTrinksAppointment, 
  deleteTrinksAppointment,
  isTrinksIntegrationActive,
  getTrinksProfessionals,
  getTrinksServices,
  getTrinksProducts,
  getTrinksAppointments,
  getTrinksBusySlots,
  type TrinksAppointment
} from './services/trinks'

// Google Calendar Service - Simplified service facade with retry support
export {
  GoogleCalendarService,
  GoogleCalendarError,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  ensureProfessionalCalendar,
  getOAuth2Client,
  getSalonGoogleClient,
  getRawOAuth2Client,
  getGoogleFreeBusy,
  getGoogleFreeBusyForProfessional,
  type CalendarEventResult
} from './services/google-calendar'
