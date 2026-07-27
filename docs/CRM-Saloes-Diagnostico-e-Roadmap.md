# CRM de salões no MinhaAgenda — o que precisa ter

> Diagnóstico feito em 26/07/2026, com leitura do código e consultas ao banco de produção.
> Nada foi alterado — este documento é só o plano.

## 1. Veredito em 5 linhas

1. Você está mais perto do que parece: já existem cadastro por salão, tags M:N, timeline de conversa com mídia, opt-out ponta-a-ponta, um motor de reengajamento por IA sério e um sync de "Cliente 360" — só que quase nada disso aparece numa tela para o dono do salão.
2. O que você **não** tem é a peça que todo o resto depende: **o fato de negócio "atendimento realizado, com valor"**. `statusEnum` tem `'completed'` (`packages/db/src/schema.ts:40`), mas nenhum código do app grava esse valor — os únicos writers são `'pending'` (`packages/db/src/services/appointments.ts:262`) e `'confirmed'` no placeholder do Google (`:704`) — e `appointments` não tem **nenhuma** coluna monetária (`schema.ts:287-306`).
3. Consequência em cadeia: a query mais bem escrita do repo, a de clientes inativos, filtra `a.status = 'completed'` (`packages/mcp-server/src/infrastructure/database/DrizzleRetentionRepository.ts:68`) e retorna **vazio por construção**; o KPI "Atendimentos Concluídos" conta `chats.status='completed'` (`apps/web/app/actions/dashboard.ts:57-63`), valor que ninguém escreve em produção — o card mostra 0 e sempre mostrará.
4. A segunda peça faltante é **identidade**: dois normalizadores de telefone em conflito (`apps/web/lib/services/chat.service.ts:24` mantém o `55`; `apps/web/lib/utils/phone.utils.ts:55` remove), `chats` sem FK para `customers` (só `client_phone` text, `schema.ts:420`) e nenhuma action de merge.
5. Não é um projeto de "construir CRM do zero" — é **ligar o que está desligado, na ordem certa**: fato → identidade → ficha → motor. Antes de qualquer coisa, tem um P0 de segurança: as actions de conversa não checam salão (`apps/web/app/actions/chats.ts:94, 219, 353` usam só `getSessionUserId()`), e você está prestes a concentrar todo o dado pessoal numa tela nova.

---

## 2. O que você JÁ tem (e não sabia que era CRM)

| Capacidade | Onde está | Maturidade |
|---|---|---|
| Cadastro de cliente por salão, multi-tenant, com unique `(salon_id, phone)` | `packages/db/src/schema.ts:502-529` | completo |
| Criação automática de cliente pelo WhatsApp (nome do perfil + auto-healing) | `apps/web/lib/services/chat.service.ts:17-100` | completo |
| CRUD manual de contatos (na verdade um upsert por telefone) | `apps/web/app/actions/customers.ts:37, 111, 259, 321` | parcial |
| Catálogo de tags por salão + atribuição M:N, com validação de tenant e transação | `schema.ts:563-596`; `apps/web/app/actions/customer-tags.ts:233-287` | completo |
| Tags do contato exibidas dentro do chat (CRM já ajudando o atendimento) | `apps/web/app/actions/chats.ts:157-165`; `chat-client.tsx:605` | parcial |
| Cliente ligado a agendamento por FK **real** (`appointments.client_id → customers.id`) | `schema.ts:293` | completo |
| Opt-out por palavra-chave, sinal fraco auditado e classificação de sentimento por cron | `apps/web/workers/message-processor.ts:310-385`; `apps/web/app/api/cron/retention-audit/route.ts:43-77` | completo (invisível na UI) |
| Timeline de conversa com status de entrega e mídia (URL assinada) | `schema.ts:445-476`; `apps/web/app/actions/chats.ts:250` | completo |
| Kanban de conversas com drag-and-drop, colunas por salão e classificação opcional por IA | `schema.ts:391-413, 429-430`; `apps/web/app/actions/kanban.ts:99-380` | completo |
| Motor de reengajamento por IA: CTE de última visita, ciclo do serviço, cooldown, opt-out, keyset, cap diário, dedup idempotente | `DrizzleRetentionRepository.ts:55-115`; `apps/web/lib/services/marketing/ai-retention-dispatcher.service.ts:237-440` | completo **e sem insumo** |
| Regra da janela de 24h do WhatsApp Cloud, implementada corretamente e falhando alto de propósito | `apps/web/lib/services/messaging/proactive.ts:52-80` | completo |
| Segmentação persistida como query salva e reavaliada no disparo | `schema.ts:605` (`segmentation_criteria` jsonb); `campaign-sender.service.ts:49-57` | parcial (motor quebrado) |
| Fila BullMQ com `delay` e `jobId` determinístico + worker único hospedando 3 workers | `apps/web/lib/queues/delivery-retry-queue.ts:111-114`; `apps/web/workers/message-processor.ts:1109-1131` | completo, subutilizado |
| Alerta por salão com throttle Redis | `apps/web/lib/services/alerts/alert.service.ts:105-125` | completo |
| Padrão pronto de tabela nova multi-tenant (salon_id + RLS + deny_all + REVOKE) | `supabase/migrations/020_customer_tags.sql:41-54` | completo — **copie literalmente** |

