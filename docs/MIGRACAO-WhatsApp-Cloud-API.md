# Migração Evolution → WhatsApp Cloud API — Plano de execução (otimizado p/ prod ASAP)

> **Meta:** colocar o **fluxo reativo** (cliente → bot) do Spettacolo rodando no canal **oficial da Meta** o mais rápido possível, sem reescrever o pipeline (fila/worker/IA ficam intactos) e sem fechar portas para o SaaS.
>
> **Decisão:** **direto na Meta Cloud API** (sem BSP). Token permanente via System User. App Review/Tech Provider só na fase multi-tenant.
>
> **Como ler:** este doc é ordenado por **execução**. Blocos **A** (espera/Meta) e **B** (código) rodam **em paralelo**. **C** integra e prova num número de teste. **D** é o go-live. **E** é pós-prod.

> **PROGRESSO (atualizado):**
> - ✅ **A1** IDs (`PHONE_NUMBER_ID=1155888540940947`, `WABA_ID=1167751138868532`, número de teste +1 555 634 9014)
> - ✅ Envio provado via curl (template + texto livre na janela 24h)
> - ✅ **A4** token permanente (validado, quality GREEN) · ✅ **A5** App Secret + verify token  *(rotacionar antes do D — expostos no chat)*
> - ✅ **B1** interface `MessageProvider` + `EvolutionProvider` (additive, 0 mudança de comportamento)
> - ✅ **B3** `CloudProvider` (envio + mapa de erros) · ✅ **B4** webhook `/cloud` (handshake + assinatura + inbound + status + eco) — *typecheck do projeto: 0 erros*
> - ✅ **Wiring do worker** — job `provider`/`phoneNumberId` + `message-processor` roteando os 9 envios pelo provider do job (watchdog/escada `status:0` só p/ Evolution). *typecheck 0 erros; 0 `sendWhatsAppMessage` restante no worker.* Loop fechado: webhook Cloud → fila → IA → reply via Cloud → status.
> - ✅ **TESTE REATIVO PASSOU (22/jun/2026)** no número de teste +1 555 634 9014 — deployado em prod (main: feat d996480 + hotfix 0993f87 dos imports relativos). Hosting: web/webhook na **Vercel**, worker na **Railway**; env nos dois. Ciclo completo: cliente → webhook → fila → worker → bot responde pela Cloud API → entregue.
> - ⚠️ **FAZER AGORA: rotacionar** o token permanente + App Secret (ficaram expostos no chat).
> - ⬜ pendentes de espera (não bloqueiam o teste): **A2** verificação CNPJ · **A6** template lembrete · **A7** nº Spettacolo no app Business ≥7 dias
> - ⬜ depois do teste OK: **B8** trocar o shim `WHATSAPP_PILOT_AGENT_ID` pela coluna `agents.whatsapp_phone_number_id` · **B6** download de mídia Cloud · **B7** handoff `smb_message_echoes`

---

## ⚠️ A correção que economiza seu tempo (leia antes de tudo)

A ideia de "Evolution e Cloud em paralelo **no mesmo número** com feature flag" **não funciona como parallel run**. Motivo: o roteamento de **inbound** é físico — preso à conexão do número. Hoje o número do Spettacolo está conectado via Evolution/Baileys (dispositivo vinculado). Ao ligar o Cloud API (Coexistence) **no mesmo número**, a mensagem passa a ser espelhada para o Cloud **e** ainda chega no Baileys → **entrega dupla/tripla e respostas duplicadas**.

**Consequências práticas (definem a ordem):**
1. O **feature flag por salão** continua valioso — mas para rodar **salões diferentes** em provedores diferentes (Spettacolo no Cloud, futuros salões no Cloud, legado no Evolution) e para **rollback**. Não para dois provedores no mesmo número ao mesmo tempo.
2. Para **provar** a integração sem risco, use o **número de teste grátis da Meta** (Bloco C). Não toca no salão.
3. O Spettacolo é um **cutover** (Bloco D), não um parallel run: ao ligar o Cloud, **desconecta-se o Evolution daquele número**. Rollback = religar o Evolution + flag de volta.

