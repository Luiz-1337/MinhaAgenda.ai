# Planos e Assinatura — Diagnóstico e Plano de Correção

**Data:** 10 de agosto de 2026
**Escopo:** configuração de planos (SOLO / PRO / ENTERPRISE), limites, créditos, preço, concessão de tier e enforcement de assinatura.
**Estado:** decisões travadas com o dono em 10/ago. Execução por frentes, na ordem da seção 8.
**Progresso:** Frente 0 concluída (10/ago). Frentes 1 a 6 pendentes. Nada commitado ainda.

---

## 1. Onde o plano mora hoje

- **Tier:** `profiles.tier` do **dono** — enum `subscription_tier` (`SOLO | PRO | ENTERPRISE`), default `SOLO`.
  `packages/db/src/schema.ts:39` e `:82`. Não fica em `salons`; todo consumidor faz join por `salons.ownerId`.
- **Status da assinatura:** `salons.subscription_status` — enum (`ACTIVE | PAID | PAST_DUE | CANCELED | TRIAL`), default `TRIAL`, com `subscription_status_changed_at`.
  `packages/db/src/schema.ts:130`.

Essa separação (tier na pessoa, status no salão) é a razão de várias telas divergirem: cada uma foi buscar o número onde era mais perto.

---

## 2. O que cada plano dá — declarado hoje

| | SOLO | PRO | ENTERPRISE |
|---|---|---|---|
| Preço (copy) | R$ 299 | R$ 999 | Sob consulta |
| Profissionais (`PLAN_LIMITS`) | 1 | 7 | ilimitado |
| Agentes (`AGENT_LIMITS`) | 1 | 3 | ilimitado (3 inclusos + R$ 150/extra) |
| Salões (código real) | 1 | **ilimitado** | ilimitado |
| Créditos/mês (`PLAN_CREDITS`) | 1.000.000 | 5.000.000 | 10.000.000 |

Fontes: `apps/web/lib/utils/permissions.ts`, `apps/web/lib/services/credits.service.ts:12`, `apps/web/components/landing/constants.ts:52`.

**Stripe** (`apps/web/lib/stripe.ts`): os preços vivem em variáveis de ambiente que apontam para price IDs. `STRIPE_PRICE_SOLO` e `STRIPE_PRICE_PRO` são obrigatórias (`apps/web/lib/env.ts:14`); `STRIPE_PRICE_ENTERPRISE` e `STRIPE_PRICE_EXTRA_AGENT` caem para string vazia — e quando isso acontece, ENTERPRISE some de `TIER_TO_PRICE` **e** de `PRICE_TO_TIER`, ou seja, o webhook deixa de conseguir sincronizar o tier de volta.
Pacotes de crédito avulso: 500k/R$ 49, 1M/R$ 89, 2M/R$ 149.

---

## 3. O que de fato é travado

Nem toda regra de plano é enforçada, e as que são não estão no mesmo lugar.

| Regra | Onde | Vale? |
|---|---|---|
| Limite de agentes | `apps/web/app/actions/agents.ts:178` | Sim, no servidor |
| Limite de profissionais | `apps/web/lib/services/professional.service.ts:127` | Sim, no servidor |
| Salão único no SOLO | `apps/web/app/actions/salon.ts:105` | Sim, no servidor |
| Créditos esgotados | `apps/web/workers/message-processor.ts:595` | Sim — para a IA, avisa o cliente (throttle 24h) e alerta o salão |
| Assinatura CANCELED / PAST_DUE | `apps/web/workers/message-processor.ts:534` | Sim, no bot — PAST_DUE com 3 dias de carência |
| Trial vencido | `apps/web/components/auth/route-guard.tsx` | **Só no navegador** |
| Feature por plano | `apps/web/lib/services/plan-features.service.ts` | **Nenhum consumidor** |
| Limite de salões PRO/ENTERPRISE | — | **Não existe** |

---

## 4. Os seis achados

### 4.1 — "Até 3 Salões" do PRO não existe no código

Só o SOLO tem limite de salão (`apps/web/app/actions/salon.ts:105`). PRO e ENTERPRISE criam quantos quiserem, enquanto três telas prometem "Até 3 Salões".