### Esqueleto morto (trabalho já pago que dá para ressuscitar ou enterrar)

| Esqueleto | Prova | Veredito |
|---|---|---|
| `customer_trinks_profile` (gasto, ticket, visitas 90/365, VIP score) — cron diário escreve, **nenhuma tela lê** | `schema.ts:531-558`; leitores só em `system-prompt-builder.service.ts` e `ai-retention-dispatcher.service.ts:187-193` | Ressuscitar como **um** dos alimentadores da ficha; a fonte da verdade passa a ser local |
| `waiting_list` — **zero escritores** no repo, 0 linhas em prod; e `slot-filler.service.ts:87-92` busca `profiles` por `waiter.clientId`, que é FK de `customers.id` | `schema.ts:317-330`; `packages/db/src/services/appointments.ts:615-621` chama `processVacantSlot` no cancelamento | Ressuscitar: é o **único gatilho por evento** que já existe e é demanda reprimida com nome e telefone |
| `leads` (+ tool `qualifyLead`) — 0 linhas em prod, nenhuma tela, `name/email/source` nunca preenchidos | `schema.ts:480-500`; `DrizzleLeadRepository.ts:92-101` | **Enterrar**. Unificar em `customers` com `lifecycle_stage` |
| `campaign_recipients` — criada e nunca preenchida por código de produto | `schema.ts:615-622` | Enterrar. O público materializado já vive em `campaign_messages` |
| `customers.ai_preferences` — lida em `generate-response.service.ts:584-596`, **nunca escrita** (`updateAiPreferences` sem caller) | `schema.ts:510` | Enterrar. `preferences` jsonb é a de verdade |
| Tela `/whatsapp-templates` — chama `/api/salons/[salonId]/whatsapp/templates`, rota que **não existe**; sem tabela `whatsapp_templates`; 404 renderiza "Nenhum template criado" | dir real tem só `connect`, `disconnect`, `status` | Ressuscitar: é o gargalo da Peça 4 |
| `getCampaigns`, `getCampaignById`, `getCampaignStats` — escritas, **zero chamadores** | `apps/web/app/actions/marketing.ts:140, 161, 239` | Ressuscitar: é a tela de histórico de campanha quase pronta |
| Badge "Finalizado" do card e filtro "Em espera" do chat — estados inalcançáveis | `apps/web/app/actions/kanban.ts:150`; `chat-client.tsx:188-190` vs `chats.ts:194` | Enterrar ou dar semântica real |
| "Finalizar" e "Bloquear" no menu do chat — toast de sucesso, `// TODO`, zero action | `chat-client.tsx:436-448` | Ressuscitar como resolução/bloqueio de verdade |
| `professionals.commission_rate` — sempre `'0'`, nunca lida para calcular dinheiro; 23/23 em 0.00 em prod | `schema.ts:218`; `professional.service.ts:142` | Deixar quieto até existir valor por atendimento |
| `campaigns.include_ai_coupon` / `recovery_steps.include_ai_coupon` — o segundo **é lido** e vira cláusula de prompt autorizando a IA a insinuar "condição especial"; **não existe entidade de cupom** em lugar nenhum | `schema.ts:650`; `GenerateReengagementMessageUseCase.ts:55-57` | Decisão de produto (seção 5) |

---

## 3. As 4 peças que faltam

### Peça 1 — O fato: "atendimento realizado, com valor"

**O que é.** Um marco gravável de que o serviço aconteceu, por quanto e com quem, mais o registro de que **não** aconteceu (falta/cancelamento) sem apagar a linha.

**Por que sem ela nada funciona.** Última visita, frequência, LTV, ticket médio, taxa de retorno, cliente inativo, pós-atendimento, receita por profissional e ROI de campanha são todos derivados desse fato. Hoje: nenhum writer de `'completed'`; cancelar é `db.delete(appointments)` (`packages/db/src/services/appointments.ts:609`, docstring "Cancelar = HARD delete" em `DeleteAppointmentUseCase.ts:16`); não existe `'no_show'` no enum. O preditor de risco que já aparece no chat e no prompt da IA conta exatamente as linhas que o sistema apagou (`packages/db/src/services/no-show-predictor.service.ts:48-55`) — é falso-negativo por construção.

