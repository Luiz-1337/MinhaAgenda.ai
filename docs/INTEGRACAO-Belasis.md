# Integração Belasis — Diagnóstico, Implementação e Ativação

**Atualizado:** 13 de novembro de 2026 (nome completo antes do cadastro, consulta por cliente antes de remarcar, origem do lead e cor — seções 2.0, 2.3 e 2.4; migration 035 aplicada em produção em 13/nov, **código ainda não publicado**)
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
| Cor do agendamento | `schedule_color_id` (inteiro, opcional) no corpo da criação; os ids vêm de `GET /schedule_colors`, que devolve de uma vez as cores "cadastradas pela empresa" (`id`, `name`, `color`, `default_for`). Cor inexistente → 422 "Cor de agendamento não encontrada". A doc não tem token nem permissão à parte para cor. Endpoints que não existiam em 15/out (a API passou de 33 para 49); lidos em 12/nov |
| Agendamentos de um cliente | `GET /schedule_groups?client_id=` (com `start_date`/`end_date`); a doc não fala em limite de período |

Conferido contra a API real (15/out, com chave propositalmente inválida): `/api/v1/employees` existe e responde 401; a recusa vira `auth` no nosso cliente.

---

## 2. Como fica o fluxo, com a Belasis como agenda oficial

O Google Calendar é **espelho** (cópia em segundo plano; se falhar, o agendamento continua valendo). A Belasis é o contrário: um agendamento só vale se ela aceitar.

| Momento | O que acontece | Se a Belasis falhar |
|---|---|---|
| IA sugere horários | subtrai o que está ocupado na grade `free_times` (cache de 45 s) | segue sem ela (a checagem do agendamento trava) |
| Cliente fala de um horário que já tem, ou a IA vai agendar | consulta os horários futuros **daquela cliente** lá e traz para cá o que a recepção marcou (seção 2.3) | a IA é avisada de que não conseguiu conferir; não afirma que não há horário |
| Antes de reservar | confere o horário na grade, sem cache | **não agenda** (fail-closed) |
| Depois de reservar aqui | acha o cliente pelo telefone (ou cadastra, com o nome que a cliente informou — seção 2.0) e grava lá **na hora**; lead de tráfego leva a cor (seção 2.4) | **desfaz a reserva local**; a IA oferece outro horário. Cor recusada não conta: sai sem cor |
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

**De quem é o nome** (`customers.name_confirmed_at`, migration 035). O cliente nasce aqui com o nome do perfil do WhatsApp. Em 07/nov uma cliente foi cadastrada lá só como "Sil", o apelido do perfil, e a recepção teve de pedir o sobrenome por mensagem. Agora a IA só cria cadastro lá com nome que uma **pessoa** informou:
- `name_confirmed_at` vazio = o nome veio do perfil. Fica preenchido quando a cliente informa o nome (tool `updateCustomerName`), quando alguém o digita no painel, ou quando o cadastro vem da Belasis (sincronização);
- cliente sem cadastro lá **e** sem nome confirmado → a tool de agendar/remarcar devolve `CUSTOMER_NAME_REQUIRED` e a IA pede nome e sobrenome. O prompt já manda perguntar quando a cliente escolhe o horário, para a pergunta não sair como resposta a um erro;
- só o primeiro nome → a IA pede o sobrenome uma vez; sem sobrenome o agendamento sai do mesmo jeito;
- quem já tem cadastro lá (vínculo guardado, ou achado pelo telefone) não é perguntada.

A regra mora em `customer-agenda-name.service.ts` (@repo/db) e é lida pela trava das tools (`agenda-customer-name.service.ts`, mcp-server) e pelo prompt.

**Um cliente por telefone, aqui dentro.** A busca de cliente na entrada do WhatsApp e no cadastro do painel comparava o texto exato do telefone; o painel gravava sem o 55 e a mesma pessoa virava dois cadastros (9 pares em 4 salões em 12/nov). Agora as duas comparam por DDD + 8 últimos dígitos (`customer-phone.service.ts`) e o número achado em outro formato é regravado no formato do WhatsApp. Os pares que já existem precisam ser unificados à mão.

