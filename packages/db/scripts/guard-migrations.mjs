#!/usr/bin/env node
/**
 * guard-migrations.mjs — FREEZE de migrations (fases 0/1 da reconciliação do banco)
 *
 * Por que isto existe:
 *   O tracking de migrations está dessincronizado (Drizzle journal para no 0019,
 *   __drizzle_migrations vazia, supabase_migrations com poucas entradas, runners .mjs
 *   que aplicam direto). Neste estado, `drizzle-kit generate`/`push` calculam um diff
 *   ERRADO contra o banco real e tentariam recriar 0020-0041 e DROPAR 7 constraints
 *   que só existem no banco. Isso é potencialmente DESTRUTIVO em produção.
 *
 *   Enquanto a reconciliação (ver docs/DATABASE.md + docs/adr/0001-migration-source-of-truth.md)
 *   não estiver concluída (baseline em supabase_migrations + schema.ts refletindo o banco),
 *   estes comandos ficam BLOQUEADOS.
 *
 * Como desbloquear conscientemente (só quem sabe o que faz):
 *   pnpm --filter @repo/db run generate:unsafe
 *   pnpm --filter @repo/db run push:unsafe
 */

const what = process.argv[2] || 'esta operação'

const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'

console.error('')
console.error(`${RED}${BOLD}╔══════════════════════════════════════════════════════════════════╗${RESET}`)
console.error(`${RED}${BOLD}║  FREEZE DE MIGRATIONS ATIVO — "${what}" está BLOQUEADO          ${RESET}`)
console.error(`${RED}${BOLD}╚══════════════════════════════════════════════════════════════════╝${RESET}`)
console.error('')
console.error(`${YELLOW}O tracking de migrations está em reconciliação (3+ sistemas dessincronizados).${RESET}`)
console.error(`${YELLOW}Rodar generate/push/runners agora pode RECRIAR ou DROPAR objetos em prod.${RESET}`)
console.error('')
console.error('Leia o fluxo único em:')
console.error(`  ${BOLD}docs/DATABASE.md${RESET}`)
console.error(`  ${BOLD}docs/adr/0001-migration-source-of-truth.md${RESET}`)
console.error('')
console.error('Para adicionar uma migration use o fluxo único (SQL idempotente via Supabase CLI),')
console.error('NÃO drizzle-kit generate/push nem os runners .mjs arquivados.')
console.error('')
console.error('Se você REALMENTE sabe o que está fazendo (ex.: reconciliação supervisionada):')
console.error(`  ${BOLD}pnpm --filter @repo/db run generate:unsafe${RESET}`)
console.error(`  ${BOLD}pnpm --filter @repo/db run push:unsafe${RESET}`)
console.error('')

process.exit(1)
