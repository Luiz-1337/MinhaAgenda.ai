# Integração Belasis — Diagnóstico, Implementação e Ativação

**Atualizado:** 21 de outubro de 2026 (sincronização Belasis → MinhaAgenda)
**Escopo:** agendamentos feitos pela IA do WhatsApp (e pelo painel) caírem na agenda da Belasis, com conexão fácil para o dono do salão.
**Decisão do dono (14/out):** a **Belasis é a agenda oficial** do salão — a recepção agenda direto lá.
**Estado:** cliente implementado contra a documentação oficial; tela de conexão e vínculo prontas; **nada commitado**. Falta, nesta ordem: aplicar a migration 034, validar com uma chave real (`scripts/diagnose-belasis.ts`) e o piloto num salão.

---

## 1. O que a API da Belasis é (documentação oficial)

Fonte: https://belasis-api.readme.io (OpenAPI 3.0.1 "Belasis API v1"), lida página a página em 15/out — os 6 guias e os 33 endpoints.

| Tema | O que a doc diz |
|---|---|
| Base | `https://api.belasis.com.br/api/v1/...` |
| Autenticação | header **`ACCESS-TOKEN`** com a chave crua (`bpk_...`), sem "Bearer" |
| Como o salão obtém a chave | belasis.app/settings/api → **Configurações → API → "Gerar token"** ("Visualizar Chave" mostra de novo). Exige o **adicional de API** ativo na conta. Gerar uma nova revoga a anterior na hora |
| Escopo da chave | "acessa dados e operações em **todos os seus estabelecimentos**"; não há parâmetro de estabelecimento — tudo é "associado ao token" |
| Limite | **30 requisições por minuto por chave**, na janela do minuto corrente; estourou, 429 **sem corpo** até o minuto virar |
| Paginação | `{ data, page, limit, total }`, `limit` máximo 100 |
| Telefone | só dígitos, com DDI e DDD (`5547999998888`) |
| Status do agendamento | `confirmed`, `unconfirmed` (padrão), `disconfirm` (cancelado), `waiting` |
| Disponibilidade | `GET /employees/{id}/free_times?date=` → grade `{ hour: "HH:MM", label: available\|unavailable }` |
| Agendamento | "schedule group": `client_id` + `date` + itens (`calendars`) com profissional, serviço, `start_hour`/`end_hour` ("HH:MM", hora de parede) |
| Remarcar | o PATCH só muda a **hora** de um item — não muda data, profissional nem serviço. A doc indica remarcação como "cancela o antigo e cria novo" |
| Cancelar | `PATCH /schedule_groups/{id}/cancel` (mantém histórico; há também DELETE) |
| Erros | 401 chave inválida/sem recurso; 404; 422 com array de strings (ex.: "Celular já está em uso") |
| Idempotência / webhooks | **não existem** |

Conferido contra a API real (15/out, com chave propositalmente inválida): `/api/v1/employees` existe e responde 401; a recusa vira `auth` no nosso cliente.

---

## 2. Como fica o fluxo, com a Belasis como agenda oficial

O Google Calendar é **espelho** (cópia em segundo plano; se falhar, o agendamento continua valendo). A Belasis é o contrário: um agendamento só vale se ela aceitar.

| Momento | O que acontece | Se a Belasis falhar |
|---|---|---|
| IA sugere horários | subtrai o que está ocupado na grade `free_times` (cache de 45 s) | segue sem ela (a checagem do agendamento trava) |
| Antes de reservar | confere o horário na grade, sem cache | **não agenda** (fail-closed) |
| Depois de reservar aqui | acha o cliente pelo telefone (ou cadastra) e grava lá **na hora** | **desfaz a reserva local**; a IA oferece outro horário |
| Remarcar no mesmo dia/profissional/serviço | PATCH da hora | volta a linha local ao horário anterior |
| Remarcar para outro dia/profissional/serviço | cria o novo, depois cancela o antigo | idem; se só o cancelamento do antigo falhar, alerta |
| Cancelar | `/cancel` lá | cancela aqui mesmo assim; alerta no painel |
| Antes do lembrete (24–48 h antes) | confere o agendamento lá | cancelado lá → cancela aqui e não lembra; mudou lá → corrige aqui e lembra o horário certo; a Belasis já vai lembrar → o daqui não sai |
| Sincronizar (botão ou de hora em hora) | traz para cá os próximos 30 dias da agenda de lá (seção 2.1) | a rodada falha inteira e tenta de novo na próxima hora |
| Escrita sem resposta (timeout) | procura pela referência gravada na observação | não achou → falha + alerta para conferir a agenda |

O cliente **nunca recebe confirmação de um horário que não existe na agenda oficial**.

O que conta como ocupado (`freeTimesToBusyIntervals`): **só está livre o que a Belasis marca como `available`**; o resto do dia — inclusive o que ela nem lista, como fora do expediente — está ocupado. Dia sem horários = dia inteiro ocupado.