Agravante de nomenclatura: `PLAN_LIMITS.PRO = 7` **nunca** limitou salão — é o teto de profissionais por salão, usado por `canAddProfessional`. O comentário em `apps/web/lib/services/plan-features.service.ts:15` e a mensagem do commit `1429b63` chamam esse 7 de "salões", o que propagou o engano.

### 4.2 — Trial vencido só bloqueia o painel, e só no navegador

`TRIAL_DURATION_DAYS = 7` vive no `apps/web/components/auth/route-guard.tsx:12` — um componente `"use client"` que age dentro de um `useEffect`. Não existe `middleware.ts` no projeto. Consequências:

- Server Actions e rotas de API não checam status de assinatura.
- O worker não olha trial: um salão com trial vencido perde o painel no navegador, mas **a IA do WhatsApp continua respondendo indefinidamente**, até acabar o crédito.

A regra de assinatura hoje está escrita duas vezes, e as duas versões discordam: o RouteGuard conhece trial e não conhece carência de PAST_DUE do mesmo jeito que o worker; o worker conhece CANCELED e PAST_DUE (3 dias) e não conhece trial.

### 4.3 — O tier é concedido sem pagamento

`apps/web/app/actions/auth.ts:108` e `apps/web/app/actions/onboarding.ts:142` gravam `tier` direto da escolha do formulário (`/register?plan=PRO`). Cadastrar com `?plan=ENTERPRISE` nasce ENTERPRISE.

Pior: o último passo do cadastro é uma tela de pagamento **simulada** — `apps/web/components/onboarding/step-payment.tsx`, documentada como tal em `apps/web/app/register/page.tsx:94`. Ela não chama o Stripe, mostra preços que não existem em lugar nenhum (R$ 49 / R$ 149), e leva ao dashboard com o tier escolhido.

### 4.4 — O gate de feature está inerte

`advanced_reports: ['PRO','ENTERPRISE']` existe, está testado e **não tem nenhum consumidor**. A rota `/[salonId]/reports` nunca foi criada, embora "Relatórios avançados" seja vendido como benefício do PRO. O próprio commit assume: *"Inerte por enquanto: nada consome ainda (a rota /reports vem em seguida)."*

### 4.5 — Números de plano em seis lugares que se contradizem

- **Três tabelas de preço:** R$ 299/R$ 999 (landing, faturamento, assinatura expirada), R$ 49/R$ 149 (`step-payment.tsx:15`), e a tela admin (preço certo, créditos errados).
- **Duas tabelas de crédito:** `PLAN_CREDITS` diz 1M/5M/10M — que é o que o worker realmente aplica — contra "5.000 Tokens/mês" e "25.000 Tokens/mês" em `apps/web/app/z_admin_minhaagendaai/plans/page.tsx:14`.
- A copy de benefícios está duplicada em landing, faturamento, assinatura expirada, cadastro e admin.

### 4.6 — Tier fantasma `TEAM`

`apps/web/lib/services/services/salon-plan.service.ts:7` declara `SalonTier = "SOLO" | "TEAM" | "ENTERPRISE"`. `TEAM` não existe no enum do banco e `PRO` está ausente do tipo. O teste do `hasFeature` já cobre a borda para que `TEAM` seja negado caso vaze.

---

## 5. O que produção diz (medido em 10/ago/2026)

Levantado direto no banco antes de decidir qualquer coisa.

- **11 salões. Zero assinaturas Stripe. Zero linhas em `payments`.** Três profiles têm `stripe_customer_id`, mas nenhuma assinatura ficou registrada — **o ciclo de cobrança nunca fechou uma vez**. Todo tier hoje foi concedido à mão ou pelo cadastro.
- As contas não-SOLO são de teste: `pro@teste.com` (2 salões) e `enterprise@teste.com` (1 salão, 7 profissionais, 4 agentes). Os salões reais são os Spettacolo, todos SOLO.
- **Nenhum dono real tem mais de um salão** — a trava de 3 salões não quebra nada existente.
- **Nenhum salão tem `subscription_status_changed_at` nulo**, então o caminho *fail-open* do RouteGuard nunca é exercido hoje.
- Dois salões estão com **trial vencido** (`salao top`, `Salão do William`). Ambos têm **zero agentes** — ligar o bloqueio no bot não derruba atendimento nenhum.

