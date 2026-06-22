#!/usr/bin/env node
/**
 * check-no-new-drizzle-sql.mjs — guard de CI (parte do gate de reconciliação)
 *
 * A fonte única de migration agora é `supabase/migrations/` (ver ADR 0001).
 * Os `.sql` antigos do Drizzle foram arquivados em `packages/db/drizzle/_archive/`.
 * Este guard FALHA o CI se alguém adicionar um novo `.sql` direto em
 * `packages/db/drizzle/` (fora de `_archive/`), reintroduzindo o caminho aposentado.
 *
 * Não precisa de banco. O drift-guard completo (schema.ts × banco via drizzle-kit check
 * contra um banco efêmero) é um TODO — ver docs/DATABASE.md.
 */
import { readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const drizzleDir = join(root, 'packages', 'db', 'drizzle')

if (!existsSync(drizzleDir)) {
  console.log('OK: packages/db/drizzle não existe (nada a checar).')
  process.exit(0)
}

const stray = readdirSync(drizzleDir, { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.sql'))
  .map((e) => e.name)

if (stray.length > 0) {
  console.error('')
  console.error('✗ Migration no caminho APOSENTADO detectada em packages/db/drizzle/:')
  for (const f of stray) console.error(`    - ${f}`)
  console.error('')
  console.error('A fonte única agora é supabase/migrations/ (ADR 0001).')
  console.error('Mova .sql legados para packages/db/drizzle/_archive/ e escreva')
  console.error('novas migrations como SQL idempotente em supabase/migrations/NNN_nome.sql.')
  console.error('')
  process.exit(1)
}

console.log('OK: nenhum .sql novo no caminho aposentado packages/db/drizzle/.')
process.exit(0)
