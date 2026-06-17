# Arquitetura — MinhaAgenda.ai

Documento canônico de arquitetura. Reflete o **código real** (verificado em
jun/2026), não planos. Se algo aqui não bater com o repositório, o documento
está desatualizado — corrija-o.

## 1. Stack real

| Camada | Tecnologia | Versão |
|---|---|---|
| Web / UI | Next.js (App Router) | **16.2.3** |
| | React | **19.2.0** |
| | Tailwind CSS | v4 |
| | shadcn/ui | local (`apps/web/components/ui`) |
| Dados | Supabase (Postgres, Auth, Realtime) | — |
| ORM | Drizzle ORM | ~0.45 |
| Validação | Zod | 3.x (web/db) / 4.x (mcp-server) ⚠️ ver §6 |
| IA | Vercel AI SDK (`ai`) + OpenAI (tool calling) | ai v5 |
| Filas | BullMQ + Redis (ioredis) | — |
| WhatsApp | Evolution API | — |

> **Não existem `apps/mobile` nem `packages/ui`.** Stacks de React Native /
> NativeWind / Expo **não fazem parte deste projeto**.

## 2. Árvore real do monorepo

```
minhaagendaai_v2/
├── apps/
│   └── web/                         # único app. Painel do salão + landing + APIs
│       ├── app/
│       │   ├── [salonId]/           # CORE: telas do salão (agenda, chat, clientes, serviços, settings)
│       │   ├── actions/             # Server Actions (mutações) — ~25 arquivos + actions/admin/
│       │   ├── api/                 # endpoints/webhooks: admin, agents, chat, cron,
│       │   │                        #   google, integrations, knowledge, salons, webhook
│       │   ├── z_admin_login/       # admin (prefixo z_ é gambiarra → migrar p/ (admin), ver CONVENTIONS §4)
│       │   ├── z_admin_minhaagendaai/
│       │   ├── login/ register/ forgot-password/ reset-password/   # auth (agrupar em (auth))
│       │   ├── onboarding/ contact/ dashboard/
│       │   ├── layout.tsx providers.tsx page.tsx globals.css
│       ├── components/              # por feature: admin, auth, billing, contacts, dashboard,
│       │                            #   landing, onboarding, scheduler, team, ui, whatsapp
│       ├── lib/                     # camada de aplicação da web (ver §3)
│       │   ├── services/            # subdomínios: actions, ai, availability, chat,
│       │   │                        #   evolution, marketing, retention, services
│       │   ├── repositories/ schemas/ utils/ types/ constants/ config/
│       │   ├── infra/ queues/ stores/ supabase/
│       └── workers/                 # worker BullMQ (message-processor)
├── packages/
│   ├── db/                          # @repo/db — camada de dados (ver §4)
│   │   ├── src/ {domain, application, infrastructure, services, utils}
│   │   └── drizzle/                 # migrations Drizzle (ver DATABASE.md)
│   ├── mcp-server/                  # @repo/mcp-server — tools de IA (Clean Arch real)
│   └── typescript-config/           # @repo/typescript-config — tsconfigs base
├── supabase/migrations/             # SQL cru: RPC, pgvector, triggers, RLS (ver DATABASE.md)
├── scripts/                         # utilitários: diagnose, seed, mcp-client, manutenção
└── docs/                            # esta knowledge base
```

## 3. Camadas e a "dependency rule"

**Regra de dependência (inegociável):**
```
apps/web  ───importa──▶  packages/*        ✅
packages/* ──importa──▶  apps/*            ❌ NUNCA
```
Dentro de `packages/mcp-server` e `packages/db` vale Clean Architecture:
`domain` não importa de `infrastructure`/`presentation`.

**Onde mora a lógica (decisão pragmática vigente):**
- `apps/web/lib/services/` é a **camada de aplicação da web**. É aqui que vivem
  os serviços de negócio do app (`marketing`, `retention`, `availability`, `ai`,
  `chat`, etc.). Isso é deliberado para o MVP.
- `packages/db` é a **fonte de dados + domínio compartilhável**: schema Drizzle,
  repositórios que falam com o banco, e serviços de domínio reutilizáveis
  (`appointments`, `availability`, `person`, integrações `trinks`/`google-calendar`).

> Houve uma intenção antiga (docs legadas) de mover *todo* domínio/use-cases para
> `packages/db`. **Não siga isso agora.** Só passa a valer o custo quando/se
> existir um segundo consumidor real (ex.: um app mobile) — que hoje não existe.

## 4. Pacotes

| Pacote | `name` | Papel |
|---|---|---|
| `packages/db` | `@repo/db` | Schema Drizzle, conexão Postgres, repositórios, serviços de domínio, migrations |
| `packages/mcp-server` | `@repo/mcp-server` | Tools do Model Context Protocol expostas à IA (Clean Arch coerente — não tocar à toa) |
| `packages/typescript-config` | `@repo/typescript-config` | tsconfigs base (next, react-library) |

## 5. Golden paths

### 5.1 Agendamento via IA (WhatsApp)
1. Cliente envia mensagem no WhatsApp.
2. **Evolution API** entrega no webhook (`apps/web/app/api/webhook/...`).
3. Webhook enfileira (BullMQ/Redis); o **worker** (`apps/web/workers`) processa.
4. O agente (Vercel AI SDK) usa **tools** (`packages/mcp-server`) — ex.:
   `getAvailability`, `getServices`, `createAppointment` — que chamam a camada
   de dados em `@repo/db`. Tools **não** escrevem Drizzle cru (ver CONVENTIONS).
5. Resposta volta pela Evolution API ao cliente.

> Há 3 modos de falha silenciosa nesse caminho (URL de webhook obsoleta no
> Evolution, referência de instância órfã, agente inativo). Ao depurar "o bot
> não responde", verifique esses três antes do código.

### 5.2 Gestão do salão (Web)
- Dono cadastra serviços/profissionais; dashboard mostra métricas; calendário
  drag & drop remaneja horários.
- Mutações = **Server Actions** em `app/actions/*` (ver CONVENTIONS §5).

## 6. Dívidas arquiteturais conhecidas (não são "como deveria ser")
- **Drift de Zod:** `mcp-server` em **4.x**, `web`/`db` em **3.x**. Como o
  mcp-server importa `@repo/db` (zod 3), tipos cruzam a fronteira v3↔v4 — fonte
  de erros silenciosos. A unificar (overrides) — tarefa dedicada.
- **Pastas split-brain** em `lib/` (`schemas.ts`+`schemas/`, `utils.ts`+`utils/`,
  `services/chat.service.ts`+`services/chat/`). Ver CONVENTIONS §6.
- **Repositórios em 3 lugares** (`lib/repositories`, dentro de `lib/services/*`,
  `packages/db/.../repositories`). A consolidar.
- **`z_admin_*`** como prefixo de rota (gambiarra alfabética) → Route Group `(admin)`.
- **Migrations:** três sistemas concorrentes e dessincronizados — ver `DATABASE.md`.

Essas dívidas estão documentadas para honestidade. Ao mexer perto delas, prefira
não piorar; correções amplas são tarefas próprias e priorizadas à parte.
