# Integração Belasis — Diagnóstico, Implementação e Ativação

**Atualizado:** 3 de novembro de 2026 (busca do cliente por telefone — seção 2.0)
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
| Remarcar | o PATCH só muda a **hora** de um item — não muda data, profissional nem serviço. A doc indica remarcação como "cancela o antigo e cria novo". **Fora da doc:** o item do PATCH precisa levar o serviço (`inventory_product_id`) que já tem; só `id` + hora dá 422 "Calendars calendar products product é obrigatório(a)" (API real, 03/nov) |
| Cancelar | `PATCH /schedule_groups/{id}/cancel` (mantém histórico; há também DELETE). **Fora da doc:** o cancelado (`disconfirm`) continua ocupando o horário — `free_times` o marca `unavailable` (API real, 03/nov). Só o `DELETE` libera (decisão 11) |
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
| Depois de reservar aqui | acha o cliente pelo telefone (ou cadastra — seção 2.0) e grava lá **na hora** | **desfaz a reserva local**; a IA oferece outro horário |
| Remarcar no mesmo dia/profissional/serviço | PATCH da hora (com o serviço e o profissional do item — seção 1) | volta a linha local ao horário anterior |
| Remarcar para outro dia/profissional/serviço | cria o novo, depois remove o antigo | idem; se só a remoção do antigo falhar, alerta |
| Cancelar | remove lá (`DELETE`; se ela não deixar remover, `/cancel`). Já cancelado lá fica como está | cancela aqui mesmo assim; alerta no painel |
| Antes do lembrete (24–48 h antes) | confere o agendamento lá | cancelado lá → cancela aqui e não lembra; mudou lá → corrige aqui e lembra o horário certo; a Belasis já vai lembrar → o daqui não sai |
| Sincronizar (botão ou de hora em hora) | traz para cá os próximos 30 dias da agenda de lá (seção 2.1) | a rodada falha inteira e tenta de novo na próxima hora |
| Escrita sem resposta (timeout) | procura pela referência gravada na observação | não achou → falha + alerta para conferir a agenda |

O cliente **nunca recebe confirmação de um horário que não existe na agenda oficial**.

O que conta como ocupado (`freeTimesToBusyIntervals`): **só está livre o que a Belasis marca como `available`**; o resto do dia — inclusive o que ela nem lista, como fora do expediente — está ocupado. Dia sem horários = dia inteiro ocupado.

### 2.0 Achar o cliente lá pelo telefone

Cliente que já tem vínculo (`integration_external_refs`, entidade `customer`) vai direto pelo id guardado. Sem vínculo, `findClientByPhone` (no provedor) procura pelo telefone. A busca da API (`GET /clients?search=`) é **parcial e casa em vários campos** (nome, apelido, telefone, celular, CPF), e o telefone pode estar guardado só com dígitos, sem DDI ou formatado — então busca do termo mais específico ao mais amplo e, em cada um, compara normalizado (DDD + 8 últimos dígitos, `phonesMatch`). Para no primeiro que achar:

| # | Termo (`belasisPhoneSearchTerms`) | Pega | Páginas lidas |
|---|---|---|---|
| 1 | 8 últimos dígitos (`91054646`) | só dígitos, com ou sem DDI, com ou sem o 9 — inclusive o que o MinhaAgenda cadastra | 1 |
| 2 | 8 últimos com hífen (`9105-4646`) | formatado (`(47) 99105-4646`) | 1 |
| 3 | 4 últimos (`4646`) | qualquer outro formato | até 5 |

O número nacional inteiro não é um termo: tudo o que ele acharia, os 8 últimos acham.

Os 4 dígitos sozinhos, numa base grande, batem em **centenas** de registros (produção, Spettacolo, 03/nov: um sufixo passou de 5 páginas). Isso **não** é "Belasis fora do ar": lidas as 5 páginas sem achar, é "não achei". Antes de 03/nov era `unavailable` — a reserva local era desfeita e a IA respondia "Não foi possível confirmar na agenda do salão agora" **para sempre** para aquele cliente.

Não achou → cadastra (`POST /clients`, telefone só dígitos com DDI). A Belasis recusa celular repetido com 422 ("Celular já está em uso"); aí repete **só os termos 1 e 2** (pega quem acabou de ser cadastrado por outro caminho, como a sincronização — os 4 dígitos dariam o mesmo de antes) e:
- achou → usa esse;
- não achou → `rejected` com mensagem clara ("a Belasis diz que o celular já está cadastrado, mas a busca por telefone não achou o cadastro"). Tentar de novo não resolve: o cadastro lá tem o telefone num formato que a busca não pega. Saída: corrigir o telefone do cliente na Belasis, ou gravar o vínculo `customer` à mão.

**Nome no cadastro** (`toBelasisClientName`). Por um caractere só, a Belasis recusa o cadastro inteiro: `422 "Nome possui carácter inválido."; "Nickname possui carácter inválido."` (o apelido não é enviado; ela o tira do nome). Produção, Spettacolo, 03/nov: cliente com nome "💤", copiado do perfil do WhatsApp, ficou sem horário. Como não se sabe tudo o que ela recusa, só vai o que com certeza passa:
- NFKC antes: letra estilizada ou de largura cheia vira comum ("𝓜𝓪𝓻𝓲𝓪" → "Maria");
- letra latina, com ou sem acento, fica ("Thaíssa", "Simão"); acento solto e caractere invisível (junção de emoji) somem; **todo o resto vira espaço**: emoji, símbolo, dígito e também pontuação ("Ana 💇‍♀️ Silva" → "Ana Silva", "Ana Carolina (Sheronn)" → "Ana Carolina Sheronn", "D'Ávila" → "D Ávila"). Pontuação sai porque não sabemos qual a Belasis aceita;
- sem nenhuma letra latina → **"Cliente WhatsApp"**.

