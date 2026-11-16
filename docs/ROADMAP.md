# Roadmap — Gestão completa do salão (paridade com a Belasis)

**Criado:** 15 de novembro de 2026
**Origem:** "Auditoria Funcional — Belasis" (13/nov/2026, 80 itens, conta admin, somente leitura).
**Estado:** fase 0 implementada em código (branch `claude/fase-0-permissoes`, ainda não
publicada); migration 036 aplicada e registrada em produção em 15/nov/2026 — ver §4.5.
Fase 1 (comandas) implementada na branch `claude/fase-1-comandas` (ainda não publicada
nem testada em uso), com a migration 037 já aplicada em produção — ver §5.9. Fases 2 em diante: planejamento.

> A auditoria cobre telas e campos (~83%), mas pouco de validações e fluxos (~30%,
> nenhum executado). Só a fórmula de comissão foi confirmada por cálculo. Em cada
> fase, as regras não cobertas precisam ser confirmadas com o dono antes de codar.

## 1. Decisões do dono (15/nov/2026)

| # | Decisão | Efeito |
|---|---|---|
| 1 | O MinhaAgenda vai **substituir** a Belasis, não conviver com ela | Ver §3 — a troca é um corte por salão, não gradual |
| 2 | Provedor de pagamento online fica **por último** | Fase 8 vai para o fim da fila |
| 3 | Provedor fiscal fica **por último** | Fase 10 continua no fim |
| 4 | Regras não cobertas pela auditoria serão confirmadas fase a fase | Cada fase abre com uma lista de perguntas |

## 2. Fases

A ordem segue as dependências: comanda é a base de financeiro, comissão, estoque,
pacotes, cashback e relatórios.

| Fase | Entrega | Depende de | Tamanho |
|---|---|---|---|
| 0. Fundação | Permissões por recurso × ação com perfis reutilizáveis, liberação de módulo por salão, convenções de dinheiro | — | Médio |
| 1. Comandas | Comanda com itens, criar a partir do agendamento, agrupar agendamentos, Salvar/Faturar, formas de pagamento com taxa e prazo | 0 | Grande |
| 2. Financeiro | Contas, transações a receber/pagar, plano de categorias, recebimento, despesa, transferência, recorrência, caixa, débito de cliente, painel | 1 | Grande |
| 3. Comissões | Configuração do salão com sobrescrita por profissional, comissão por item e como auxiliar, extrato, vales e bonificações, pagamento em lote com recibo | 1, 2 | Grande |
| 4. Produtos e estoque | Cadastro completo, marcas, categorias, fornecedores, compras, movimentação, lotes e validades, consumo por serviço, solicitações de saída, sugestão de compra | 1, 3 | Grande |
| 5. Pacotes e assinaturas | Pacotes predefinidos e vendidos com saldo de sessões, assinatura de cliente com renovação manual | 1, 2 | Médio/grande |
| 6. Fidelização | Cashback, promoções e cupons, avaliações pós-atendimento, mensagens de cuidados e retorno por serviço, metas | 1 | Médio |
| 7. Cliente e agenda | Agendamento online público, ficha do cliente completa, anamneses, documentos com assinatura, recorrência e etiquetas na agenda | 1, 5, 6 | Médio/grande |
| 9. Relatórios e multiunidade | Os 38 sub-relatórios, favoritos, exportação, organização com membros por unidade | Todas as anteriores | Médio |
| 8. Pagamento online | Conta de pagamentos por salão, sinal no agendamento online, renovação automática de assinatura | 2, 5, 7 | Médio |
| 10. Notas fiscais | NFS-e, NF-e, NFC-e via API fiscal de terceiros, importação de XML de compra | 1, 2, 4 | Grande |

Vale para todas as fases:

- Cada fase entrega seus próprios relatórios básicos; a fase 9 só consolida.
- Cada fase pode expor o módulo ao agente do WhatsApp (saldo de pacote, cashback,
  cupom, pedido de avaliação) — é o que a Belasis não faz.
- Fora do escopo: Academia, "IA da Belasis", CRM no Chrome, Indique e ganhe.

## 3. Como "substituir a Belasis" acontece na prática

Hoje a Belasis é a **agenda oficial** dos salões integrados (`docs/INTEGRACAO-Belasis.md`):
um agendamento só vale se ela aceitar, e a recepção trabalha lá. Enquanto isso for
verdade, a recepção também fatura, paga comissão e controla estoque lá. Logo:

