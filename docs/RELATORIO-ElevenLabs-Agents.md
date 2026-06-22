# RELATÓRIO TÉCNICO FINAL: Plataforma de Agentes Conversacionais da ElevenLabs (ElevenAgents / Conversational AI)

**Propósito:** dissecar a engenharia da plataforma de Agentes da ElevenLabs e extrair padrões aplicáveis a um SaaS próprio de atendimento corporativo em Clean Architecture + Node.js + TypeScript.

**Convenção de marcação:**
- **[doc]** — Fato documentado (confirmado em fonte oficial / verificação adversarial com verdict `confirmed` ou `documented`).
- **[inf]** — Inferência de engenharia reversa (plausível, não comprovada em doc).
- **[corr]** — Afirmação corrigida pela verificação adversarial (`refuted` / `partially_confirmed`); usa-se a `corrected_claim`.

---

## PILAR 1 — FUNCIONALIDADES E UX

### 1.1 Anatomia do builder (abas)

O builder (em `elevenlabs.io/app/agents`) segmenta a configuração em abas, e essa segmentação é o principal "atalho mental" da ferramenta: cada decisão complexa fica isolada num bloco digerível. **[doc]**

| Aba | Responsabilidade | Campos-chave |
|-----|------------------|--------------|
| **Agent** | Comportamento e cérebro | First message, System prompt, LLM, idioma + idiomas adicionais, Tools, Knowledge Base/RAG |
| **Voice** | Identidade sonora | Voz, modelo TTS, stability/speed/similarity, dicionários de pronúncia, Expressive mode, normalização (ícone de engrenagem na seção Voices) |
| **Analysis** | Pós-chamada | Success Evaluation (critérios), Data Collection |
| **Security** | Superfície de risco | Overrides (por campo), Guardrails 2.0, autenticação/allowlist |
| **Advanced** | Temporização e privacidade | Turn-taking, turn_timeout, soft timeout, client events/interrupções, max_duration, retention/privacy |
| **Widget** | Embed visual no-code | Orb/cores/CTA/variantes/modos |
| **Tests / Versioning** | QA e release | Cenários, simulação, drafts, rollout |

### 1.2 Latência — alavancas no painel

A latência é vendida como "sub-segundo" (sem número em ms na landing) e otimizada **primariamente pela escolha de LLM + modelo TTS**. **[doc]**

| Componente | Latência típica | Observação |
|-----------|-----------------|------------|
| TTS **Flash v2.5** | ~75 ms inferência (p50 first-chunk 75–150 ms) | 2–4× mais rápido que Turbo, 5–8× que Multilingual v2; 32 idiomas; recomendado p/ Agents **[doc]** |
| Scribe v2 Realtime (ASR) | ~150 ms | STT custom adiciona <100 ms vs ~300 ms+ do Whisper **[doc]** |
| LLM TTFT | variável (Gemini Flash <350 ms 1º token) | maior driver controlável após o TTS **[doc]** |
| Buffer do player | ~500 ms típico | redutível abaixo de 500 ms aceitando risco de stutter **[doc]** |
| Rede | 20–200 ms | proximidade geográfica **[doc]** |

> **[corr]** A normalização de texto fica **desativada por padrão no Flash v2.5** para manter latência; recomenda-se normalizar via instrução no LLM. **[corr]** O quickstart só exibe um **aviso textual genérico** de tradeoff qualidade×latência ("Using higher quality voices, models, and LLMs may increase response time...") — **não existe "medidor/preview de latência ao vivo" na UI do builder**; os números (Flash ~75 ms) vivem em páginas separadas.

### 1.3 Turn-taking, interrupção e fillers

| Recurso | Campo (API) | Faixa / default | Função |
|--------|-------------|-----------------|--------|
| Take turn after silence | `conversation_config.turn.turn_timeout` | 1–30 s, default ~7 s | Quanto o agente espera no silêncio antes de assumir o turno **[doc]** |
| Turn eagerness | `turn.turn_eagerness` | eager / normal / patient | Ansiedade para assumir o turno **[doc]** |
| Soft timeout (filler) | `turn.soft_timeout_config` | timeout_seconds 0.5–8.0 s (default off = -1; recomendado 3.0); `message` (≤200 chars); `use_llm_generated_message` (default false); `additional_soft_timeout_messages` (≤7); `max_soft_timeouts_per_generation` 1–8 | Toca áudio de preenchimento ("Hhmmmm...yeah.") usando ~4 mensagens / 1000 chars de contexto **[doc/corr]** |
| Turn model | `turn.turn_model` | `turn_v2` / `turn_v3` (default turn_v3) | Versão do modelo de detecção de turno **[corr]** |
| Interrupção (barge-in) | Client Event `interruption` | selecionável em Client Events (Advanced) | Desativar = agente completa mensagens sem ser cortado (info crítica) **[doc]** |
| Skip Turn | system tool | — | Agente pausa sem falar ("Give me a second") e aguarda input **[doc]** |

