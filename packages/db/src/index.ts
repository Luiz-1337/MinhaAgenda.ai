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
export { and, eq, gt, lt, gte, lte, ne, like, ilike, inArray, notInArray, isNull, isNotNull, desc, asc, sql } from 'drizzle-orm'
export * as domainServices from './services'
// Re-export timezone utilities
export { fromBrazilTime, toBrazilTime, getBrazilNow, formatBrazilTime, BRAZIL_TIMEZONE } from './utils/timezone.utils'
// Re-export Google Calendar services
export { getOAuth2Client, getSalonGoogleClient, ensureProfessionalCalendar, createGoogleEvent, updateGoogleEvent, deleteGoogleEvent } from './services/google-calendar'

