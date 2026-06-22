# Equipe de Especialistas — MinhaAgenda.ai

Oito agentes especialistas, um por área real do sistema. Foram escritos a partir
do **código real** (cada caminho de arquivo citado foi verificado), seguindo a
visão do dono (ver abaixo). Servem para você sair do caos de forma controlada.

## A verdade que guia todos eles
- **Direção: SaaS híbrido.** Os dois salões *Spettacolo* são o piloto real em
  produção, mas o sistema é a **fundação de um SaaS vendável**. Logo segurança e
  isolamento multi-tenant são fundação, não "depois".
- **A IA é um concierge completo:** agendar + reter + vender + tirar dúvidas.
  Os serviços `marketing` e `retention` no código são **visão, não entulho**.
- **Dores P0:** confiabilidade WhatsApp/IA, painel web/UX, segurança multi-tenant.

## Como cada agente opera (importante)
Todos são **read-only / diagnóstico-primeiro** por escolha do dono. Eles:
1. Auditam a área no código real.
2. Entregam um **roadmap priorizado** (P0/P1/P2) com problema, evidência
   (`arquivo:linha`), risco, esforço, *blast radius* e próximo passo.
3. **Não alteram código, SQL, schema ou config sem sua aprovação explícita.**

Eles **não têm** ferramentas de escrita. Quando você aprovar um plano, a
implementação é feita à parte (por mim no loop principal, ou liberando as tools).

## O roster

| Agente | Prioridade | Dono de… |
|---|---|---|
| **`whatsapp-pipeline`** | P0 | Evolution → webhook → fila → worker → entrega. Confiabilidade, idempotência, os 4 modos de falha silenciosa, observabilidade. |
| **`ai-agent`** | P0 | A conversa: Vercel AI SDK + OpenAI, tools do `mcp-server`, persona concierge, guardrails, qualidade e custo. |
| **`scheduling-domain`** | P1 | A corretude do agendamento: disponibilidade, double-booking, no-show, timezones, regras de negócio. |
| **`data-platform`** | P1 | Postgres/Supabase/Drizzle: schema, integridade, índices e o caos das migrations. *(tem acesso de leitura ao banco via Supabase MCP)* |
| **`security-multitenant`** | P0 | RLS, isolamento de tenant, auth, tokens OAuth/PII, segredos. *(tem acesso de leitura ao banco via Supabase MCP)* |
| **`web-frontend`** | P0 | Next.js App Router, Server Actions, shadcn/ui, scheduler drag&drop, performance e UX do painel do dono. |
| **`integrations`** | P2 | Google Calendar, Stripe (billing), Trinks, ElevenLabs, Resend. Webhooks externos, OAuth, idempotência. |
| **`architecture-lead`** | P1 | Saúde do monorepo, dependency rule, convenções, dívidas estruturais. **Porta de entrada** que roteia para os outros. |

## Como invocar
- **Por nome:** "use o `whatsapp-pipeline` para diagnosticar por que o bot não respondeu".
- **Por sintoma:** descreva o problema; as `description` têm frases-gatilho que
  fazem o agente certo ser escolhido (ex.: "mensagem duplicada", "RLS", "double-booking").
- **Sem saber por onde começar:** chame o **`architecture-lead`** — ele faz o
  diagnóstico de alto nível e te diz qual especialista atacar cada item.

## Ordem de ataque sugerida (dadas as dores P0)
1. **`architecture-lead`** — visão geral + roteamento (uma rodada rápida).
2. **`whatsapp-pipeline`** + **`ai-agent`** — o coração do produto (a maior dor).
3. **`security-multitenant`** (+ **`data-platform`** como par) — fundação de SaaS.
4. **`web-frontend`** — a experiência do dono do salão.
5. **`scheduling-domain`** e **`integrations`** — corretude e bordas.

> Estes agentes nasceram de uma auditoria do código em jun/2026. Se o código
> mudar muito, vale re-rodar a geração. Documentação canônica que eles seguem:
> `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/CONVENTIONS.md`, `docs/DATABASE.md`.