- **Não dá para trocar módulo a módulo num salão que usa a Belasis.** Faturar comanda
  aqui e pagar comissão lá deixaria os dois sistemas errados.
- **Fases 1 a 3 são pilotadas em salões sem Belasis.** O código é o mesmo; só não
  ligamos o módulo no salão integrado.
- **O corte de um salão integrado é um evento único**, depois da fase 3 (ou da 4 e 5,
  se o salão usa estoque e pacotes — a auditoria mostra que o salão auditado usa
  ambos). No corte: a agenda oficial passa a ser a daqui, a sincronização é
  desligada e os dados são importados.
- **Importação a levantar antes do corte:** clientes, serviços e profissionais já têm
  vínculo (`integration_external_refs`). Falta saber se a API da Belasis entrega saldo
  de pacotes, créditos/débitos de cliente, estoque e histórico de comandas — não
  verificado.

## 4. Fase 0 — Fundação (detalhe)

### 4.1 Permissões

**Hoje** (`apps/web/lib/services/permissions.service.ts`): três níveis por salão —
`manage` (dono, OWNER, MANAGER), `read` (STAFF ativo, só leitura de CRM) e `none`.
`hasSalonPermission` é chamado em 51 pontos.

**Alvo:** permissão por recurso × ação, atribuída por perfil reutilizável ou
personalizada por profissional, como na matriz RN-PERM da auditoria.

Modelo de dados (migration `036_access_profiles.sql`):

| Tabela / coluna | Campos | Observação |
|---|---|---|
| `access_profiles` | `id`, `salon_id`, `name`, `permissions jsonb`, `created_at`, `updated_at` | `permissions` = lista de chaves (`"sales.invoice"`). Único por (`salon_id`, `name`) |
| `professionals.access_profile_id` | FK nula → `access_profiles`, `ON DELETE SET NULL` | Alterar o perfil vale para todos os vinculados |
| `professionals.custom_permissions` | `jsonb` nulo | Preenchido = "Personalizado"; tem prioridade sobre o perfil |

Regras:

1. **Catálogo de permissões em código**, não em banco: um mapa tipado
   `recurso → ações` exportado de `@repo/db`. Chave fora do catálogo é rejeitada na
   gravação e ignorada na leitura.
2. **Dono do salão e papel OWNER têm tudo**, sempre (a chave
   "Administrador/Proprietário" da Belasis).
3. **Compatibilidade:** profissional sem perfil e sem personalização mantém o
   comportamento de hoje — MANAGER tem tudo; STAFF só lê CRM. Nenhum salão muda de
   comportamento no dia do deploy.
4. **Novo guard** `can(salonId, userId, 'recurso.acao')`, memoizado por request como
   o `getSalonAccess`. Módulos novos usam só ele.
5. **`hasSalonPermission` não muda de assinatura.** Os 51 chamadores migram para
   `can` aos poucos, quando a área for tocada.
6. **A trava é no servidor** (Server Action / service). Esconder botão é cortesia.
7. **Tela bloqueada** mantém menu e abas e mostra "Sem permissão" no conteúdo, como
   na Belasis.

Catálogo inicial (só o que existe; cada fase acrescenta o seu):

| Recurso | Ações |
|---|---|
| `schedule` | `access`, `create`, `edit`, `delete`, `view_all` |
| `customers` | `access`, `create`, `edit`, `delete`, `view_phones`, `notes` |
| `services`, `products`, `team` | `access`, `create`, `edit`, `delete` |
| `marketing`, `chat`, `reports`, `settings` | `access` |

Telas:

- **Configurações do salão → Perfis de acesso**
  (`/[salonId]/salon-settings/access-profiles`): lista, criar/editar com a matriz de
  caixas de seleção, excluir (quem estava vinculado volta a seguir o cargo).
- **Na mesma tela, seção Equipe:** por profissional, escolher "Padrão do cargo", um
  perfil ou "Personalizado". Ficou aqui, e não na tela de Equipe, para a decisão de
  acesso ter um lugar só.

### 4.2 Liberação de módulo

- **Por salão (piloto):** lista de módulos ligados em `salons.settings.modules`
  (a coluna `settings jsonb` já existe). Módulo desligado não aparece no menu e as
  actions recusam.
