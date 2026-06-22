# Runbook — Reconciliação do Banco (o que depende de VOCÊ)

Todo o trabalho **em repositório** (reversível, versionado na branch `chore/db-remediation`)
já foi feito: freeze, fix dos lembretes, migrations `013`–`018`, `schema.ts` refletindo o
banco, ADR, CI, arquivamento e docs. Este runbook lista o que **não pode ser feito sem você**
— porque exige painel externo, aplica DDL em produção, ou é decisão de negócio.

> Regra de ouro: **backup/snapshot do banco antes de qualquer DDL**; aplicar em
> staging/branch antes de prod; **referenciar salões por ID, nunca por nome**;
> **nunca** rodar `reset.mjs`/`db:reset` apontando para produção.

---

## 1. AGORA — Pré-requisito de segurança (SEC-0) · só você

**Rotacionar a credencial Supabase vazada.** É a raiz do P0: `service_role` tem
`rolbypassrls=true`, então quem tem a chave vazada **ignora toda RLS** que aplicarmos.

- [ ] No painel Supabase (`egrfxtrkcasiuypkxilr`): rotacionar `service_role`, `anon`/publishable e (se aplicável) o JWT secret.
- [ ] Atualizar os segredos em todos os ambientes (apps/web `.env`, worker, mcp-server, CI) em janela coordenada.
- [ ] Purgar a chave do histórico do git (BFG / `git filter-repo`) e forçar push.
- [ ] Validar: chave ANTIGA contra `/rest/v1/` → 401; app end-to-end com as novas; `git log --all -S '<fragmento>'` vazio.

---

## 2. Aplicação das migrations em PRODUÇÃO (ordem obrigatória) · seu OK + backup

As migrations estão em `supabase/migrations/`. Aplicar via Supabase CLI / `apply_migration`
(registra em `supabase_migrations.schema_migrations`). **Snapshot antes de cada bloco.**

| Ordem | Arquivo | O que faz | Risco | Reversível |
|---|---|---|---|---|
| 1 | `013_rls_lockdown_salon_integrations.sql` | **P0** — para o vazamento de tokens OAuth | BAIXO | sim |
| 2 | `014_rls_lockdown_drizzle_only.sql` | RLS + revoke nas Drizzle-only | MÉDIO | sim |
| 3 | `015_revoke_secdef_execute.sql` | revoke EXECUTE de anon nas funções SECURITY DEFINER | BAIXO | sim |
| 4 | `016_data_hygiene_indexes.sql` | +índice messages, +2 FK, −4 redundantes | BAIXO | sim |
| 5 | `017_pgvector_hnsw.sql` | índice HNSW (⚠ confirme o operador — ver §5) | BAIXO | sim |
| 6 | `018_drop_embeddings.sql` | **só depois** do deploy da remoção de código da `embeddings` | MÉDIO | recriável |

- [ ] **Antes de 014:** `grep` confirmando que nenhuma das 22 tabelas é acessada via supabase-js `.from()` (a superfície anon deve ser só as 6 híbridas).
- [ ] Rodar `get_advisors` (security + performance) **antes e depois** e confirmar que os ERRORs caem.
- [ ] **BASELINE-1** (depois de aplicar): criar a migration-baseline no-op e registrá-la em `supabase_migrations` SEM reaplicar DDL, para a CLI considerar o estado atual como ponto-zero. Opcional: `DROP` da tabela vazia `drizzle.__drizzle_migrations`.

Rollback de cada uma está documentado no topo do respectivo `.sql`.

---

## 3. Decisões de negócio (Fase 4) · só você

- [ ] **ON DELETE de `appointments` (HIG-6).** Hoje as 4 FKs são NO ACTION → deletar
  salão/cliente/profissional com agendamento trava (causa do bug do `adminDeleteUser`).
  Decida: **soft-delete** (recomendado, preserva histórico) / RESTRICT / cascade.
  Depois disso eu escrevo a migration `019_appointments_on_delete.sql`. (com scheduling-domain)

- [ ] **6 tabelas híbridas (SEC-5)** — `profiles, salons, chats, professionals, availability, schedule_overrides`.
  Você adiou em 18/jun. **013 e 014 não dependem disto.** Para avançar: escrever policies
  `auth.uid()` refletindo owner **+ manager** (NÃO reusar a `999_security_hardening.sql`,
  que modela owner-only e referencia `chat_messages` inexistente) OU converter os 6 `.from()`
  para Drizzle e travar deny-all. Testar isolamento com 2 salões reais por ID.

---

## 4. Limpeza de salões (Fase 4) · só você decide, sempre por ID

- [ ] **NUNCA TOCAR (reais):** `ed4cb777`, `0e5d76eb` (ativo hoje), `8b68b7d8` (PII real).
- [ ] **CLASSIFICAR antes de limpar:**
  - `37dc22de` "Salão TOP" — owner é **seu gmail pessoal** (luiz.guilherme3108@), 887 msgs. É você testando (arquivar) ou clientes reais (não tocar)?
  - `2a13a394` "Studio A" — seed SOLO + 1 customer com seu nome; alvo do `db:clean:solo`.
  - `e1bb1145` "Salão do William" — shell vazio, mas owner é pessoa real (lead?).
- [ ] **SEED seguros para limpar** (sem PII de terceiros, após backup): `9e6e5597`, `bbf49a06`, `57e75777`, `189fb05c`.
- Ao limpar um salão: **apagar `appointments` por `salon_id` ANTES** dos pais (FK sem ON DELETE), ou aplicar HIG-6 primeiro.

---

## 5. Código a finalizar (preparado, precisa de dono/decisão) · não apliquei

- [ ] **SEC-7 — validar `salonId` em `/api/chat` e tools MCP.** Esse caminho usa
  `service_role` (RLS não protege) → autorização é só código. Regra: `salonId` deve ser
  **derivado no servidor** (instância WhatsApp → salão), nunca aceito de input não confiável;
  onde houver sessão web, validar `hasSalonPermission`. Implementação é par com **ai-agent +
  whatsapp-pipeline** (eu não toquei no hot path sem revisão de domínio).
- [ ] **HNSW (017) — confirmar o operador de distância** com ai-agent: se o RAG usa `<=>`
  (cosine), `vector_cosine_ops` está certo; se `<->`/`<#>`, trocar para `vector_l2_ops`/`vector_ip_ops`
  senão o índice **não é usado** pelo planner.
- [ ] **SEC-4 — Auth (painel):** ligar leaked-password protection + endurecer política de senha.
- [ ] **SEC-6 — cifrar tokens OAuth em repouso** em `salon_integrations` (reusar o util da Evolution + backfill das 4 linhas). Par com integrations.

---

## 6. Limpezas de menor prioridade (anotadas, não feitas)
- Extensão `vector` vive no schema `public` (advisor recomenda schema dedicado).
- Os `.claude/agents/*.md` e a memória descrevem o estado ANTIGO de migrations — atualizar quando conveniente (o canônico agora é este runbook + `DATABASE.md` + ADR 0001).
