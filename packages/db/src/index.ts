import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import * as dotenv from 'dotenv'

dotenv.config({ path: "../../.env" }); 

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const connectionString = process.env.DATABASE_URL
const client = postgres(connectionString, { prepare: false })
export const db = drizzle(client, { schema })
export * from './schema'
// Re-export drizzle-orm helpers for convenience
export { and, eq, gt, lt, gte, lte, ne, like, ilike, inArray, notInArray, isNull, isNotNull, desc, asc, sql } from 'drizzle-orm'
export * as domainServices from './services'