- **Por plano:** quando houver decisão comercial, cada módulo vira uma linha em
  `plan-features.service.ts` (`PlanFeature`), que hoje só tem `advanced_reports`.
  **Pendente do dono:** qual plano inclui o quê.

### 4.3 Convenções para os módulos financeiros

- Dinheiro no banco: `numeric(12,2)`. O driver devolve string — toda conta passa por
  `apps/web/lib/utils/money.utils.ts`, em centavos inteiros.
- Totais são **recalculados no servidor** ao salvar e ao faturar; o que o cliente
  envia é só entrada.
- Toda tabela nova tem `salon_id`, índice por `salon_id` e RLS ligada, seguindo
  `supabase/migrations/999_security_hardening.sql`.
- Migrations: fluxo de `docs/DATABASE.md` (SQL idempotente em `supabase/migrations/`,
  `schema.ts` no mesmo PR, backup antes de produção). Próximo número livre: **036**.

### 4.4 Critérios de pronto da fase 0

- Perfil criado, vinculado a um profissional e respeitado numa action de teste.
- Salão sem perfis configurados se comporta exatamente como antes (teste de regressão
  sobre `classifySalonAccess`).
- Módulo desligado some do menu e a action devolve erro.

### 4.5 Estado da implementação (15/nov/2026)

| Peça | Onde | Estado |
|---|---|---|
| Migration | `supabase/migrations/036_access_profiles.sql` | Aplicada e registrada em produção (15/nov/2026) |
| Tabela e colunas | `packages/db/src/schema.ts` (`accessProfiles`, `professionals.accessProfileId`, `customPermissions`) | Feito |
| Catálogo e regra pura | `packages/db/src/domain/permissions.ts` | Feito, com testes |
| Guard `can()` | `apps/web/lib/services/permissions.service.ts` | Feito |
| Módulo por salão | `apps/web/lib/services/salon-modules.service.ts` | Feito |
| Actions | `apps/web/app/actions/access-profiles.ts` | Feito |
| Tela | `apps/web/app/[salonId]/salon-settings/access-profiles/` | Feita, **não testada no navegador** (sem `.env` no checkout) |

**Ordem de deploy.** A migration 036 tinha que estar aplicada ANTES do código ir para
produção — o `schema.ts` já declara as colunas novas de `professionals`, e toda
consulta do Drizzle que lê a linha inteira passa a pedi-las. Isso já está cumprido:
o código pode ser publicado. Conferido no banco após aplicar: 0 perfis, 0 de 28
profissionais configurados, nenhum salão com módulo ligado.

**Ligar o módulo num salão** (a tela só aparece onde estiver ligado):

```sql
UPDATE salons
   SET settings = jsonb_set(
         coalesce(settings, '{}'::jsonb),
         '{modules}',
         coalesce(settings->'modules', '[]'::jsonb) || '["access_profiles"]'::jsonb
       )
 WHERE id = '<id do salão>';
```

**O que a fase 0 ainda NÃO faz** — importante para não vender o que não existe:

- **Perfis não mudam as telas atuais.** As 51 chamadas a `hasSalonPermission`, o menu
  lateral e o `RouteGuard` continuam decidindo pelo cargo (gerente/equipe). Um perfil
  só passa a valer numa tela quando as actions dela forem migradas para `can()`.
  Os módulos novos (fase 1 em diante) já nascem com `can()`.
- **Não há botão para ligar o módulo** no admin do produto; é o SQL acima.
- **Liberação por plano** segue pendente de decisão comercial (§4.2).

## 5. Fase 1 — Comandas (detalhe)

### 5.1 Escopo

Dentro: formas de pagamento, comanda com itens de serviço e produto, criar a partir
de um agendamento, agrupar agendamentos do dia numa comanda, Salvar (Pendente) e
Faturar (Finalizado), lista com filtros, aba Vendas na ficha do cliente.

Fora (e em qual fase entra):

| Item | Fase |
|---|---|
| Lançamento em Transações, conta de destino, caixa | 2 |
| Faturar com valor em aberto (débito do cliente), crédito do cliente | 2 |
| Auxiliar/assistente no item, cálculo de comissão | 3 |
| Baixa de estoque na venda de produto | 4 |
| Item de pacote, uso de sessão de pacote | 5 |
| Cupom, cashback | 6 |
| Nota fiscal | 10 |

