# ADR 0001 — Fonte única da verdade de migrations

- **Status:** Proposto (aguarda aprovação do dono) — 2026-06-21
- **Contexto:** reconciliação do banco (fases 0–5), ver `docs/DATABASE.md` e o plano de remediação.
- **Decisores:** dono + architecture-lead + data-platform + security-multitenant.

## Contexto

O projeto tinha **quatro** mecanismos de tracking de migration divergentes:

| Mecanismo | Onde | Estado real (21/jun/2026) |
|---|---|---|
| Drizzle — arquivos | `packages/db/drizzle/*.sql` | 51 arquivos, 10 colisões de número |
| Drizzle — journal | `packages/db/drizzle/meta/_journal.json` | para no índice 19 (`0019_*`), desconectado de 0020–0041 |
| Drizzle — tracking no banco | `drizzle.__drizzle_migrations` | **0 linhas** (`drizzle-kit migrate` nunca rodou aqui) |
| Supabase — tracking no banco | `supabase_migrations.schema_migrations` | 4 entradas (aplicadas via Supabase CLI) |
| Runners manuais | `packages/db/scripts/migrate_*.mjs` | ~11 scripts que aplicam direto e engolem erro "já existe" |

O **schema do banco está correto e completo** (todas as colunas de 0020–0041 existem),
mas nenhum mecanismo reflete isso. Rodar `drizzle-kit generate`/`push` neste estado
calcularia um diff ERRADO e tentaria recriar 0020–0041 + **dropar 7 constraints** que
só existem no banco. Isso é potencialmente destrutivo em produção.

## Decisão

Separar dois conceitos que estavam misturados:

1. **Fonte da verdade do TRACKING (o que já foi aplicado):**
   `supabase_migrations.schema_migrations` (Supabase CLI / `apply_migration`).
   É o único mecanismo conectado ao banco com entradas reais. O `__drizzle_migrations`
   está vazio e o `_journal.json` está irrecuperavelmente dessincronizado.

2. **Fonte da verdade do SCHEMA (a forma desejada das tabelas):**
   `packages/db/src/schema.ts`. O Drizzle **continua sendo o ORM e a camada de tipos**
   consumida em todo o `@repo/db` — só deixa de ser o **aplicador** de migrations.

### Consequências práticas

- **Aplicar migration** passa a ser: escrever **SQL idempotente** em
  `supabase/migrations/NNN_nome.sql` → aplicar via Supabase CLI / `apply_migration`
  (registra automaticamente em `supabase_migrations.schema_migrations`).
- `drizzle-kit generate`/`push` ficam **CONGELADOS** por um guard
  (`packages/db/scripts/guard-migrations.mjs`). Bypass consciente:
  `generate:unsafe` / `push:unsafe`.
- O `schema.ts` deve **refletir o banco real** (inclui os 7 constraints driftados,
  já adicionados em 21/jun). Validar drift-zero antes de confiar em qualquer diff.
- Os 51 `.sql` do Drizzle e os 11 runners `.mjs` são **arquivados** (não apagados) em
  `_archive/` — registro histórico, fora do caminho ativo.
- Um **gate de CI** (`.github/workflows/ci.yml`) compara `schema.ts` × banco e bloqueia
  novos `.sql` em `packages/db/drizzle/` fora de `_archive/`.

## Alternativas consideradas

- **Drizzle canônico** (realinhar `_journal.json` + baseline via `drizzle-kit`):
  rejeitada — o journal tem 10 colisões e está 22 migrations atrás; reconstruí-lo é
  frágil e o `__drizzle_migrations` nunca foi usado. Maior risco, menor ganho.

## Notas de implementação

- O índice por expressão `campaign_msgs_dedup` (`(sent_at)::date`) tem suporte irregular
  no diff do drizzle-kit; o gate de CI de drift deve tolerar/ignorar esse objeto
  específico ou comparar via `information_schema`, não só via `drizzle-kit check`.
- Baseline (`BASELINE-1`): criar uma migration-baseline no-op/idempotente e registrá-la
  em `supabase_migrations` SEM reaplicar DDL. Exige backup antes (ação do dono/data-platform).