Se mesmo assim vier 422 sobre o nome (mensagem que começa com "Nome"/"Nickname" ou fala em caractere inválido), tenta **uma vez** com "Cliente WhatsApp". Melhor esse cadastro, com o telefone certo, do que o cliente sem horário. O nome do cliente no MinhaAgenda não muda; só o que vai para lá. Cliente que já existe lá (achado pela busca) não é cadastrado de novo, e o nome dele lá não é tocado.

Custo na cota (30/min): cliente com o telefone só em dígitos, **1** chamada; formatado, 2; cliente novo, 2 + 1 a 5 (os 4 dígitos) + 1 (o cadastro). Para ver qual termo acha um telefone real: `scripts/diagnose-belasis.ts --phone` (seção 6).

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
| Falha lá → motivo certo para a IA | os 4 códigos `EXTERNAL_AGENDA_*` viram erros próprios em `appointment-error.mapper.ts` (criar e remarcar); a mensagem que a IA lê está no `ErrorPresenter`. Para esses códigos, `handleToolErrors` (`generate-response.service.ts`) não troca a resposta da IA pelo texto pronto que pedia data e horário de novo |
| Lembrete confere a agenda oficial (e não duplica o lembrete de lá) | `apps/web/lib/services/reminders.service.ts` |
| Sincronização Belasis → MinhaAgenda | `services/agenda-import.service.ts`; fila `apps/web/lib/queues/agenda-sync-queue.ts`; worker `apps/web/workers/agenda-sync.worker.ts`; cron `apps/web/app/api/cron/agenda-sync` (de hora em hora, `vercel.json`); botão no card |
| Diagnóstico com chave real (só leitura) | `scripts/diagnose-belasis.ts` |

**Testes:** `packages/db` 201/201 (Belasis: conversões 27, transporte 22, provedor 31; orquestração 38; sincronização 16; ligação em `appointments.ts` 12; vínculo 7; credencial 12); `apps/web` 451/451; mcp-server 284 verdes. As regras críticas foram validadas quebrando o código de propósito. tsc limpo em db, mcp-server e web; lint limpo nos arquivos novos.
Os 4 testes de `CheckAvailabilityUseCase.test.ts` (mcp-server) que falhavam desde `25ec1ca` (8/jun) foram acertados em 03/nov: faltavam `isWeekdayAllowed`/`timeToMinutes` no mock do `@repo/db` e o 4º argumento de `generateSlots` nas expectativas. mcp-server 362/362 (03/nov).

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
10. **Cliente sem nome → a IA pergunta o nome antes de agendar ou remarcar** (decisão de 03/nov). Vale quando o nome daqui não tem nenhuma letra (só emoji, como "💤", ou o telefone). O cadastro lá é feito por esse nome e não se corrige depois. A trava fica no mcp-server (`agenda-customer-name.service.ts`, erro `CUSTOMER_NAME_REQUIRED`). Na remarcação, só vale quando muda horário, profissional ou serviço. Sem agenda oficial, nada muda; o painel não passa por ela.
11. **Cancelar daqui remove o agendamento lá** (decisão do dono, 03/nov). Cancelado (`disconfirm`) continua ocupando o horário na Belasis (seção 1): o salão via o horário preso e a IA não o oferecia de novo. Vale também para o antigo de uma remarcação para outro dia/profissional/serviço. O histórico do cancelamento fica no MinhaAgenda; lá o registro some. Se a Belasis não deixar remover (422), cai no `/cancel`. Agendamento já cancelado lá (pela recepção) não é tocado. Os cancelados daqui antes desta decisão continuam lá ocupando o horário — a recepção exclui na Belasis.

---

## 6. O que a doc não responde — validar com chave real (`scripts/diagnose-belasis.ts`)

```bash
BELASIS_TOKEN=bpk_... pnpm --filter @repo/db exec tsx ../../scripts/diagnose-belasis.ts --date 2026-10-20 --phone 5547999998888
```

Só leitura, ~6 requisições, não imprime a chave. Conferir:

1. **Estabelecimento:** os profissionais listados são os do salão? (a chave "vale para todos os estabelecimentos" e não há parâmetro — se a conta tiver mais de um, pode misturar.)
2. **Grade:** o passo inferido e o que aparece fora do expediente; os agendamentos do dia caem nos horários `✗`? (confirma o fuso.)
3. **Telefone:** o formato guardado nos clientes (o exemplo da doc vem sem DDI e às vezes formatado). O `--phone` roda os três termos da busca (seção 2.0), diz quantos candidatos cada um trouxe, se cortou em páginas e qual acha o cliente — com os números mascarados.
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
| 7 | Volume: 30 req/min por salão | cada agendamento gasta ~4 requisições (cliente novo: até ~10, seção 2.0); a sugestão de horários, 1 por profissional por dia (com cache); a sincronização usa no máximo 15/min |

---

## 8. Checklist para ligar

1. Aplicar a migration 034 (backup antes).
2. Deploy do código.
3. `scripts/diagnose-belasis.ts` com a chave do salão (seção 6).
4. Integrações → Belasis: conectar, vincular, **Ativar**.
5. Um agendamento de teste pela IA e conferência na agenda da Belasis (data, hora, profissional, serviço, cliente).
6. Remarcar e cancelar esse agendamento pela IA e conferir lá.
7. "Sincronizar agora" e conferir no painel os agendamentos da recepção (e o resumo: trazidos, sem vínculo, sem telefone).