> **[corr] Distinção arquitetural crítica (correção adversarial):** o **Scribe v2 Realtime** é o modelo de **STT** que faz VAD/segmentação e fornece sinais (prosódia, cues emocionais). A **detecção de turno/end-of-speech** é feita por um **modelo de turn-taking dedicado (turn_v2/turn_v3)** que *consome* esses sinais. Não conflacionar os dois. O **Expressive Mode** (ativado por padrão ao escolher o TTS **Eleven v3 Conversational**) reúne duas atualizações: (a) o TTS v3 Conversational de baixa latência e (b) o novo turn-taking alimentado pelo Scribe v2 Realtime. **[corr-confirmed]**
>
> **[corr]** A doc **não expõe parâmetros granulares de VAD** (thresholds, janelas de no-interrupt, regras de transição de estado) — só `turn_timeout`, `turn_eagerness`, `turn_model` e `soft_timeout_config`.

### 1.4 Pronúncia, idioma e contexto

| Tópico | Detalhe |
|--------|---------|
| **Dicionários de pronúncia** | Regras `phoneme` (IPA ou CMU/Arpabet) **só** funcionam em `eleven_flash_v2` e `eleven_v3`; `alias` funciona em todos. Arquivos `.pls` XML (`<lexicon>/<lexeme>/<grapheme>/<phoneme>\|<alias>`). Config em `tts.pronunciation_dictionary_locators[]` (array de id+version). **[doc]** |
| **Idioma** | Primário em `agent.language` (novos agentes começam em inglês/Flash v2). Dropdown "Additional Languages"; opção **"All" = 31 idiomas**. Idiomas adicionais acionam Multilingual v2.5. `language_presets` permite first message localizado por idioma. **[doc]** |
| **Limite de System Prompt** | **2 MB** (inclui instruções + KB + contexto de sistema). **[corr-confirmed]** |
| **Duração de conversa** | `max_duration_seconds`, default **600 s** (10 min). **[corr-confirmed]** |
| **Janela de contexto/token** | Depende do modelo; consultável via `GET /v1/convai/llm/list` → `max_context_limit` (input) e `max_tokens_limit` (output). **[corr-confirmed]** |
| **ASR keyword boost** | Keyterm prompting do Scribe: realtime até **50 keyterms (20 chars)**, batch até 1000 (50 chars). **[doc]** |

### 1.5 Fluxo de criar um agente do zero (atalhos mentais)

1. **Nome + template "Blank"** (existem templates prontos, ex. suporte). Sem onboarding longo. **[doc]**
2. **Defaults inteligentes invisíveis** que removem decisões: credenciais internas da ElevenLabs para LLMs populares (sem API key do usuário), **LLM Cascading** (fallback automático, desencorajado desligar), normalização automática, cor do widget theme-aware, allowlist de domínio automática. **[doc]**
3. **Framework de 6 blocos** de prompt (ver Pilar 3) transforma "escrever um prompt" em "preencher seções".
4. **Botão "Test AI agent"** abre widget de conversa ao vivo dentro do editor → fecha o loop edição→teste sem deploy. **[doc]**

### 1.6 Micro-interações de alto valor percebido

| Micro-interação | Por que aumenta percepção de valor |
|-----------------|-----------------------------------|
| **"Test AI agent" inline** | Valor imediato sem deploy **[doc]** |
| **Embed de 2 linhas** (`<elevenlabs-convai>` + script unpkg) | Integração = colar 2 linhas no `<body>` **[doc]** |
| **Shareable landing page** pública | Demonstrar/validar o agente sem site nem código **[doc]** |
| **Testes probabilísticos** (N runs, dropdown 3×/5×/15×) | Pass rate com badges: **verde=100%, âmbar≥80%, vermelho<80%**; falhas agrupadas em **buckets** com transcript sob demanda → reduz carga cognitiva **[doc]** |
| **"Create test from this conversation"** | Converte produção real em caso de QA num clique, auto-preenchendo o contexto **[doc]** |
| **Simulation Testing (alpha)** | Usuário sintético controlado por IA, 1–50 turnos, **tool mocking**, avaliação custom; saída JSON (transcript + critérios + data collection + sumário) **[doc]** |
| **Versionamento estilo git** | Drafts isolados por usuário/branch; salvar = snapshot imutável com ID **[doc]** |
| **Rollout por % de tráfego** | Sliders que somam 100%; **roteamento determinístico por conversation ID** (mesmo usuário → mesmo branch); best practice 5–10%→25→50→100 **[doc]** |
| **Workflow builder com métricas sobre os nós** | Node Inspector: entradas, duração média, terminações, distribuição de arestas → design + observabilidade no mesmo canvas **[doc]** |
| **Dashboard com chamadas ativas em tempo real** | Indicador top-left; métricas toggláveis (nº chamadas, duração, custo); granularidade temporal automática; filtros multidimensionais (agente, branch, idioma, modelo LLM/TTS/ASR, tool, erro, critério) **[doc]** |
| **Tests em CI/CD** | `elevenlabs agents test <id>`; cada PR validado contra cenários (`repeat_count`) **[doc]** |