### 5.2 Modelo de dados (migration `037_sales.sql`)

A tabela `payments` já existe e é do SaaS (assinatura do salão). Por isso os
pagamentos de comanda se chamam `sale_payments`.

**`payment_methods`** — formas de pagamento do salão

| Campo | Tipo | Observação |
|---|---|---|
| `id`, `salon_id`, `created_at` | | |
| `name` | text | Único por salão |
| `kind` | text | `cash`, `pix`, `credit_card`, `debit_card`, `other` |
| `fee_percent` | numeric(5,2) | Taxa cobrada do salão |
| `settlement_days` | integer | Prazo de recebimento |
| `is_active` | boolean | Inativa não aparece ao faturar; histórico preservado |

**`sales`** — a comanda

| Campo | Tipo | Observação |
|---|---|---|
| `id`, `salon_id`, `created_at`, `updated_at` | | |
| `number` | integer | Sequencial por salão; único (`salon_id`, `number`) |
| `customer_id` | FK `customers` | Obrigatório |
| `status` | text | `open` (Pendente), `invoiced` (Finalizado), `void` (Excluída) |
| `sale_date` | timestamp | Data da comanda |
| `notes` | text | |
| `subtotal`, `discount_total`, `total` | numeric(12,2) | Recalculados no servidor |
| `invoiced_at`, `invoiced_by` | | Preenchidos ao faturar |
| `voided_at`, `voided_by`, `void_reason` | | Exclusão é lógica |
| `created_by` | FK `profiles` | |

**`sale_items`**

| Campo | Tipo | Observação |
|---|---|---|
| `id`, `sale_id`, `salon_id`, `position` | | |
| `kind` | text | `service` ou `product` |
| `service_id` / `product_id` | FK nula | Exatamente um preenchido (CHECK) |
| `description` | text | Cópia do nome no momento da venda |
| `professional_id` | FK `professionals` | Obrigatório em serviço; opcional em produto (vendedor) |
| `quantity` | numeric(10,3) | |
| `unit_price`, `discount_amount`, `total` | numeric(12,2) | `total = quantity × unit_price − discount_amount`, nunca negativo |
| `appointment_id` | FK nula `appointments` | Um agendamento entra em no máximo uma comanda não excluída (índice único parcial) |

**`sale_payments`**

| Campo | Tipo | Observação |
|---|---|---|
| `id`, `sale_id`, `salon_id`, `created_by`, `paid_at` | | |
| `payment_method_id` | FK | |
| `amount` | numeric(12,2) | |
| `fee_percent`, `fee_amount` | | Cópia da taxa no momento — mudar a forma não reescreve o passado |
| `settles_on` | date | `paid_at` + prazo da forma |

Numeração: contador por salão com trava de linha (coluna `salons.next_sale_number` ou
tabela própria). `max() + 1` gera número duplicado sob concorrência.

### 5.3 Regras de negócio

1. **Salvar** grava como `open`; pode ser editada livremente por quem tem `sales.edit`.
2. **Faturar** é uma transação única: trava a comanda, recalcula totais, grava os
   pagamentos, muda para `invoiced`.
3. **Na fase 1, só fatura se a soma dos pagamentos for igual ao total.** Pagamento
   parcial ou fiado depende de débito de cliente (fase 2).
4. **Faturar fecha os agendamentos vinculados:** cada item com `appointment_id` marca
   o agendamento como `completed`, com `completed_at`, `price_charged` = total do
   item e `outcome_source = 'sale'`. Isso mantém dashboard, LTV e retenção corretos
   sem mudança — eles leem `price_charged`.
5. **Agendamento já concluído à mão** pode virar comanda; ao faturar, o
   `price_charged` passa a ser o da comanda.
6. **Com o módulo ligado**, "Concluir atendimento" na agenda passa a oferecer
   "Criar comanda" como caminho principal. O fechamento manual continua existindo.
7. **Reabrir comanda faturada** exige `sales.edit_invoiced`: volta para `open`,
   remove os pagamentos e devolve os agendamentos para `confirmed`. Registra quem e
   quando.
8. **Excluir** é lógico (`void`), com motivo; agendamentos vinculados são liberados.
9. **Cancelar um agendamento** que está numa comanda `open` remove o item; se a
   comanda está `invoiced`, o cancelamento é recusado.