Isso é o que evita você "ligar tudo junto" e ver mensagem duplicada em produção no primeiro dia.

---

## Visão de tempo (o que disparar AGORA porque tem espera)

| Tem lead time (dispare já, roda sozinho) | Tempo típico |
|---|---|
| Verificação de negócio Meta (CNPJ) | 10 min – 2 dias úteis |
| Aprovação do **nome de exibição** do número | minutos – 1 dia |
| Aprovação do **template de lembrete** (UTILITY) | minutos – horas |
| Migrar o número do Spettacolo p/ **app WhatsApp Business** (se hoje for o WhatsApp comum) + ≥7 dias de uso | **dias** se precisar |

> **Faça o Bloco A no minuto 1.** O Bloco B (código) leva mais tempo que essas esperas — então, bem orquestrado, as esperas terminam antes do código.

---

# BLOCO A — Disparar agora (Meta, em paralelo ao código)

**A1. Criar conta e app** — https://business.facebook.com e https://developers.facebook.com
- [ ] Meta Business Portfolio com seu **CNPJ**.
- [ ] *Criar app* → tipo **Business** → adicionar produto **WhatsApp**.
- [ ] Anotar (tela *WhatsApp → Configuração da API*): **`PHONE_NUMBER_ID`** (do número de **teste** grátis que a Meta cria), **`WABA_ID`**, token temporário.
- [ ] Adicionar seu próprio celular como **destinatário de teste**.

**A2. Verificação de negócio** (assíncrona — não bloqueia o código)
- [ ] *Configurações do Negócio → Verificação* → enviar **Cartão CNPJ** (ou Certificado MEI). Sem verificação dá p/ testar até 250 contatos/24h; verificação destrava escala.

**A3. Cobrança**
- [ ] Adicionar cartão de crédito na linha de cobrança do WhatsApp (você paga a Meta direto, sem markup).

**A4. Token permanente (System User)** — *produção exige*
- [ ] *Configurações do Negócio → Usuários do sistema* → criar Admin → **atribuir o App e a WABA** → **gerar token** com escopos **`whatsapp_business_messaging`** + **`whatsapp_business_management`**. Não expira. Guardar em segredo.

**A5. App secret + verify token** (p/ webhook)
- [ ] Copiar **`App Secret`** (*Config do app → Básico*) e definir um **`VERIFY_TOKEN`** secreto.

**A6. Template de lembrete (UTILITY)** — dispare a aprovação cedo
- [ ] WhatsApp Manager → *Modelos* → criar `lembrete_agendamento` (UTILITY, `pt_BR`, variáveis nome/serviço/data-hora). Aprova rápido e precisa estar pronto **antes do cutover** (senão o cron de lembrete quebra no Cloud).

**A7. Pré-checagem do número do Spettacolo** (pode ter lead time)
- [ ] Confirmar que o número está no **app WhatsApp Business ≥ 2.24.17** (não no WhatsApp comum). Se estiver no comum → **migrar para o Business app** (gratuito, mantém histórico) e deixar **≥7 dias** de uso. **Brasil é suportado** no Coexistence.
- [ ] Como hoje ele está na Evolution (Baileys, que **não** é Cloud API), **não** há WABA pré-existente a deletar — ok.

**A8. Variáveis de ambiente novas** (as `EVOLUTION_*` permanecem)
```env
WHATSAPP_GRAPH_VERSION=v21.0            # estável citada em 2026; endpoints toleram versão — use a default do painel
WHATSAPP_CLOUD_TOKEN=EAAG...            # token permanente (A4)
WHATSAPP_PHONE_NUMBER_ID=...            # número de TESTE no Bloco C; troca p/ o do Spettacolo no Bloco D
WHATSAPP_WABA_ID=...
WHATSAPP_APP_SECRET=...                 # (A5) valida X-Hub-Signature-256
WHATSAPP_WEBHOOK_VERIFY_TOKEN=...       # (A5) handshake GET
```

---

# BLOCO B — Código (em paralelo ao Bloco A; não espera nada da Meta)

> Princípio: **nada de comportamento muda em prod** até o Bloco D. Aqui você só adiciona o provider Cloud ao lado do Evolution.