**Mudanças concretas (próxima migration livre):**
- `appointments`: `completed_at timestamp`, `price_charged numeric(10,2)`, `discount numeric(10,2)`, `payment_method text`, `performed_professional_id uuid → professionals.id` (quem atendeu de fato, que pode não ser quem foi agendado), `cancelled_at`, `cancel_reason`, `cancelled_by uuid → profiles.id`.
- `statusEnum` (`schema.ts:40`): adicionar `'no_show'`.
- Trocar o `db.delete` de `appointments.ts:609` por `update` com `status='cancelled'`. Revisar os dois deletes em cascata feitos **pelo código, não por FK**: `apps/web/app/actions/professionals.ts:257` e `apps/web/lib/services/services/service.repository.ts:180-184`.
- UI: botões "Concluir" / "Não compareceu" em `apps/web/components/scheduler/appointment-detail-dialog.tsx` (hoje só oferece "Apagar agendamento"; `STATUS_LABELS:11-16` já tem os rótulos, sem caminho para produzi-los). O preço vem pré-preenchido de `services.price` e é editável — **não** dá para usar o catálogo como proxy: ~30% dos 144 serviços em prod são faixa min/max, "sob avaliação" ou 0.
- Job de fechamento em `apps/web/app/api/cron/` para agendamentos passados não tocados (com janela de carência), senão o dado depende de disciplina do balcão.

**Destrava.** A query de inativos volta a devolver gente. Todo o pipeline de retenção que já existe passa a ter insumo. Ticket, LTV e taxa de no-show viram calculáveis.

> **Correção verificada:** `appointments_client_id_customers_id_fk` é **NO ACTION** em produção, não `ON DELETE CASCADE` — o `012_fix_appointments_client_fk_v2.sql` caiu no guard `IF NOT EXISTS` porque o Drizzle já tinha criado a constraint com o mesmo nome. Ou seja: excluir contato com histórico **falha** com erro de FK e o dono lê só "Falha ao remover contato." (`apps/web/app/actions/customers.ts:300-306`). O histórico não evapora por cascade — evapora pelos deletes explícitos citados acima.

---

### Peça 2 — Identidade: uma pessoa = um registro = uma conversa

**O que é.** Telefone canônico único, `chats` ligado a `customers` por FK, e merge assistido.

**Por que sem ela o resto não funciona.** A ficha 360 e o LTV nascem partidos se a mesma pessoa tem duas linhas; o import de CSV multiplica o problema de uma vez; a tag aplicada à mão não aparece no chat porque o casamento é feito por string em `apps/web/app/actions/chats.ts:137-175`.

**Estado real medido em produção:**
- 52 de 180 clientes (29%) têm `+` no início — vindo dos **seeds** (`packages/db/scripts/seed-pro-complete.mjs:445-447`), não de writer de aplicação. São 8 comprimentos de string diferentes na coluna.
- Nos salões reais: Spettacolo `ed4cb777` tem 54 com `55` e **12 sem**; Spettacolo Salone, 31 e **3**. São 15 contatos que nunca casam com o chat por `replace(/\D/g,'')`.
- Duplicação real por sufixo de 8 dígitos dentro do salão: **5 grupos, 6 linhas redundantes**. Pequeno hoje — e é exatamente por isso que a hora de canonizar é agora, antes do import.

**Mudanças concretas:**
- Um único normalizador. Hoje são dois: `chat.service.ts:24` (mantém DDI) e `apps/web/lib/utils/phone.utils.ts:52-56` (remove o `55` e corta em 11 dígitos). Escolher E.164 sem `+` (`5511...`) e aplicar em `apps/web/app/actions/customers.ts:147`, no import e no `findOrCreateChat` (`chat.service.ts:144-150`, que hoje casa string literal **sem** normalizar).
- Migration de backfill: canonizar `customers.phone` e `chats.client_phone` na mesma transação; sem isso a mudança de formato quebra o casamento existente.
- `chats.customer_id uuid → customers.id` (`schema.ts:415-443`), preenchido em `chat.service.ts:138` — o `findOrCreateCustomer` já roda no mesmo webhook e devolve o id.
- Action `mergeCustomers` em `apps/web/app/actions/customers.ts`: repontar `appointments.client_id`, `campaign_messages.customer_id`, `customer_tag_assignments`, `customer_trinks_profile`, `waiting_list.client_id`; união de tags; opt-out sobrevive se qualquer lado tiver.
- Corrigir de uma vez os **três** lugares com o mesmo bug de classe (`profiles.id` usado onde o dado é `customers.id`): `apps/web/lib/services/marketing/segmentation.service.ts:53-72`, `apps/web/lib/services/ai/generate-response.service.ts:969-980` (faz todo cliente parecer novo) e `packages/db/src/services/slot-filler.service.ts:87-92`.
- `customers.archived_at` e trocar o delete físico de `customers.ts:300` por arquivamento.

**Destrava.** Import de CSV seguro, ficha com histórico completo, timeline confiável, e o chat mostrando nome em vez de número.

---

### Peça 3 — A ficha do cliente (a tela que faz virar CRM)