Custo na cota (30/min): cliente com o telefone só em dígitos, **1** chamada; formatado, 2; cliente novo, 2 + 1 a 5 (os 4 dígitos) + 1 (o cadastro). Para ver qual termo acha um telefone real: `scripts/diagnose-belasis.ts --phone` (seção 6).

Alertas no painel (`system_alerts`, um aberto por tipo): `agenda_auth_failed` e `agenda_unavailable` (críticos — reconectar), `agenda_not_linked`, `agenda_rejected`, `agenda_write_uncertain`, `agenda_cancel_failed`, `agenda_ref_not_saved`, `agenda_conflict`.

### 2.1 Sincronização (Belasis → MinhaAgenda)

Decisão do dono (21/out): só nesse sentido, próximos 30 dias, botão "Sincronizar agora" + automática de hora em hora. Não é ela que evita choque de horário (a IA já consulta a Belasis ao vivo); ela faz o MinhaAgenda **enxergar** o que a recepção marca.

Para cada agendamento lá no período:
- **já existe aqui** (criado pela IA ou trazido antes) → cancelado lá cancela aqui; horário/profissional mudou lá corrige aqui; confirmado lá confirma aqui. Atendimento já concluído/falta aqui não é desfeito;
- **não existe aqui** (marcado na recepção) → cria aqui com o de-para ao contrário (nº 7 → Ana) e a cliente achada pelo telefone (ou cadastrada). Entra sem as travas de expediente/conflito — lá já aceitou; se bater com algo daqui, entra mesmo assim e abre `agenda_conflict`;
- **profissional ou serviço sem par** → fica de fora ("sem vínculo" no resumo). A Belasis devolve a agenda do salão inteiro: os itens de profissionais de lá sem par aqui são descartados logo no começo (uma consulta por profissional, não por item) e não entram no "Sincronizando… X de Y" — a barra conta só o que pode mexer em algo daqui. Exceções que ainda passam: agendamento já ligado a um daqui (a recepção pode tê-lo passado para outro profissional) e o que tem a marca `[MinhaAgenda <id>]`;
- **visita com vários serviços** (corte com a Ana + escova com a Bia) → um agendamento aqui por serviço, com referência `grupo:item`; cancelar/remarcar um deles pela IA mexe só naquele item lá.

E o contrário: o que foi para lá e não veio na lista (apagado, ou remarcado para fora do período) é conferido um a um.

Ritmo: no máximo **15 chamadas por minuto** em segundo plano — metade da cota da chave fica sempre livre para a IA. A primeira sincronização pode levar alguns minutos (cada cliente novo é buscado lá); as seguintes, segundos. O andamento aparece no card da Belasis.

**Pausar** = o MinhaAgenda não fala com a Belasis: a IA agenda só aqui, sem consultar nem gravar lá, e a sincronização também para. Token e vínculos continuam salvos; **Ativar** volta tudo.

### 2.2 Agendamentos que já existiam antes da ativação

Nada leva para a Belasis o que foi agendado aqui **antes** de ativar: a gravação lá só acontece ao criar ou remarcar, e a sincronização é só no sentido Belasis → MinhaAgenda. A recepção vê o profissional livre nesses horários. Visto no Spettacolo Salone (3/nov): 12 agendamentos futuros do Fabiano, criados em 29/out, nunca chegaram lá.

**Não cadastrar à mão na Belasis:** sem o par salvo, a sincronização traz cada um de volta como agendamento novo — duplicado aqui, com lembrete em dobro.

O caminho é `scripts/backfill-belasis.ts`, que grava um por um pelo mesmo fluxo da IA (confere vínculo, telefone e horário livre lá; salva o par). Por padrão só simula; `--apply` grava. Antes de criar, procura lá a marca `[MinhaAgenda <id>]`, então rodar de novo não duplica.

```bash
pnpm --filter @repo/db exec tsx ../../scripts/backfill-belasis.ts --salon <uuid>            # simulação
pnpm --filter @repo/db exec tsx ../../scripts/backfill-belasis.ts --salon <uuid> --apply    # grava
```

Sem `pnpm` no PATH (Windows): de dentro de `packages/db`, `npx -y tsx@4.21.0 ../../scripts/backfill-belasis.ts ...` (ou `corepack pnpm ...` na raiz).