### 5.1 — O bloqueio real do Relatório 360

O motor de "atendimento realizado com valor" **já existe inteiro**: colunas `price_charged`, `completed_at`, `outcome_source`, CHECK no banco exigindo valor quando `status='completed'`, fechamento pelo balcão (`outcome_source='panel'`) e o cron diário `apps/web/app/api/cron/close-appointments/route.ts`, registrado no `vercel.json`.

**Mas está desligado.** O cron é opt-in por `salons.auto_close_appointments`, que nasce `false` — e **não existe nenhuma UI ou action para ligar**: a coluna aparece apenas no schema e no próprio cron.

Resultado medido:

- `auto_close_appointments = true` em **0 dos 11 salões**.
- 45 agendamentos `completed`, **todos** com `outcome_source='legacy'` (backfill de jan–mar), com `price_charged = 0` porque o valor real era desconhecido.
- **53 agendamentos passados em aberto** (23 confirmados, 30 pendentes), o mais recente de 07/08.
- Nenhum fechamento por `cron` ou por `panel` desde março.

Se a tela de relatórios subir hoje, ela mostra **R$ 0,00 de abril em diante**. Como o próprio roadmap do CRM registra: *relatório errado destrói a confiança mais rápido que relatório ausente*.

---

## 6. Decisões do dono — 10/ago/2026

| Tema | Decisão |
|---|---|
| Preço | **R$ 299 (SOLO) / R$ 999 (PRO)**. As demais tabelas viram cópia dessa fonte |
| Limites do PRO | **3 salões, 7 profissionais por salão** |
| Concessão de tier | **Só por Stripe confirmado ou pelo admin.** Conta nova nasce SOLO/TRIAL |
| Fim do cadastro | Tela de pagamento simulada vira **tela de resumo honesto** — sem cartão, sem "pagamento aprovado" |
| Trial vencido | **Bloqueia painel e bot**, mesmo prazo, com verificação no servidor |
| Créditos | **1M / 5M / 10M** é a verdade. A tela admin passa a ler a mesma constante |
| Relatórios | **Construir a rota `/reports` agora** |
| Contas de teste | Podem ser normalizadas, com o SQL revisado antes |

---

## 7. Plano de execução

### Frente 0 — Catálogo único de planos — **CONCLUÍDA em 10/ago/2026**
*Fundação das frentes 1, 4 e 5.*

O que foi feito:

- **Criado `apps/web/lib/plans.ts`** — por tier: preço, salões, profissionais por salão, agentes (com os inclusos), créditos, descrição e a lista de benefícios. Mais os helpers `getPlan`, `canAddSalon`, `canAddProfessional`, `canAddAgent`, `getExtraAgentCount`, `getMonthlyCredits`, `formatLimit` e `formatPlanPrice`.
- **`apps/web/lib/utils/permissions.ts` foi removido**, não renomeado. O plano previa rebatizar `PLAN_LIMITS` para `PROFESSIONAL_LIMITS`, mas com o catálogo no lugar o arquivo virava uma segunda porta para o mesmo número — que é exatamente o problema que a frente existe para resolver. Os quatro consumidores passaram a ler o catálogo: `actions/agents.ts`, `team/team-client.tsx`, `agent-billing.service.ts` e `professional.service.ts`.
- **`PLAN_CREDITS` deixou de existir** em `credits.service.ts`; o worker lê `getMonthlyCredits(tier)`, mantendo 1M/5M/10M.
- **A tela admin de usuário tinha uma cópia própria de `PLAN_CREDITS`** (`z_admin_minhaagendaai/users/[userId]/page.tsx:15`), que definia o limite padrão do painel de créditos. Removida — passa a ler o catálogo.

Achados menores, corrigidos de passagem:

- `agent-billing.service.ts` importava `ENTERPRISE_INCLUDED_AGENTS` sem nunca usar.
- `professional.service.ts` fazia **duas** consultas de `countActiveProfessionals` no caminho SOLO: uma no bloqueio próprio do SOLO (com um `>= 1` que repetia o limite) e outra na checagem genérica logo abaixo. Agora é uma só, com o número vindo do catálogo. As duas mensagens de erro foram preservadas.