**O que é.** `apps/web/app/[salonId]/contacts/[customerId]/page.tsx` — a rota **não existe** (o diretório tem exatamente `page.tsx`, `contacts-client.tsx`, `loading.tsx`), e `contacts-client.tsx` não tem um único `Link` ou `router.push`. O cliente hoje é uma linha de tabela com 4 campos.

**Por que sem ela o resto não funciona.** É onde tudo o que você já construiu fica visível. O "Cliente 360" já é montado e injetado no prompt da IA (`system-prompt-builder.service.ts:129-183`, com os valores em R$ deliberadamente redigidos) — **o robô conhece o cliente melhor que a recepcionista**. Sem a ficha não há onde pendurar nota, ficha técnica, timeline nem métrica.

**Mudanças concretas:**
- Cabeçalho: nome, telefone, tags, badge de **opt-out** (`customers.opted_out_at` existe desde sempre e não há **uma** referência a `optedOutAt` em todo o `apps/web`), próxima visita, botão "Abrir conversa".
- Blocos: histórico de agendamentos (o índice `appt_client_idx` já existe, `schema.ts:309`), métricas, notas, ficha técnica, campanhas recebidas.
- Novas tabelas (próxima migration livre, copiando `020_customer_tags.sql:41-54`):
  - `customer_notes` (`salon_id`, `customer_id`, `author_profile_id`, `body`, `created_at`) — hoje o substituto é `preferences.notes`, um campo único **sobrescrito** a cada edição (`customers.ts:402-412`), sem autor nem data, disputando o mesmo jsonb com as chaves arbitrárias que a IA grava (`preferences-tool-factory.service.ts:63-72`).
  - `customer_health_records` (alergia, fórmula, restrição, `registrado_por`, `created_at`) — dado sensível LGPD art. 11, com acesso por papel; **não** deixar isso num jsonb que vai no CSV e no prompt da OpenAI.
  - `crm_customer_metrics` (`salon_id`, `customer_id`, `total_spent`, `avg_ticket`, `visits_90/365`, `first_visit_at`, `last_visit_at`, `no_show_count`, `updated_at`) alimentada por job — **não** calcular on-demand por linha (RTT us-west-2).
- Colunas em `customers`: `birth_date date`, `gender` (o critério já está declarado em `segmentation.service.ts:10` e explicitamente não aplicado em `:117`), `source`/`acquisition_channel`, `owner_professional_id`, `preferred_professional_id`, `preferred_service_id`, `lifecycle_stage`, `stage_entered_at`, `consent_at`/`consent_source`/`consent_basis`.
- Permissão: `hasSalonPermission` só aceita `MANAGER|OWNER` (`apps/web/lib/services/permissions.service.ts:27`), então **STAFF vê a tela de contatos vazia** — justamente quem atende no balcão. Criar um nível de leitura (`canReadCrm`). E o dashboard é ainda mais fechado: `salon.ownerId !== user.id` (`dashboard.ts:113`) — nem MANAGER vê o painel.
- Lista: mover busca/filtro/ordenação/paginação para o servidor. `getSalonCustomers` (`customers.ts:63-78`) faz `findMany` sem `limit`, com join de tags por contato, `orderBy desc(updatedAt)` **sem índice** — e o array inteiro viaja no HTML do RSC e no cache do react-query para renderizar 20 linhas.
- Importação de CSV: não existe nenhum parser em `apps/web/app/actions` (a única ocorrência de csv é o exportador no browser, `contacts-client.tsx:36-56`, que ainda ignora busca e filtro ativos na linha 133). Sem import você não vende para salão que já tem base.

**Destrava.** O produto passa a parecer CRM. E vira o local natural de LGPD: opt-out manual, exportação por titular, anonimização.

---

### Peça 4 — O motor de relacionamento que realmente entrega

**O que é.** Público correto + saída governada + gatilho por evento.

**Por que sem ela o CRM não trabalha sozinho.** Quatro furos verificados:

1. **Público errado.** `segmentation.service.ts:53-72` busca `profiles` por telefone e usa `profile.id` no where de `appointments.client_id`, que é FK de `customers.id`. Espaços de UUID distintos — `lastAppointment` é sempre `null`, então "30 dias"/"60 dias" fazem `continue` em todos e a contagem dá **0**. O dono olha e conclui que não tem cliente inativo. Pior: `profiles.phone` nos seeds é `+5511...` e `customers.phone` é dígitos — falha duas vezes. E `profiles` é o **assinante**, então até um match acidental apontaria para a pessoa errada. Reescrever como **uma** SQL, usando `DrizzleRetentionRepository.ts:55-115` como molde (window function, join `lv.client_id = c.id`, keyset). Hoje são 2 queries por cliente dentro de um `for`, e o preview de contagem reexecuta isso a cada tecla.
2. **Opt-out não é do motor.** O `where` base filtra só `isSystem` (`segmentation.service.ts:40`); e `enqueueRecoveryMessages` insere em `campaign_messages` **sem** `customer_id` (`packages/db/src/services/marketing-dispatcher.service.ts:157-163`), então o LEFT JOIN de defesa (`:192, :209`) dá sempre NULL. `isNull(customers.optedOutAt)` tem que estar no motor, não em cada chamador.
3. **A mensagem não sai (ou sai errado).** Os três chamadores passam `sendProactiveMessage` **sem `chatId` e sem `template`** — `apps/web/app/api/cron/reminders/route.ts:12-14`, `cron/marketing-dispatcher/route.ts:21`, `campaign-sender.service.ts:113`. Em salão Cloud (Spettacolo Salone, 34 clientes) isso lança em `proactive.ts:77-79`. Nos salões **Evolution** (Spettacolo `ed4cb777`, 66 clientes, e outros) entrega — texto livre a qualquer hora (`proactive.ts:56-60`), sem janela, sem quiet hours, sem template. **São dois riscos distintos: um não entrega, o outro entrega de madrugada.** Falta a tabela `whatsapp_templates` (nome, idioma, categoria, status na Meta, mapa de params) e um template por tipo de disparo. Isso depende de App Review da Meta — prazo externo, começar já.
4. **O relógio não existe.** O `ai-retention-dispatcher` calcula janela 9-18h + jitter (`:82-109`) e grava `sent_at` no futuro, mas o único despachante filtra `cm.sent_at <= now()` (`marketing-dispatcher.service.ts:194`) e roda 1x/dia às 12 UTC: nada agendado hoje sai hoje, tudo sai amanhã em rajada, com teto **global** de 100 (`:175, :251`, sem partição por salão).

**Mudanças concretas:**
- `apps/web/lib/queues/automation-queue.ts` + `apps/web/workers/automation.worker.ts`, registrados no bootstrap de `message-processor.ts:1109-1131` (3 linhas, igual ao Trinks e ao delivery-retry). Eventos: `appointment.created/completed/no_show/cancelled`, `customer.birthday`, `slot.vacant`. Emitir nos chokepoints que já existem e são únicos: `packages/db/src/services/appointments.ts:230-272`, `:552`, `:605-621`.
- Um **guardião de saída** único: `canSendProactive(salonId, customerId, kind)` chamado dentro de `sendProactiveMessage`, aplicando opt-out, quiet hours (fonte: `salons.workingHours`), cap por salão e teto agregado por cliente somando lembrete + reativação + broadcast (hoje os três não se conhecem). Reusar o padrão Redis NX/EX de `alert.service.ts:114-116`.
- Persistir o outbound proativo em `messages` — nenhum chamador de `sendProactiveMessage` chama `saveMessage`, então o chat mostra a resposta do cliente sem a mensagem que a provocou, e a IA não sabe do que ele está falando (`getChatHistory` ainda corta em "hoje", `chat.service.ts:320-332`).
- **Corrigir o lembrete hoje, é um bug de confiança:** `apps/web/lib/services/reminders.service.ts:101` pede "responda *CANCELAR*", e `cancelar` está no HARD regex de opt-out (`apps/web/lib/services/retention/opt-out-detector.ts:15`), com curto-circuito antes da IA (`message-processor.ts:310-341`). O cliente acha que cancelou o horário, na verdade se descadastrou do marketing — e o horário fica na agenda. "CONFIRMAR" não tem handler nenhum e não existe tool de confirmação em `appointment.tools.ts`.
- Ressuscitar a lista de espera: dar uma entrada (tool de IA + botão no painel), corrigir o join para `customers` e enviar pela fila na hora — hoje `slot-filler` grava `campaign_messages` para o cron de 12 UTC, ou seja o aviso de "vaga liberou" pode sair 24h depois.
- Autonomia: `salons.ai_retention_enabled` só o super-admin liga (`apps/web/app/actions/admin/users.ts:576`), `recoveryFlows.isActive` não tem toggle na tela, e `/marketing` **não está na sidebar** (`apps/web/components/dashboard/sidebar.tsx:54-74`).

**Destrava.** O CRM passa a trabalhar sozinho e de forma auditável: lembrete → confirmação → conclusão → avaliação → reativação no ciclo do serviço.

---

## 4. Roadmap em ondas