Precisa de `DATABASE_URL` e da `ENCRYPTION_KEY` do app (lidas de `apps/web/.env.local`). Horário que a grade da Belasis não marca como livre — inclusive almoço — sai como "ocupado" e fica de fora até liberarem lá. `--only id1,id2` limita (bom para testar com um só); `--skip id1,id2` deixa algum de fora. Alertas são impressos, não vão para o painel do salão.

### 2.3 O que a cliente já tem marcado lá (consulta por cliente)

A sincronização é de hora em hora e deixa de fora o que não tem par aqui. Em 10 e 12/nov duas clientes pediram para remarcar um horário que uma atendente tinha marcado direto na Belasis; aqui ele não existia, a IA respondeu "não encontrei nenhum agendamento futuro" e criou **outro** — o original continuou na agenda (e, num dos casos, nasceu um segundo cadastro).

`refreshCustomerAppointmentsFromAgenda` (`agenda-customer-refresh.service.ts`) consulta **uma cliente**: acha o cadastro dela lá (vínculo guardado ou telefone), lista os agendamentos desse cadastro dos próximos 180 dias (`client_id`) e passa pelo mesmo miolo da sincronização (`reconcileAgendaAppointments`). O que a recepção marcou passa a existir aqui, no cadastro da cliente da conversa, e é remarcado ou cancelado pelas tools de sempre.

**De quem é cada horário:** tudo o que essa consulta traz é dado à cliente da conversa, então o dono de cada item é conferido aqui (no provedor e no serviço), e não só pelo filtro `client_id` da API. Item de outro cadastro, ou sem `client_id`, fica de fora. O filtro vem da documentação da Belasis e **ainda não foi conferido com a chave de um salão**: se a API o ignorar, nada de outra pessoa entra, mas cada consulta percorre a agenda inteira (passo 6 do diagnóstico, seção 6).

Quando roda:
- a tool `getMyFutureAppointments`, sempre;
- o bloco de agendamentos do prompt, quando a mensagem fala de um horário que ela já tem (`detectExistingAppointmentIntent`: remarcar, desmarcar, "outro dia", "não vou poder ir", "tinha agendado");
- a tool `addAppointment`, antes de criar. Se a consulta **trouxe** um horário futuro, a tool não cria e devolve `EXISTING_APPOINTMENT_FOUND` com o horário e o id, para a IA perguntar se é remarcação. Na segunda chamada (horário a mais) ela cria.

Horário de lá cujo serviço ou profissional não tem par aqui não dá para trazer: a IA é avisada de que ele existe e não pode ser alterado por aqui, e encaminha para a equipe em vez de criar outro.

Custo: 1 chamada por consulta com a cliente já vinculada; sem vínculo, a busca por telefone da seção 2.0. Consulta repetida em menos de 1 minuto não vai à API, e o "não achei este telefone" vale por 10 minutos — tempo de a cliente responder o nome, sem pagar a busca três vezes.

**Limite conhecido:** se o cadastro que a recepção usou não tem o celular da cliente, não há como achá-lo por telefone; aí a IA não enxerga o horário.

### 2.4 Origem do lead e cor

O WhatsApp oficial (Cloud API) manda `referral` na mensagem que nasce de um clique em anúncio (`messages.ad_referral`, migration 031). O webhook classifica (`leadSourceFromReferral`: `source_type` `ad`, ou click id sem tipo → tráfego; `post` e sem `referral` → orgânico) e grava no cliente (`customers.lead_source`, migration 035). A marca só sobe: orgânico vira tráfego ao clicar num anúncio; tráfego não volta. O agendamento copia a marca do cliente ao ser criado (`appointments.lead_source`), inclusive o que vem da recepção pela sincronização. Canal que não entrega a origem (Evolution) deixa vazio.

Na Belasis, o agendamento de lead de tráfego criado por aqui leva `schedule_color_id`. A cor é escolhida pela variável de ambiente **`BELASIS_TRAFFIC_COLOR`**: o nome da cor como está cadastrada na conta do salão (ex.: `Marrom`) ou o id. O id é resolvido em `GET /schedule_colors` e guardado por 6 horas. O token usado é o do próprio salão.

