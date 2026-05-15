# Eval Suite — Golden Conversations

Suite mínima de regressão de qualidade do agente. Roda 6 conversas representativas contra `generateAIResponse` real (OpenAI + DB + Redis reais) e verifica comportamento via assertions estruturais (tool calls + regex no texto). NÃO usa LLM-as-judge, NÃO usa snapshot de texto — tudo é determinístico ou tolerante a variação de redação.

## Quando rodar

- **Antes** de mudar `system-prompt-builder.service.ts`, `generate-response.service.ts`, tools do MCP ou trocar de modelo.
- **Depois** dessas mudanças, para confirmar que não regrediu nada.
- **NÃO** roda em PR comum (custa OpenAI + leva ~3-5 min).

## Setup (uma vez)

A suite assume que você já tem um **salão de teste** funcional no DB com:

- Pelo menos 1 agente ativo (`agents.is_active=true`)
- Pelo menos 1 profissional ativo (`professionals.is_active=true`)
- Pelo menos 1 serviço ativo (idealmente "corte" ou similar)
- Disponibilidade configurada para o profissional (segunda a sexta no mínimo)
- Assinatura em `ACTIVE`, `TRIAL` ou `PAID` (não pode ser `CANCELED`)

> ⚠️ **Não aponte para produção.** Use um salão de staging/dev. A suite cria customers, chats, messages e potencialmente appointments em nome do telefone configurado.

### Configurar env vars

Adicione ao `.env` (na raiz do monorepo, mesmo lugar do `.env` que `dotenv-cli` carrega):

```
EVAL_SALON_ID=00000000-0000-0000-0000-000000000000
EVAL_PROFESSIONAL_ID=00000000-0000-0000-0000-000000000000
EVAL_SERVICE_ID=00000000-0000-0000-0000-000000000000

# Opcional — telefone fake usado pelo cliente simulado.
# Default: 5500900000001 (marker fácil de identificar)
EVAL_CLIENT_PHONE=5500900000001
```

Para descobrir os UUIDs, rode no Postgres:

```sql
-- salão de teste
SELECT id, name, subscription_status FROM salons WHERE name ILIKE '%teste%' OR name ILIKE '%dev%';

-- profissional desse salão
SELECT id, name FROM professionals WHERE salon_id = '<EVAL_SALON_ID>' AND is_active = true;

-- serviço corte
SELECT id, name, price FROM services
  WHERE salon_id = '<EVAL_SALON_ID>' AND is_active = true AND name ILIKE '%corte%';
```

## Rodar

```bash
# Todos os 6 cenários
pnpm --filter web eval

# Cenário específico (filter por nome)
pnpm --filter web eval -- -t saudacao_pura

# Modo watch (re-roda em mudança de arquivo de cenário)
pnpm --filter web eval:watch
```

Saída esperada em sucesso:

```
 ✓ golden conversations > saudacao_pura — ... (2.1s)
 ✓ golden conversations > despedida — ... (1.8s)
 ✓ golden conversations > lista_servicos — ... (3.4s)
 ✓ golden conversations > agendamento_solicita_data — ... (2.5s)
 ✓ golden conversations > agendamento_direto_dia_hora — ... (4.2s)
 ✓ golden conversations > memoria_tool_context — ... (2.9s)

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Em falha, o console mostra qual turno falhou, a resposta gerada, as tools chamadas, e cada assertion não atendida.

## Cenários cobertos

| Nome | O que valida |
|---|---|
| `saudacao_pura` | "oi" → 0 tools, ≤2 frases, sem "vou verificar/um momento", sem UUIDs |
| `despedida` | "tchau, obrigada!" → 0 tools, ≤2 frases, sem devolver pergunta |
| `lista_servicos` | "quanto custa um corte?" → chama `getServices`, preço citado vem de tool result (anti-invenção) |
| `agendamento_solicita_data` | "queria agendar um corte" (sem data) → NÃO chama `checkAvailability`, faz 1 pergunta sobre data |
| `agendamento_direto_dia_hora` | "corte sexta às 10h" → chama `checkAvailability`, NÃO chama `addAppointment` ainda, sem "vou verificar" |
| `memoria_tool_context` | Após injetar TOOL_CONTEXT com `getServices`, próximo turno NÃO rechamada `getServices` |

## Adicionar um cenário novo

1. Crie um arquivo em `conversations/NN-nome-do-cenario.ts` seguindo o shape `Conversation` (`../types`).
2. Importe-o em `golden-conversations.eval.ts` e adicione ao array `ALL_CONVERSATIONS`.
3. Rode `pnpm --filter web eval -- -t nome_do_cenario` para validar isoladamente.

Tipos de assertion disponíveis (em `runner/assertions.ts`):

- `tools.required: string[]` — tools obrigatórias
- `tools.forbidden: string[]` — tools proibidas
- `tools.args.<toolName>.{mustHaveKeys, mustNotHaveKeys, matches}` — inspeção de argumentos
- `text.maxSentences | maxChars`
- `text.mustNotMatch | mustMatchAny | mustMatchAll` (arrays de RegExp)
- `custom: (result, steps) => string | null` — predicado livre

## Limitações conhecidas (v0)

- **Histórico de "hoje" no `getChatHistory`**: rodar perto da meia-noite Brasília pode causar comportamento inesperado entre turnos. Rodar de manhã/tarde.
- **`getServices` em `lista_servicos` depende do salão ter um serviço com "corte" no nome ou em descrição parecida.** Se o salão de teste não tiver corte, o cenário pode falhar mesmo com o bot correto. Ajuste o serviço seed para incluir "corte".
- **Disponibilidade em `agendamento_direto_dia_hora`** assume que o profissional trabalha sexta-feira. Se não trabalhar, `checkAvailability` retorna vazio mas o tool é chamado (o que é o ponto do teste), então tende a passar.
- **Não-determinismo do modelo**: mesmo com `temperature=0.2`, há flutuação. Se um cenário falhar 1 em 5 runs por flakiness e não por regressão real, mover o assert mais frágil para `mustMatchAny` em vez de `mustMatchAll`, ou para um padrão mais tolerante.
- **Sem retry**: cada conversa roda 1 vez. Não há "passa se 2 de 3" — adicionar em v1 quando flakiness vira problema observável.
- **Sem baseline diff**: cada run é independente. Adicionar em v1 (salvar score em JSON, comparar com run anterior).
- **Custo por run completa**: ~$0.20-1.00 dependendo do modelo. Rodar com parcimônia.

## Próximos passos (v1+)

- LLM-as-judge para assertions subjetivas ("tom amigável", "não repetiu o que cliente disse")
- Cenários multi-profissional, cancelamento, reagendamento, no-show
- Fluxo de pagamento antecipado (PIX → comprovante → addAppointment só depois)
- Baseline diff + report markdown comitável
- CI integration via GitHub Action gated por path filter
