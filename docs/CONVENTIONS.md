# Convenções de Código — MinhaAgenda.ai

Documento canônico de padronização. Vale para humanos e agentes de IA.

## 1. Nomenclatura de arquivos e pastas

**Tudo em `kebab-case`.** O nome do arquivo é `kebab-case`; o *export* do
componente React continua `PascalCase`.

```
✅ daily-scheduler.tsx        → export function DailyScheduler() {}
✅ availability.service.ts
❌ DailyScheduler.tsx
❌ availabilityService.ts
```

## 2. Sufixos obrigatórios por tipo

| Tipo | Sufixo | Exemplo |
|---|---|---|
| Serviço | `*.service.ts` | `salon.service.ts` |
| Repositório | `*.repository.ts` | `availability.repository.ts` |
| Utilitário | `*.utils.ts` | `time.utils.ts` |
| Constantes | `*.constants.ts` | `landing.constants.ts` |
| Schema Zod | `*.schema.ts` | `evolution.schema.ts` |

**Violadores conhecidos a renomear** (quando tocar na área):
- Serviços sem sufixo: `lib/services/ai/openai-client.ts`,
  `assistant-output-guards.ts`, `availability-message-policy.ts`,
  `retention/opt-out-detector.ts`, `retention/retention-container.ts`; em
  `@repo/db`: `services/{appointments,availability,person,trinks,google-calendar}.ts`.
- Utils sem sufixo: `lib/utils/{credits,permissions,file-processor}.ts`.
- Constantes: `components/landing/constants.ts`.
- Schema: `lib/schemas/evolution.ts`.

> Renomeações em massa devem usar codemod (`git mv` em lote + ajuste de imports
> guiado por `tsc`), não um a um na mão.

## 3. Tipos, utils e constantes — onde colocar
- **Tipos que cruzam workspaces** (entidades, schema): fonte única em `@repo/db`.
  Importe de `@repo/db`, não redefina.
- **Tipos locais de um app:** `apps/web/lib/types/`.
- **Constantes/utils:** sempre em **pasta com `index.ts` (barrel)**, nunca
  arquivo solto convivendo com pasta de mesmo nome (ver §6).
- **Proibido `any`.** Use tipos do schema, generics ou `unknown` + narrowing.

## 4. Rotas: Route Groups, não prefixos

Não use prefixos alfabéticos (`z_admin_*`) para ordenar/segregar rotas. Use
**Route Groups** do Next.js — não afetam a URL e expressam a intenção:

```
app/z_admin_login/            ❌  →  app/(admin)/login/            ✅
app/z_admin_minhaagendaai/    ❌  →  app/(admin)/minhaagendaai/    ✅
app/{login,register,forgot-password,reset-password}/  →  app/(auth)/...
```
(Migração ainda pendente — ver ARCHITECTURE §6.)

## 5. Server Actions vs API Routes
- **Mutações disparadas pela UI web → Server Actions** em `apps/web/app/actions/*`.
- **API Routes (`app/api/*`) só para:** webhooks, cron, e integrações externas
  (Evolution, Google, Stripe, etc.).
- Toda interação com banco/IA com `try/catch` e feedback ao usuário (toast).

## 6. Barrels e o problema "split-brain"
Nunca tenha um arquivo `X.ts` **e** uma pasta `X/` competindo. Casos atuais a
resolver em `apps/web/lib/`:
- `schemas.ts` + `schemas/` → mover conteúdo para `schemas/<dominio>.schema.ts` e expor via `schemas/index.ts`.
- `utils.ts` + `utils/` → idem, `utils/index.ts` reexporta `cn()` etc.
- `services/chat.service.ts` + `services/chat/` → mover o arquivo para `chat/chat.service.ts`.

## 7. Componentes React
- **Server Components por padrão.** Só use `"use client"` quando precisar de
  interatividade (hooks, estado, listeners).
- Estilize com Tailwind + shadcn/ui (componentes locais em `components/ui`).
  Evite arquivos CSS custom.
- Implemente `loading.tsx` ou `<Suspense>` para evitar bloquear a UI.

## 8. Tools de IA (`packages/mcp-server`)
1. **Validação de input com Zod** em toda tool. Nunca confie no input cru do LLM.
2. **Read-only por padrão.** Mutações (ex.: agendar) exigem checagem de
   autorização do usuário antes de executar.
3. **`description` da tool é para o LLM** — detalhe exatamente quando usá-la e o
   formato esperado.
4. **Sem Drizzle cru na tool.** Use a camada de dados de `@repo/db`.