Decisão de projeto registrada: **tier desconhecido cai no SOLO**, o plano menos permissivo. Vale para `null`, `undefined`, string vazia e para o `TEAM` fantasma. Um catálogo que libera por omissão entrega plano pago de graça.

**Armadilha respeitada:** `credits.service.ts` está no grafo de import do worker, que roda via `tsx` e **não resolve o alias `@/`** — ele importa `../plans`, e `plans.ts` é sem dependências, como o `money.utils.ts`. O `tsc` não pega isso; quebraria só em runtime, em produção.

**Provas:** `pnpm --filter web exec tsc --noEmit` exit 0; suíte completa **396 testes / 29 arquivos**, verde, incluindo 29 testes novos em `__tests__/lib/plans.test.ts`.

**Fora do escopo desta frente, de propósito:** o teste que falha se uma tela declarar número próprio só entra na Frente 4. As telas ainda têm os números na mão — escrever a guarda agora seria entregar um teste vermelho.

### Frente 1 — Trava de salões e limites do PRO
*Achado 4.1.*

- `canAddSalon(tier, count)` no catálogo: SOLO 1, PRO 3, ENTERPRISE ilimitado.
- Substituir o `if (tier === 'SOLO')` de `apps/web/app/actions/salon.ts:105` pela checagem genérica.
- Profissionais seguem 7 por salão no PRO, agora com o nome certo.

**Risco: nenhum** — nenhum dono real tem mais de um salão.

### Frente 2 — Paywall no servidor e trial no bot
*Achado 4.2. Maior vazamento de receita.*

- Criar `subscription.service.ts` com `assertSubscriptionActive(salonId)` — fonte única: CANCELED bloqueia, PAST_DUE tem 3 dias, TRIAL tem 7 dias, ACTIVE/PAID livre.
- **Servidor:** gate no `apps/web/app/[salonId]/layout.tsx` (RSC), liberando só `expired` e `billing`. O RouteGuard vira cortesia de navegação; a trava real passa a ser server-side.
- **Bot:** o worker chama o mesmo helper, e trial vencido cala a IA pelo caminho que já existe (`notifyClientSubscriptionBlocked`, com motivo novo `trial_expired`).

**Limite honesto do escopo:** o gate no layout fecha o uso do painel, mas não protege Server Actions chamadas diretamente. Cobrir as ~25 actions é trabalho separado; nesta frente entram só as que geram custo (conectar WhatsApp, criar agente, disparar campanha). O resto fica registrado como dívida.

**Impacto medido:** 2 salões de teste perdem o painel, nenhum atendimento cai.

### Frente 3 — Tier deixa de ser de graça
*Achado 4.3.*

- `auth.ts:108` e `onboarding.ts:142` param de gravar o tier escolhido. Toda conta nasce SOLO/TRIAL.
- A escolha vira intenção de compra: migration **032**, `profiles.intended_plan` (nullable, aditiva).
- `step-payment.tsx` → `step-summary.tsx`: sem cartão, sem "pagamento aprovado", sem R$ 49/R$ 149.
- Guarda de regressão: teste que falha se signup ou onboarding escreverem tier diferente de SOLO.

**Gate obrigatório antes de mergear:** com essa mudança o webhook do Stripe vira o único caminho automático de upgrade — e ele nunca fechou um ciclo em produção. Validar ponta-a-ponta em modo teste faz parte desta frente. Se não subir, o upgrade fica manual pelo admin, que já sabe editar tier.

### Frente 4 — Preço e números numa fonte só
*Achado 4.5.*

Todas as telas passam a ler o catálogo: `landing/constants.ts`, `billing/page.tsx`, `expired/page.tsx`, `z_admin_minhaagendaai/plans/page.tsx` e o novo step-summary. Some o R$ 49/R$ 149, somem os "5.000/25.000 Tokens", e "Até 3 Salões" vira verdade pela Frente 1.