| Onda | O que entrega | Mudanças de código/schema | Esforço | Destrava |
|---|---|---|---|---|
| **0 — Travas (não é CRM, é pré-requisito)** | Isolamento multi-tenant, lembrete que não descadastra, opt-out no público | `salonId`/membro nas 5 funções de `apps/web/app/actions/chats.ts:94, 219, 272, 303, 353`; reescrever os 3 counts de `dashboard.ts:57-79` em Drizzle e trocar a policy `authenticated_all_chats USING(true)` por `deny_all`; tirar "CANCELAR" do texto de `reminders.service.ts:101`; `isNull(customers.optedOutAt)` em `segmentation.service.ts:40` | P | Poder concentrar PII numa tela nova sem vazar cross-tenant |
| **1 — A ficha (a menor coisa que já parece CRM)** | `/contacts/[customerId]` lendo o que **já existe**: dados, tags, agendamentos por `client_id`, `customer_trinks_profile`, conversas; badge e toggle de opt-out; botão "Concluir/Não compareceu" no diálogo da agenda; STAFF lê | Nova rota + `getCustomerDetail`; `customer_notes`; `completed_at`/`price_charged`/`no_show`/soft cancel; `canReadCrm` em `permissions.service.ts` | M | O dono **vê** o cliente. E começa a acumular o fato a partir de hoje |
| **2 — Identidade e base** | Telefone canônico + backfill, `chats.customer_id`, merge, arquivar em vez de deletar, import de CSV com dedup e preview | Normalizador único; migration de backfill; action `mergeCustomers`; `customers.archived_at`; correção dos 3 joins `profiles.id`→`customers.id` | G | Import de base (bloqueia venda), LTV inteiro, chat mostrando nome |
| **3 — Métricas e público** | `crm_customer_metrics` por job; segmentação em **uma** SQL com critérios de salão (última visita, gasto/VIP, serviço consumido, tag, aniversário); lista de contatos paginada no servidor | Nova tabela + job; reescrita de `SegmentationService`; `limit`/cursor + índice `(salon_id, updated_at desc)` em `customers` | M | Campanha que acerta o alvo; ficha com número; tela que aguenta 5.000 contatos |
| **4 — Entrega governada** | Tabela `whatsapp_templates` + tela funcional; `template` e `chatId` nos 3 chamadores; guardião de saída (opt-out, quiet hours, cap agregado); outbound persistido em `messages` | `whatsapp_templates`; `canSendProactive`; `saveMessage` no proativo | G | Proativo legal na Cloud e educado no Evolution; a retenção que já existe passa a entregar |
| **5 — Automação por evento** | `automation-queue` + worker; lembrete D-1/D-0 com job cancelável; handler de CONFIRMAR/CANCELAR; pós-atendimento; aniversário; lista de espera viva | Fila + worker + emissão nos 3 chokepoints de `appointments.ts`; `customers.birth_date`; entrada da waiting list | G | CRM que trabalha sozinho, com idempotência por `jobId` |
| **6 — Relatórios (já vendidos)** | `/[salonId]/reports`: receita, ticket, retorno 30/60/90, no-show, receita por profissional/serviço, ROI de campanha; ligar `getCampaigns`/`getCampaignStats` | `crm_daily_metrics` + cron; gate por tier | M | Cumprir "Relatórios avançados" que o plano PRO de R$999 já promete (`apps/web/app/[salonId]/billing/page.tsx:40`) |

---

## 5. Decisões que você precisa tomar antes de codar

**1. Kanban de conversa ou funil de oportunidade separado?**
→ **Nem um nem outro agora: ciclo de vida do CLIENTE.** O Kanban atual é inbox e não pode virar funil — `unique(salon_id, client_phone)` em `chats` (`schema.ts:441`) + reaproveitamento do chat ativo (`chat.service.ts:148`) garantem 1 telefone = 1 cartão eterno; contar entradas/ganhos do mês é matematicamente impossível. Mas salão não é venda B2B com deals: use `customers.lifecycle_stage` **derivado** de fatos (lead → 1ª visita → recorrente → em risco → perdido), não um segundo board para arrastar à mão. Deixe `opportunities` para quando existir pacote/noiva/orçamento.

**2. Segmentação: query salva ou lista materializada?**
→ **Query salva, reavaliada no disparo.** A decisão certa já está no código (`campaigns.segmentation_criteria` jsonb em `schema.ts:605`, reavaliado em `campaign-sender.service.ts:49-57`, materializando o resultado em `campaign_messages`). Materializar antes envelhece o público e reintroduz o risco de mandar para quem já pediu opt-out. Só guarde o `count` apurado no momento do disparo, para auditoria. **Não** use `campaign_recipients`.

**3. Automação: evento ou cron?**
→ **Híbrido, com regra clara.** BullMQ com `delay` para tudo que tem hora certa (lembrete, pós-atendimento, vaga liberada). Cron **só** para varredura por natureza (aniversário do dia, inatividade) — e cron **apenas enfileira**, nunca envia. Motivo: em serverless o `fire-and-forget` de `appointments.ts:604, 615` morre com a função.

**4. Onde mora o cálculo de LTV?**
→ **Tabela agregada + job**, nunca on-demand na lista. `crm_customer_metrics` por cliente e `crm_daily_metrics` por salão/dia. Não use materialized view (não existe nenhuma no repo, logo não há rotina de REFRESH nem monitoramento). Drill-down = **uma** SQL parametrizada no molde de `DrizzleRetentionRepository.ts:55-115`. E agrupe por `(date at time zone 'America/Sao_Paulo')::date` — `appointments.date` é timestamp sem timezone guardando UTC.