**B1. Interface `MessageProvider`** — `apps/web/lib/services/messaging/provider.ts`
```ts
export interface OutboundResult { messageId: string }
export interface SendTextArgs { to: string; body: string; salonId: string; agentId?: string }
export interface SendMediaArgs extends SendTextArgs { mediaUrl: string; mediaType:'image'|'audio'|'video'|'document'; caption?: string; fileName?: string }
export interface MessageProvider {
  readonly kind: 'evolution' | 'cloud';
  sendText(a: SendTextArgs): Promise<OutboundResult>;
  sendMedia(a: SendMediaArgs): Promise<OutboundResult>;
  sendTyping?(to: string, salonId: string, ms: number, lastInboundWamid?: string, agentId?: string): Promise<void>;
  downloadMedia(ref: unknown): Promise<{ base64: string; mimetype: string } | null>;
}
```

**B2. Embrulhar a Evolution** como `EvolutionProvider` (mover a lógica de `evolution-message.service.ts`, **sem mudar nada**). Manter `sendWhatsAppMessage` fino delegando via `getProviderForSalon`. Cobre todos os 14+ call sites (message-processor, delivery-retry, crons reminders/marketing, campaign-sender, actions/chats:329, admin debug).

**B3. `CloudProvider.sendText/sendMedia`** — `apps/web/lib/services/messaging/cloud/cloud-provider.ts`
```ts
// POST https://graph.facebook.com/{VER}/{PHONE_NUMBER_ID}/messages  (Bearer {token})
{ messaging_product:'whatsapp', recipient_type:'individual', to: digitsOnly(to), type:'text',
  text:{ preview_url:false, body } }
// resposta: { messages:[{ id:'wamid...' }] }  -> messageId
// mídia: type:'image'|'audio'|'document', image:{ link, caption } (ou {id} se upload via /media)
```
- Erro vem **síncrono** no `!r.ok` (não há `status:0`). `mapMetaError`: `131047` (fora da janela 24h→precisa template), `131026`/template → **não-retryable**; `130429`/transient → retryable. Reusar `WhatsAppMessageError`.

**B4. Webhook Cloud (rota NOVA, separada)** — `apps/web/app/api/webhook/whatsapp/cloud/route.ts`
- `GET`: handshake — se `hub.verify_token` == env, responde `hub.challenge` (200).
- `POST`: validar **`X-Hub-Signature-256`** (HMAC-SHA256 do corpo cru com `WHATSAPP_APP_SECRET`) **antes** de parsear.
- Tenant = `entry[].changes[].value.metadata.phone_number_id` (substitui `instance`).
- Inbound: `value.messages[0]` → `from` (E.164 real, **sem LID**) = `clientPhone`; `id` = `wamid`; `text.body`/`image.caption` = conteúdo; `contacts[0].profile.name`; `timestamp`.
- **Reusar tudo**: dedup, rate-limit, `findOrCreateChat/Customer`, `saveMessage`, `enqueueMessage`. Apaga as ~55 linhas de resolução de LID.

**B5. Status de entrega** (mesma rota, quando `value.statuses` presente) — **aqui simplifica**
- `sent|delivered|read` → `messages.deliveryStatus='delivered'` por `providerMessageId`.
- `failed` → `'failed'` + logar `errors[].code`. **Sem escada de reenvio/restart** (não há sessão a curar). No caminho Cloud, `delivery-retry`/`triggerSessionRecovery`/watchdog ficam **desligados** (mas vivos p/ Evolution até o Bloco E).

**B6. Mídia inbound** (2 passos) — em `media-processor.service.ts`
```ts
const meta = await GET(`${BASE}/${mediaId}`, Bearer);   // -> meta.url
const bin  = await GET(meta.url, Bearer);               // baixar COM Bearer
const base64 = Buffer.from(await bin.arrayBuffer()).toString('base64');
```

**B7. 🔴 Handoff humano via `smb_message_echoes`** (Coexistence — cuidado NOVO)
- Quando o **dono responde pelo celular**, chega um *echo* (`from_me`) no webhook. Tratar: **pausar a IA naquele chat** (modo manual), igual ao manual atual. Sem isso, IA + humano respondem em paralelo. Assinar os campos `smb_message_echoes` e `smb_app_state_sync` no Bloco D.

