# Arquivo histórico — runners de migration (APOSENTADOS)

Estes `migrate_*.mjs` aplicavam SQL direto e **engoliam erros** "objeto já existe"
(códigos 42P07/42710/42701/23505/42P16), sem registrar em nenhum tracking. Foram a
causa de drift invisível (ex.: constraints criados só no banco).

**NÃO execute nada daqui** (os caminhos relativos para os `.sql` também já não valem —
os `.sql` foram movidos para `packages/db/drizzle/_archive/`). Mantidos só como histórico.

Fluxo único atual: SQL idempotente em `supabase/migrations/` aplicado via Supabase CLI /
`apply_migration`. Ver `docs/adr/0001-migration-source-of-truth.md` e `docs/DATABASE.md`.