10. **Desconto é por item**, em valor. Desconto no total da comanda fica para depois.
11. **Preço de serviço em faixa ou "sob avaliação"** entra com o valor em branco e
    precisa ser digitado antes de faturar.
12. **Produto vendido não mexe em estoque** até a fase 4.

Perguntas a confirmar com o dono antes de codar (não cobertas pela auditoria):

- Itens 7 e 9: é esse o comportamento esperado ao reabrir e ao cancelar?
- A comanda pode ter cliente "avulso", sem cadastro?
- A data da comanda pode ser retroativa? Sem limite?
- O profissional comum fatura, ou só a recepção?

### 5.4 Permissões novas

| Recurso | Ações |
|---|---|
| `sales` | `access`, `create`, `edit`, `delete`, `view_invoiced`, `invoice`, `edit_invoiced`, `view_all` |
| `payment_methods` | `access`, `manage` |

Sem `view_all`, o profissional vê só comandas com itens dele.

### 5.5 Telas

| Tela | Rota / lugar | Conteúdo |
|---|---|---|
| Lista de comandas | `/[salonId]/sales` | Nº, data, cliente, status, total, forma de pagamento. Filtros: período, status, forma, excluídas |
| Comanda | `/[salonId]/sales/[saleId]` | Cliente, data, nº, itens (descrição, profissional, qtde, valor, desconto, total), observações; Salvar e Faturar |
| Faturar | Diálogo na comanda | Uma ou mais formas de pagamento; mostra taxa e líquido por linha; trava se a soma não fecha |
| Formas de pagamento | Configurações do salão | Nome, tipo, taxa, prazo, ativa |
| Criar comanda | Diálogo do agendamento (`components/scheduler/appointment-detail-dialog.tsx`) | Abre a comanda já com o serviço, o profissional e o cliente |
| Agrupar agendamentos | Agenda → Ações | Agendamentos do dia por cliente, com busca; cria uma comanda com todos |
| Vendas | Ficha do cliente | Comanda, data, descrição, valor, profissional; filtro de período |

### 5.6 Onde o código mora

| O quê | Onde |
|---|---|
| Tabelas e tipos | `packages/db/src/schema.ts` + `supabase/migrations/037_sales.sql` |
| Regra (criar, salvar, faturar, reabrir, excluir) | `packages/db/src/services/sales.service.ts` |
| Server Actions | `apps/web/app/actions/sales.ts`, `payment-methods.ts` |
| Validação de entrada | `apps/web/lib/schemas/sales.schema.ts` |
| Telas | `apps/web/app/[salonId]/sales/` |
| Testes | `apps/web/__tests__/` — totais, faturamento, numeração concorrente, isolamento por salão |

### 5.7 Ordem de entrega

1. **1a** — migration, schema, formas de pagamento (tela + action).
2. **1b** — comanda: criar, editar, salvar, lista.
3. **1c** — faturar, reabrir, excluir, fechamento dos agendamentos.
4. **1d** — agenda: Criar comanda e Agrupar agendamentos.
5. **1e** — aba Vendas na ficha do cliente, filtros da lista.

### 5.8 Critérios de pronto da fase 1

- Agendamento → comanda → faturada em duas formas de pagamento; agendamento fica
  `completed` com o valor certo e o dashboard reflete.
- Duas comandas criadas ao mesmo tempo no mesmo salão recebem números diferentes.
- Usuário de outro salão não lê nem altera a comanda (teste).
- Profissional sem `sales.invoice` não fatura, nem chamando a action direto.
- Salão com o módulo desligado não vê nada novo.

### 5.9 Estado da implementação (15/nov/2026)

Branch `claude/fase-1-comandas` (sai de `claude/fase-0-permissoes`).

