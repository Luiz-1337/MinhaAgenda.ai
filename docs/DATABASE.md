# Banco de Dados e Migrations — MinhaAgenda.ai

> **LEIA ISTO ANTES DE CRIAR OU RODAR QUALQUER MIGRATION.**
> O estado de migrations deste projeto está **bagunçado e dessincronizado**.
> Mexer sem cuidado pode corromper o schema em produção.

## 1. Estado atual (verificado jun/2026) — a realidade, não o ideal

Existem **três sistemas de migration concorrentes**, e nenhum é claramente a
fonte única da verdade:

### A. Drizzle — `packages/db/drizzle/*.sql`
- **49 arquivos `.sql`**, mas `drizzle/meta/_journal.json` registra **apenas 20**.
  → ~29 migrations foram escritas à mão e o `drizzle-kit` **não as conhece**.
- **8 colisões de número** (dois arquivos com o mesmo prefixo): `0002`, `0003`,
  `0004`, `0005`, `0016`, `0017`, `0018`, `0019` — nomes auto-gerados
  (`0002_magenta_nemesis`) misturados com manuais (`0002_user_tier_and_password`).
  É ambíguo qual rodou.

### B. Supabase — `supabase/migrations/*.sql`
- **13 arquivos** (`001`…`012`, `999`). SQL cru: auth, `pgvector`, triggers, RLS.
- **`009` faltando**; **`012` duplicado** (`012_fix_appointments_client_fk.sql`
  vs `..._v2.sql`); lacunas `008→010` e `012→999`.

### C. Runners manuais — `packages/db/scripts/migrate_*.mjs`
- ~10 scripts `.mjs` (`migrate_002`, `003`, `005`, `006`, `009`, `038`, `039`…),
  espelhados em scripts `db:migrate:manual:NNN` do `package.json` raiz.

## 2. Avisos de produção (não ignore)
- **O `_journal.json` do Drizzle NÃO reflete o estado real do prod.** Há
  migrations escritas mas **não aplicadas** em produção (ex.: `0034`, `0041`
  conforme auditoria de jun/2026). O tracking de migrations é **não-confiável**.
- **Antes de qualquer mudança de schema, confira o schema REAL do banco**
  (via Supabase MCP: `list_tables` / `list_migrations`, ou `psql`), não o que
  os arquivos sugerem.
- **Há tenants reais com nomes parecidos** (dois salões "Spettacolo" legítimos).
  Nunca purgue dados assumindo que duplicata de nome = lixo. Confirme por ID.
- **Sempre faça backup do banco antes de rodar migration em prod.**

## 3. Como proceder AGORA (regras interinas, até o P4)
Enquanto a fonte canônica não for eleita formalmente:
1. **Não invente um novo sistema.** Não adicione um quarto caminho de migration.
2. **Evite gerar migration Drizzle nova** (`db:generate`) sem entender o estado
   — o journal desatualizado fará o drizzle-kit calcular diff errado.
3. Mudança de schema necessária e urgente? Escreva **SQL explícito e idempotente**
   (`IF NOT EXISTS`, `IF EXISTS`), aplique de forma controlada e **registre o que
   foi aplicado** (qual arquivo, qual ambiente, quando).
4. **Em dúvida, pergunte antes de aplicar.** Este é um ponto de alto risco.

## 4. Decisão em aberto (P4 — não decidida)
Falta **eleger uma fonte única da verdade** e reconciliar:
- Opção 1: Drizzle canônico → reconstruir/realinhar o `_journal.json` com os 49 SQL.
- Opção 2: Supabase migrations canônico → aposentar formalmente o journal do Drizzle.

Essa decisão **não foi tomada** e exige: backup, inventário do que realmente está
aplicado em cada ambiente, e validação. Quando for feita, **atualize este
documento** com a fonte escolhida e o passo-a-passo de "como adicionar uma
migration". Até lá, trate a seção 3 como lei.
