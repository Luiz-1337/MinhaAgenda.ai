# Roadmap — Gestão completa do salão (paridade com a Belasis)

**Criado:** 15 de novembro de 2026
**Origem:** "Auditoria Funcional — Belasis" (13/nov/2026, 80 itens, conta admin, somente leitura).
**Estado:** fase 0 implementada em código (branch `claude/fase-0-permissoes`, ainda não
publicada); migration 036 aplicada e registrada em produção em 15/nov/2026 — ver §4.5.
Fase 1 (comandas) implementada na branch `claude/fase-1-comandas` (ainda não publicada
nem testada em uso), com a migration 037 já aplicada em produção — ver §5.9. Fase 2 (financeiro): fatias 2a a 2e e 2g implementadas na
branch `claude/fase-2-financeiro`; migrations 038 e 039 aplicadas; fases 0 a 2
testadas em uso num salão — ver §6.7 e §6.8. A fatia 2f (débito de cliente) está
feita, com a migration 040 aplicada em 16/nov/2026 e testada em uso. Fica para depois o
crédito de cliente (2h). As fases 0 a 2 estão em três PRs abertos (#14, #15 e #16).
Fase 3 (comissões): fatia 3a feita na branch `claude/fase-3-comissoes` (publicada,
sem PR), com a migration 041 aplicada em 16/nov/2026 e testada em uso — ver §7.7.
Fatia 3b (auxiliar) feita na mesma branch e publicada, com a migration 042 aplicada
em 16/nov/2026 e testada em uso — ver §7.8. Fatia 3c (vales e bonificações) feita na
mesma branch e publicada, com a migration 043 aplicada em 16/nov/2026 e testada em
uso — ver §7.9. Fatia 3d (pagamento em lote, recibo e saída no financeiro) feita na
mesma branch e publicada, com a migration 044 aplicada em 16/nov/2026 e testada em
uso — ver §7.10. As migrations 040 a 044 estão registradas em `schema_migrations`.
Da fase 3 falta só a fatia 3e, que depende do estoque (fase 4).
Fase 4 (produtos e estoque): fatia 4a feita na branch `claude/fase-4-estoque`
(publicada, sem PR), com a migration 045 aplicada e registrada em 16/nov/2026.
**Ainda sem teste em uso**: o preview da branch nova pede login — ver §8.7.
Fases 5 em diante: planejamento.

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
| Migration | `supabase/migrations/037_sales.sql` | Aplicada e registrada em produção (15/nov/2026), conferida por leitura |
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

## 6. Fase 2 — Financeiro (detalhe)

A comanda registra a venda e como ela foi paga. O financeiro registra o DINHEIRO:
quando entra, em qual conta, quanto a maquininha levou e o que o salão tem a pagar.
É também o que a comissão (fase 3) vai ler para saber quando um valor ficou
disponível.

### 6.1 Fatias

A fase é grande demais para uma entrega só. Ordem e estado:

| Fatia | Entrega | Estado |
|---|---|---|
| 2a | Contas, plano de categorias, conta de destino da forma de pagamento | Feita |
| 2b | Transações: faturar comanda gera conta a receber; reabrir desfaz | Feita |
| 2c | Novo recebimento, nova despesa, transferência, baixa, estorno, exclusão, lista com filtros e totais, saldo por conta | Feita |
| 2d | Editar lançamento manual em aberto; lançamento que se repete todo mês | Feita |
| 2g | Resumo do mês: recebido, pago, resultado, a receber, a pagar, atrasado, por categoria, por forma de pagamento e fluxo de caixa por dia | Feita (em tabelas, sem gráficos) |
| 2e | Caixa: abrir, suprimento, sangria, fechar com conferência, histórico; comanda paga em dinheiro entra sozinha | Feita e testada em uso |
| 2f | Débito de cliente: faturar com valor em aberto e receber depois, em uma ou mais vezes | Feita — migration 040 aplicada em 16/nov/2026, testada em uso |
| 2h | Crédito de cliente (saldo a favor, usado como forma de pagamento) | Pendente — ficou fora da 2f |

### 6.2 Modelo de dados (migration `038_finance.sql`)

| Tabela / coluna | O que é |
|---|---|
| `financial_accounts` | Onde o dinheiro está: banco, caixa, cofre. Tem saldo inicial; o saldo atual nunca é gravado, é sempre saldo inicial + entradas pagas − saídas pagas |
| `financial_categories` | Plano de categorias, de receita e de despesa |
| `financial_transactions` | Contas a receber e a pagar, e as transferências |
| `payment_methods.account_id` | Conta de destino de cada forma de pagamento |

Campos centrais de `financial_transactions`:

| Campo | Regra |
|---|---|
| `direction` | `in` (entrada) ou `out` (saída) |
| `kind` | `sale` (gerada por comanda), `manual` (lançada na tela), `transfer` (perna de transferência) |
| `status` | `open` (a receber / a pagar) ou `paid` (baixada); paga exige `paid_at` |
| `amount`, `fee_amount`, `net_amount` | Bruto, taxa e líquido. O líquido é gravado e é o que entra no saldo |
| `due_date`, `competence_date` | Dias de calendário em Brasília, sem hora |
| `sale_payment_id` | Aponta para o pagamento da comanda, com `ON DELETE CASCADE` |
| `transfer_group` | Une as duas pernas de uma transferência |

### 6.3 Regras de negócio

1. **Faturar comanda gera uma conta a receber por pagamento.** A taxa da forma de
   pagamento vira `fee_amount`; o líquido é o que entra no saldo.
2. **Prazo zero nasce pago; com prazo nasce em aberto**, vencendo no dia do
   recebimento. É a diferença entre vender e receber.
3. **Reabrir a comanda apaga as contas a receber dela**, sem código: os pagamentos
   são removidos e a chave estrangeira leva junto.
4. **Só gera financeiro com o módulo `finance` ligado** no salão. Comandas faturadas
   antes de ligar o módulo não entram — não há retroativo (pendente, se necessário).
5. **Nada entra em saldo sem conta.** Dar baixa exige conta. Forma de pagamento sem
   conta de destino não trava o faturamento: a venda entra como "sem conta" e fica
   fora de todo saldo até alguém dar baixa informando a conta.
6. **Baixa não pode ter data futura.**
7. **Transferência são duas linhas pagas**, saída de uma conta e entrada na outra.
   Não entra em receita nem despesa, nem nos totais da tela.
8. **Excluir:** lançamento manual só em aberto (o baixado precisa ser estornado
   antes); transferência exclui as duas pernas; lançamento de comanda não se exclui
   — reabre-se a comanda.
9. **Conta e categoria com lançamento não são excluídas**, são desativadas.
10. **O tipo da categoria (receita/despesa) não muda na edição.**
11. **Só se edita lançamento manual em aberto.** O baixado precisa ser estornado
    antes; lançamento de comanda e transferência não se editam. O tipo (entrada ou
    saída) não muda na edição.
12. **Lançamento que se repete** cria uma linha por mês (até 60), numeradas
    "(2/6)", a partir do vencimento informado. Dia 31 recua para o último dia nos
    meses mais curtos e volta ao 31 quando existe. "Já pago" vale só para a
    primeira. Depois de criadas, as linhas são independentes — não há "excluir as
    próximas" (exigiria uma coluna de grupo, que ficou fora para não pedir migration).
13. **O resumo separa duas perguntas:** recebido e pago são pelo DIA DA BAIXA
    (regime de caixa); a receber e a pagar são pelo VENCIMENTO. Atrasado independe
    do mês escolhido.

Caixa (fatia 2e) — o dono escolheu seguir com estes padrões, em 15/nov/2026:

14. **Um caixa aberto por salão**, com quem abriu registrado. O banco garante (índice
    único parcial); duas abas abrindo ao mesmo tempo não criam dois.
15. **O caixa é separado das contas financeiras.** Ele controla o dinheiro vivo da
    gaveta e não gera lançamento em conta: suprimento e sangria NÃO mexem em saldo.
    Uma sangria que vira depósito no banco ainda precisa de uma transferência
    lançada à parte no financeiro.
16. **Comanda paga em dinheiro entra sozinha** no caixa aberto: só forma de pagamento
    do tipo "Dinheiro", e só se houver caixa aberto. Sem caixa aberto a comanda
    fatura normalmente e nada é registrado — o caixa não trava a venda.
17. **Reabrir a comanda tira a entrada do caixa**, mesmo que o caixa já esteja
    fechado. O esperado, o contado e a diferença gravados no fechamento NÃO mudam —
    o histórico fica como foi fechado.
18. **Sangria maior que o dinheiro em caixa é barrada.**
19. **O esperado só é gravado no fechamento**; com o caixa aberto é sempre calculado
    (inicial + suprimentos + vendas em dinheiro − sangrias).
20. **Diferença não impede fechar.** Sobra e falta ficam registradas no histórico.
21. **Caixa fechado não se reabre nem se edita** nesta fatia.

Débito de cliente (fatia 2f) — o dono escolheu seguir com estes padrões:

22. **O débito é a própria comanda**, não uma tabela nova: `sales.amount_due` guarda
    quanto da comanda faturada ainda não foi pago, e `sales.debt_due_date` quando a
    cliente combinou de pagar (opcional).
23. **Fiado é decisão, não descuido.** Faturar com valor em aberto exige a permissão
    `sales.invoice_debt` E marcar "Deixar R$ X em aberto" na tela. Sem os dois,
    faltar um centavo continua sendo erro. Pode ficar tudo em aberto (nenhum
    pagamento).
24. **Receber depois é mais um pagamento na mesma comanda.** Pode ser parcial e em
    várias vezes. Usa a permissão `sales.invoice`: quem fatura também recebe.
25. **Passar do valor nunca é aceito** — nem do total ao faturar, nem do valor em
    aberto ao receber. O que sobraria seria crédito do cliente, que não existe (2h).
26. **O pagamento de depois gera o mesmo que o de hoje:** conta a receber no
    financeiro e entrada no caixa aberto se for dinheiro.
27. **O fiado NÃO vira lançamento no financeiro enquanto não é pago.** Ele aparece no
    resumo do mês como "Fiado de clientes", fora de "A receber" — somar os dois
    contaria o mesmo dinheiro duas vezes quando o pagamento chegasse.
28. **O agendamento fecha pelo valor cheio** no faturamento, mesmo com parte em
    aberto: receita por competência. Receber depois não mexe no agendamento.
29. **Reabrir a comanda zera o débito**, junto com os pagamentos.
30. **Débito sem data combinada nunca conta como atrasado.**
31. **O total devido na ficha** soma todas as comandas do cliente e só é mostrado a
    quem vê todas as comandas (`sales.view_all` + `sales.view_invoiced`).

Perguntas a confirmar com o dono (a auditoria não cobre):

- Cartão: a conta a receber deve dar baixa sozinha no dia do recebimento, ou alguém
  confere e dá baixa? Hoje é manual (fica "Atrasado" se ninguém baixar).
- Comandas faturadas antes de ligar o módulo devem entrar no financeiro?
- Quem pode ver o financeiro além do dono e dos gerentes?
- Cliente com débito pode abrir comanda nova sem aviso? Hoje pode, e a tela da
  comanda nova não avisa.

### 6.4 Permissões e módulo

| Recurso | Ações |
|---|---|
| `finance` | `access`, `create`, `delete`, `settle` (dar baixa e estornar), `settings` (contas e categorias) |
| `cash` | `access`, `operate` (abrir, suprimento, sangria, fechar), `view_all` (histórico de todos; sem ela, só os caixas que a pessoa abriu) |

Módulo `finance` em `salons.settings.modules`. Sem perfil configurado, gerentes e
dono têm tudo e a equipe não tem nada.

### 6.5 Telas

| Tela | Rota | Conteúdo |
|---|---|---|
| Financeiro | `/[salonId]/finance` | Saldo por conta, filtros (tipo, situação, conta, vencimento), totais do filtro, lista de lançamentos, novo recebimento, nova despesa (com "repetir por meses"), edição, transferência, baixa, estorno, exclusão |
| Resumo do mês | `/[salonId]/finance/summary?month=AAAA-MM` | Recebido, pago, resultado, a receber, a pagar, atrasado; receitas e despesas por categoria; recebimentos por forma de pagamento; fluxo de caixa por dia |
| Caixa | `/[salonId]/finance/cash` | Abrir com saldo inicial; com o caixa aberto: inicial, vendas em dinheiro, suprimentos, sangrias, esperado, movimentos, suprimento, sangria e fechar (com a diferença ao vivo); histórico dos caixas fechados |
| Contas e categorias | `/[salonId]/finance/settings` | Contas com saldo, plano de categorias em duas colunas |
| Formas de pagamento | `/[salonId]/salon-settings/payment-methods` | Ganhou o campo "Conta de destino" (só com o módulo ligado) |

### 6.6 Onde o código mora

| O quê | Onde |
|---|---|
| Tabelas | `packages/db/src/schema.ts` + `supabase/migrations/038_finance.sql` |
| Regra pura | `packages/db/src/domain/finance.ts` |
| Gravação e leitura | `packages/db/src/services/finance.service.ts` |
| Comanda → financeiro | `recordSaleTransactions`, chamado por `invoiceSaleService` |
| Caixa | `packages/db/src/domain/cash.ts`, `services/cash.service.ts`, `apps/web/app/actions/cash.ts`, `apps/web/app/[salonId]/finance/cash/`, `supabase/migrations/039_cash_sessions.sql` |
| Comanda → caixa | `recordSaleCashMovements`, chamado por `invoiceSaleService` |
| Débito de cliente | `planInvoice` (com `allowDebt`) e `planDebtPayment` em `domain/sales.ts`; `receiveSaleDebtPaymentService` e `getDebtTotalsService` em `services/sales.service.ts`; action `receiveSalePayment`; `supabase/migrations/040_sale_debt.sql` |
| Actions | `apps/web/app/actions/finance.ts`, `finance-settings.ts` |
| Telas | `apps/web/app/[salonId]/finance/` |
| Testes | `apps/web/__tests__/lib/services/finance-domain.test.ts` |

### 6.7 Estado da implementação (15/nov/2026)

Branch `claude/fase-2-financeiro` (sai de `claude/fase-1-comandas`), publicada no
GitHub, com preview na Vercel. Fatias 2a, 2b, 2c, 2d e 2g escritas. Passam typecheck,
lint, testes e `next build`.

- **Migration 038: aplicada e registrada em produção** (15/nov/2026). As fatias 2d e
  2g não precisaram de migration.
- **Migration 039 (caixa): aplicada e registrada em produção** (15/nov/2026), antes
  de o código do caixa ser publicado. A ordem importava: com o módulo `finance`
  ligado, faturar uma comanda passa a consultar `cash_sessions`, e sem a tabela o
  faturamento falharia — inclusive no preview da Vercel, que usa o banco de produção.
- **Ordem de deploy.** A 038 tinha que vir antes do código — ela adiciona
  `payment_methods.account_id`, e o INSERT do Drizzle lista todas as colunas da
  tabela. Já está cumprido.

- **Migration 040 (débito): aplicada em produção em 16/nov/2026**, antes de o código
  ser publicado. Mesma regra da 039: ela adiciona colunas a `sales`, e o INSERT do
  Drizzle lista todas as colunas — sem elas, criar QUALQUER comanda falharia em todo
  ambiente que usa o banco de produção. Registrada em `schema_migrations` em
  16/nov/2026 (nome `sale_debt`).

Onde o débito aparece na tela: no diálogo de faturar (caixa "Deixar R$ X em aberto"
e data combinada), na comanda faturada (aviso "Em aberto" e botão "Receber"), na
lista de comandas (filtro "Com valor em aberto" e o valor em cada linha), no cartão
Vendas da ficha do cliente ("Deve R$ X em N comandas") e no resumo do mês ("Fiado de
clientes").

### 6.8 Teste em uso (15/nov/2026)

Feito no preview da Vercel, no "Salão TOP" (`37dc22de…`), único salão com os módulos
`access_profiles`, `sales` e `finance` ligados. O preview usa o banco de produção. O
banco foi conferido por leitura a cada passo.

Funcionou, sem nenhum erro do código novo:

- contas, categoria e formas de pagamento com conta de destino;
- comanda manual com desconto, numeração (#1, #2, #3) e faturamento dividido em
  crédito e PIX, com taxa e prazo corretos;
- financeiro: PIX nasce recebido e soma no saldo, crédito nasce a receber pelo
  líquido; despesa, baixa, estorno, transferência e exclusões;
- reabrir comanda (pagamentos e lançamentos somem) e excluir comanda;
- perfil de acesso criado e excluído;
- "Criar comanda" pelo agendamento, recusa de faturamento antes do horário, recusa
  de um agendamento em duas comandas, "Agrupar em comanda" com dois agendamentos, e
  cancelamento de agendamento tirando o item da comanda aberta.

Em 16/nov/2026, depois das 9h, foi testado o que dependia do horário: faturar a
comanda #3 concluiu o agendamento (`completed`, R$ 170,00, `outcome_source = 'sale'`)
e gerou o lançamento no financeiro; reabrir devolveu o agendamento para
`confirmed` sem valor e apagou pagamento e lançamento. A correção da coluna
Operador do caixa também foi vista na tela.

Também em 16/nov/2026 foi testado o débito de cliente (fatia 2f), na comanda #5 de
R$ 170,00:

- faturar com R$ 100,00 no PIX: sem marcar o fiado, "Faltam R$ 70,00" e o botão de
  confirmar fica desligado; marcando "Deixar R$ 70,00 em aberto" e uma data
  combinada já vencida, a comanda fatura com `amount_due = 70.00`;
- a comanda mostra "Em aberto: R$ 70,00 de R$ 170,00 · venceu em …" e o botão
  "Receber";
- receber R$ 80,00 é recusado na tela ("Passou do valor em aberto em R$ 10,00") e
  nada muda no banco;
- receber R$ 30,00 no PIX deixa R$ 40,00 em aberto, com novo pagamento e novo
  lançamento recebido no financeiro;
- com R$ 40,00 em aberto: a lista filtra por "Com valor em aberto" e mostra o valor
  na linha; a ficha do cliente mostra "Deve R$ 40,00 em 1 comanda · R$ 40,00
  vencido"; o resumo do mês mostra "Fiado de clientes R$ 40,00", fora de "A receber";
- receber os R$ 40,00 no crédito quita a comanda: `amount_due = 0`, a data combinada
  é apagada, o aviso e o botão "Receber" somem, e o lançamento nasce a receber pelo
  líquido (R$ 38,83, taxa de R$ 1,17) para 30 dias depois;
- reabrir a comanda apagou os três pagamentos e os três lançamentos.

Ainda não testado:

- débito com pagamento em dinheiro entrando no caixa aberto;
- total devido somando mais de uma comanda do mesmo cliente;
- produto na comanda (o salão não tem produto ativo);
- restrição por perfil, logado como outro usuário;

As fatias 2d e 2g foram testadas em uso no mesmo dia, num segundo preview: despesa
repetida por três meses com a primeira paga, edição de uma parcela e o resumo de
novembro e dezembro, todos batendo com o banco.

O caixa (fatia 2e) foi testado em uso num terceiro preview, também em 15/nov:
abertura com R$ 100,00, suprimento de R$ 50,00, sangria de R$ 500,00 recusada e de
R$ 30,00 aceita, comanda #4 paga em "Teste Dinheiro" entrando sozinha (esperado
R$ 290,00), fechamento com R$ 285,00 contados registrando falta de R$ 5,00, e a
reabertura da comanda tirando a entrada dos movimentos sem mudar os números do
fechamento. O teste revelou que a coluna Operador saía vazia (`profiles.full_name`
não é preenchido); corrigido para cair em nome + sobrenome e depois e-mail — essa
correção ainda não foi vista em uso.

Dois problemas ANTERIORES às fases novas, revelados pelo teste, no plano SOLO:

- a tela "Novo Agendamento" deixa escolher um profissional, mas a action usa sempre
  o do dono, sem avisar;
- salvar um serviço apaga os vínculos de todo profissional que não seja o dono.

Dados de teste deixados no Salão TOP: contas "Teste Banco" e "Teste Caixa",
categoria "Teste Aluguel", formas "Teste PIX", "Teste Credito" e "Teste Dinheiro",
comandas #1 a #5 excluídas, um caixa fechado (com suprimento e sangria de teste) e
dois agendamentos de teste cancelados. O serviço
"Corte de Cabelo Masculino" passou do Marcos Affonso para o profissional do dono.

Ligar o módulo num salão (depois da 038 aplicada e do código publicado):

```sql
UPDATE salons
   SET settings = jsonb_set(
         coalesce(settings, '{}'::jsonb),
         '{modules}',
         coalesce(settings->'modules', '[]'::jsonb) || '["finance"]'::jsonb
       )
 WHERE id = '<id do salão>';
```

## 7. Fase 3 — Comissões (detalhe)

Responde: de cada item vendido, quanto é do profissional? Parte da comanda (fase 1)
e das taxas das formas de pagamento (fase 2). Itens da auditoria: C-01 a C-04,
K-05 (seções 7 a 10 da ficha do profissional), RN-COM e RN-COM-CFG.

### 7.1 Fatias

| Fatia | Entrega | Estado |
|---|---|---|
| 3a | Regras do salão com exceção por profissional, comissão por item (percentual ou valor fixo), cálculo no faturamento, extrato detalhado e por profissional, recalcular período | Feita — migration 041 aplicada e testada em uso em 16/nov/2026 (§7.7) |
| 3b | Auxiliar no item da comanda e comissão como auxiliar (descontada do salão ou do profissional) | Feita — migration 042 aplicada e testada em uso em 16/nov/2026 (§7.8) |
| 3c | Vales e bonificações do profissional, com o líquido no extrato | Feita — migration 043 aplicada e testada em uso (§7.9) |
| 3d | Pagamento de comissão em lote, com recibo e despesa no financeiro; saída do vale no financeiro | Feita — migration 044 aplicada e testada em uso em 16/nov/2026 (§7.10) |
| 3e | Custo adicional do serviço e produtos consumidos abatendo a comissão | Pendente — depende da fase 4 (estoque) |

### 7.2 Modelo de dados (migrations 041 a 044)

A 041 (`041_commissions.sql`) cria três tabelas novas e não altera nenhuma
existente. A 042 (`042_commission_assistants.sql`, fatia 3b) cria uma quarta e
acrescenta uma coluna em `sale_items` e outra em `commission_entries`. A 043
(`043_commission_adjustments.sql`, fatia 3c) cria `commission_adjustments` e não
altera nenhuma existente. A 044 (`044_commission_payments.sql`, fatia 3d) cria
`commission_payments`, acrescenta `payment_id` em `commission_entries` e em
`commission_adjustments`, e mexe no financeiro: duas colunas e um tipo novo em
`financial_transactions`.

- `commission_settings` — as regras gerais. Uma linha do salão (`professional_id`
  NULL) e, se houver, uma por profissional que foge da regra do salão. Cada campo
  NULL quer dizer "não define": o profissional segue o salão, o salão segue o padrão.
- `commission_rules` — quanto cada item paga: padrão do salão por serviço ou produto
  (`professional_id` NULL) e exceção por profissional. `kind` é `percent` (0 a 100)
  ou `fixed` (reais por unidade).
- `commission_entries` — o extrato: uma linha por item de comanda faturada, com a
  base, a regra usada, a comissão, a parcela da taxa e o valor a receber já
  calculados. `release_date` é o dia em que fica disponível (NULL = aguardando o
  cliente pagar). `role` é `professional` ou `assistant`. Na linha do profissional,
  `assistant_deduction` (042) guarda quanto da comissão foi para o auxiliar:
  a receber = comissão − taxa − desconto de auxiliar.
- `sale_items.assistant_id` (042) — quem auxiliou naquele serviço. Opcional; só em
  item de serviço e nunca a mesma pessoa que executou (CHECK no banco).
- `commission_assistant_rules` (042) — quanto o auxiliar ganha por serviço: padrão do
  salão (`professional_id` NULL) e exceção de quem auxilia. Além de `kind` e `value`,
  tem `base` (`gross` = sobre o valor do serviço; `commission` = sobre a comissão do
  profissional) e `deduct_from` (`professional` ou `salon`). Tabela própria, para as
  consultas da comissão do profissional não precisarem saber que ela existe.
- `commission_adjustments` (043) — vales e bonificações: profissional, `kind`
  (`advance` = vale, `bonus` = bonificação), `amount` sempre positivo,
  `reference_date` (o dia em que entra no extrato), observação e quem lançou.
- `commission_payments` (044) — um pagamento a UM profissional: a data de corte
  (`cutoff_date`), a fotografia do que foi quitado (comissões, vales, bonificações),
  o valor pago, o dia, a conta de saída (opcional) e quem registrou. Os feitos na
  mesma operação compartilham `batch_id`. O banco confere que
  valor = comissões − vales + bonificações, e que não é negativo.
- `commission_entries.payment_id` e `commission_adjustments.payment_id` (044) — o
  pagamento que quitou a linha; NULL = em aberto. `ON DELETE SET NULL`: apagar o
  pagamento devolve tudo para "em aberto".
- `financial_transactions` (044) — tipo novo `commission` e as colunas
  `commission_payment_id` e `commission_adjustment_id` (exatamente uma preenchida
  nesse tipo; `ON DELETE CASCADE`). É sempre saída, paga e com conta (CHECK).

O percentual geral do profissional continua onde sempre esteve:
`professionals.commission_rate`, editado no cadastro em Equipe.

### 7.3 Regras de negócio

Da auditoria (RN-COM, confirmada por cálculo sobre dados reais):

1. **Fórmula:** disponível = valor × %comissão − valor × %taxa da comanda ×
   %comissão − desconto de auxiliar. Conferido: item de R$ 200, 50%, taxa de 2,92% →
   R$ 2,92 de taxa, R$ 97,08 disponível; com auxiliar, item de R$ 600, 50%, taxa
   R$ 8,76, auxiliar R$ 60 → R$ 231,24. Os exemplos da auditoria são testes
   automáticos.
2. **Taxa da comanda** é a soma das taxas dos pagamentos, repartida entre os itens
   pelo valor de cada um. Com mais de uma forma de pagamento vale a média ponderada.
3. **Item sem comissão aparece no extrato com zero** (regra de 0%, item de cortesia):
   a linha mostra que o atendimento foi contado.

Da auditoria (RN-COM-CFG), com os padrões que ela encontrou configurados no salão:

4. **Quando fica disponível** — competência (padrão): no dia da comanda.
   Disponibilidade: quando o salão recebe, no último dia de recebimento entre os
   pagamentos; com valor em aberto (fiado), fica sem data até o cliente quitar.
5. **Taxas de pagamento** — proporcional à comissão (padrão), o salão paga tudo, o
   profissional paga tudo, ou meio a meio.
6. **Descontos** — o salão arca com tudo (padrão: comissão sobre o valor cheio),
   proporcional (comissão sobre o que o cliente pagou), o profissional arca com tudo
   (o desconto sai da comissão) ou meio a meio.
7. **Exceção por profissional**, campo a campo; o que ele não define segue o salão.

Decididas aqui, porque a auditoria não cobre — **a confirmar com o dono**:

8. **A comissão é fotografia, não consulta.** É calculada quando a comanda é
   faturada e fica gravada. Mudar uma regra não muda o que já foi calculado; para
   isso existe "Recalcular período", que refaz com as regras de agora. Na Belasis o
   extrato é recalculado sempre; aqui o histórico só muda quando alguém pede.
9. **Só comanda faturada gera comissão.** A opção "Todas" da Belasis (comissão de
   comanda ainda pendente) não existe — o salão auditado usava "Somente finalizadas".
10. **Qual regra vale para o item:** exceção do profissional para o item → padrão do
    salão para o item → percentual geral do profissional → zero. O padrão do item
    vem antes do percentual geral para dar para dizer "produto paga 10%" ou
    "estacionamento não paga comissão" para todos de uma vez.
11. **Valor fixo é por unidade** (3 unidades de um produto com R$ 5,00 fixo = R$ 15,00).
12. **A taxa nunca deixa a comissão negativa**, nem o desconto: o mínimo é zero.
13. **Receber um débito recalcula a comissão da comanda:** a taxa efetiva e a data de
    disponibilidade mudam com o novo pagamento. **Reabrir a comanda apaga** as
    comissões dela.
14. **Sem "Ver de todos", a pessoa vê só o próprio extrato** — as comissões dos
    vínculos de profissional do usuário dela.

Auxiliar (fatia 3b). Da auditoria vêm os três campos da regra — de quem desconta,
valor percentual ou fixo, e sobre o quê — e o exemplo da regra 1. O resto foi
decidido aqui, **a confirmar com o dono**:

15. **O auxiliar é do item da comanda**, opcional, só em serviço, e nunca a mesma
    pessoa que executou. Ele ganha a própria linha no extrato, marcada "Auxiliar".
16. **Qual regra vale:** a de quem auxilia para aquele serviço → o padrão do salão
    para o serviço → nenhuma. Não existe "percentual geral de auxiliar": sem regra,
    o auxiliar aparece no extrato com zero (como na regra 3).
17. **O auxiliar não paga taxa de pagamento.** A taxa do profissional já é calculada
    sobre a comissão inteira, antes do desconto — é o que os números da auditoria
    mostram (R$ 8,76 = 2,92% de R$ 300, não de R$ 240).
18. **"Sobre a comissão do profissional"** é a comissão antes da taxa. **"Sobre o
    valor do serviço"** é o valor do item antes do desconto. Valor fixo é por
    unidade (regra 11).
19. **O auxiliar recebe o valor da regra mesmo que a comissão do profissional não
    cubra.** O profissional vai a zero (regra 12) e a diferença fica por conta do
    salão.
20. **A data de disponibilidade do auxiliar segue a regra dele**, não a de quem
    executou.
21. **Quem auxiliou vê a comanda** mesmo sem "Ver todas", como quem executou.
22. **No resumo, o valor do item conta uma vez só**, na linha de quem executou; a
    linha do auxiliar é do mesmo item.

Vales e bonificações (fatia 3c). A auditoria traz os campos (tipo, vencimento,
valor, observação, pagamento) e o rodapé do extrato (comissões, vales,
bonificações, líquido). Decidido aqui, **a confirmar com o dono**:

23. **Líquido = comissões a receber − vales + bonificações.** O vale abate, a
    bonificação soma.
24. **O líquido pode ficar negativo.** Vale maior que a comissão do período quer
    dizer que o profissional está devendo; mostrar zero faria o salão pagar de novo.
25. **A data do lançamento é o dia em que ele entra no extrato** (o "Vencimento" da
    Belasis), não o dia em que o dinheiro foi entregue. Vale dado dia 20 para
    descontar em dezembro leva a data de dezembro.
26. **Não há edição: corrigir é excluir e lançar de novo.** Fica gravado quem lançou.
27. **Vale e bonificação não geram movimento no financeiro nesta fatia.** A saída de
    dinheiro do vale e o pagamento do líquido entram juntos na fatia 3d, para a
    despesa não ser contada duas vezes.
28. **O saldo não passa de um período para o outro sozinho.** Um líquido negativo
    em novembro não aparece em dezembro; isso também é da fatia 3d (o pagamento em
    lote é que fecha um período).
29. **Sem "Ver de todos", a pessoa só lança e exclui nos próprios vínculos** — a
    permissão de lançar não amplia o que ela enxerga.

Pagamento (fatia 3d). A auditoria traz a tela "Resumidas" (período e profissionais,
"base para o pagamento em lote"), a lista "Pagas" (data, pagamento, profissional,
usuário, comissões, vales, bonificações, valor pago; impressão individual e
agrupada) e o vale como saída do financeiro. Decidido aqui, **a confirmar com o
dono** — as regras 30 a 39 substituem a 27 e a 28:

30. **O pagamento quita tudo o que está em aberto até uma data de corte**, por
    profissional: comissões liberadas − vales + bonificações. Um pagamento por
    profissional; os feitos juntos formam um lote.
31. **Não há data inicial.** O que não foi quitado continua em aberto e entra no
    próximo pagamento — é assim que o saldo passa de um mês para o outro. A Belasis
    usa período (de/até); aqui, só "até".
32. **Líquido negativo não se paga nem se quita.** O profissional aparece como
    devendo e fica fora do lote; o que é dele continua em aberto até um pagamento
    futuro cobrir.
33. **Líquido zero quita sem sair dinheiro** (comissão e vale que se anulam).
34. **Comissão que aguarda o cliente pagar não entra** (sem data de liberação). A
    data de corte pode ser futura: adiantar o que ainda vai liberar é escolha de
    quem paga. O dia do pagamento não pode ser futuro.
35. **Comissão paga é fotografia.** "Recalcular período" e o recebimento de um
    débito só regravam o que está em aberto, e a comanda com comissão paga não
    reabre enquanto o pagamento não for estornado (substitui a pergunta da regra 13).
36. **Estornar é apagar o pagamento**: o que ele quitou volta a ficar em aberto e a
    despesa que ele gerou sai do financeiro. Lançamento que entrou num pagamento
    não se exclui sem estornar antes.
37. **O dinheiro só entra no financeiro quando se escolhe a conta de saída** — no
    pagamento e no vale. Vira despesa paga, do tipo "comissão", que não se edita,
    estorna nem exclui pela tela do financeiro. Sem conta, nada é lançado lá. A
    bonificação não gera despesa própria: sai dentro do pagamento. Assim o total
    lançado é comissões + bonificações, sem contar o vale duas vezes.
38. **A despesa do vale leva a data em que o dinheiro saiu**: a data do vale, ou
    hoje quando ela é futura (vale para descontar no mês que vem).
39. **Só oferece conta para quem pode lançar no financeiro** (`finance.create`, com
    o módulo ligado): pagar comissão não dá, por tabela, o direito de criar despesa.
    O valor que a tela mostrou é conferido no servidor — se outro lançamento entrou
    nesse meio-tempo, o pagamento é recusado.

Perguntas para o dono:

- O percentual geral do profissional deve vencer o padrão do item? Hoje o item vence.
- Na regra "disponibilidade" com pagamento dividido, liberar a comissão aos poucos
  (proporcional a cada recebimento) em vez de tudo no último dia?
- Comissão paga ficou congelada (regra 35): comanda com comissão paga não reabre
  sem estornar o pagamento. É isso mesmo, ou a reabertura deve ser livre e gerar um
  acerto no pagamento seguinte?
- Auxiliar: quando a comissão do profissional não cobre o auxiliar (regra 19), o
  salão completa ou o auxiliar recebe só o que houver? Hoje o salão completa.
- Auxiliar: o percentual "sobre o valor do serviço" deve seguir a regra de desconto
  do salão (regra 6)? Hoje é sempre sobre o valor cheio.
- Um serviço pode ter mais de um auxiliar? Hoje é um por item.
- Pagamento por data de corte (regra 31), sem período de/até como na Belasis: serve?
- Vale e pagamento só vão para o financeiro quando se escolhe a conta (regra 37).
  Deve ser obrigatório escolher? E o vale pago em dinheiro deve sair do caixa aberto
  (sangria) sozinho? Hoje não mexe no caixa.
- O texto do recibo é fixo. Na Belasis ele é configurável, com as variáveis valor e
  nome da empresa. Vale a pena configurar?
- A lista "Pagas" mostra a conta de saída na coluna "Pagamento". A Belasis mostra a
  forma de pagamento. Falta a forma (dinheiro, PIX) no pagamento de comissão?
- "Solicitações de saída" (retirada de produto pelo profissional, com "preço para
  profissional") também abatem o líquido na Belasis. Ficam para a fase 4 (estoque).

### 7.4 Permissões e módulo

Módulo novo: `commissions` (ligado por salão, como os outros). Depende de `sales`;
não depende de `finance`.

| Permissão | O que libera |
|---|---|
| `commissions.access` | Ver o próprio extrato |
| `commissions.view_all` | Ver o extrato de todos os profissionais |
| `commissions.configure` | Regras do salão, exceções, comissão por item e recalcular |
| `commissions.adjust` | Lançar e excluir vales e bonificações (fatia 3c) |
| `commissions.pay` | Pagar comissões e estornar pagamentos (fatia 3d) |

Registrar a saída no financeiro (no pagamento e no vale) pede também
`finance.create` e o módulo `finance` ligado; sem isso o pagamento e o vale
funcionam, só não geram despesa.

### 7.5 Telas

- **Comissões** (`/[salonId]/commissions`): filtro de período e de profissional na
  URL, totais (valor dos itens, comissões, taxas, a receber), aviso do que está sem
  data, resumo por profissional e a lista detalhada item a item. Com auxiliar no
  período, aparece a coluna "Auxiliar" (o desconto) e a linha de quem auxiliou.
  Seção "Vales e bonificações" com a lista do período e, para quem tem
  `commissions.adjust`, o formulário de lançamento e a exclusão; havendo
  lançamento, aparecem os totais de vales, bonificações e líquido. O vale pode
  dizer de qual conta o dinheiro saiu. Comissão e lançamento já pagos aparecem
  marcados com o dia do pagamento.
- **Pagamento de comissões** (`/[salonId]/commissions/payments`): "Em aberto até"
  uma data, por profissional (comissões, vales, bonificações, a pagar), com quem
  está devendo fora da seleção; dia do pagamento, conta de saída, categoria e
  observação; e a lista "Pagas" do período, com recibo, recibos do lote e estorno.
- **Recibo** (`/[salonId]/commissions/payments/receipt?payment=` ou `?batch=`): o
  demonstrativo do que foi quitado, pronto para imprimir — um por folha no lote.
- **Configurar comissões** (`/[salonId]/commissions/settings`): regras do salão;
  comissão por item, escolhendo entre o padrão do salão e um profissional (que
  também mostra as regras gerais dele, com "Seguir o salão"); comissão como
  auxiliar por serviço, para o mesmo alvo (tipo, valor, sobre o quê e de quem sai);
  recalcular período.
- **Comanda**: com o módulo ligado, o item de serviço ganha o campo "Auxiliar
  (opcional)", e o aviso de reabrir diz que as comissões são apagadas.

### 7.6 Onde o código mora

| O quê | Onde |
|---|---|
| Regra pura | `packages/db/src/domain/commissions.ts` (`planSaleCommissions`, `resolveCommissionRate`, `resolveCommissionSettings`, `resolveAssistantRule`, `planAssistantRule`, `planCommissionAdjustment`, `commissionNetCents`, `planCommissionPayment`, `planCommissionPaymentBatch`, `unpaidPlannedEntries`, `advancePaidDate`); o bloqueio do lançamento de comissão no financeiro fica em `domain/finance.ts`; o auxiliar do item é validado em `domain/sales.ts` (`planSaleItems`) |
| I/O | `packages/db/src/services/commissions.service.ts` |
| Comanda → comissão | `syncSaleCommissions`, chamado por `invoiceSaleService`, `receiveSaleDebtPaymentService` e `reopenSaleService` quando a action passa `recordCommissions` |
| Actions | `apps/web/app/actions/commissions.ts` |
| Telas | `apps/web/app/[salonId]/commissions/` |
| Testes | `apps/web/__tests__/lib/services/commissions-domain.test.ts` e, para o auxiliar no item, `sales-domain.test.ts` |

### 7.7 Estado da implementação (16/nov/2026)

- Fatia 3a na branch `claude/fase-3-comissoes` (sai de `claude/fase-2-financeiro`),
  publicada, ainda sem PR. Typecheck, lint dos arquivos novos e testes passando; o
  build do preview da Vercel passou.
- **Migration 041: aplicada em produção em 16/nov/2026**, conferida por leitura (três
  tabelas com RLS, política `deny_all`, sem acesso para `anon`/`authenticated`).
  Registrada em `schema_migrations` em 16/nov/2026 (nome `commissions`).
  Ela só cria tabelas novas: com o módulo `commissions` desligado, nenhuma tabela de
  comissão é tocada. Com o módulo ligado e sem a 041, faturar e reabrir comanda
  falham — em outro ambiente, **aplicar a 041 antes de ligar o módulo**.
- Módulo `commissions` ligado só no salão de teste (o mesmo da §6.8).

Teste em uso (16/nov/2026, preview da branch, salão de teste, comanda #6):

- Padrão do salão de 50% para um serviço; comanda de R$ 200,00 faturada no crédito
  (taxa de 2,92%, 30 dias) → extrato com R$ 200,00 de base, R$ 100,00 de comissão,
  R$ 2,92 de taxa e **R$ 97,08 a receber**, na data da comanda. É o exemplo da
  auditoria, agora conferido na tela e no banco.
- Trocar a regra do salão para "disponibilidade" **não mexeu** na comissão já
  gravada (regra 8). Depois de "Recalcular período", ela saiu de novembro e foi para
  16/dez/2026, o dia em que o crédito cai (regra 4).
- Exceção do profissional para o mesmo serviço, R$ 30,00 fixos, venceu o padrão do
  salão (regra 10): R$ 30,00 de comissão, R$ 0,88 de taxa, R$ 29,12 a receber. A
  tela da exceção mostra "Padrão do salão: 50%" no item sem valor.
- Reabrir a comanda apagou a comissão dela (regra 13).
- Limpeza: comanda #6 excluída, as duas regras de teste removidas, regras do salão de
  volta ao padrão (ficou a linha do salão em `commission_settings`, com os valores
  padrão).

Não testado em uso: resumo "Por profissional" (só aparece com mais de um
profissional no período), aviso de comissão sem data (fiado sob "disponibilidade"),
receber débito recalculando a comissão, os modos de taxa e de desconto fora do
padrão, comissão de produto e a restrição de quem não tem "Ver de todos". Os modos
de taxa e de desconto e a data de liberação têm teste automático da regra pura; o
caminho deles pelo banco e pela tela, não.

Achado do teste, não corrigido: o aviso de "Reabrir comanda" fala dos pagamentos e
dos agendamentos, mas não diz que as comissões da comanda são apagadas.

Depois do teste, corrigido junto com a fatia 3b: o aviso de reabrir passou a falar
das comissões, e o total "N itens" do extrato contava profissionais, não itens (com
um profissional só, como no teste, o número coincidia).

Ligar o módulo num salão (depois da 041 aplicada e do código publicado):

```sql
UPDATE salons
   SET settings = jsonb_set(
         coalesce(settings, '{}'::jsonb),
         '{modules}',
         coalesce(settings->'modules', '[]'::jsonb) || '["commissions"]'::jsonb
       )
 WHERE id = '<id do salão>';
```

### 7.8 Fatia 3b — estado (16/nov/2026)

- Na branch `claude/fase-3-comissoes`, publicada, ainda sem PR. Typecheck, lint dos
  arquivos alterados e testes passando (o exemplo de R$ 231,24 da auditoria é
  teste); o build do preview da Vercel passou.
- **Migration 042: aplicada em produção em 16/nov/2026**, conferida por leitura (as
  duas colunas, a tabela com RLS e `deny_all`, sem acesso para
  `anon`/`authenticated`, os dois CHECKs). Registrada em `schema_migrations` em
  16/nov/2026 (nome `commission_assistants`).
- Em outro ambiente, **aplicar a 042 antes de publicar o código**: diferente da 041,
  ela acrescenta colunas em tabelas que o código já lê e grava
  (`sale_items.assistant_id` e `commission_entries.assistant_deduction`). Sem elas,
  salvar comanda e abrir o extrato falham.

Teste em uso (16/nov/2026, preview da branch, salão de teste, comanda #7):

- Padrão do salão de 50% para um serviço e regra de auxiliar de 10% sobre o valor
  do serviço, saindo do profissional. Comanda de R$ 600,00 no crédito (2,92%), com
  auxiliar no item → profissional com R$ 300,00 de comissão, R$ 8,76 de taxa,
  R$ 60,00 de auxiliar e **R$ 231,24 a receber**; auxiliar com **R$ 60,00**, sem
  taxa. É o exemplo da auditoria, conferido na tela e no banco.
- O resumo "Por profissional" apareceu (dois profissionais no período) com o valor
  do item contado uma vez: R$ 600,00 e "1 item"; o auxiliar aparece como "0 + 1 como
  auxiliar".
- Trocar a regra para "Do salão" e recalcular o período → profissional de volta a
  R$ 291,24, auxiliar ainda com R$ 60,00, e a coluna "Auxiliar" some do extrato.
- Reabrir a comanda apagou as duas linhas (a do profissional e a do auxiliar); o
  aviso de reabrir já fala das comissões.
- Limpeza: comanda #7 excluída e as duas regras de teste removidas.

Não testado em uso: exceção de quem auxilia (regra própria do profissional),
percentual sobre a comissão do profissional, valor fixo, comissão do profissional
que não cobre o auxiliar, auxiliar com regra de data própria, e a comanda vista por
quem só auxiliou e não tem "Ver todas". Os cinco primeiros têm teste automático da
regra pura; a visibilidade, não.

### 7.9 Fatia 3c — estado (16/nov/2026)

- Na branch `claude/fase-3-comissoes`, publicada, ainda sem PR. Typecheck, lint dos
  arquivos alterados e testes passando; o build do preview da Vercel passou.
- **Migration 043: aplicada em produção em 16/nov/2026**, conferida por leitura (a
  tabela com RLS e `deny_all`, sem acesso para `anon`/`authenticated`, o índice do
  extrato, os CHECKs de valor e de tipo) e registrada em `schema_migrations` (nome
  `commission_adjustments`).
- Em outro ambiente, **aplicar a 043 antes de publicar o código**: ela só cria uma
  tabela nova, mas o extrato de comissões passa a consultá-la. Sem a 043, a tela de
  comissões falha nos salões com o módulo ligado.

**Teste em uso (16/nov/2026, salão de teste, no preview da branch).** Regra de 50%
no serviço, comanda #8 com dois itens em cartão de crédito (taxa de 2,92%): R$ 300,00
de um profissional e R$ 200,00 do outro.

- Vale de R$ 300,00 para quem ainda não tinha comissão no período → líquido de
  −R$ 300,00, com o aviso de que os vales passam do que há a receber.
- Com a comanda faturada: a receber de R$ 145,62 e R$ 97,08 (R$ 242,70 no total).
  Vale de R$ 100,00 e bonificação de R$ 50,00 no primeiro → líquido de R$ 95,62; o
  segundo, com o vale de R$ 300,00, fica em −R$ 202,92; total do salão −R$ 107,30. A
  tabela "Por profissional" ganha as colunas de vales, bonificações e líquido.
- Extrato filtrado num profissional: só os lançamentos dele aparecem, e o formulário
  já abre nele.
- Vale com data de 05/12/2026 não mexe em novembro e aparece em dezembro (regra 25).
- Excluir um lançamento pede confirmação e os totais voltam.
- Reabrir a comanda apaga as comissões e **mantém** os vales e a bonificação; os dois
  profissionais continuam no resumo, só com os lançamentos.
- Dados de teste removidos ao final: comanda #8 excluída, regra e lançamentos
  apagados.

Não testado em uso: o perfil com `commissions.adjust` e sem "Ver de todos" (só os
próprios vínculos — regra 29) e a lista com mais lançamentos do que o limite da
tela. Detalhe de tela anotado, sem correção: o total de vales mostra "− R$ 400,00"
e o líquido negativo mostra "-R$ 107,30" (sinais com grafias diferentes).

### 7.10 Fatia 3d — estado (16/nov/2026)

- Na branch `claude/fase-3-comissoes`, publicada, ainda sem PR. Typecheck, lint dos
  arquivos alterados e testes passando; o build do preview da Vercel passou.
- **Migration 044: aplicada em produção em 16/nov/2026** (pelo assistente, com a
  autorização do dono para rodar migrations naquela sessão), conferida por leitura
  (a tabela com RLS e `deny_all`, sem acesso para `anon`/`authenticated`, as
  quatro colunas novas, os dois CHECKs do financeiro) e registrada em
  `schema_migrations` (nome `commission_payments`). As três tabelas que ela altera
  estavam vazias, então não houve cópia de segurança.
- Em outro ambiente, **aplicar a 044 antes de publicar o código**: ela acrescenta
  colunas em tabelas que o código já grava (`commission_entries`,
  `commission_adjustments`, `financial_transactions`). Sem elas, faturar comanda
  com comissões ligadas e lançar no financeiro falham. O código antigo continua
  funcionando depois dela.

**Teste em uso (16/nov/2026, salão de teste, no preview da branch).** Regra de 50%
no serviço, comanda #9 com dois itens em cartão de crédito (taxa de 2,92%): R$ 300,00
de um profissional e R$ 200,00 do outro.

- Vale de R$ 100,00 com saída na conta de caixa → o extrato mostra "saiu de" a
  conta e o financeiro ganha a despesa paga "Vale — <profissional>". Vale de
  R$ 300,00 sem conta e bonificação de R$ 50,00 (o campo de conta some na
  bonificação) não lançam nada.
- Em aberto até hoje: R$ 145,62 − R$ 100,00 + R$ 50,00 = **R$ 95,62** a pagar a um;
  o outro, com R$ 97,08 de comissão e R$ 300,00 de vale, aparece como devendo
  (−R$ 202,92) e sem caixa de seleção. Com a data de corte na véspera, nada em aberto.
- Pagamento de R$ 95,62 com saída na conta de banco e categoria: entra em "Pagas",
  o profissional sai de "Em aberto", e o financeiro ganha a despesa paga
  "Comissão — <profissional>". Total pago no financeiro: R$ 195,62 — a comissão mais
  a bonificação, com o vale contado uma vez só.
- Recibo: comanda, vale e bonificação no demonstrativo, totais e linha de assinatura.
- No financeiro, as duas despesas de comissão aparecem sem editar, estornar ou excluir.
- No extrato, a comissão e os dois lançamentos pagos ficam marcados com o dia do
  pagamento, e os lançamentos pagos perdem o botão de excluir.
- Reabrir a comanda #9 com a comissão paga foi **recusado**.
- Regra trocada para 40% e "Recalcular período": a comissão paga ficou em R$ 145,62
  (50%) e só a em aberto foi refeita (R$ 77,66).
- Estorno: o pagamento some, o profissional volta para "Em aberto" com os mesmos
  R$ 95,62, a despesa da comissão sai do financeiro e a do vale fica. Excluir o
  vale com conta tira a despesa dele também. Depois do estorno a comanda reabriu.
- Dados de teste removidos ao final: comanda #9 excluída, regra, lançamentos e
  despesas apagados.

Não testado em uso: lote com mais de um profissional (impressão agrupada), o
profissional que recebe uma comissão nova depois de ficar devendo (o saldo antigo
entrando no pagamento seguinte), pagamento de valor zero, o perfil com
`commissions.pay` e sem "Ver de todos", o perfil sem `finance.create` (sem campo
de conta), a impressão em papel, e o recebimento de débito numa comanda com
comissão paga.

Fica para depois (não é da auditoria ou depende de decisão do dono): texto do
recibo configurável, forma de pagamento no pagamento de comissão, vale em dinheiro
saindo do caixa aberto, "pagar salário" (ficha do profissional na Belasis).

## 8. Fase 4 — Produtos e estoque (detalhe)

Responde: quanto há de cada produto, o que entrou, o que saiu e o que comprar.
Parte da comanda (fase 1) e alimenta a comissão (fatia 3e). Itens da auditoria:
T-02 a T-04, T-06, T-07, T-09, T-10, K-08, R-10 e os fluxos 3 e 4.

### 8.1 Fatias

| Fatia | Entrega | Estado |
|---|---|---|
| 4a | Controle de estoque por produto (ligar, mínimo, custo, códigos), movimentações (entrada, saída, acerto), baixa pela comanda, sugestão de compra e valor em estoque | Feita em código e publicada — migration 045 aplicada; **sem teste em uso** (§8.7) |
| 4b | Fornecedores, marcas e categorias de produto; compra com itens, que dá entrada no estoque, atualiza o custo e gera a despesa no financeiro | Pendente |
| 4c | Lotes e validades | Pendente |
| 4d | Produtos consumidos por serviço (baixa de insumo por atendimento) e fracionamento ("uma unidade equivale a"); com isso, a fatia 3e (custo adicional e consumo abatendo a comissão) | Pendente |
| 4e | Solicitações de saída pelo profissional, com "preço para profissional", debitadas no extrato de comissões | Pendente |
| 4f | Relatórios de estoque (movimentação por período, produtos consumidos) e importação de XML de NF-e de compra (depende do provedor fiscal — fase 10) | Pendente |

O cadastro de produto que já existe (nome, descrição, preço, ativo) continua como
está e continua valendo para todo salão. O estoque é um módulo à parte, ligado
salão a salão.

### 8.2 Modelo de dados (migration `045_inventory.sql`)

- `products` ganha `track_stock` (o salão controla este produto?), `min_stock`,
  `cost_price`, `sku` e `barcode`. Todas com padrão ou nulas: o cadastro antigo e o
  código antigo não percebem.
- `stock_movements` — uma linha por entrada, saída, acerto ou venda: produto,
  `kind` (`in`, `out`, `adjustment`, `sale`), `quantity` COM SINAL, custo unitário
  (na entrada), observação, quem lançou e, na venda, a comanda e o item.
- **O saldo não é gravado**: é a soma de `stock_movements.quantity` do produto, como
  o saldo das contas do financeiro. Não há número para sair de sincronia.

### 8.3 Regras de negócio

A auditoria traz os campos do produto e a frase "controlar estoque: ajustado
automaticamente conforme a utilização em comandas, pacotes e quando novas compras
forem feitas". A baixa na venda foi **inferida** por ela (fluxo 3). Decidido aqui,
**a confirmar com o dono**:

1. **O salão escolhe o que controla.** Produto sem o controle ligado não baixa, não
   tem saldo e não entra na sugestão de compra.
2. **Ligar o controle começa em zero.** O saldo inicial entra por um acerto com o
   que há na prateleira (o "Estoque inicial" da Belasis).
3. **Faturar a comanda baixa os produtos controlados**; reabrir devolve. A baixa
   aponta para a comanda e para o item. Reabrir devolve mesmo com o módulo
   desligado depois — senão a baixa ficaria órfã.
4. **Vender sem saldo não é barrado.** O produto já saiu da prateleira; o saldo
   fica negativo e a tela avisa. O mesmo vale para a saída manual.
5. **Acerto de inventário recebe o que foi CONTADO** e grava a diferença. Contar o
   que o sistema já mostra não é movimento.
6. **Entrada com custo atualiza o custo de compra do produto** (último preço pago).
   Custo médio fica para a fatia 4b, junto com as compras.
7. **"Abaixo do mínimo" é abaixo**: ter exatamente o mínimo ainda não pede compra.
   Zerado e negativo sempre pedem.
8. **Sugestão de compra = mínimo − saldo**, só para produto controlado e com
   mínimo definido. A auditoria só diz que o relatório compara mínimo e atual.
9. **Valor em estoque = saldo × custo de compra.** Saldo negativo ou produto sem
   custo não entra.
10. **Movimento não se edita nem se exclui.** Corrigir é lançar o contrário ou um
    acerto — o histórico fica.
11. **Quantidade com três casas**, como no item da comanda: produto fracionado (ml,
    g) cabe sem mudar o tipo depois.

Perguntas para o dono:

- Vender sem saldo deve ser barrado, só avisar na comanda, ou seguir como está
  (regra 4)?
- O custo do produto deve ser o último preço pago (regra 6) ou o custo médio?
- Quem cadastra o produto (hoje, quem gerencia o salão) deve ver os campos de
  estoque no próprio cadastro, ou basta a tela de Estoque?
- A sugestão de compra deve repor até o mínimo (regra 8) ou até um "estoque ideal"
  separado?

### 8.4 Permissões e módulo

Módulo novo: `inventory` (ligado por salão). A baixa pela comanda depende de
`sales`.

| Permissão | O que libera |
|---|---|
| `inventory.access` | Ver o estoque e as movimentações |
| `inventory.move` | Lançar entrada, saída e acerto de inventário |
| `inventory.manage` | Ligar o controle do produto, estoque mínimo, custo e códigos |

Para ligar no salão de teste:

```sql
UPDATE salons
   SET settings = jsonb_set(
         coalesce(settings, '{}'::jsonb),
         '{modules}',
         coalesce(settings->'modules', '[]'::jsonb) || '["inventory"]'::jsonb
       )
 WHERE id = '<id do salão>';
```

### 8.5 Telas

- **Estoque** (`/[salonId]/inventory`): totais (produtos controlados, para comprar,
  valor em estoque), a lista de produtos com saldo, mínimo, sugestão de compra,
  custo, valor e situação (sem controle, negativo, zerado, abaixo do mínimo, em
  dia), com os filtros "Todos", "Para comprar" e "Sem controle"; "Movimentar"
  (entrada, saída, acerto) e "Configurar" por produto; e a movimentação recente,
  com filtro por produto e o link da comanda nas vendas.
- **Comanda**: nada muda na tela. Faturar baixa, reabrir devolve.

### 8.6 Onde o código mora

| O quê | Onde |
|---|---|
| Regra pura | `packages/db/src/domain/inventory.ts` (`planStockMovement`, `planProductStockSettings`, `planSaleStockMovements`, `stockStatus`, `purchaseSuggestionMilli`, `stockValueCents`) |
| I/O | `packages/db/src/services/inventory.service.ts` |
| Comanda → estoque | `recordSaleStock` (em `invoiceSaleService`, quando a action passa `recordStock`) e `revertSaleStock` (em `reopenSaleService`, sempre) |
| Actions | `apps/web/app/actions/inventory.ts` |
| Telas | `apps/web/app/[salonId]/inventory/` |
| Testes | `apps/web/__tests__/lib/services/inventory-domain.test.ts` |

### 8.7 Fatia 4a — estado (16/nov/2026)

- Na branch `claude/fase-4-estoque` (sai de `claude/fase-3-comissoes`), publicada,
  sem PR. Typecheck, lint dos arquivos alterados e testes passando; o build do
  preview da Vercel passou.
- **Migration 045: aplicada em produção em 16/nov/2026** (pelo assistente, com a
  autorização do dono para rodar migrations naquela sessão), conferida por leitura
  (os 71 produtos intactos e nenhum com o controle ligado; `stock_movements` com
  RLS, `deny_all`, sem acesso para `anon`/`authenticated`, índices e CHECKs) e
  registrada em `schema_migrations` (nome `inventory`).
- Cópia de segurança antes da 045: `backups.products_pre_045_20261116` (71 linhas).
  **Apagar só com o OK do dono.**
- Em outro ambiente, **aplicar a 045 antes de publicar o código**: ela acrescenta
  colunas em `products`, que todo salão usa. Sem elas, cadastrar produto e abrir a
  lista falham em qualquer salão.
- **Sem teste em uso — travado por acesso.** O endereço do preview da branch nova
  (`minha-agenda-ai-web-git-claude-fase-4-estoque-minhaagendaai.vercel.app`) pede
  login, e a sessão do navegador é por endereço. O módulo `inventory` também ainda
  **não foi ligado** em nenhum salão (nem no de teste), de propósito: nada muda para
  ninguém até o teste.
- Roteiro do teste, quando houver login: ligar o módulo no salão de teste (SQL da
  §8.4); ligar o controle de um produto com mínimo 5 e custo; acerto para 10 →
  saldo 10, "Em dia"; entrada de 2 com custo novo → saldo 12 e custo atualizado;
  saída de 9 → saldo 3, "Abaixo do mínimo", sugestão de 2; comanda com 4 unidades
  do produto faturada → saldo −1, "Negativo", movimento com o link da comanda;
  reabrir a comanda → saldo 3 de novo; produto sem controle na mesma comanda não
  gera movimento. Depois, limpar os dados de teste.

## 9. Pendências do dono

| Pendência | Trava |
|---|---|
| Respostas às perguntas da §5.3 | Fase 1c |
| Qual plano inclui cada módulo | Liberação comercial (não trava o piloto) |
| Em qual salão sem Belasis pilotar | Fase 1 em produção |
| Conta Belasis de teste para executar fluxos | Fidelidade das regras nas fases 2 a 5 |
| Provedor de pagamento e provedor fiscal | Fases 8 e 10 |
| Respostas às perguntas da §6.3 (baixa de cartão, retroativo, quem vê) | Fatias 2d em diante |
| Revisar e mergear os PRs #14 (fase 0), #15 (fase 1) e #16 (fase 2), nessa ordem (cada branch contém a anterior) | Publicação das fases 0 a 2 |
| Respostas às perguntas da §7.3 (item × percentual geral, liberação parcial, comissão paga, auxiliar, data de corte, conta obrigatória, recibo) | Ajustes na fase 3 antes do piloto |
| Abrir o PR da fase 3 (`claude/fase-3-comissoes`, que contém a fase 2) depois dos PRs #14 a #16 | Publicação da fase 3 |
| Entrar no preview da fase 4 (endereço na §8.7) para o teste em uso do estoque | Teste em uso da fatia 4a e as fatias seguintes da fase 4 |
| Respostas às perguntas da §8.3 (venda sem saldo, custo médio, campos no cadastro, estoque ideal) | Fatia 4b |
| Dizer quando a cópia `backups.products_pre_045_20261116` pode ser apagada | Limpeza do schema `backups` |
| Corrigir os dois problemas do plano SOLO (§6.8) | Salões SOLO com mais de um profissional |
