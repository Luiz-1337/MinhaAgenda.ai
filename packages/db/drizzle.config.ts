import { defineConfig } from 'drizzle-kit'
import * as dotenv from 'dotenv'
import { URL } from 'url'

dotenv.config({ path: '../../.env' })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

const u = new URL(process.env.DATABASE_URL as string)
export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    ssl: {
      rejectUnauthorized: false,
    },
  },
  tablesFilter: ['!libsql_wasm_func_table']
})
