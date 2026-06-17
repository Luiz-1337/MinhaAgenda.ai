---
name: minha-agenda-architect
description: Regras consolidadas — ver AGENTS.md, docs/ARCHITECTURE.md e docs/CONVENTIONS.md
---

# MinhaAgenda.ai — regras consolidadas

As regras de arquitetura, de frontend (Server Components por padrão, Server
Actions para mutações) e de tools de IA (validação Zod, read-only por padrão,
sem Drizzle cru na tool) agora vivem nas fontes canônicas:

- **`AGENTS.md`** (raiz)
- **`docs/ARCHITECTURE.md`** — camadas, dependency rule, golden paths
- **`docs/CONVENTIONS.md`** — nomenclatura, Server Actions (§5), componentes (§7), tools de IA (§8)

⚠️ A versão antiga deste arquivo afirmava que "Domain, DB e Use Cases DEVEM
residir em `/packages/db`" e citava `apps/mobile`, `packages/ui` e NativeWind.
Isso **contradiz o código atual**: a camada de aplicação da web vive em
`apps/web/lib/services`, e não há app mobile nem `packages/ui`. Siga as fontes
canônicas acima.