---

## PILAR 2 — ENGENHARIA REVERSA E STACK

### 2.1 Frontend do painel

| Camada | Tecnologia | Evidência |
|--------|-----------|-----------|
| Framework | **Next.js (App Router + RSC)** | Headers `X-Powered-By: Next.js`, `x-nextjs-cache/prerender`, `Vary: rsc, next-router-state-tree`, `<meta next-size-adjust>` **[doc]** |
| Bundler | webpack/**Turbopack** do Next, chunks content-hasheados | `/_next/static/chunks/<hash>.js` (102 scripts no app autenticado sob `/app_assets/_next/...`) **[doc/inf]** |
| Hospedagem | Google Cloud (us-central1), **não Vercel** | `Via: 1.1 google`, `x-region` **[doc]** |
| Observabilidade | **Sentry** | grep em chunks + CSP (`browser.sentry-cdn.com`, `*.sentry.io`) **[doc]** |
| Animação | **Motion (Framer Motion)** | grep em chunks **[doc]** |
| Analytics/Flags | **PostHog** | cookie `bootstrap_data` (distinctID, featureFlags) **[doc]** |
| Auth | **Firebase** | cookie `NEXT_PUBLIC_FIREBASE_API_KEY` **[doc]** |
| Billing | **Stripe** | CSP `js.stripe.com` **[doc]** |
| **Server state** | **TanStack Query (React Query v5)** | **[corr — REFUTADO o "não confirmado"]** `useQuery`/`queryKey`/`invalidateQueries` em hooks da app (`useSaveToFiles`, `useCreateResourceLocator`). SWR/tRPC = 0 hits |
| **Form state** | **react-hook-form + zod** | **[corr]** chunk com `appendErrors`/`useController`/`useFieldArray` (assinatura RHF) + `ZodError`/`safeParse`; `@hookform/resolvers` detectado; uso pontual de **zustand** |
| Design system | **shadcn/ui + Radix + Tailwind** (ElevenLabs UI, registry shadcn-compatível) | forte indício de reuso no painel interno **[doc]** |

### 2.2 Gestão do estado de configuração complexa

> **Padrão central:** a config de um agente é **UM objeto JSON único, profundamente aninhado e versionável**. **[doc]**

```
conversation_config
 ├─ agent.prompt   (prompt, llm, temperature, tool_ids, knowledge_base, rag, custom_llm)
 ├─ tts            (model_id, voice_id, stability/speed/similarity, pronunciation)
 ├─ asr            (quality, provider, audio_format, keywords)
 ├─ turn           (turn_timeout, turn_eagerness, turn_model, soft_timeout_config)
 └─ conversation   (max_duration, client_events, file upload)
+ language_presets, workflow, platform_settings, metadata, tags
```

O **CLI oficial** confirma o modelo **GitOps**: cada agente = arquivo JSON em `agent_configs/` + `agents.json` de registro (version IDs, branch IDs), **detecção de mudança por hash**, variantes por branch (`My-Agent.staging.json`), push/pull com `--dry-run`/`--update`/`--branch`. **[doc]**

**Sistema de overrides hierárquico** (precedência decrescente): eventos custom runtime (`elevenlabs-convai:call`) > troca dinâmica de modo (text-only) > atributos HTML > `override-config` > config do servidor > defaults built-in. **[doc]**

### 2.3 Comunicação de rede — WebSocket vs WebRTC vs SSE

| Transporte | Uso default | Como funciona | Latência/qualidade |
|-----------|-------------|---------------|--------------------|
| **WebRTC (via LiveKit)** | **Voz** | Endpoint `wss://livekit.rtc.elevenlabs.io/rtc/v1`; deps `livekit-client`/`@livekit/react-native-webrtc`; sinalização por WebSocket | Echo cancellation + supressão de ruído (testados em bilhões de chamadas); UDP/SRTP tolerante a perda **[doc/high]** |
| **WebSocket** | **Texto** + integrações server-side + telefonia | `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=...`; JSON + áudio base64 full-duplex sobre TCP | Confiável, simples de integrar em backend **[doc]** |
| **SSE / HTTP chunked** | Saída TTS quando texto já existe | Chunks progressivos unidirecionais (server→client) | Para scripts/resposta LLM já finalizada **[doc]** |

Seleção via `connectionType: 'webrtc' \| 'websocket'` no SDK. **[doc]**

**Protocolo de eventos WebSocket (JSON, campo `type`):**

| Direção | Eventos |
|---------|---------|
| Cliente→Servidor | `conversation_initiation_client_data` (dynamic_variables, overrides, custom_llm_extra_body), `user_audio_chunk` (PCM 16-bit/16 kHz base64), `user_message`, `contextual_update` (contexto sem interromper turno), `client_tool_result`, `pong`, `user_activity`, `user_feedback` **[doc]** |
| Servidor→Cliente | `conversation_initiation_metadata` (conversation_id, formatos), `user_transcript`, `agent_response`, `agent_response_correction`, `audio` (`audio_base_64` + `event_id` + `alignment`), `interruption`, `ping` (`ping_ms`), `vad_score` (0–1), `client_tool_call`, `mcp_tool_call` (loading/awaiting_approval/success/failure), `agent_chat_response_part`, `guardrail_triggered` **[doc]** |

**Keepalive:** `ping` (com `event_id`, `ping_ms`) ↔ `pong` (mesmo `event_id`). **Formatos de áudio:** entrada `pcm_16000`, saída `pcm_44100`; **`ulaw_8000`** para telefonia. **[doc]**

**Otimizações de latência de streaming:**
- **Streaming incremental:** TTS começa a gerar enquanto o LLM ainda produz tokens. **[doc]**
- **TTS WebSocket `stream-input`:** `chunk_length_schedule` default `[120,160,250,290]`, `auto_mode` (sintetiza sentença a sentença), `flush:true` (no fim do turno), EOS `{"text":""}`. **[doc]**
- **[corr]** `optimize_streaming_latency` (0–4) é parâmetro dos endpoints **HTTP/REST** de TTS (`/convert`, `/stream`), **não** do `stream-input` WebSocket atual (que usa `auto_mode`/`chunk_length_schedule`). Não há rótulo "Deprecated" formal na referência, e o uso interno de `auto_mode`/Flash pelos agentes é **[inf]** plausível mas não comprovável.

### 2.4 Arquitetura de integração / exposição ao mundo

**Endpoints — todos sob `api.elevenlabs.io/v1/convai/*` [corr-confirmed: DOCUMENTADO, não inferido]:**

| Endpoint | Método | Função |
|----------|--------|--------|
| `/conversation/get-signed-url` | GET | Signed URL WebSocket (expira **15 min**) |
| `/conversation/token` | GET | Conversation token WebRTC (params: participant_name, branch_id, environment) |
| `/twilio/outbound-call` | POST | Chamada outbound Twilio |
| `/sip-trunk/outbound-call` | POST | Chamada outbound SIP |
| `/batch-calling/submit` | POST | Batch outbound (recipients + dynamic vars + agendamento) |
| `wss://.../conversation` | WS | Canal tempo-real |

**Autenticação client-side (nunca expor `xi-api-key`):**

| Método | Transporte | Detalhe |
|--------|-----------|---------|
| **Signed URL** | WebSocket | server-side mint, expira 15 min, regional (us/eu/in/sg) **[doc]** |
| **Conversation token** | WebRTC | passado como `conversationToken` no SDK **[doc]** |
| **Allowlist de hostnames** | ambos | até 10 hostnames (match exato); **mutuamente exclusivo** com signed URL **[doc]** |

**Dois eixos de webhooks:**

| Eixo | Direção | Conteúdo / Segurança |
|------|---------|----------------------|
| **Server tools** | ElevenLabs → API do dev (HTTP, durante a conversa) | O agente chama webhooks como ferramentas (ver Pilar 3) |
| **Post-call webhooks** | ElevenLabs → endpoint do dev (HTTP, após a chamada) | 3 tipos: `post_call_transcription`, `post_call_audio` (base64 MP3 chunked), `call_initiation_failure`. Payload `{type, event_timestamp, data}`. Handler retorna **HTTP 200**. **Auth HMAC** no header `ElevenLabs-Signature` + helpers `constructEvent`/`construct_event`. **IPs fixos** por região para whitelist (US `34.67.146.145`/`34.59.11.47`, EU, Asia...). Desativado após 10+ falhas consecutivas se última entrega ≥7 dias **[doc]** |
| **Client tools** | ElevenLabs → cliente (sobre WebSocket) | Execução client-side via SDK |

**Canais omnichannel** (uma definição → múltiplos canais): **[doc]**
- **Web:** SDKs JS/React/Python + widget web component.
- **Telefonia:** Twilio nativo (importa SID/token; inbound+outbound), **SIP trunking** (`sip:identifier@sip.rtc.elevenlabs.io:5060`/5061 TLS; G711/G722; Digest ou ACL; headers SIP → `{{sip_header_name}}`), **batch calling**.
- **WhatsApp:** canal **nativo de primeira classe** (responde áudio com áudio por default; outbound via template message; `whatsapp_user_id`/`whatsapp_params` na API de batch).

**SDKs (monorepo `elevenlabs/packages`, pnpm + Turborepo + Changesets):** **[doc]**
- `@elevenlabs/client` — core agnóstico (lifecycle, áudio, device, classe Scribe STT).
- `@elevenlabs/react` — hook `useConversation`; v1.0 reestruturou em **`ConversationProvider` + hooks granulares** (`useConversationControls`, `useConversationStatus`, `useConversationInput`, `useConversationMode`, `useConversationClientTool`) para evitar re-render global.
- `@elevenlabs/react-native` — LiveKit RN direto.
- `convai-widget-core/embed` — **Preact + @preact/signals + Shadow DOM** (web component encapsulado, distinto do React SDK).
- `@elevenlabs/types` — tipos TS gerados de **AsyncAPI** como fonte única da verdade do protocolo.

---

## PILAR 3 — ORQUESTRAÇÃO DE IA E PROMPTS

### 3.1 Framework de System Prompt — 6 blocos canônicos

Ordem oficial: **Personality → Environment → Tone → Goal → Guardrails → Tools** (cabeçalhos markdown `#`, sentence case). **[doc]**

| Bloco | Classe | Definição | Recomendação de rigidez |
|-------|--------|-----------|-------------------------|
| **# Personality** | Identidade | Nome, traços, papel, background | **Firme/estático** |
| **# Environment** | Identidade | Canal e contexto situacional ("telefone, cliente frustrado") | Estático |
| **# Tone** | Comportamento | Estilo, ritmo, verbosidade, afirmações breves | **Flexível** (adaptar ao usuário) |
| **# Goal** | Comportamento | Objetivos; passos numerados em fluxo multi-etapa ("This step is important") | **Firme** |
| **# Guardrails** | Comportamento | Limites não-negociáveis (segurança, compliance, ética) — recebe atenção extra do modelo | **Firme** |
| **# Tools** | Comportamento | Capacidades externas: descrição de uso, parâmetros, tratamento de erro | — |

**Regras oficiais de formatação/altitude:** **[doc]**
- Headings markdown (`#`/`##`), bullets em vez de parágrafos densos, whitespace entre grupos.
- Separar seções "ajuda o modelo a priorizar e interpretar corretamente" e evita instruções contraditórias → refino isolado.
- Repetir 1–2 instruções críticas duas vezes.
- Prompts acima de **~2000 tokens** aumentam latência/custo → dividir em subagentes ou mover referência para a **Knowledge Base**.
- **Turn-taking e quais idiomas o agente fala são config de plataforma, NÃO regras dentro do system prompt.** First message e idioma também são campos de plataforma (com `{{variáveis}}`), overrideáveis em runtime. **[doc]**

### 3.2 Variáveis dinâmicas — 3 famílias

Sintaxe `{{variable_name}}` (texto/numérico/booleano), em system prompt, first message, params e headers de tools. **[doc]**

| Família | Prefixo | Vai ao LLM? | Origem |
|---------|---------|-------------|--------|
| **Sistema** | `system__` | Sim | Automáticas, não sobrescrevíveis |
| **Customizadas** | (sem prefixo) | Sim | SDK (`dynamicVariables`), dashboard (defaults de teste), tool responses (dot-notation), URL (`var_user_name=John` ou base64 `vars=`) |
| **Secretas** | `secret__` | **Não** (só headers de tool) | Tokens/API keys |

**Variáveis de sistema (verificadas):** `system__agent_id`, `system__current_agent_id` (muda no transfer), `system__caller_id`, `system__called_number`, `system__call_duration_secs`, `system__time_utc`, `system__time`, `system__timezone`, `system__conversation_id`, `system__call_sid`, `system__agent_turns`, `system__current_agent_turns`, `system__current_subagent_turns`, `system__is_text_only`, `system__conversation_history`. **[doc]**

### 3.3 Overrides em runtime — 9 campos

Desabilitados por padrão; ativados **campo a campo** na aba Security (`platform_settings.overrides`). Campos: `prompt`, `first_message`, `language`, `voice_id`, `llm`, `text_only`, `stability`, `speed`, `similarity_boost`. **Regra crítica:** omitir campos não desejados (não usar string vazia/null). A doc recomenda **dynamic variables como alternativa preferida**. **[doc]**

### 3.4 Function Calling / Tools — 4 tipos + MCP

| Tipo (`type`) | Onde executa | Caso de uso |
|--------------|--------------|-------------|
| **`client`** | Dispositivo do usuário (SDK, via `client_tool_call` no WS) | UI client-side (abrir modal, redirect) |
| **`webhook` (server)** | Servidor da ElevenLabs → API HTTP do dev | Integração com APIs externas |
| **`system` (built-in)** | Servidor interno | Controle de estado da conversa |
| **`mcp`** | Servidor MCP externo (SSE / HTTP streamable) | Tools descobertas dinamicamente |

**Modelo mental de cadastro de uma tool:** nome + descrição + **JSON Schema de parâmetros**. A **descrição é o contexto que o LLM usa** para decidir chamar e preencher os parâmetros (gerados dinamicamente da conversa). `response_timeout_secs` default ~20s. **[doc]**

**Origem do valor de cada parâmetro — mutuamente exclusiva (regra exata da doc: "Only ONE of the following fields can be set"):** **[doc]**

| Mecanismo | Quem fornece o valor |
|-----------|----------------------|
| `description` | O LLM gera o valor |
| `dynamic_variable` | Variável dinâmica em runtime |
| `constant_value` | Valor fixo |
| `is_system_provided: true` | Templating do sistema |
| `is_omitted: true` | Exclui o campo do payload |

**Server tool — `api_schema`:** `url` (com path placeholders), `method` (GET/POST/PUT/PATCH/DELETE), `request_headers` (auth, secrets), `path_params_schema`, `query_params_schema`, `request_body_schema`, `response_body_schema` (**só documentação, NÃO exposto ao LLM**), `content_type` (`application/json` ou `x-www-form-urlencoded`). **[doc]**

**Retorno ao LLM:** o resultado HTTP volta ao LLM para continuar a conversa; opcionalmente `assignments` (DynamicVariableAssignment) extrai campos via `value_path` (dot-notation) e grava em variáveis dinâmicas. **[doc]**

**Opções avançadas:** `execution_mode` (immediate / post_tool_speech / **async** em background), `disable_interruptions`, `pre_tool_speech`, `tool_call_sound`, `tool_error_handling_mode` (auto/summarized/passthrough/hide), `response_mocks` (testar sem chamar). **Client tools** podem ser **blocking** (`expects_response: true` + `response_timeout_secs`) ou fire-and-forget. **[doc]**

**System tools:** `end_call` (adicionado por padrão), `language_detection` (system tool, não automático), `transfer_to_agent`, `transfer_to_number`, `skip_turn`, `play_keypad_touch_tone` (DTMF), `voicemail_detection`. **[doc]**

**Arquitetura atual de tools:** entidades independentes (CRUD em `/v1/convai/tools`) referenciadas via `prompt.tool_ids`; system tools em `prompt.built_in_tools`. Isso **substituiu** o antigo esquema inline `prompt.tools` (deprecado), permitindo reuso entre agentes. **[doc]**

**MCP — modos de aprovação:** `Always Ask` (máxima segurança), aprovação fine-grained (read-only roda sozinho, write exige aprovação), `No Approval`. Timeout default 30s (5–300s). **[doc]**

### 3.5 Multi-agente / orquestração

- **Workflows** (editor visual de grafo): orquestrador classifica intenção e roteia para subagentes especializados (prompt/KB escopados → menos tokens/latência). Nós: **Subagent, Dispatch Tool (rotas sucesso/falha), Agent Transfer, Transfer to Number, End**. Arestas: **LLM Conditions** (linguagem natural em runtime), **Expression-based** (determinística sobre variáveis), **Unconditional** (podem voltar = loops de retry). **[doc]**
- **`transfer_to_agent`** (handoff agente-a-agente): `agent_number` (zero-indexed) + `reason`; regra com `condition` (NL), `delay_ms` (default 0), `transfer_message` (vazio = silencioso). **Preserva o transcript completo.** O filho **herda** do pai: idioma atual, client events, formato TTS/ASR; o filho **define**: prompt, first message, LLM, workflow, voz, tools, KB. O LLM do filho não vê a chamada da tool de transfer. **[doc]**

### 3.6 LLM Cascading (resiliência)

Fallback automático em **API errors, timeouts ou respostas vazias**. Sequência fixa: Gemini 2.5 Flash → 2.0 Flash → 2.0 Flash Lite → Claude 3.7 Sonnet → 3.5 Sonnet v2 → 3.5 Sonnet v1 → GPT-4o → Gemini 1.5 Pro → 1.5 Flash. ≥3 tentativas; sob HIPAA a lista é filtrada; **Custom LLM NÃO participa** (só re-tenta a si mesmo). **[doc]**

### 3.7 Knowledge Base / RAG

| Parâmetro | Valor |
|-----------|-------|
| Formatos | PDF/TXT/DOCX/HTML/EPUB (≤21 MB/arquivo), URLs, texto **[doc]** |
| Embedding | `e5_mistral_7b_instruct` (também `multilingual_e5_large_instruct`, `qwen3_embedding_4b`) **[doc]** |
| Chunks recuperados | `max_retrieved_rag_chunks_count` = 20 **[doc]** |
| Distância vetorial | threshold 0.6 (default) **[doc]** |
| Contexto máx | 50.000 chars/request **[doc]** |
| Indexação | docs >500 bytes (menores vão modo "Prompt"); modos Auto vs Prompt **[doc]** |
| Latência extra | ~250 ms **[doc]** |
| Limite por tier | Free 1 MB → Business/Enterprise 1 GB **[doc]** |

---

## PILAR 4 — INSIGHTS PARA APLICAÇÃO PRÁTICA (Clean Architecture + Node.js + TS, atendimento corporativo)

### 4.1 Princípio macro

A ElevenLabs separa de forma quase cirúrgica **o domínio conversacional (objeto de config único, versionável) da infraestrutura volátil (transporte, telefonia, LLM)**. Isso é exatamente Clean Architecture aplicada a agentes: o "agente" é uma entidade de domínio serializável; LLM, TTS, ASR, telefonia e LLM-cascading são **adapters plugáveis atrás de ports**. Replicar essa fronteira é o ganho arquitetural número um.

### 4.2 Mapeamentos concretos (ElevenLabs → seu SaaS)

| Padrão ElevenLabs | Mapeamento em Clean Architecture (Node/TS) |
|-------------------|--------------------------------------------|
| **`tool_config` (4 tipos)** | Cada tool = um **Use Case** + um **Port** (interface). `webhook`→adapter HTTP (out); `client`→port resolvido no frontend; `system`→use case interno de domínio; `mcp`→adapter de descoberta dinâmica. Os 4 valores de origem (`description`/`dynamic_variable`/`constant_value`/`is_system_provided`) viram um **discriminated union em TS** validado por **zod** no boundary. |
| **JSON Schema de params + descrição como contexto do LLM** | DTO de entrada do use case validado por zod; a descrição vira metadado do registro de tools (single source) — espelha o uso de **react-hook-form + zod** que eles têm no painel. |
| **Signed URL (15 min) / conversation token** | **Token efêmero** mintado por um use case server-side (`IssueRealtimeTokenUseCase`); o `xi-api-key` equivalente (segredo do provedor) **nunca** sai do backend. Port `TokenIssuerPort`. |
| **Post-call webhook + HMAC `ElevenLabs-Signature`** | **Evento de domínio** `ConversationEnded` / `ConversationFailed`. Adapter de entrada HTTP valida HMAC (port `SignatureVerifierPort`), faz **idempotência** (retornar 200, IP allowlist), publica no event bus. Os 3 tipos (`transcription`/`audio`/`initiation_failure`) = 3 eventos distintos. |
| **Server tool (agente chama API do dev)** | Padrão **anti-corruption layer**: o agente é cliente de seus use cases via um gateway HTTP fino; `secret__` → segredos só em headers, resolvidos por `SecretsVaultPort`. |
| **LLM Cascading** | Port `LlmPort` com decorator **Circuit Breaker + fallback chain** (config-driven, não hardcoded); registre a cadeia como dado, como eles fazem. Custom LLM = adapter que não participa do fallback. |
| **Config como UM JSON versionável + CLI GitOps (hash diff, branches)** | Entidade `AgentConfig` serializável; **event sourcing leve** ou snapshots imutáveis com ID; rollout por % via roteamento determinístico por `conversationId` (hash → branch). |
| **Dynamic variables `{{}}` (system/custom/secret)** | Camada de **template resolver** no use case de montagem de prompt; `secret__` filtrado antes de qualquer log/telemetria/LLM. |
| **WebSocket vs WebRTC vs SSE** | Port `RealtimeTransportPort` com adapters intercambiáveis; default WebRTC p/ voz, WS p/ texto — decisão isolada na infra, fora do domínio. |
| **Guardrails 2.0 (3 níveis)** | Cross-cutting concern: hardening do prompt + validação de input + validação de output, como **middleware/decorators** no pipeline do use case (modo Streaming sem latência vs Blocking 200–500 ms). |
| **Success Evaluation + Data Collection (pós-chamada)** | Handlers do evento `ConversationEnded`: um avalia critérios (LLM-as-judge, success/failure/unknown), outro extrai dados estruturados (string/boolean/integer/number) → persistência analítica. |

### 4.3 Os 3 conceitos de engenharia a PRIORIZAR

1. **Config do agente como objeto de domínio único, versionável (modelo GitOps).**
   *Justificativa:* é a fundação que torna tudo o resto barato — versionamento estilo git, drafts isolados, rollout por % com roteamento determinístico, diff por hash e testes em CI/CD só existem porque o agente é **um documento serializável imutável**. Em Clean Architecture isso é a sua Entity central; acertar essa fronteira primeiro evita que regras de negócio vazem para a infra de LLM/telefonia. Sem isso, multi-tenant corporativo vira pesadelo de drift de configuração.

2. **Token efêmero server-side (signed URL/conversation token) + post-call webhook com HMAC como evento de domínio.**
   *Justificativa:* é o par de segurança que viabiliza expor o agente ao mundo (web, telefone, WhatsApp) sem nunca vazar credenciais e sem acoplar o frontend ao domínio. O token efêmero (15 min, mint server-side) e o webhook assinado+idempotente (HMAC, IP allowlist, retorno 200, desativação após falhas) são o contrato de borda que mantém o núcleo limpo. Para atendimento corporativo (dados sensíveis, compliance), isso não é opcional.

3. **Tool como Use Case atrás de Port, com origem de parâmetro explícita e a descrição como contrato para o LLM.**
   *Justificativa:* é o coração da automação de atendimento — cada ação (consultar pedido, abrir ticket, transferir para humano) precisa ser uma unidade testável, mockável (eles têm `response_mocks`/tool mocking na simulação) e reusável entre agentes (`tool_ids`). O modelo de **um único mecanismo de origem por parâmetro** + `response_body_schema` que **não vai ao LLM** ensina disciplina de boundary: o LLM só vê o que precisa, o resto é infraestrutura. Isso mapeia 1:1 para use cases + ports + DTOs validados por zod e blinda o domínio de alucinação e de acoplamento ao provedor.

---

## LACUNAS E INCERTEZAS

- **[inf]** Padrão de data-fetching/forms do painel: *refutado o "desconhecido"* — confirmado TanStack Query + react-hook-form/zod + zustand pontual via bundles. Não há, porém, garantia de que **toda** a app use exclusivamente esse stack.
- **Concorrência (chamadas simultâneas) de Agents:** valores divergem entre fontes (help article oficial: Free 4/Starter 6/Creator 10/Pro 20/Scale 30/Business 30; terceiros citam "Business ~100"). **Tratar como aproximação.** Burst pricing: até 3× (cap 300 não-enterprise), overage 2×, prioridade reduzida. **[doc para burst]**
- **Preços e minutos inclusos por plano:** **[corr — partially_confirmed]** minutos batem nas fontes (15/75/275/1.238/3.738/12.375), mas **preços citados estão parcialmente errados** (Scale US$299 não US$330; Business US$990 não US$1.320; Starter ~US$6 não US$5) e overage não é universalmente US$0.08/min. Não há doc oficial pública direta consolidada — derivado de análises de terceiros.
- **`optimize_streaming_latency` "deprecated":** **[corr]** ausência confirmada do `stream-input`, mas **sem rótulo formal "Deprecated"** nas refs REST; continua documentado em `/convert` e `/stream`.
- **Uso interno de `auto_mode`/Flash pelos agentes:** **[inf]** plausível, não comprovável como detalhe de implementação.
- **Parâmetros granulares de VAD** (thresholds, no-interrupt windows, transições de estado): **não expostos** na doc; delegados ao modelo de turn-taking. **[corr]**
- **Latência sub-segundo end-to-end:** alvo de marketing; **não há número total publicado** — só componentes quantificados.
- **Default `turn_timeout` ~7 s** e **`max_duration` 600 s:** o 600 s é doc oficial **[corr-confirmed]**; o 7 s vem de fonte secundária (MCP wrapper), confiança média.
