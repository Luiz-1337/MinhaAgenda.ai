# Replay Harness — Simulação de Conversas Reais

Alimenta o bot com as mensagens reais de clientes (exports do WhatsApp) e compara
a resposta do bot com a da secretária humana, com um **juiz IA** opcional. É
**observacional** (não é pass/fail) — serve para *ver o comportamento* do bot.

Diferente da suíte `eval/` (regressão pass/fail), aqui não há asserção: o objetivo
é inspecionar lado a lado e deixar o juiz sinalizar problemas (preço/horário
inventado, tool errada, tom, regra de "uma pergunta por vez", roteamento de unidade).

## Como funciona

```
transcript .txt → parser → episódios → date-shifter → runEpisode (bot real)
                                                          → juiz IA (opcional)
                                                          → relatório .md + .json
```

- **parser/whatsapp-parser.ts** — tokeniza o export, filtra ruído (mídia oculta,
  avisos de sistema, auto-resposta do salão), colapsa rajadas em um turno (modela
  o debounce do bot), quebra o histórico em episódios e pareia cliente→humano.
- **dateshift/date-shifter.ts** — reescreve datas absolutas para o futuro em
  múltiplos de 7 dias (preserva o dia da semana: sábado continua sábado). Datas
  relativas ("amanhã", "sábado") são deixadas como estão (já resolvem no futuro).
- **runner/replay-runner.ts** — roda cada troca via `generateAIResponse` (o mesmo
  entrypoint da eval), reaproveitando o seed/cleanup da eval. Não para no erro.
- **judge/** — juiz IA (chamada estruturada à Responses API) com rubrica extraída
  do system-prompt do bot.
- **report/markdown.ts** — escreve `reports/<id>-<stamp>.md` + `.json`.

## Setup (uma vez)

1. Crie o salão de teste fiel:
   ```
   pnpm db:seed:cris
   ```
   Copie os `REPLAY_*` impressos para o `.env` da raiz do monorepo.

2. Coloque os exports do WhatsApp (`.txt`) em `transcripts/` (gitignored — são
   dados reais de clientes). O lado do salão deve ser o contato "Cris Ferreira".

> ⚠️ Aponte para um salão de **teste**, nunca produção. O runner cria/limpa
> customer, chat, mensagens e appointments no telefone simulado.

## Rodar

```
# todos os episódios, com juiz
pnpm --filter web replay

# um episódio específico, sem juiz (mais barato)
pnpm --filter web replay -- --episode alina-1 --no-judge

# por cliente/arquivo, limitando a 2 episódios
pnpm --filter web replay -- --episode celia --limit 2
```

Opções: `--episode <id|substr>` (repetível), `--salon <uuid>`, `--phone <e164>`,
`--judge`/`--no-judge` (default ligado), `--out <dir>`, `--limit <n>`.
Modelo do juiz: `REPLAY_JUDGE_MODEL` (default `gpt-5.4-mini-2026-03-17`).

Os relatórios saem em `reports/` (gitignored). Cada `.md` mostra, por troca:
🧑 cliente → 🤖 bot (+ tools) vs 👩 humano + ⚖️ veredito do juiz.

## Custo

Cada troca = 1 chamada do bot (+1 do juiz se ligado). Episódios reais têm 3–12
trocas. Comece com `--no-judge` e `--limit 1`.

## Limitações conhecidas

- **Unidades** (Aclimação x Campo Belo) vivem no system_prompt do agente — o bot
  *conversa* unidades, mas as tools só validam dia-da-semana (sem agenda por
  unidade). Bom para observar comportamento, não para afirmar slot por unidade.
- **Datas**: reescrita textual (v0). Datas relativas não são tocadas. Episódios
  que mencionam feriado emitem aviso (o shift de N semanas tira do feriado).
- **getChatHistory** só enxerga mensagens de "hoje" (Brasília): rode sequencial e
  evite atravessar a meia-noite.
