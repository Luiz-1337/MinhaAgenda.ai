# Banco de Dados e Migrations — MinhaAgenda.ai

> **LEIA ISTO ANTES DE CRIAR OU RODAR QUALQUER MIGRATION.**
> A fonte única da verdade foi eleita (ADR 0001). Os comandos antigos estão **congelados**.

## 1. Fonte única da verdade (decidida — ver `docs/adr/0001-migration-source-of-truth.md`)

- **Tracking (o que já foi aplicado):** `supabase_migrations.schema_migrations` (Supabase CLI / `apply_migration`).
- **Schema (forma desejada das tabelas):** `packages/db/src/schema.ts` (Drizzle é o **ORM/tipos**, não o aplicador).
- **Aplicar migration:** SQL idempotente em `supabase/migrations/NNN_nome.sql`, aplicado via Supabase CLI / `apply_migration`.

## 2. FREEZE ATIVO — não use os caminhos antigos

- `pnpm db:generate` / `pnpm db:push` estão **bloqueados** por `packages/db/scripts/guard-migrations.mjs`.
  No estado anterior eles recriavam 0020–0041 e **dropavam 7 constraints** que só existem no banco.
  Bypass consciente (só em reconciliação supervisionada): `generate:unsafe` / `push:unsafe`.
- Os **51 `.sql`** do Drizzle (`packages/db/drizzle/`) e os **11 runners `.mjs`** estão **arquivados**
  em `_archive/` — registro histórico, **não execute**.
- `_journal.json` (parava no `0019`) e `drizzle.__drizzle_migrations` (0 linhas) estão **aposentados**.

## 3. Como adicionar uma migration (fluxo canônico)

1. Escreva **SQL idempotente** (`IF NOT EXISTS` / `IF EXISTS` / `DO $$ ... $$`) em
   `supabase/migrations/NNN_nome.sql` (próximo número livre após o maior existente).
2. Atualize `packages/db/src/schema.ts` **no mesmo PR** para refletir a mudança (tipos/ORM).
3. **Backup do banco** (snapshot) antes de aplicar em produção.
4. Aplique via Supabase CLI (`supabase db push` / migration) ou `apply_migration` (MCP) —
   registra automaticamente em `supabase_migrations.schema_migrations`.
5. Rode `get_advisors` (security + performance) antes/depois e confirme o efeito.
6. O **gate de CI** (`.github/workflows/ci.yml`) valida `schema.ts` × banco e bloqueia
   novos `.sql` em `packages/db/drizzle/` fora de `_archive/`.

## 4. Avisos de produção (não ignore)

- **Confira o schema REAL do banco** (Supabase MCP `list_tables` / `execute_sql`) antes de mudar — não confie só nos arquivos.
- **Tenants reais com nomes parecidos:** TRÊS salões "Spettacolo" legítimos (`ed4cb777`, `0e5d76eb`, `8b68b7d8`)
  e DOIS chamados variações de "top". **Nunca purgue por nome — sempre por ID.**
- **`packages/db/scripts/reset.mjs` (`db:reset`) trunca tudo + `auth.users`.** Nunca aponte para produção.
- **Sempre faça backup antes de migration em prod.**
- A credencial Supabase vazada deve ser **rotacionada** (service_role bypassa RLS — sem rotação, RLS não protege contra quem tem a chave).

## 5. Histórico (estado anterior, para contexto)

Antes da reconciliação (21/jun/2026) havia 4 mecanismos divergentes: Drizzle arquivos (51 `.sql`, 10 colisões
de número — `0002`-`0005`, `0016`-`0019`, `0040`, `0041`), Drizzle journal (parava no `0019`),
`__drizzle_migrations` (0 linhas), `supabase_migrations` (4 entradas) e ~11 runners `.mjs`.
As migrations `0034` e `0041` **já estão aplicadas** (correção de auditorias anteriores que as davam como pendentes).