**Depende do dono:** confirmar no dashboard do Stripe que `STRIPE_PRICE_SOLO` e `STRIPE_PRICE_PRO` valem mesmo 299 e 999. Se não baterem, o catálogo mente de novo — só que num lugar só.

### Frente 5 — Relatório 360 em `/reports`
*Achado 4.4. A maior.*

Escopo conforme a Peça 6 de `docs/CRM-Saloes-Diagnostico-e-Roadmap.md`: receita, ticket médio, retorno 30/60/90, no-show, receita por profissional e serviço, ROI de campanha.

**5a — Ligar o fato (obrigatória antes da tela).** Toggle de `auto_close_appointments` em Configurações, com `?dryRun=1` rodado antes de ligar no primeiro salão; e visibilidade do selo "aguardando fechamento" para o balcão resolver os 53 em aberto.

**5b — A tela.** Gate por `salonHasFeature` no RSC (não só esconder o menu), tela de upgrade usando `tiersWithFeature`, e regra explícita: receita é soma de `price_charged` em `completed` não-`legacy`; período sem fechamento aparece como **"sem dados"**, nunca como R$ 0.

**Armadilha:** `price_charged` é `numeric` — o driver devolve **string**. Somar em JS sem converter dá concatenação silenciosa.

### Frente 6 — Limpeza
*Achado 4.6 + dados de teste.*

- Remover o tier fantasma `TEAM` de `salon-plan.service.ts:7`, trocando `SalonTier` pelo `PlanTier` real.
- Normalizar `pro@teste.com` e `enterprise@teste.com`, com SELECT de inspeção revisado antes de qualquer escrita.

---

## 8. Ordem e gates

**0 → 2 → 1 + 4 → 3 → 6 → 5**

A Frente 0 destrava as outras. A 2 vem logo porque é receita vazando com risco medido de zero. A 3 fica depois da validação do webhook do Stripe. A 5 é a maior e a única que depende de dado que ainda não é coletado — por isso vai por último, com a 5a como pré-requisito.

Convenção do repositório respeitada: **código → deploy → migration**. Só a Frente 3 tem migration (032).

### Depende do dono

1. Confirmar os preços no dashboard do Stripe (Frente 4).
2. Validar o webhook do Stripe em modo teste, ou decidir que o upgrade fica manual (Frente 3).
3. Aprovar o SQL de limpeza das contas de teste (Frente 6).

### Fora do escopo, de propósito

Escopar por salão as 5 policies RLS em ponte `USING(true)`, e blindar as ~25 Server Actions restantes contra assinatura vencida. Ambos são dívida real e maior que este plano — ficam registrados como próximos, não misturados aqui.

---

## 9. Inventário exaustivo (10/ago) — o que muda nas frentes seguintes

Varredura de 6 lentes independentes (preço, limites, créditos, copy, ramificação por tier, grafo do worker) com verificação adversarial: **327 achados confirmados**. O catálogo da Frente 0 bate 100% com as decisões e os imports do worker estão corretos. O que segue é o que sobrou fora dele.

### 9.1 — Muda a Frente 1 (trava de salões)

**`getUserSalons` não serve para contar salões do dono.** `apps/web/app/actions/salon.ts` faz `or(eq(salons.ownerId, userId), eq(professionals.userId, userId))` — ou seja, inclui salões em que a pessoa é apenas profissional de outra. Usar essa contagem no `canAddSalon` barraria quem não deveria ser barrado. O gate precisa contar **por `ownerId`**. *(Verificado no código.)*

**Há mais de um caminho de criação de salão e só um tem gate:** `actions/salon.ts:105` (com gate), `lib/services/salon.service.ts:202` (insert direto), mais os caminhos de `actions/onboarding.ts` e `actions/auth.ts`. Decidir onde o gate entra para cobrir todos é parte da frente.

### 9.2 — Muda a Frente 4 (copy)

**Acoplamento por string literal que quebra na migração.** Três telas escondem o sufixo "/mês" comparando `plan.price !== 'Sob Consulta'` — com **C maiúsculo**: `landing/pricing.tsx:76`, `onboarding/step-plan.tsx:106` e `auth/plan-selection.tsx:73`. O `formatPlanPrice` do catálogo devolve **"Sob consulta"**, minúsculo. Trocar a fonte sem ajustar as comparações faz as três telas imprimirem "Sob consulta/mês". *(Verificado.)*

