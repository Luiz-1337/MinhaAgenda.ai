# Arquivo histórico — migrations Drizzle (APOSENTADAS)

Estes 51 `.sql` foram aplicados **fora de banda** (mistura de `db:push` antigo + runners
`.mjs`) e o tracking nativo do Drizzle (`_journal.json`, `__drizzle_migrations`) nunca
refletiu o estado real do banco. Mantidos como **registro histórico**.

**NÃO execute nada daqui.** A fonte única da verdade agora é:
- **Tracking:** `supabase_migrations.schema_migrations` (Supabase CLI / `apply_migration`).
- **Schema:** `packages/db/src/schema.ts`.
- **Novas migrations:** SQL idempotente em `supabase/migrations/NNN_nome.sql`.

Ver `docs/adr/0001-migration-source-of-truth.md` e `docs/DATABASE.md`.

As 10 colisões de número históricas (`0002`-`0005`, `0016`-`0019`, `0040`, `0041`) ficam
como estão — resolvê-las seria reescrever história sem ganho, já que o tracking não
depende mais delas.
