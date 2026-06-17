# MinhaAgenda.ai — Guia para Agentes e Devs

SaaS multi-tenant (B2B2C) de agendamento para salões e barbearias, com um
agente de IA que conversa com o cliente final pelo WhatsApp. O dono gerencia o
salão pela web; o cliente agenda pelo WhatsApp via IA. Monorepo Turborepo + pnpm.

> Este é o **entrypoint curto**. O detalhe vive em `docs/`. Regra de ouro:
> **mantenha esta doc sincronizada com o código.** Se a doc divergir do código,
> a doc está errada — corrija a doc, não invente estrutura.

## Stack real (verificada — jun/2026)
- **Web:** Next.js **16.2.3** (App Router), React **19.2**, Tailwind CSS v4, shadcn/ui **local** (`apps/web/components/ui`)
- **Dados:** Supabase (Postgres + Auth + Realtime) + Drizzle ORM → camada de dados em `packages/db`
- **IA:** Vercel AI SDK (`ai`) + OpenAI, com *tool calling*; as tools ficam em `packages/mcp-server`
- **Filas:** BullMQ + Redis (ioredis) — worker em `apps/web/workers`
- **WhatsApp:** Evolution API (mensagem → webhook → fila → agente)

> ⚠️ **NÃO existem `apps/mobile` nem `packages/ui`.** Eram planos antigos que
> nunca foram implementados. Não os referencie, não sugira padrões de React
> Native/NativeWind e não crie esses pacotes "preventivamente".

## Comandos
- `pnpm dev` — sobe tudo (turbo, paralelo)
- `pnpm build` / `pnpm lint`
- `pnpm --filter web <script>` — scripts do app web (`dev`, `build`, `worker`, `test`, `replay`…)
- `pnpm --filter @repo/db <script>` — schema, seed, migrations
- **Banco: leia `docs/DATABASE.md` ANTES de criar qualquer migration.**

## Regras inegociáveis
1. `apps/*` pode importar de `packages/*`; o contrário, **NUNCA**.
2. Tipos de domínio: importe de `@repo/db`. **Proibido `any`.**
3. Mutações na web: Server Actions em `apps/web/app/actions/*` (não API routes — estas só para webhooks/integrações externas).
4. Nomenclatura: `kebab-case` + sufixos por tipo — ver `docs/CONVENTIONS.md`.
5. Segredos só em `.env` / variáveis de ambiente. **Nunca** em arquivos versionados (inclui `**/settings.local.json`, já ignorado).

## Mapa rápido
| Quero mexer em… | Vá para |
|---|---|
| Telas do salão | `apps/web/app/[salonId]/` |
| Admin do produto | `apps/web/app/z_admin_*` (a migrar p/ `(admin)` — ver CONVENTIONS) |
| Mutações (forms) | `apps/web/app/actions/` |
| APIs / webhooks | `apps/web/app/api/` |
| Lógica de aplicação | `apps/web/lib/services/` |
| Schema / dados | `packages/db/` |
| Tools da IA | `packages/mcp-server/` |

## Documentação canônica (em `docs/`)
- **`docs/ARCHITECTURE.md`** — estrutura real, camadas, dependency rule, golden paths
- **`docs/CONVENTIONS.md`** — nomenclatura, sufixos, route groups, Server Actions, tools de IA
- **`docs/DATABASE.md`** — migrations: estado atual (bagunçado) e como proceder com segurança