A cor nunca impede um agendamento:
- sem a variável, ou cor não cadastrada na conta, ou listagem fora do ar → agenda sem cor;
- a Belasis recusa (422) → repete a criação sem a cor e fica 10 minutos sem tentar de novo.
Em todos os casos `appointments.lead_source` continua gravado.

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
| De-para de IDs | tabela `integration_external_refs` — `supabase/migrations/034_integration_external_refs.sql` (aplicada em produção em out/2026) |
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
10. **Cliente sem nome próprio → a IA pergunta o nome antes de agendar ou remarcar** (decisão de 03/nov, ampliada em 13/nov). Vale quando o nome daqui não tem nenhuma letra (só emoji, como "💤", ou o telefone) **e também quando o nome veio do perfil do WhatsApp** e a cliente ainda não tem cadastro lá — aí a IA pede nome e sobrenome (seção 2.0). A trava fica no mcp-server (`agenda-customer-name.service.ts`, erro `CUSTOMER_NAME_REQUIRED`). Na remarcação, só vale quando muda horário, profissional ou serviço. Sem agenda oficial, nada muda; o painel não passa por ela.
11. **Cancelar daqui remove o agendamento lá** (decisão do dono, 03/nov). Cancelado (`disconfirm`) continua ocupando o horário na Belasis (seção 1): o salão via o horário preso e a IA não o oferecia de novo. Vale também para o antigo de uma remarcação para outro dia/profissional/serviço. O histórico do cancelamento fica no MinhaAgenda; lá o registro some. Se a Belasis não deixar remover (422), cai no `/cancel`. Agendamento já cancelado lá (pela recepção) não é tocado. Os cancelados daqui antes desta decisão continuam lá ocupando o horário — a recepção exclui na Belasis.
12. **Antes de criar, a IA confere o que a cliente já tem lá** (13/nov, seção 2.3). Achou horário futuro que não conhecia → não cria; pergunta se é remarcação. Custa uma chamada a mais por agendamento.
13. **Faltar sobrenome não trava o agendamento** (13/nov). A IA pede o nome completo e, se vier só o primeiro nome, pede o sobrenome uma vez; depois segue.
14. **Cor de tráfego escolhida pelo nome, em variável de ambiente** (13/nov, seção 2.4). `BELASIS_TRAFFIC_COLOR=Marrom`. O token é o do salão; a doc da Belasis não tem credencial à parte para cor. A variável vale para todos os salões com Belasis — por isso o nome (cada conta tem os seus ids).

---

## 6. O que a doc não responde — validar com chave real (`scripts/diagnose-belasis.ts`)

```bash
BELASIS_TOKEN=bpk_... pnpm --filter @repo/db exec tsx ../../scripts/diagnose-belasis.ts --date 2026-10-20 --phone 5547999998888
```

Só leitura, ~8 requisições, não imprime a chave. Conferir:

1. **Estabelecimento:** os profissionais listados são os do salão? (a chave "vale para todos os estabelecimentos" e não há parâmetro — se a conta tiver mais de um, pode misturar.)
2. **Grade:** o passo inferido e o que aparece fora do expediente; os agendamentos do dia caem nos horários `✗`? (confirma o fuso.)
3. **Telefone:** o formato guardado nos clientes (o exemplo da doc vem sem DDI e às vezes formatado). O `--phone` roda os três termos da busca (seção 2.0), diz quantos candidatos cada um trouxe, se cortou em páginas e qual acha o cliente — com os números mascarados.
4. **No piloto:** a Belasis recusa agendamento em horário ocupado? Qual o texto do 422? (o cliente reconhece "indisponível/ocupado/conflito".)
5. **Filtro por cliente** (passo 6 do script; `--client ID` escolhe o cliente, senão usa um com horário em `--date`): a listagem com `client_id` traz só os agendamentos daquele cliente? É disso que depende a consulta da seção 2.3. O script diz quantos vieram de outros clientes ou sem `client_id`.
6. **Cores** (passo 7; `--color NOME` ou `BELASIS_TRAFFIC_COLOR`, padrão "Marrom"): as cores da conta e se a do lead de tráfego existe, com o id que vai em `schedule_color_id` (seção 2.4).