| Peça | Onde | Estado |
|---|---|---|
| Migration | `supabase/migrations/037_sales.sql` | Aplicada em produção (15/nov/2026) e conferida por leitura; **falta registrar** em `supabase_migrations.schema_migrations` |
| Tabelas | `packages/db/src/schema.ts` (`paymentMethods`, `saleCounters`, `sales`, `saleItems`, `salePayments`) | Feito |
| Regra pura (itens, totais, faturamento) | `packages/db/src/domain/sales.ts` | Feito, com testes |
| Gravação (criar, salvar, faturar, reabrir, excluir, listar) | `packages/db/src/services/sales.service.ts` | Feito, **sem teste contra banco** |
| Actions | `apps/web/app/actions/sales.ts`, `payment-methods.ts` | Feito |
| Formas de pagamento | `/[salonId]/salon-settings/payment-methods` | Feita |
| Lista e comanda | `/[salonId]/sales`, `/[salonId]/sales/[saleId]` (`new` = criar) | Feitas |
| Criar comanda pelo agendamento | botão no diálogo do agendamento → `/sales/new?appointment=<id>` | Feito |
| Menu "Comandas" | `components/dashboard/sidebar.tsx` | Feito (módulo ligado + `sales.access`) |
| Agrupar agendamentos | botão "Agrupar em comanda" na agenda (`components/scheduler/group-appointments-dialog.tsx`) → `/sales/new?appointment=<id>&appointment=<id>` | Feito |
| Vendas na ficha do cliente | `components/contacts/customer-sales-card.tsx` | Feito |
| Cancelar agendamento remove o item da comanda aberta (regra 9) | `detachCancelledAppointmentFromSale`, chamado por `cancelAppointmentService` | Feito |

Nenhuma tela foi aberta no navegador (sem `.env` no checkout): typecheck, lint, testes
e `next build` passam, mas o fluxo nunca foi clicado. A gravação no banco
(transações, trava de linha, numeração) só será exercitada no piloto.

**Deploy.** Diferente da 036, a ordem aqui é livre: a 037 só cria tabelas novas e o
código só as consulta com o módulo `sales` ligado. Para usar, as duas coisas precisam
estar no ar.

**Ligar o módulo num salão** (depois da 037 aplicada):

```sql
UPDATE salons
   SET settings = jsonb_set(
         coalesce(settings, '{}'::jsonb),
         '{modules}',
         coalesce(settings->'modules', '[]'::jsonb) || '["sales"]'::jsonb
       )
 WHERE id = '<id do salão>';
```

Quem vê o quê, sem configurar perfil: gerentes e o dono têm todas as permissões de
comanda; a equipe (STAFF) não tem nenhuma — precisa de um perfil de acesso.

**Padrões assumidos nas perguntas da §5.3** (sem resposta do dono até aqui):

| Pergunta | O que foi implementado |
|---|---|
| Reabrir comanda faturada | Remove os pagamentos e devolve para "confirmado" só os agendamentos que a própria comanda fechou |
| Cliente avulso | Não: a comanda exige cliente cadastrado |
| Data retroativa | Livre, sem limite |
| Quem fatura | Quem tiver a permissão `sales.invoice` — por padrão, gerentes e o dono |

**Diferenças em relação ao plano da §5.3 e da §5.5:**

- **"Agrupar em comanda" é um botão no topo da agenda**, não um item de menu
  "Ações" (a agenda não tem esse menu). Lista os agendamentos do dia em foco, por
  cliente, e junta os de UM cliente; se algum já está em outra comanda, avisa qual.
- **Vendas na ficha é um cartão**, não uma aba — a ficha do cliente é uma página
  só, sem abas. Mostra as últimas 50 comandas, sem filtro de período.
- **A regra 9 roda em todo cancelamento** (painel, IA, sincronização com a agenda
  oficial): é uma consulta a mais por cancelamento, pelo índice do agendamento. Se
  falhar, o cancelamento segue e o item fica na comanda.

- **Excluir** só vale para comanda aberta; a faturada precisa ser reaberta antes
  (regra 8 não dizia isso).
- **Agendamento que ainda não começou** não pode ser faturado — mesma regra do
  "Concluir" da agenda. A comanda pode ser aberta antes; só o faturamento espera.
- **Agendamento marcado como falta** também barra o faturamento.

## 6. Pendências do dono

| Pendência | Trava |
|---|---|
| Respostas às perguntas da §5.3 | Fase 1c |
| Qual plano inclui cada módulo | Liberação comercial (não trava o piloto) |
| Em qual salão sem Belasis pilotar | Fase 1 em produção |
| Conta Belasis de teste para executar fluxos | Fidelidade das regras nas fases 2 a 5 |
| Provedor de pagamento e provedor fiscal | Fases 8 e 10 |