Alertas no painel (`system_alerts`, um aberto por tipo): `agenda_auth_failed` e `agenda_unavailable` (críticos — reconectar), `agenda_not_linked`, `agenda_rejected`, `agenda_write_uncertain`, `agenda_cancel_failed`, `agenda_ref_not_saved`, `agenda_conflict`.

### 2.1 Sincronização (Belasis → MinhaAgenda)

Decisão do dono (21/out): só nesse sentido, próximos 30 dias, botão "Sincronizar agora" + automática de hora em hora. Não é ela que evita choque de horário (a IA já consulta a Belasis ao vivo); ela faz o MinhaAgenda **enxergar** o que a recepção marca.

Para cada agendamento lá no período:
- **já existe aqui** (criado pela IA ou trazido antes) → cancelado lá cancela aqui; horário/profissional mudou lá corrige aqui; confirmado lá confirma aqui. Atendimento já concluído/falta aqui não é desfeito;
- **não existe aqui** (marcado na recepção) → cria aqui com o de-para ao contrário (nº 7 → Ana) e a cliente achada pelo telefone (ou cadastrada). Entra sem as travas de expediente/conflito — lá já aceitou; se bater com algo daqui, entra mesmo assim e abre `agenda_conflict`;
- **profissional ou serviço sem par** → fica de fora ("sem vínculo" no resumo);
- **visita com vários serviços** (corte com a Ana + escova com a Bia) → um agendamento aqui por serviço, com referência `grupo:item`; cancelar/remarcar um deles pela IA mexe só naquele item lá.

E o contrário: o que foi para lá e não veio na lista (apagado, ou remarcado para fora do período) é conferido um a um.

Ritmo: no máximo **15 chamadas por minuto** em segundo plano — metade da cota da chave fica sempre livre para a IA. A primeira sincronização pode levar alguns minutos (cada cliente novo é buscado lá); as seguintes, segundos. O andamento aparece no card da Belasis.

**Pausar** = o MinhaAgenda não fala com a Belasis: a IA agenda só aqui, sem consultar nem gravar lá, e a sincronização também para. Token e vínculos continuam salvos; **Ativar** volta tudo.

---

## 3. Conexão fácil (o que o dono vê em Integrações)

1. **"Abrir Configurações → API"** — botão que abre a página exata da Belasis (e link para ativar o adicional de API, se faltar).
2. **"Gerar token"** lá e copiar (ou "Visualizar Chave").
3. **Colar** e **"Testar e conectar"**. O campo limpa espaços, aspas e "Bearer" colados juntos e avisa se não começar com `bpk_`; o teste chama a Belasis na hora e explica a recusa em linguagem de gente.
4. **Vincular** profissionais e serviços: a tela sugere o par pelo nome (sem acento/caixa; ambíguo não vira sugestão) e o dono confere.
5. **Ativar.** Até aqui nada muda para a IA: a conexão nasce inativa.

O token fica **cifrado** (AES-256-GCM, `ENCRYPTION_KEY`). Trocar o token num salão já conectado mantém vínculos e ativação.

---

## 4. O que foi construído (14–15/out — não commitado)

| Peça | Arquivo |
|---|---|
| Correção pré-requisito: consultas do Google sem filtro de provedor (apagariam a linha da Belasis no `invalid_grant`) + guarda estática | `packages/db/src/services/google-calendar.ts`, `apps/web/app/api/google/callback/route.ts`, `apps/web/__tests__/lib/salon-integrations-provider-scope.test.ts` |
| Contrato da agenda oficial (`AgendaProvider`) e erros por `kind` | `packages/db/src/domain/integrations/interfaces/agenda-provider.interface.ts`, `domain/errors/agenda-provider-error.ts` |
| Orquestração (checar, gravar, remarcar, cancelar, conferir, alertas) | `packages/db/src/services/agenda-sync.service.ts`, ligada em `appointments.ts` |
| Cliente Belasis (transporte, limite de 30/min, 429, paginação, erros) | `packages/db/src/infrastructure/integrations/belasis/belasis-client.ts` |
| Provedor Belasis (grade → ocupado, cliente por telefone, remarcação, conferência) | `.../belasis/belasis-agenda-provider.ts`, `belasis-mapping.ts`, `belasis-types.ts` |
| Registro (Belasis registrada) e credencial cifrada | `services/agenda-provider-registry.service.ts`, `infrastructure/integrations/agenda/agenda-credentials.ts`, `utils/secret-crypto.utils.ts` |
| De-para de IDs | tabela `integration_external_refs` — `supabase/migrations/034_integration_external_refs.sql` (**não aplicada**) |
| Conexão e vínculo | `services/agenda-setup.service.ts`, `apps/web/app/actions/belasis.ts`, `apps/web/components/integrations/belasis-integration.tsx` |
| Disponibilidade da IA | `IExternalBusySource` + `AgendaBusySource` (mcp-server), com o `salonId` em cada chamada |
| Lembrete confere a agenda oficial (e não duplica o lembrete de lá) | `apps/web/lib/services/reminders.service.ts` |
| Sincronização Belasis → MinhaAgenda | `services/agenda-import.service.ts`; fila `apps/web/lib/queues/agenda-sync-queue.ts`; worker `apps/web/workers/agenda-sync.worker.ts`; cron `apps/web/app/api/cron/agenda-sync` (de hora em hora, `vercel.json`); botão no card |
| Diagnóstico com chave real (só leitura) | `scripts/diagnose-belasis.ts` |