**B8. Flag + job shape**
- Migration (backup antes — migrations do projeto são bagunçadas): `agents.messaging_provider text NOT NULL DEFAULT 'evolution'`, `agents.whatsapp_phone_number_id text`, `agents.whatsapp_waba_id text`. Colunas `evolution_*` permanecem.
- `MessageJobData`: tornar Evolution-fields opcionais + adicionar `provider:'evolution'|'cloud'` e `phoneNumberId?`. Worker decide envio pelo `provider`; no Cloud, `sendTo = clientPhone`.
- `getProviderForSalon(salonId, agentId)` lê a flag.

**B9. Lembrete via template + janela 24h**
- Helper `isWithin24hWindow(chatId)` (olha última msg **recebida** do cliente). Dentro → texto livre (grátis); fora → template.
- `cron/reminders` → `sendTemplate('lembrete_agendamento', …)`. (Marketing fica p/ Bloco E.)
- **Throughput Coexistence = 5 mps**: limitar o ritmo de envio em massa a isso.

---

# BLOCO C — Integrar e PROVAR no número de teste (sem tocar no salão)

Precisa de: A1, A4, A5 + Bloco B deployado.

- [ ] **C1** Deploy da rota `/api/webhook/whatsapp/cloud`. No painel Meta (*WhatsApp → Configuração → Webhook*): URL + `VERIFY_TOKEN` → passar o GET. Assinar **`messages`** (+ `message_template_status_update`).
- [ ] **C2** Smoke test de envio (curl, número de teste):
```bash
curl -X POST "https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages" \
 -H "Authorization: Bearer ${WHATSAPP_CLOUD_TOKEN}" -H "Content-Type: application/json" \
 -d '{ "messaging_product":"whatsapp","to":"55SEU_NUMERO","type":"text","text":{"body":"Teste ✅"} }'
```
- [ ] **C3** Ponta a ponta: do seu celular, mandar msg p/ o número de teste → confirmar webhook chega → job enfileira → IA responde → status `delivered` volta.
- [ ] **C4** Validar: mídia (enviar foto), status `read`, e o **handoff** (responder algo manualmente e ver o echo pausar a IA — se já houver app no número de teste).

> ✅ Critério: pipeline 100% no número de teste, sem `status:0`, com `delivered`. Só então toca no Spettacolo.

---

# BLOCO D — GO LIVE: cutover do Spettacolo

Precisa de: **A2** (verificação ok ou dentro do limite de 250), **A6** (template aprovado), **A7** (número no Business app), **C** provado.

- [ ] **D1** Onboardar o número do Spettacolo via **Coexistence** (no painel/Embedded Signup: conectar app Business existente → QR + código → autorizar histórico até 6 meses). Pegar o **`PHONE_NUMBER_ID` real**.
- [ ] **D2** Webhook do número real (mesma rota `/cloud`) + **assinar `messages`, `smb_message_echoes`, `smb_app_state_sync`**.
- [ ] **D3** 🔴 **Desconectar o Evolution desse número** (logout/disconnect da instância/Baileys) para eliminar entrega dupla. *(Este é o ponto de corte real.)*
- [ ] **D4** `UPDATE agents SET messaging_provider='cloud', whatsapp_phone_number_id='<real>' WHERE id='<agente Spettacolo>';` e setar `WHATSAPP_PHONE_NUMBER_ID` se usado por env.
- [ ] **D5** Teste real com o seu celular → confirmar inbound→IA→resposta→`delivered`. Mandar 1 lembrete (template) e ver entregar.
- [ ] **D6** Monitorar 1–2 semanas: taxa `delivered/read` vs `failed`, latência, custo no painel, **quality rating** verde, e que o handoff pausa a IA.

**Rollback (instantâneo):** `messaging_provider='evolution'` + **religar o Evolution** (re-scan QR) no número. Volta ao estado atual.

**Critério de sucesso:** ≥99% reativo entregue sem `status:0`; lembrete UTILITY entregue; quality verde por 7 dias.

---

# BLOCO E — Pós-prod (NÃO bloqueia o go-live)

