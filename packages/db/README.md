# @repo/db

Pacote compartilhado de banco de dados. **Drizzle é o ORM / camada de tipos** (consumido em
todo o monorepo). Drizzle **não é mais o aplicador de migrations** — ver ADR 0001.

## Migrations — fonte única (ver `docs/DATABASE.md` e `docs/adr/0001-migration-source-of-truth.md`)

- **Tracking:** `supabase_migrations.schema_migrations` (Supabase CLI / `apply_migration`).
- **Schema:** `src/schema.ts` (reflete o banco real).
- **Novas migrations:** SQL idempotente em `../../supabase/migrations/NNN_nome.sql`.

> **FREEZE ATIVO:** `pnpm db:generate` / `pnpm db:push` estão bloqueados por
> `scripts/guard-migrations.mjs` (no estado dessincronizado eles dropavam constraints reais).
> Bypass consciente só em reconciliação supervisionada: `generate:unsafe` / `push:unsafe`.
> Os `.sql` e runners antigos estão em `drizzle/_archive/` e `scripts/_archive/` — **não execute**.

## Scripts

- `check-types` - `tsc --noEmit` (usado no CI)
- `studio` - Abre Drizzle Studio (leitura/inspeção)
- `smoke` - Testa conexão com o banco
- `seed` / `seed:*` - Popula banco com dados de teste (cuidado com o DATABASE_URL!)
- `reset` - **Reseta o banco (TRUNCA tudo + auth.users). NUNCA aponte para produção.**
- `generate` / `push` - **CONGELADOS** (guard). Use o fluxo único acima.