**Testes:** `packages/db` 201/201 (Belasis: conversões 27, transporte 22, provedor 31; orquestração 38; sincronização 16; ligação em `appointments.ts` 12; vínculo 7; credencial 12); `apps/web` 451/451; mcp-server 284 verdes. As regras críticas foram validadas quebrando o código de propósito. tsc limpo em db, mcp-server e web; lint limpo nos arquivos novos.
4 testes de `CheckAvailabilityUseCase.test.ts` (mcp-server) **já falhavam antes** (desde `25ec1ca`, 8/jun) — sem relação; há tarefa separada.

---

## 5. Decisões tomadas pelo lado mais seguro (o dono pode mudar)

1. **Belasis fora do ar → a IA não agenda** (diz que não conseguiu confirmar).
2. **Token revogado → a IA para de agendar** + alerta crítico até reconectar.
3. **Profissional sem vínculo → a IA não oferece horários dele**; serviço sem vínculo não é agendado.
4. **`reminder: false`** nos agendamentos criados lá: o MinhaAgenda já lembra todo agendamento pendente; com o da Belasis, o cliente receberia dois.
5. **Status `unconfirmed`** na criação (o equivalente ao nosso `pending`).
6. **Ocupado conservador**: o que a grade não marca como livre é ocupado.
7. **Fuso de Brasília** para `date`/`HH:MM` (a doc não diz; é o que o resto do sistema assume).
8. **Lembrete de agendamento trazido da recepção:** se a Belasis já vai lembrar (lembrete ligado lá), o MinhaAgenda não manda o dele.
9. **Sincronização em segundo plano a 15 chamadas/min**, para nunca tirar a vez da IA na cota de 30.

---

## 6. O que a doc não responde — validar com chave real (`scripts/diagnose-belasis.ts`)

```bash
BELASIS_TOKEN=bpk_... pnpm --filter @repo/db exec tsx ../../scripts/diagnose-belasis.ts --date 2026-10-20 --phone 5547999998888
```

Só leitura, ~6 requisições, não imprime a chave. Conferir:

1. **Estabelecimento:** os profissionais listados são os do salão? (a chave "vale para todos os estabelecimentos" e não há parâmetro — se a conta tiver mais de um, pode misturar.)
2. **Grade:** o passo inferido e o que aparece fora do expediente; os agendamentos do dia caem nos horários `✗`? (confirma o fuso.)
3. **Telefone:** o formato guardado nos clientes (o exemplo da doc vem sem DDI e às vezes formatado).
4. **No piloto:** a Belasis recusa agendamento em horário ocupado? Qual o texto do 422? (o cliente reconhece "indisponível/ocupado/conflito".)

---

## 7. O que falta

| # | Item | Observação |
|---|---|---|
| 1 | **Aplicar a migration 034** | backup + `get_advisors` antes/depois (DATABASE.md). Sem ela, conectar funciona mas o vínculo falha — e a ativação exige vínculo, então nada liga sem a tabela |
| 2 | Rodar o diagnóstico com a chave do salão (seção 6) | |
| 3 | Piloto: conectar, vincular, ativar, e um agendamento real pela IA | acompanhar os alertas `agenda_*` |
| 4 | Confirmação do cliente (resposta ao lembrete) → `confirm` na Belasis | hoje a confirmação não sincroniza com ninguém (decisão antiga de `ConfirmAppointmentUseCase`) |
| 5 | Mudança feita na recepção chega aqui em até 1 hora (sincronização) ou antes do lembrete | webhook não existe; o botão "Sincronizar agora" traz na hora |
| 6 | Cancelamento em massa ao remover profissional (`actions/professionals.ts`) não avisa a agenda oficial | |
| 7 | Volume: 30 req/min por salão | cada agendamento gasta ~4 requisições; a sugestão de horários, 1 por profissional por dia (com cache); a sincronização usa no máximo 15/min |

---

## 8. Checklist para ligar

1. Aplicar a migration 034 (backup antes).
2. Deploy do código.
3. `scripts/diagnose-belasis.ts` com a chave do salão (seção 6).
4. Integrações → Belasis: conectar, vincular, **Ativar**.
5. Um agendamento de teste pela IA e conferência na agenda da Belasis (data, hora, profissional, serviço, cliente).
6. Remarcar e cancelar esse agendamento pela IA e conferir lá.
7. "Sincronizar agora" e conferir no painel os agendamentos da recepção (e o resumo: trazidos, sem vínculo, sem telefone).