**E uma quarta tela já erra hoje, sem migração nenhuma:** `[salonId]/billing/page.tsx:152` renderiza `{plan.price}<span>/mes</span>` **sem a guarda**. Um salão ENTERPRISE lê literalmente **"Sob Consulta/mes"** sob o rótulo "Valor mensal". *(Verificado.)*

**São sete listas de benefício**, seis renderizadas, com divergências reais entre si — "Relatórios e métricas" vs "Relatórios avançados", "SLA garantido" presente em duas e ausente em uma, "API dedicada" vs "API personalizada". Além disso: **nenhuma tela do cliente informa a franquia de créditos**, e **nenhuma informa o teto de 7 profissionais por salão** — o cliente PRO descobre esbarrando no erro.

**Contradição de posicionamento:** `expired/page.tsx:82` marca o **PRO** como "Popular"; a landing marca o **SOLO** (`constants.ts:56`, `highlight: true`).

**Outros pontos de preço solto:** `components/billing/subscription-actions.tsx:72` tem "R$ 999/mês" dentro do label do botão, e `:15` declara um `PLAN_ORDER` próprio onde tier desconhecido cai em `0` e oferece todos os upgrades.

### 9.3 — Achados novos, fora dos seis originais

**Um gate de plano que a IA usa nunca funcionou.** `packages/mcp-server/src/domain/entities/Salon.ts:195`:
`this._subscriptionStatus === "solo" || this.getSetting<boolean>("is_solo") === true`.
O primeiro termo compara `subscription_status` (cujo enum é `ACTIVE|PAID|PAST_DUE|CANCELED|TRIAL`) com `"solo"`, que é um *tier*, minúsculo. O segundo lê uma chave `is_solo` que tem **um leitor e zero escritores** no monorepo e **não existe em nenhum dos 11 salões em produção**. Logo `isSoloPlan()` é sempre `false`, e o `PlanRestrictionError` de `GetProfessionalsUseCase.ts:30` — exposto ao modelo como tool — **nunca disparou**. *(Verificado nas duas pontas, código e banco.)*

**`STRIPE_PRICE_EXTRA_AGENT` não está em `lib/env.ts`** e cai para string vazia em `lib/stripe.ts:24`. Faltando, `syncExtraAgentBilling` apenas loga um `warn` e retorna — **agente extra do ENTERPRISE fica de graça em silêncio**, enquanto duas telas prometem R$ 150/mês. Mesma situação de `STRIPE_PRICE_ENTERPRISE`.

**Reentrega de webhook credita duas vezes.** `api/webhook/stripe/route.ts:241` faz `extra_credits + N` na mesma transação do `INSERT` idempotente em `payments`, mas o UPDATE do saldo não é idempotente.

**Terceira cópia da regra de peso de modelo:** `api/cron/stats-sync/route.ts:65` hardcoda `0.5` para o modelo mini, ao lado de `MODEL_WEIGHTS` em `utils/credits.ts`. Renomear o modelo em produção dobra a cobrança em silêncio, porque `getModelWeight` cai em `?? 1.0`.

**`creditsForDisplay` (`lib/utils.ts:14`) divide por 1.000, mas o JSDoc diz 100.000** e dá exemplo errado. Seis telas consomem.

**Pacotes de crédito desalinhados com a mensalidade:** R$ 89 avulsos dão 1.000.000 de créditos — a franquia mensal inteira do SOLO, que custa R$ 299. R$ 149 dão o dobro da franquia por metade da mensalidade. As decisões de 10/ago não trataram de pacotes avulsos; revisar preço de plano sem revisar isso é meia decisão.

**Armadilha de execução:** os números `49` e `149` aparecem tanto como preço fantasma em `step-payment.tsx` quanto como preço legítimo de pacote de crédito em `lib/stripe.ts`. **Não fazer find-and-replace por número.**

> Os itens de 9.1 e 9.2 e os quatro primeiros de 9.3 foram conferidos abrindo os arquivos. Os demais vêm do inventário com arquivo:linha e devem ser reconferidos na frente correspondente.
