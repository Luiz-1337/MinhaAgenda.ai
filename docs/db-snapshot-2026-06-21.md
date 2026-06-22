# Snapshot do banco — 2026-06-21 (VERIFY-1)

Inventário read-only do banco de produção (Supabase `egrfxtrkcasiuypkxilr`, Postgres 17.6)
no início da reconciliação. **Nada foi alterado para gerar este snapshot.** Serve de
ponto-zero para o baseline (`BASELINE-1`) e o gate de CI.

> Backup lógico recomendado ANTES de qualquer DDL desta reconciliação (ação do dono/ops):
> `pg_dump --schema-only` + dump das tabelas de tracking (`supabase_migrations.schema_migrations`,
> `drizzle.__drizzle_migrations`). Não foi possível gerar pg_dump pelas ferramentas MCP.

## Tabelas (33 em `public`, todas no schema.ts)

| Tabela | Linhas | RLS | Observação |
|---|---|---|---|
| messages | 1858 | off→014 | FK chat_id sem índice (corrigido em 016) |
| customers | 157 | off→014 | |
| professional_services | 159 | off→014 | |
| availability | 180 | off (híbrida) | SEC-5 (decisão do dono) |
| services | 138 | off→014 | |
| appointments | 111 | off→014 | 4 FKs NO ACTION (HIG-6, decisão do dono) |
| chats | 84 | off (híbrida) | SEC-5 |
| products | 71 | off→014 | |
| profiles | 55 | off (híbrida) | SEC-5 |
| chat_kanban_columns | 40 | on, sem policy → REVOKE 014 | |
| campaign_messages | 30 | off→014 | |
| ai_usage_stats | 275 | off→014 | |
| professionals | 22 | off (híbrida) | SEC-5 |
| agent_stats | 20 | off→014 | |
| agents | 9 | off→014 | |
| salons | 10 | off (híbrida) | SEC-5; 3 reais + 7 teste (ver classificação) |
| system_alerts | 15 | on, sem policy → REVOKE 014 | |
| system_prompt_templates | 6 | off→014 | |
| salon_integrations | 4 | off→**013 (P0)** | tokens OAuth expostos |
| recovery_flows / recovery_steps | 2 / 2 | off→014 | |
| google_calendar_sync_channels | 2 | off→014 | |
| schedule_overrides | 9 | off (híbrida) | SEC-5; FK salon_id indexado em 016 |
| payments | 0 | off→014 | feature não usada |
| customer_trinks_profile | 0 | off→014 | |
| admin_audit_logs | 0 | on, sem policy → REVOKE 014 | |
| retention_response_audit | 0 | on, sem policy → REVOKE 014 | |
| campaigns | 8 | off→014 | |
| leads / campaign_recipients / waiting_list | 0 / 0 / 0 | off→014 | features recentes |
| ~~embeddings~~ | 0 | — | **MORTA — DROP em 018 (após deploy)** |

Sem views, materialized views ou sequences. Extensão `vector` 0.8.0 (em `public` — mover p/ schema próprio é higiene futura).

## Tracking de migrations (ponto-zero)

- `drizzle.__drizzle_migrations`: **0 linhas**.
- `supabase_migrations.schema_migrations`: **4 entradas** (via CLI).
- `packages/db/drizzle/`: 51 `.sql`, 10 colisões.
- `packages/db/scripts/migrate_*.mjs`: 11 runners.

## Segurança (advisors)

- ERROR `sensitive_columns_exposed`: `salon_integrations` (tokens OAuth) → 013.
- ERROR `rls_disabled_in_public`: 29 tabelas → 013/014 (6 híbridas ficam p/ SEC-5).
- INFO `rls_enabled_no_policy`: 4 tabelas → REVOKE em 014.
- WARN: 3 funções SECURITY DEFINER executáveis por anon → 015; leaked-password protection off → SEC-4.
- **Achado novo:** anon + authenticated têm grants CRUD completos nas 33 tabelas (escrita, não só leitura).
- `postgres` e `service_role` confirmados com `rolbypassrls=true` (RLS sem policy nas Drizzle-only é seguro).