---

## 7. O que falta

| # | Item | Observação |
|---|---|---|
| 1 | ~~Aplicar a migration 034~~ | **Feito** em out/2026 (consta em `supabase_migrations.schema_migrations`) |
| 2 | Rodar o diagnóstico com a chave do salão (seção 6) | |
| 3 | Piloto: conectar, vincular, ativar, e um agendamento real pela IA | acompanhar os alertas `agenda_*` |
| 4 | Confirmação do cliente (resposta ao lembrete) → `confirm` na Belasis | hoje a confirmação não sincroniza com ninguém (decisão antiga de `ConfirmAppointmentUseCase`) |
| 5 | Mudança feita na recepção chega aqui em até 1 hora (sincronização) ou antes do lembrete | webhook não existe; o botão "Sincronizar agora" traz na hora |
| 6 | Cancelamento em massa ao remover profissional (`actions/professionals.ts`) não avisa a agenda oficial | |
| 7 | Volume: 30 req/min por salão | cada agendamento gasta ~5 requisições (cliente novo: até ~10, seção 2.0; a consulta por cliente da seção 2.3 soma 1); a sugestão de horários, 1 por profissional por dia (com cache); a sincronização usa no máximo 15/min |
| 8 | ~~Aplicar a migration 035~~ (`customers.name_confirmed_at`, `customers.lead_source`, `appointments.lead_source`) | **Feito** em 13/nov/2026, antes do deploy. Carga: 1.059 clientes de tráfego, 304 orgânicos, 99 sem origem; 12 agendamentos de tráfego. As duas tabelas como estavam antes ficaram em `backups.customers_pre_035_20261113` e `backups.appointments_pre_035_20261113` (schema fora da API; apagar quando o deploy estiver validado). `get_advisors` sem novidade além dessas duas cópias |
| 9 | `BELASIS_TRAFFIC_COLOR` no worker e no app web | e a cor com esse nome cadastrada na conta Belasis do salão. Sem isso, agenda sem cor |
| 10 | Unificar os cadastros duplicados por formato de telefone | Spettacolo Salone: **feito** em 13/nov (4 pares, `scripts/data-fixes/2026-11-13-spettacolo-salone-clientes-duplicados.sql`). Restam 5 pares em 3 outros salões. O código novo não cria mais, mas não junta os que já existem |
| 11 | Por que a sincronização não trouxe os horários da recepção desde 03/nov (Spettacolo Salone) | não diagnosticado: serviço sem vínculo, cadastro sem celular ou rotina parada. O resumo da última sincronização no card da Belasis diz qual. No banco (13/nov), os 36 agendamentos do salão têm par lá: 11 criados juntos em 03/nov às 20h10 e 25 criados pela IA ou pelo painel (`sync_source = app`) de 04 a 12/nov — nenhum com cara de ter vindo da recepção depois de 03/nov. O passo 5 do diagnóstico avisa se a listagem vem sem `client_id`, o que impediria a sincronização de achar o cliente |
| 12 | **Rodar o diagnóstico com a chave do salão antes de publicar este código** (seção 6, itens 5 e 6) | a consulta por cliente (seção 2.3) e a cor (seção 2.4) foram escritas pela documentação da Belasis, sem chamada real. Os testes usam uma Belasis simulada |

---

## 8. Checklist para ligar

1. Aplicar a migration 034 (backup antes).
2. Deploy do código.
3. `scripts/diagnose-belasis.ts` com a chave do salão (seção 6).
4. Integrações → Belasis: conectar, vincular, **Ativar**.
5. Se o salão já tinha agendamentos futuros aqui: `scripts/backfill-belasis.ts` — simulação, depois `--apply` (seção 2.2).
6. Um agendamento de teste pela IA e conferência na agenda da Belasis (data, hora, profissional, serviço, cliente).
7. Remarcar e cancelar esse agendamento pela IA e conferir lá.
8. "Sincronizar agora" e conferir no painel os agendamentos da recepção (e o resumo: trazidos, sem vínculo, sem telefone).