**5. Trinks é fonte da verdade ou espelho?**
→ **Espelho.** A fonte passa a ser `appointments` locais; `customer_trinks_profile` vira mais um alimentador. Hoje em prod são 25 linhas, **25/25 com `trinks_not_found=true`** e `total_spent` 0,00 — porque o cron só **enriquece** quem já está no banco (`apps/web/app/api/cron/trinks-sync/route.ts:47-62`, `limit(500)`), nunca importa.

**6. As quatro unidades Spettacolo: cliente por salão ou por rede?** (decida antes do merge e do import)
→ Em prod são **quatro** salões Spettacolo (110 dos 180 clientes) e **5 pessoas já existem em 2+ unidades, 1 em três**. Recomendação em dois tempos: (a) **agora**, tornar o opt-out **global por telefone** — hoje `customers` é por salão, então um "PARAR" numa unidade não vale na outra, o que é risco LGPD e de banimento direto; (b) **depois**, `person_id` cross-salão para consolidar ficha e LTV de rede. Não quebre o `unique(salon_id, phone)`.

**7. Excluir ou arquivar contato?**
→ **Arquivar.** O delete físico já falha por FK quando há histórico. Delete real só via caminho de anonimização (LGPD), preservando agregados.

**8. O checkbox `include_ai_coupon`: mantém?**
→ **Desligue o texto até existir cupom.** Ele hoje autoriza a IA a insinuar "uma condição especial" (`GenerateReengagementMessageUseCase.ts:55-57`) que o sistema não sabe emitir, validar nem honrar no caixa — zero ocorrências de cupom/voucher no schema. Mesma decisão para `aiSkipOptOutFooter` (`:60-64`), que remove a única salvaguarda que funciona e não tem gate de super-admin.

---

## 6. Armadilhas deste codebase

| Armadilha | Prova | Qual feature de CRM ela morde |
|---|---|---|
| Worker roda via `tsx` e **não resolve o alias `@/`** | `apps/web/package.json:12`; regra documentada em `proactive.ts:10-12` | O job de `crm_customer_metrics` e o `automation.worker`. Um `@/lib/...` passa no `tsc` e quebra só em runtime, em produção |
| `"use server"` não re-exporta tipo (Turbopack) | todos os `apps/web/app/actions/*.ts` | `CustomerDetail`/`CustomerTimelineEvent` da ficha: declarar em `lib/types/*`, senão `ReferenceError` no SSR |
| Três sistemas de migration e numeração colidida (dois `012_`, dois `020_`) | `supabase/migrations` + `packages/db/drizzle/meta` + `_archive` + `drizzle-kit push` | Foi assim que o `ON DELETE CASCADE` do 012_v2 sumiu. `schema.ts` **não é** a verdade do banco — confirme em `pg_constraint`/`pg_policies` depois de cada deploy de `birth_date`, `price_charged`, `lifecycle_stage` |
| Drizzle roda com `bypassrls`: RLS **não** protege as actions | as 5 funções de `chats.ts` provam | A ficha concentra telefone + histórico + mídia com URL assinada de TTL 24h (`apps/web/lib/supabase/storage.ts:15`). Se copiar o padrão de `chats.ts`, nasce com IDOR sobre o dado mais sensível do produto |
| Tabelas híbridas com `USING(true)` para `authenticated` | `pg_policies` prod: `authenticated_all_chats`, idem `salons`, `professionals`, `availability`, `schedule_overrides` | A timeline vai ler `chats`. Se qualquer leitura nova passar pelo client Supabase (como `dashboard.ts:57-79` faz) em vez de Drizzle, vaza cross-tenant via PostgREST |
| RTT transcontinental: banco em us-west-2 e `vercel.json` sem `regions` | `vercel.json` (35 linhas, só build/crons) | Ficha junta 4-6 fontes; segmentação faz 2-3 queries **por cliente** num `for` e o preview reexecuta a cada tecla. Alinhe a região antes de somar relatórios ao painel |
| Três formatos de telefone convivendo (com `55`, sem `55`, com `+`) | `chat.service.ts:24` vs `phone.utils.ts:55`; 52 linhas com `+` vindas dos seeds | Import de CSV, merge e casamento chat↔contato. Importar antes de canonizar duplica a base de uma vez |
| Deletes destrutivos feitos **pelo código**, não por FK | `professionals.ts:257`, `service.repository.ts:180-184`, `appointments.ts:609` | LTV e receita retroativa somem quando um funcionário sai ou um serviço é removido — e sem auditoria |
| Cultura de falha silenciosa | tool engolida (`generate-response.service.ts:684`), 404 virando lista vazia (whatsapp-templates), erro de envio engolido por mensagem (`marketing-dispatcher.service.ts:233-241`) | Automação de CRM que quebrar não avisa ninguém. É literalmente o que já acontece: "não tenho cliente inativo" |
| Dados de seed dentro do banco de produção | 6 salões demo, 52 clientes `+55...` | Qualquer agregado global, o job de dedup, o import e todo relatório que o PRO promete |
| `jobId` do BullMQ não aceita `:` | documentado em `apps/web/lib/queues/trinks-sync-queue.ts:10-12` | A idempotência da automação (`reminder_<appointmentId>_<rung>`, com `_`) |
| `chats.status='completed'` é uma armadilha ativa | `findOrCreateChat` busca só `status='active'` (`chat.service.ts:174-185`) | Se alguém implementar "Finalizar conversa" ingenuamente, o inbound daquele telefone **passa a falhar** — o insert cai no `onConflictDoNothing` do unique e a re-busca não acha nada |