- **E1 — Marketing + CTWA:** templates MARKETING + opt-out; gravar `messages[0].referral`/`ctwa_clid` p/ atribuição; janela grátis de 72h via Click-to-WhatsApp.
- **E2 — Saneamento de LID:** **só importa p/ proativo**. O reativo **se auto-corrige** (o próximo inbound traz o `from` real). Lembretes usam o número do **agendamento** (já real), não o `chats.client_phone`. Então **não bloqueia prod**; limpar depois.
- **E3 — SaaS multi-tenant:** **Embedded Signup** no painel (callback grava `phone_number_id`/`waba_id` por salão) + **App Review** (`whatsapp_business_messaging`+`management`) + **Tech Provider** (obrigatório p/ ISV, ~3–4 sem, 200 clientes/7 dias após verificação). **O código de envio/webhook/templates não muda** — só a origem do `phone_number_id`. É o que o `getProviderForSalon` já resolve.
- **E4 — Desligar Evolution:** quando todos os salões estiverem no Cloud, remover `evolution-*.service`, rota webhook Evolution, delivery-retry/restart, LID mapping, telas de QR, colunas `evolution_*`, env `EVOLUTION_*`.

---

## Caminho crítico (a sequência mais curta até prod)

```
A1 → A4 ─┐
         ├─→ C1 → C2 → C3 ──┐
   (B1…B8 em paralelo) ─────┘ (prova no número de teste)
A2 (verif) ─┐
A6 (template) ┤
A7 (Business app ≥7d) ┘ ──→ D1 → D2 → D3 → D4 → D5 → D6  ✅ PROD
```
- **Bloqueadores reais do go-live:** A2 (ou aceitar limite 250), A6 (template p/ lembrete), A7 (número no Business app há ≥7 dias), e C provado.
- **Não bloqueiam:** marketing (E1), LID (E2), Embedded Signup/App Review/Tech Provider (E3).

---

## Apêndice — Tradução de conceitos & fatos jun/2026

**Conceitos:** `instanceName`→`phone_number_id` · QR/scan→Coexistence/Embedded Signup · `remoteJid`/`@lid`/`replyToJid`→`from` (E.164) · `key.id`→`wamid` · `status:0`→webhook `failed` síncrono · restart de sessão→não existe · `getBase64FromMediaMessage`→media id + download Bearer · texto livre proativo→template HSM + janela 24h.

**Fatos confirmados jun/2026:**
- On-Premises descontinuada (out/2025) → **Cloud API é a única opção**.
- Graph API **v21.0** citada como estável; endpoints toleram versão.
- **Typing indicator:** `POST /{id}/messages` com `{status:'read', message_id, typing_indicator:{type:'text'}}`; some ao responder ou após ~25s. Só mostrar se vai responder.
- **Coexistence:** throughput **5 mps**; webhooks **`smb_message_echoes`** (eco do dono pelo celular → pausar IA) + **`smb_app_state_sync`**; Brasil suportado; precisa do **WhatsApp Business app ≥2.24.17**, número usado ≥7 dias.
- **Preço:** service (dentro de 24h) grátis/ilimitado; utility na janela grátis; marketing pago; **nova categoria p/ conversas iniciadas por IA** (preço TBA, esperado < marketing); cobrança em moeda local chegando em 2026; max-price bidding p/ marketing em 2026.
- **Tech Provider:** obrigatório p/ ISV (prazo 31/dez/2025), Embedded Signup exigido, ~3–4 sem, 200 clientes/7 dias após verificação.

**Fontes:** Meta — [Typing indicators](https://developers.facebook.com/documentation/business-messaging/whatsapp/typing-indicators/), [Mark as read](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/mark-message-as-read), [Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers), [Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing), [Changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog) · Coexistence: [ChakraHQ](https://chakrahq.com/article/issues-whatsapp-coexistence-onboarding-setup/), [YCloud](https://www.ycloud.com/blog/whatsapp-business-app-coexistence-meta-update) · Pricing 2026: [respond.io](https://respond.io/blog/whatsapp-business-api-pricing), [Chatarmin](https://chatarmin.com/en/blog/whats-app-api-pricing).