---

## 7. O que NÃO fazer agora

- **Funil de oportunidades com valor e forecast.** Exige entidade nova, histórico de estágio e semântica ganho/perdido — e o dono de salão não vive de pipeline, vive de cadeira ocupada. Volte a isso quando existir pacote/noiva/orçamento.
- **Pacotes pré-pagos, clube de assinatura, pontos e indicação.** São os produtos mais vendidos do setor e vão fazer falta, mas **todos** dependem de "atendimento realizado com valor". Construir antes da Peça 1 é construir sobre o vazio.
- **NPS/avaliação.** Bloqueado a montante: sem `'completed'` não existe momento de pós-atendimento para perguntar.
- **Portal do cliente final.** Não existe rota pública hoje e é um produto inteiro (autenticação, remarcação, consentimento). O canal continua sendo o WhatsApp que você já domina.
- **E-mail como canal.** `customers.email` existe e não há **nenhum** caminho de envio. Adicionar um canal antes de governar o que já sai é multiplicar o problema.
- **Refatorar ou reviver `leads` e `campaign_recipients`.** Zero linhas em prod, zero leitores. Enterre: `lifecycle_stage` em `customers` cobre o caso, e `campaign_messages` já é o público materializado.
- **Importar a base do Trinks.** Só depois do telefone canônico e do merge — hoje colidiria com tudo que o WhatsApp já criou.
- **Relatórios do plano PRO.** Antes das Peças 1 e 3 eles só podem mostrar estimativa por `services.price`, com ~30% do catálogo sem número confiável. Relatório errado destrói a confiança mais rápido do que relatório ausente.
- **Materialized view para métricas.** Não há nenhuma no repo, logo não há cultura de REFRESH nem monitoramento. Tabela agregada + cron é mais barato de operar aqui.
- **Mexer no board de Kanban.** Ele funciona bem como inbox. O único ajuste que vale é o guard de `apps/web/app/actions/kanban.ts:279`, que só bloqueia `isDefault` — hoje o dono pode apagar "Concluídas" e a classificação por IA passa a falhar em silêncio.

---

## Anexo — capacidades de CRM de salão que hoje não existem em lugar nenhum

Verificado por ausência total no `packages/db/src/schema.ts`:

1. **Pacotes/sessões pré-pagas e saldo** — o produto mais vendido do setor ("10 sessões de escova", pacote de noiva). Sem entidade, sem saldo, sem consumo por atendimento.
2. **Clube/assinatura do cliente final** — `payments` é do assinante SaaS via Stripe (`webhook/stripe/route.ts:137`), não do cliente do salão.
3. **Programa de pontos** — zero. Depende da Peça 1.
4. **Indicação / member-get-member** — zero, e `customers` não tem `source` nem "indicado por".
5. **Anamnese com assinatura** — zero. Hoje alergia é texto livre no `preferences` jsonb, sem versão, data, autor ou valor probatório.
6. **Avaliação / NPS** — zero coluna. Bloqueado pela Peça 1.
7. **Google Calendar como fonte de clientes — pior que ausente:** todo appointment vindo do Google aponta para **um cliente placeholder** por salão (`appointments.ts:672-684`, `isSystem: true`), excluído de contatos e de segmentação. Quem opera pelo Google não constrói base.
8. **Multi-unidade** — quatro salões Spettacolo em prod, 5 pessoas em 2+ unidades. Ficha, LTV e **opt-out** são todos por salão.
9. **WhatsApp compartilhado entre recepcionistas** — `chats` não tem responsável (o "Atendente" é a string literal `'IA Assistente'`, `chats.ts:195`), `messages` não tem autor (envio manual e eco da Coexistência entram ambos como `'assistant'`), "Finalizar"/"Bloquear" são stubs com toast falso, e STAFF não acessa contatos.
10. **"Quem atendeu de fato"** — `appointments.professionalId` é quem foi *agendado*. Sem isso, comissão e receita por profissional ficam inviáveis mesmo depois de existir valor.

> Nota de fato: **não há Twilio no working tree** — as únicas ocorrências são `packages/db/drizzle/_archive/0028_remove_twilio_fields.sql` e `supabase/migrations/008_add_agents_whatsapp_columns.sql`. Sem rota `/api/webhook/twilio`, sem provider, sem coluna.
