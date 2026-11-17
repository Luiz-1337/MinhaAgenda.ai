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
crédito de cliente (2h). As fases 0 a 2 estão na `main` (PRs #14, #15 e #16, mergeados); as fases 3 e 4 estão no PR #17.
Fase 3 (comissões): fatia 3a feita na branch `claude/fase-3-comissoes` (publicada,
sem PR), com a migration 041 aplicada em 16/nov/2026 e testada em uso — ver §7.7.
Fatia 3b (auxiliar) feita na mesma branch e publicada, com a migration 042 aplicada
em 16/nov/2026 e testada em uso — ver §7.8. Fatia 3c (vales e bonificações) feita na
mesma branch e publicada, com a migration 043 aplicada em 16/nov/2026 e testada em
uso — ver §7.9. Fatia 3d (pagamento em lote, recibo e saída no financeiro) feita na
mesma branch e publicada, com a migration 044 aplicada em 16/nov/2026 e testada em
uso — ver §7.10. As migrations 040 a 044 estão registradas em `schema_migrations`.
Fatia 3e (custo do atendimento abatendo a comissão) feita na branch
`claude/fase-4-estoque`, porque depende do consumo por serviço (fatia 4d), e
publicada, com a migration 049 aplicada e registrada em 17/nov/2026 e testada em
uso — ver §7.11. Com ela a fase 3 está completa.
Fase 4 (produtos e estoque): fatia 4a feita na branch `claude/fase-4-estoque`
(publicada, sem PR), com a migration 045 aplicada e registrada em 16/nov/2026 e
testada em uso — ver §8.7. Fatia 4b (fornecedores, marcas, categorias e compras)
feita na mesma branch e publicada, com a migration 046 aplicada e registrada em
16/nov/2026 e testada em uso — ver §8.8. Fatia 4c (lotes e validades) feita na
mesma branch e publicada, com a migration 047 aplicada e registrada em 17/nov/2026
e testada em uso — ver §8.9. Fatia 4d (produtos consumidos por serviço e
fracionamento) feita na mesma branch e publicada, com a migration 048 aplicada e
registrada em 17/nov/2026 e testada em uso — ver §8.10. Fatia 4e (solicitações de
saída pelo profissional) feita na mesma branch e publicada, com a migration 050
aplicada e registrada em 17/nov/2026 e testada em uso — ver §8.11. Fatia 4f
(relatórios de estoque) feita na mesma branch e publicada, sem migration, e
testada em uso em 17/nov/2026 — ver §8.12.
Fase 5 (pacotes e assinaturas): detalhada em §9. Fatia 5a (pacotes predefinidos e
venda de pacote pela comanda) feita na branch `claude/fase-5-pacotes` (sai de
`claude/fase-4-estoque`) e publicada, com a migration 051 aplicada e registrada
em 17/nov/2026 e testada em uso — ver §9.7. Fatia 5b (usar o pacote na comanda)
na mesma branch: migration 052 aplicada em 17/nov/2026, publicada e testada em
uso — ver §9.8. Fatia 5c (assinaturas de cliente) na mesma branch: migration 053
aplicada em 17/nov/2026, publicada e testada em uso — ver §9.9.
Fases 6 em diante: planejamento.

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
| 3e | Custo adicional do serviço e produtos consumidos abatendo a comissão | Feita — migration 049 aplicada, testada em uso em 17/nov/2026 (§7.11) |

### 7.2 Modelo de dados (migrations 041 a 044 e 049)

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
- `services.additional_cost` (049) — custo fixo do serviço por atendimento.
- `commission_settings.cost_mode` (049) — quem arca com o custo do atendimento, com
  os mesmos quatro valores de taxa e desconto; NULL = segue o salão ou o padrão.
- `commission_entries.cost_amount` (049) — a parte do custo que saiu da comissão
  daquela linha. O que há a receber passa a ser comissão − taxa − auxiliar − custo.
  O banco confere que o custo não passa do que sobrou e só existe na linha do
  profissional.

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

Custo do atendimento (fatia 3e). A auditoria traz o campo "Custo adicional" e a aba
"Produtos consumidos" do serviço, sem dizer como entram na comissão. O dono decidiu
em 17/nov/2026 que **os dois abatem a comissão**; o resto foi decidido aqui, **a
confirmar com o dono**:

40. **Custo de um atendimento = custo adicional do serviço + custo estimado dos
    produtos que ele consome** (fatia 4d: fração da unidade × custo de compra). É o
    mesmo número que a tela "Consumo por serviço" mostra.
41. **"Quem arca com o custo" é uma regra do salão, com exceção por profissional**,
    no mesmo molde de taxa e desconto:
    - sai do valor do serviço antes da comissão (o profissional perde a mesma
      fração que a comissão representa: 50% de comissão → 50% do custo);
    - o salão arca com tudo (a comissão não muda);
    - sai inteiro da comissão;
    - meio a meio.
42. **O padrão é "sai do valor do serviço antes da comissão".** Só tem efeito em
    serviço com custo cadastrado: sem custo, a comissão é a de antes.
43. **O custo vem por último** — depois da taxa e do auxiliar — e **nunca deixa a
    comissão negativa**: abate, no máximo, o que sobrou.
44. **O auxiliar não é abatido**: o custo sai só da linha de quem executou.
45. **Custo só existe em serviço.** Produto vendido não tem "custo do atendimento".
46. **O custo conta mesmo quando o produto não tem controle de estoque** (não baixa
    saldo, mas custa) e mesmo com o módulo de estoque desligado, se houver consumo
    cadastrado. Produto sem custo de compra cadastrado não soma.
47. **O extrato é fotografia**: a comissão guarda o custo que valia quando a comanda
    foi faturada. Mudar o custo do serviço ou do produto depois não mexe no que já
    está no extrato; "Recalcular período" refaz as comissões em aberto com o custo
    de agora, e comissão paga não muda (regra 35).

Perguntas para o dono:

- O padrão "o custo sai do valor do serviço antes da comissão" (regra 42) é o que a
  Belasis faz? Se lá o custo sai inteiro da comissão, o padrão muda.
- O custo adicional do serviço é editado em Estoque > Consumo por serviço. Salão
  que usa comissões sem o estoque fica sem tela para ele: deve ir também para o
  cadastro do serviço ou para Comissões > Configurar?
- Produto vendido deve ter "custo adicional" abatendo a comissão da venda, como o
  serviço (regra 45)? A Belasis tem o campo no produto.
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
- (Feito na fatia 4e: a retirada de produto pelo profissional entra no extrato como
  vale e abate o líquido — ver §8.11.)

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
- **Custo do atendimento (fatia 3e)**: em Configurar comissões, a regra "Custo do
  atendimento" (no salão e na exceção do profissional). No extrato, a coluna
  "Custo" aparece quando algum atendimento do período teve custo abatido, e o
  resumo de "A receber" diz quanto foi. O custo adicional de cada serviço é
  editado em Estoque > Consumo por serviço, que mostra o custo por atendimento.

### 7.6 Onde o código mora

| O quê | Onde |
|---|---|
| Regra pura | `packages/db/src/domain/commissions.ts` (`planSaleCommissions`, `resolveCommissionRate`, `resolveCommissionSettings`, `resolveAssistantRule`, `planAssistantRule`, `planCommissionAdjustment`, `commissionNetCents`, `planCommissionPayment`, `planCommissionPaymentBatch`, `unpaidPlannedEntries`, `advancePaidDate`); o bloqueio do lançamento de comissão no financeiro fica em `domain/finance.ts`; o auxiliar do item é validado em `domain/sales.ts` (`planSaleItems`) |
| I/O | `packages/db/src/services/commissions.service.ts` |
| Comanda → comissão | `syncSaleCommissions`, chamado por `invoiceSaleService`, `receiveSaleDebtPaymentService` e `reopenSaleService` quando a action passa `recordCommissions` |
| Actions | `apps/web/app/actions/commissions.ts` |
| Telas | `apps/web/app/[salonId]/commissions/` |
| Testes | `apps/web/__tests__/lib/services/commissions-domain.test.ts` e, para o auxiliar no item, `sales-domain.test.ts` |
| Custo do atendimento (3e) | `costShare` em `domain/commissions.ts`; `serviceCostCents`, `itemCostCents` e `planAdditionalCost` em `domain/consumption.ts`; `loadServiceCosts` em `services/consumption.service.ts`, chamado por `syncSaleCommissions`; testes em `commission-costs-domain.test.ts` |

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

### 7.11 Fatia 3e — estado (17/nov/2026)

- Na branch `claude/fase-4-estoque` (depende da fatia 4d), publicada, sem PR.
  Typecheck (db, web e mcp-server), lint dos arquivos alterados e testes passando;
  o build do preview da Vercel passou.
- **Migration 049: aplicada em produção em 17/nov/2026** (pelo assistente, com a
  autorização do dono dada na hora), conferida por leitura (as três colunas e os
  três CHECKs no lugar; os 157 serviços batem com a cópia e nenhum ganhou custo;
  a regra do salão de teste ficou com `cost_mode` nulo) e registrada em
  `schema_migrations` (nome `commission_costs`).
- Cópias de segurança antes da 049: `backups.services_pre_049_20261117` (157
  linhas) e `backups.commission_settings_pre_049_20261117` (1 linha).
  `commission_entries` estava vazia. **Apagar só com o OK do dono.**
- Em outro ambiente, **aplicar a 049 antes de publicar o código**: ela acrescenta
  uma coluna em `services`, que o código novo seleciona e insere.
- Os números conferidos na auditoria continuam valendo para serviço sem custo
  (R$ 97,08 e R$ 231,24): há teste para os dois.
- **Testada em uso em 17/nov/2026**, no preview da branch, no salão de teste (Teste
  Shampoo com 1000 ml por unidade e custo R$ 20,00; regra de 50% para o Corte de
  Cabelo Masculino, criada para o teste). A captura de tela do navegador falhou; as
  conferências foram pelo texto da página:
  - Consumo por serviço, Corte de Cabelo Masculino: custo adicional R$ 2,00 e 30 ml
    de Teste Shampoo → "Custo adicional R$ 2,00" e "Custo por atendimento R$ 2,60".
  - Comanda #13 com 1 Corte (R$ 170,00) em dinheiro, faturada, com a regra no
    padrão → extrato: comissão R$ 85,00, coluna "Custo" R$ 1,30, a receber
    R$ 83,70 ("Comissões menos taxas, R$ 1,30 de custo dos atendimentos").
  - "Sai inteiro da comissão" + Recalcular período → custo R$ 2,60, a receber
    R$ 82,40.
  - "O salão arca com tudo" + Recalcular → a coluna "Custo" some, a receber
    R$ 85,00.
  - Exceção do profissional em "Meio a meio", com o salão arcando com tudo, +
    Recalcular → custo R$ 1,30, a receber R$ 83,70.
- **Não testado em uso:** custo com taxa de cartão e com auxiliar na mesma comanda
  (coberto só por teste da regra); custo maior que a comissão; comissão em valor
  fixo; quantidade maior que 1; produto consumido sem controle de estoque entrando
  no custo; comissão já paga ficando de fora do recálculo com custo; a tabela "por
  profissional" do extrato com a coluna "Custo" (só aparece com mais de um
  profissional no período); perfil sem `commissions.configure`.
- Dados de teste limpos: comanda #13 reaberta e excluída pela tela (comissões,
  baixa de consumo e lançamento no financeiro saíram com ela); por SQL, pelos IDs,
  a exceção do profissional, a regra de 50%, o consumo e o custo adicional do
  serviço, e a regra de custo do salão de volta a nulo. O salão de teste ficou como
  estava antes do teste.

## 8. Fase 4 — Produtos e estoque (detalhe)

Responde: quanto há de cada produto, o que entrou, o que saiu e o que comprar.
Parte da comanda (fase 1) e alimenta a comissão (fatia 3e). Itens da auditoria:
T-02 a T-04, T-06, T-07, T-09, T-10, K-08, R-10 e os fluxos 3 e 4.

### 8.1 Fatias

| Fatia | Entrega | Estado |
|---|---|---|
| 4a | Controle de estoque por produto (ligar, mínimo, custo, códigos), movimentações (entrada, saída, acerto), baixa pela comanda, sugestão de compra e valor em estoque | Feita — migration 045 aplicada, testada em uso em 16/nov/2026 (§8.7) |
| 4b | Fornecedores, marcas e categorias de produto; compra com itens, que dá entrada no estoque, atualiza o custo e gera a despesa no financeiro | Feita — migration 046 aplicada, testada em uso em 16/nov/2026 (§8.8) |
| 4c | Lotes e validades: registro de lote (código, fabricação, validade, quantidade), lote na entrada e no item da compra, o que resta por lote, aviso de vencidos e vencendo | Feita — migration 047 aplicada, testada em uso em 17/nov/2026 (§8.9) |
| 4d | Produtos consumidos por serviço (baixa de insumo por atendimento) e fracionamento ("uma unidade equivale a"). A fatia 3e (custo adicional e consumo abatendo a comissão) fica destravada, mas é outra entrega | Feita — migration 048 aplicada, testada em uso em 17/nov/2026 (§8.10) |
| 4e | Solicitações de saída pelo profissional, com "preço para profissional", debitadas no extrato de comissões | Feita, publicada na branch, migration 050 aplicada e testada em uso (§8.11) |
| 4f | Relatórios de estoque (movimentação por período, produtos consumidos) | Feita, publicada na branch, sem migration, testada em uso em 17/nov/2026 (§8.12) |
| — | Importação de XML de NF-e de compra | Fora da fase 4: depende do provedor fiscal (fase 10) |

O cadastro de produto que já existe (nome, descrição, preço, ativo) continua como
está e continua valendo para todo salão. O estoque é um módulo à parte, ligado
salão a salão.

### 8.2 Modelo de dados (migrations 045 a 048 e 050)

**045 (`045_inventory.sql`, fatia 4a):**

- `products` ganha `track_stock` (o salão controla este produto?), `min_stock`,
  `cost_price`, `sku` e `barcode`. Todas com padrão ou nulas: o cadastro antigo e o
  código antigo não percebem.
- `stock_movements` — uma linha por entrada, saída, acerto ou venda: produto,
  `kind` (`in`, `out`, `adjustment`, `sale`), `quantity` COM SINAL, custo unitário
  (na entrada), observação, quem lançou e, na venda, a comanda e o item.
- **O saldo não é gravado**: é a soma de `stock_movements.quantity` do produto, como
  o saldo das contas do financeiro. Não há número para sair de sincronia.

**046 (`046_purchases.sql`, fatia 4b):**

- `suppliers` — fornecedores: nome (único no salão, sem diferenciar maiúsculas),
  documento (CPF ou CNPJ, sem pontuação), telefone, e-mail, observações, ativo.
- `product_brands` e `product_categories` — nome único no salão. `products` ganha
  `brand_id` e `category_id` (FK `SET NULL`: apagar a marca não apaga produto).
- `purchases` — a compra: fornecedor (opcional), data, número da nota, observações,
  `items_amount`, `freight_amount`, `discount_amount` e `total_amount`, com CHECK
  `total = itens + frete − desconto`.
- `purchase_items` — produto, cópia do nome (`description`), quantidade, custo
  unitário, total e `previous_cost` (o custo que o produto tinha antes).
- `stock_movements` ganha `kind = 'purchase'`, `purchase_id` e `purchase_item_id`
  (FK `CASCADE`, um movimento por item).
- `financial_transactions` ganha `kind = 'purchase'` e `purchase_id` (FK `CASCADE`,
  índice NÃO único: uma compra pode ter várias parcelas).

**047 (`047_product_batches.sql`, fatia 4c):**

- `product_batches` — um lote de um produto: `code`, `manufactured_on`,
  `expires_on`, `quantity` (o que ENTROU com o lote), observação e
  `stock_movement_id` (a entrada que trouxe o lote; NULL = registrado solto; FK
  `CASCADE`). CHECK: código ou validade, e fabricação ≤ validade.
- **O que resta em cada lote não é gravado**: é calculado a partir do saldo do
  produto. Nenhuma tabela existente muda.

**048 (`048_service_consumption.sql`, fatia 4d):**

- `products` ganha `content_amount` e `content_unit` (`ml`, `g`, `un`): "uma
  unidade equivale a". Os dois andam juntos (CHECK); nulos = não fracionado.
- `service_products` — o que um serviço consome por atendimento: serviço, produto
  e `quantity` (na unidade de consumo do produto, ou em unidades). Um produto por
  serviço uma vez só.
- `stock_movements` ganha `kind = 'consumption'`: negativo, apontando para a
  comanda e para o ITEM DE SERVIÇO (FK `CASCADE`). O índice único de item passa a
  valer só para `sale`; o consumo tem o seu (`sale_item_id` + `product_id`).

**050 (`050_stock_requests.sql`, fatia 4e):**

- `products` ganha `requestable` (disponível para solicitação) e
  `professional_price` (preço para profissional; nulo = sem custo para ele).
- `stock_requests` — a solicitação: produto, profissional, cópia do nome e do
  preço da hora (`description`, `unit_price`), quantidade, total, `status`
  (`pending`, `approved`, `rejected`), quem pediu, quem decidiu e quando.
- `stock_movements` ganha `kind = 'request'` e `stock_request_id` (FK `CASCADE`,
  uma saída por solicitação).
- `commission_adjustments` ganha `stock_request_id` (FK `CASCADE`, único): o
  débito da retirada é um vale que aponta para a solicitação. O CHECK garante que
  só `advance` aponta.

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
   A compra (fatia 4b) segue a mesma regra. Custo médio continua como pergunta.
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

Compras (fatia 4b). A auditoria só lista as telas (Compras, Fornecedores, Marcas,
Categorias) e o passo "Entrada por Compra" do fluxo 3; o que segue foi decidido
aqui, **a confirmar com o dono**:

12. **A compra não tem rascunho nem edição.** Lançou, valeu. Para corrigir,
    exclui-se e lança-se de novo.
13. **Total = itens + frete − desconto.** É o que se paga ao fornecedor e o que vai
    para o financeiro. O desconto pode zerar a compra, não passar dela.
14. **Só produto com controle ligado dá entrada no estoque.** Produto sem controle
    entra na compra e tem o custo atualizado, mas não gera movimento (regra 1).
15. **O custo do produto passa a ser o custo unitário da compra** (último preço
    pago). Com o mesmo produto em dois itens, vale o último. Item a custo zero
    (bonificação) não muda o custo. Frete e desconto NÃO são rateados no custo.
16. **Fornecedor é opcional** na compra. A data não pode ser futura.
17. **O financeiro é uma escolha de quem lança**, e só aparece com o módulo
    `finance` ligado e a permissão `finance.create`:
    - "Fica a pagar": de 1 a 24 parcelas mensais a partir do primeiro vencimento
      (que não pode ser antes da compra). A soma das parcelas é exatamente o total;
      os centavos que sobram vão para a última. A conta é opcional.
    - "Já foi paga": uma despesa baixada no dia da compra; a conta é obrigatória.
    - "Não lançar": a compra só mexe no estoque.
18. **A competência de todas as parcelas é o dia da compra**: a despesa é do mês em
    que se comprou.
19. **Parcela de compra recebe baixa e estorno no Financeiro**, como qualquer
    despesa. Editar e excluir por lá, não: quem a desfaz é a exclusão da compra.
20. **Excluir a compra** desfaz a entrada no estoque e apaga as parcelas abertas.
    **Com parcela paga, não exclui**: estorna-se a baixa antes.
21. **Excluir a compra devolve o custo do produto** ao que era antes dela — só se o
    custo atual ainda for o desta compra. Se já mudou depois, fica.
22. **Fornecedor com compra não se exclui: desativa-se.** Marca e categoria podem
    ser excluídas a qualquer momento; os produtos ficam, sem elas.
23. **Documento do fornecedor sem conferência de dígito verificador.** Aceita CPF
    (11 dígitos) e CNPJ (14 caracteres, letras incluídas — CNPJ alfanumérico).
24. **Produto com venda ou compra não se apaga** (o banco recusa). A tela de
    Produtos passou a dizer isso, em vez de "Falha ao excluir produto".

Lotes e validades (fatia 4c). A auditoria só traz as colunas da tela (Item, Lote,
Fabricação, Validade, Quantidade); o que segue foi decidido aqui, **a confirmar com
o dono**:

25. **O lote guarda o que entrou; o que resta é calculado.** O saldo do produto é
    distribuído pelos lotes dele supondo que **sai primeiro o que vence primeiro**
    (PVPS). Lote sem validade sai por último; na mesma validade, sai primeiro o
    registrado antes. É uma suposição — a tela diz isso.
26. **A venda em comanda não escolhe lote** e não mudou. O mesmo vale para saída e
    acerto: mexem no saldo, e os lotes acompanham.
27. **Saldo maior que a soma dos lotes** é estoque sem lote (entrou antes de o
    salão registrar lotes, ou sem lote). Saldo zerado ou negativo: nenhum lote tem
    nada.
28. **O lote nasce de três jeitos:** na entrada manual do estoque (campos
    opcionais), no item da compra (lote e validade opcionais, só em produto
    controlado) ou solto, na tela de lotes, para o que já está na prateleira.
    **O lote solto não muda o saldo.**
29. **Lote precisa de código ou de validade.** A fabricação não pode ser futura nem
    depois da validade. Validade já vencida é aceita — é assim que o lote aparece
    como vencido.
30. **Situação do lote:** esgotado (não resta nada), vencido (resta e a validade
    passou), vencendo (resta e vence em até 30 dias — vencer hoje ainda não é
    vencido), em dia, sem validade. O aviso de 30 dias é fixo por enquanto.
31. **Editar e excluir o lote não mudam o saldo.** Para tirar produto vencido do
    estoque, lança-se uma saída. Excluir a compra apaga a entrada e o lote que veio
    com ela.

Consumo por serviço e fracionamento (fatia 4d). A auditoria traz a aba "Produtos
consumidos" do serviço e os campos "Registro de saída em unidade de consumo" e
"Uma unidade equivale a" do produto, sem as regras; o que segue foi decidido aqui,
**a confirmar com o dono**:

32. **O estoque continua em unidades** (frascos, potes). O fracionamento só diz
    quanto cabe em uma unidade — 1000 ml, 300 g, 12 un.
33. **O consumo do serviço é informado na unidade de consumo do produto** (ml, g)
    e convertido para fração de unidade na baixa: 30 ml de um frasco de 1000 ml
    baixam 0,030. Produto não fracionado: o consumo é em unidades.
34. **Faturar a comanda baixa o que os serviços dela consomem**, uma baixa por item
    de serviço × produto, multiplicada pela quantidade do item. Reabrir devolve.
    Vale só com o módulo `inventory` ligado, como a baixa da venda.
35. **Só produto com controle de estoque baixa.** O produto sem controle pode ficar
    na lista do serviço (a tela avisa), mas não gera movimento (regra 1).
36. **Consumo menor que um milésimo de unidade não vira movimento** (0,2 ml de um
    frasco de 1000 ml). A baixa é arredondada para o milésimo de unidade.
37. **O consumo é o do cadastro, sempre**: a comanda não deixa informar quanto foi
    gasto de fato naquele atendimento. Diferença aparece no acerto de inventário.
38. **Custo estimado por atendimento** = fração da unidade × custo de compra do
    produto, somado por serviço. É só informativo nesta fatia; é a base da 3e.
39. **Mudar o consumo de um serviço não mexe em comanda já faturada**: a baixa foi
    feita com o que valia na hora.

Solicitações de saída (fatia 4e). A auditoria traz a tela (Produto, Qtde,
Profissional, Status, Origem), os campos do produto ("Disponível para solicitação",
"Preço para profissional") e o fluxo 4: o profissional solicita, e "a saída aparece
no extrato de comissões como débito pelo preço para profissional". O resto foi
decidido aqui, **a confirmar com o dono**:

40. **Só produto ativo e marcado como "disponível para solicitação" pode ser
    pedido.** O preço para profissional é opcional: sem preço (ou zero), a retirada
    sai de graça e não gera débito.
41. **A solicitação nasce pendente** e guarda o nome e o preço da hora. Mudar o
    preço para profissional depois não muda o que já foi pedido.
42. **Quem só solicita (`inventory.request`) pede para si mesmo** — para os vínculos
    de profissional do próprio usuário — e vê só as próprias solicitações. Quem
    movimenta o estoque (`inventory.move`) pede para qualquer profissional, vê
    todas e decide.
43. **Aprovar tira o produto do estoque** (movimento "Retirada", se o produto tem
    controle) **e debita o valor no extrato de comissões**, na mesma operação. O
    débito é um **vale** que aponta para a solicitação: aparece em "Vales e
    bonificações" como "Retirada de produto" e abate o líquido como qualquer vale.
44. **O débito só existe com o módulo de comissões ligado e com valor maior que
    zero.** Sem comissões, a aprovação só mexe no estoque.
45. **Aprovar não confere saldo**, como a venda: o saldo pode ficar negativo.
46. **O débito entra no extrato no dia da aprovação**, não no dia do pedido.
47. **O débito de retirada não se exclui pelo extrato**: quem o desfaz é a exclusão
    da solicitação, que também devolve o produto ao estoque.
48. **Solicitação aprovada cujo débito já entrou num pagamento de comissão não se
    exclui**: estorna-se o pagamento antes. Pendente e recusada se excluem sempre;
    quem só solicita exclui as próprias pendentes.
49. **Nenhum dinheiro entra no financeiro**: a retirada é acerto entre o salão e o
    profissional, quitado no pagamento de comissões.

Relatórios (fatia 4f). A auditoria lista os relatórios de estoque sem dizer a
conta de cada um; o que segue foi decidido aqui:

50. **O período é em dias de Brasília**, do primeiro dia do mês corrente até hoje
    quando não se escolhe, e de no máximo um ano. Datas invertidas são trocadas.
51. **Movimentação por produto**: saldo inicial (tudo o que aconteceu até a véspera
    do período), entradas (entrada manual + compra), e as saídas separadas por
    motivo — vendas, consumo, retiradas e saídas manuais —, acertos com sinal e
    saldo final. O saldo final tem que fechar: inicial + entradas − saídas ±
    acertos.
52. **Entra no relatório o produto que teve movimento no período ou que começou o
    período com saldo.** Produto parado e zerado não aparece.
53. **Produtos consumidos**: o que os atendimentos gastaram de cada produto, com os
    serviços que consumiram e quantos itens de comanda. No produto fracionado,
    mostra também na medida dele (ml, g). O produto que mais custou vem primeiro.
54. **Todo valor é quantidade × custo de compra de HOJE.** O movimento de venda, de
    consumo e de retirada não guarda o custo da hora; a tela diz que é estimativa.
55. **Comanda reaberta some do relatório**: a baixa dela é apagada na reabertura
    (regra da fatia 4a), então o relatório mostra só o que está faturado agora.
56. **Quem vê**: `inventory.access`, como as outras telas de leitura do estoque.

Perguntas para o dono:

- Os valores dos relatórios devem usar o custo da data do movimento (regra 54)?
  Isso pede gravar o custo em cada baixa — hoje só a entrada e a compra guardam.
- Os relatórios precisam de exportação (planilha) já, ou fica para a fase 9?
- Vender sem saldo deve ser barrado, só avisar na comanda, ou seguir como está
  (regra 4)?
- O custo do produto deve ser o último preço pago (regra 6) ou o custo médio?
- Quem cadastra o produto (hoje, quem gerencia o salão) deve ver os campos de
  estoque no próprio cadastro, ou basta a tela de Estoque?
- A sugestão de compra deve repor até o mínimo (regra 8) ou até um "estoque ideal"
  separado?
- A compra deve poder ser editada depois de lançada (regra 12), ou excluir e
  lançar de novo basta?
- Frete e desconto da nota devem entrar no custo do produto (rateio), ou o custo é
  só o preço unitário (regra 15)?
- Fornecedores devem ter permissão própria, separada do estoque, como na Belasis
  (§8.4)? E devem aparecer nas despesas do Financeiro ("pago para fornecedor")?
- O que resta em cada lote pode ser calculado ("vence primeiro, sai primeiro",
  regra 25), ou a comanda deve escolher de qual lote o produto saiu?
- O aviso de validade em 30 dias (regra 30) serve, ou cada salão precisa escolher o
  prazo? Produto vencido deve ser barrado na venda?
- O consumo do serviço pode ser sempre o do cadastro (regra 37), ou o profissional
  precisa informar na comanda quanto gastou naquele atendimento?
- A saída manual também deve aceitar a unidade de consumo ("Registro de saída em
  unidade de consumo" da Belasis), ou só o consumo por serviço?
- (Respondida em 17/nov/2026: na fatia 3e, os dois abatem a comissão — o consumo e
  o custo adicional. Ver §7.11.)
- A solicitação precisa de aprovação (regra 43), ou o profissional retira direto e
  o débito nasce na hora? E quem aprova pode ser o próprio profissional?
- A coluna "Origem" da tela da Belasis não foi reproduzida: o que ela mostra lá?
- Retirada sem preço para profissional sai de graça (regra 40). Deve cair no preço
  de venda ou no custo de compra, em vez de zero?

### 8.4 Permissões e módulo

Módulo novo: `inventory` (ligado por salão). A baixa pela comanda depende de
`sales`.

| Permissão | O que libera |
|---|---|
| `inventory.access` | Ver o estoque e as movimentações |
| `inventory.move` | Lançar entrada, saída e acerto de inventário |
| `inventory.manage` | Ligar o controle do produto, estoque mínimo, custo e códigos; marca e categoria do produto; cadastro de fornecedores, marcas e categorias |
| `inventory.purchase` | Lançar e excluir compras |

Ver compras, fornecedores, marcas e categorias é `inventory.access`. A Belasis tem
"Compras" e "Fornecedores" como recursos separados, cada um com Acessar, Criar,
Editar e Excluir; aqui ficaram dentro de Estoque (decisão a confirmar). Gerar conta
a pagar a partir da compra exige também `finance.create`. Registrar, corrigir e
excluir lote é `inventory.move` (é operação de estoque, como a entrada). Definir o
fracionamento do produto e o consumo de cada serviço é `inventory.manage`.

Solicitações (fatia 4e): `inventory.request` é pedir produto para uso próprio — só
para si, vendo só as próprias. Aprovar, recusar, pedir para outro profissional e
excluir qualquer solicitação é `inventory.move`. Marcar o produto como disponível e
definir o preço para profissional é `inventory.manage`. Quem tem só
`inventory.request` vê "Estoque" no menu e cai direto na tela de solicitações.

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
- **Comanda**: nada muda na tela. Faturar baixa, reabrir devolve (o aviso de
  reabrir diz isso quando o módulo está ligado).
- As telas do estoque têm uma barra em comum: Produtos e saldo · Compras ·
  Fornecedores · Marcas e categorias.
- **Compras** (`/[salonId]/inventory/purchases`): lista por período com data,
  fornecedor, nota, itens, total e a situação no financeiro (fora do financeiro, a
  pagar, paga em parte, paga); cada linha abre os itens; excluir.
- **Nova compra** (`/[salonId]/inventory/purchases/new`): fornecedor, data, nota,
  itens (produto, quantidade, custo unitário — vem preenchido com o último custo),
  frete, desconto, total e a escolha do financeiro.
- **Fornecedores** (`/[salonId]/inventory/suppliers`): cadastro, edição, desativar
  e excluir (só sem compra).
- **Marcas e categorias** (`/[salonId]/inventory/catalog`): as duas listas, com o
  número de produtos de cada uma. A marca e a categoria do produto se escolhem em
  Produtos e saldo > Configurar.
- **Financeiro**: a parcela de compra aparece como despesa; aceita baixa e estorno,
  não tem editar nem excluir.
- **Lotes e validades** (`/[salonId]/inventory/batches`): totais (lotes em
  estoque, vencidos, vencendo), a lista por validade com produto, lote, fabricação,
  validade, quanto entrou, quanto resta e a situação, com os filtros "Em estoque",
  "Vencidos e vencendo" e "Esgotados"; "Novo lote" (solto), editar e excluir.
- **Produtos e saldo**: aviso no topo quando há lote vencido ou vencendo com
  produto na prateleira; em Movimentar > Entrada, os campos opcionais Lote,
  Fabricação e Validade.
- **Nova compra**: no item de produto controlado, Lote e Validade opcionais.
- **Consumo por serviço** (`/[salonId]/inventory/consumption`): cada serviço com o
  que consome por atendimento e o custo estimado; editar abre a lista de produtos
  e quantidades do serviço (a medida aparece no rótulo: ml, g ou un).
- **Produtos e saldo > Configurar**: "Uma unidade equivale a" (quantidade e
  medida). A lista mostra "1000 ml por unidade" e a movimentação mostra "Consumo"
  com o link da comanda.
- **Solicitações** (`/[salonId]/inventory/requests`): lista com data, produto,
  quantidade, profissional, valor e situação, com os filtros "Pendentes" e
  "Todas"; "Nova solicitação" (produto, profissional, quantidade, observação, com
  o total pelo preço para profissional); aprovar, recusar e excluir, cada um com a
  confirmação dizendo o que vai acontecer no estoque e nas comissões.
- **Produtos e saldo > Configurar**: "Disponível para solicitação" e "Preço para
  profissional". A tela avisa quando há solicitação pendente.
- **Comissões**: o débito aparece em "Vales e bonificações" como "Retirada de
  produto", sem botão de excluir.
- **Relatórios** (`/[salonId]/inventory/reports`): período em "De" e "Até" (fica
  na URL); três números (produtos com movimento ou saldo, valor das entradas,
  valor das saídas); "Movimentação por produto" (saldo inicial, entradas, vendas,
  consumo, retiradas, saídas, acertos, saldo final, custo das saídas) e "Produtos
  consumidos" (produto, serviços, consumido na medida, em unidades, custo
  estimado).

### 8.6 Onde o código mora

| O quê | Onde |
|---|---|
| Regra pura | `packages/db/src/domain/inventory.ts` (`planStockMovement`, `planProductStockSettings`, `planSaleStockMovements`, `stockStatus`, `purchaseSuggestionMilli`, `stockValueCents`) |
| I/O | `packages/db/src/services/inventory.service.ts` |
| Comanda → estoque | `recordSaleStock` (em `invoiceSaleService`, quando a action passa `recordStock`) e `revertSaleStock` (em `reopenSaleService`, sempre) |
| Actions | `apps/web/app/actions/inventory.ts` |
| Telas | `apps/web/app/[salonId]/inventory/` |
| Testes | `apps/web/__tests__/lib/services/inventory-domain.test.ts` |
| Compras — regra pura | `packages/db/src/domain/purchases.ts` (`planSupplier`, `planCatalogName`, `planPurchase`, `planPurchasePayables`, `splitInstallments`, `purchasePaymentStatus`, `purchaseDeleteBlocker`, `planCostRestore`) |
| Compras — I/O | `packages/db/src/services/purchases.service.ts` |
| Compras — parcela no financeiro | `PURCHASE_BLOCKER` em `packages/db/src/domain/finance.ts` (`editBlocker`, `deleteBlocker`) |
| Compras — actions | `apps/web/app/actions/purchases.ts` |
| Compras — telas | `apps/web/app/[salonId]/inventory/{purchases,suppliers,catalog}/`; peças comuns em `inventory-ui.tsx` |
| Compras — testes | `apps/web/__tests__/lib/services/purchases-domain.test.ts` |
| Lotes — regra pura | `packages/db/src/domain/batches.ts` (`planBatch`, `hasBatchData`, `compareBatchesByConsumption`, `distributeBalance`, `batchStatus`, `daysBetween`, `EXPIRY_WARNING_DAYS`) |
| Lotes — I/O | `packages/db/src/services/batches.service.ts`; `insertMovementBatch` é chamado por `createStockMovementService` e `createPurchaseService` |
| Lotes — actions | `getBatches`, `saveBatch` e `deleteBatch` em `apps/web/app/actions/inventory.ts` |
| Lotes — tela | `apps/web/app/[salonId]/inventory/batches/` |
| Lotes — testes | `apps/web/__tests__/lib/services/batches-domain.test.ts` |
| Consumo — regra pura | `packages/db/src/domain/consumption.ts` (`planProductContent`, `planServiceConsumption`, `consumptionUnitsMilli`, `consumptionCostCents`, `planSaleConsumptionMovements`) |
| Consumo — I/O | `packages/db/src/services/consumption.service.ts`; a baixa está em `recordSaleStock` (`inventory.service.ts`) |
| Consumo — actions | `getServiceConsumption` e `saveServiceConsumption` em `apps/web/app/actions/inventory.ts` |
| Consumo — tela | `apps/web/app/[salonId]/inventory/consumption/` |
| Consumo — testes | `apps/web/__tests__/lib/services/consumption-domain.test.ts` |
| Solicitações — regra pura | `packages/db/src/domain/stock-requests.ts` (`planProductRequestSettings`, `planStockRequest`, `planStockRequestApproval`, `requestDebitNotes`, `stockRequestRejectBlocker`, `stockRequestDeleteBlocker`) |
| Solicitações — I/O | `packages/db/src/services/stock-requests.service.ts`; o bloqueio de excluir o débito pelo extrato está em `deleteCommissionAdjustmentService` |
| Solicitações — actions | `getStockRequests`, `createStockRequest`, `decideStockRequest` e `deleteStockRequest` em `apps/web/app/actions/inventory.ts` (o `authorizeSalon` de lá aceita uma lista: basta uma permissão) |
| Solicitações — tela | `apps/web/app/[salonId]/inventory/requests/` |
| Solicitações — testes | `apps/web/__tests__/lib/services/stock-requests-domain.test.ts` |
| Relatórios — regra pura | `packages/db/src/domain/stock-reports.ts` (`planReportPeriod`, `buildMovementReport`, `buildConsumptionReport`, `unitsToMeasureMilli`) |
| Relatórios — I/O | `packages/db/src/services/stock-reports.service.ts` (só leitura; soma por produto e tipo no banco) |
| Relatórios — action | `getStockReports` em `apps/web/app/actions/inventory.ts` |
| Relatórios — tela | `apps/web/app/[salonId]/inventory/reports/` |
| Relatórios — testes | `apps/web/__tests__/lib/services/stock-reports-domain.test.ts` |
| Quantidade na tela | `apps/web/lib/utils/quantity.utils.ts` (`formatQuantity`, `quantityToInput`, `parseQuantity`), com teste em `__tests__/lib/utils/quantity.test.ts` |

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
- O módulo `inventory` está ligado **só no salão de teste** (Salão TOP), desde
  16/nov/2026. Nos outros salões nada muda.
- **Testada em uso em 16/nov/2026**, no preview da branch, no salão de teste, com
  dois produtos criados para isso ("Teste Shampoo", R$ 30,00, e "Teste Pente",
  R$ 10,00 — cadastrar produto continua funcionando depois da 045):
  - "Estoque" aparece no menu; os dois produtos entram como "Sem controle".
  - Controle do Teste Shampoo ligado com mínimo 5, custo R$ 18,50 e código →
    "Zerado", sugestão de compra 5, "Para comprar (1)".
  - Acerto com 10 contados → movimento "+ 10", saldo 10, "Em dia", valor em estoque
    R$ 185,00.
  - Entrada de 2 a R$ 20,00 com observação → saldo 12, custo do produto passa a
    R$ 20,00, valor R$ 240,00.
  - Saída de 9 → saldo 3, "Abaixo do mínimo", sugestão 2, valor R$ 60,00; a aba
    "Para comprar" mostra só ele.
  - Comanda #10 com 4 Teste Shampoo e 1 Teste Pente, faturada → movimento "Venda
    − 4" com o link "Comanda #10", saldo −1, "Negativo", sugestão 6, valor em estoque
    R$ 0,00. O Teste Pente (sem controle) não gerou movimento.
  - Reabrir a comanda → o movimento de venda some e o saldo volta a 3. O filtro de
    movimentações por produto funciona.
  - Acerto com a mesma quantidade que o sistema mostra é recusado ("O estoque já
    está nesta quantidade").
- Ajuste que saiu do teste: o aviso de "Reabrir comanda" não dizia que o estoque
  volta. Com o módulo ligado, passou a dizer (`inventoryEnabled` nas opções da
  comanda).
- **Não testado em uso:** perfil com `inventory.access` sem `move`/`manage` (os
  botões somem; a trava do servidor está coberta só pelo teste estático das
  actions); quantidade fracionada (1,5); desligar o controle de um produto que já
  tem movimentos; o mesmo produto em dois itens da comanda; faturar com o módulo
  desligado e reabrir depois.
- Dados de teste limpos: comanda #10 excluída e os três lançamentos de estoque
  apagados. **Ficaram, como apoio para as próximas fatias:** os produtos "Teste
  Shampoo" (controle ligado, mínimo 5, custo R$ 20,00, saldo zero) e "Teste Pente"
  no salão de teste.

### 8.8 Fatia 4b — estado (16/nov/2026)

- Na branch `claude/fase-4-estoque`, publicada, sem PR. Typecheck (db, web e
  mcp-server), lint dos arquivos alterados e testes passando; o build do preview da
  Vercel passou.
- **Migration 046: aplicada em produção em 16/nov/2026** (pelo assistente, com a
  autorização do dono dada na hora), conferida por leitura (as cinco tabelas novas
  com RLS, `deny_all` e sem acesso para `anon`/`authenticated`; as colunas novas e
  os CHECKs de `stock_movements` e `financial_transactions` no lugar; os 73
  produtos intactos, nenhum com marca ou categoria) e registrada em
  `schema_migrations` (nome `purchases`).
- Cópia de segurança antes da 046: `backups.products_pre_046_20261116` (73 linhas).
  `stock_movements` e `financial_transactions` estavam vazias. **Apagar só com o
  OK do dono.**
- Em outro ambiente, **aplicar a 046 antes de publicar o código**: ela acrescenta
  colunas em `products`, `stock_movements` e `financial_transactions`, e o INSERT
  do Drizzle lista todas as colunas.
- **Testada em uso em 16/nov/2026**, no preview da branch, no salão de teste:
  - Marcas e categorias: "Teste Marca" e "Teste Categoria" criadas; o mesmo nome em
    minúsculas é recusado ("Já existe uma marca com este nome"); em Produtos e
    saldo > Configurar, as duas no Teste Shampoo → a lista mostra "SH-01 · Teste
    Marca · Teste Categoria".
  - Fornecedores: "Teste Distribuidora" com CNPJ (mostrado com a pontuação) e
    telefone; nome repetido recusado; edição (e-mail); desativado → some da nova
    compra; reativado → volta.
  - Compra a pagar: 10 Teste Shampoo a R$ 22,00 + 3 Teste Pente a R$ 4,00, frete
    R$ 10,00, desconto R$ 2,00 → total R$ 240,00, "A pagar em 3×". O Shampoo foi a
    saldo 10 com movimento "Compra + 10" e custo R$ 22,00; o Pente (sem controle)
    não gerou movimento e ficou com custo R$ 4,00. No Financeiro, três despesas
    "Compra NF 1234 — Teste Distribuidora (1/3)…(3/3)" de R$ 80,00, vencendo em
    16/11, 16/12 e 16/01, "A pagar", só com o botão de dar baixa.
  - Baixa da parcela 1/3 no Financeiro → a compra mostra "Paga 1 de 3" e excluir
    é recusado; estorno da baixa → excluir funciona: saldo volta a zero, o
    movimento e as parcelas somem, o custo do Shampoo volta a R$ 20,00 e o do Pente
    volta a vazio.
  - Compra "Já foi paga": sem conta, não lança; com a conta, vira despesa "Pago" de
    R$ 42,00 na data da compra, o saldo da conta cai R$ 42,00 e a compra mostra
    "Paga".
  - Compra sem fornecedor, de produto sem controle, "Não lançar no financeiro" →
    "Sem fornecedor", "Fora do financeiro".
  - Fornecedor com compra não tem o botão de excluir. Remover o Teste Shampoo em
    Produtos → "Este produto tem vendas ou compras lançadas. Desative em vez de
    excluir."
- Ajustes que saíram do teste (ainda **não vistos na tela**): com parcela paga, o
  botão de excluir a compra avisa na hora, em vez de abrir uma confirmação que
  seria recusada; a nova compra diz "Nenhum fornecedor ativo" (dizia "cadastrado"
  mesmo havendo um inativo).
- **Não testado em uso:** perfil sem `inventory.purchase` ou sem `finance.create`
  (a compra sem a opção do financeiro); salão sem o módulo `finance`; filtro de
  período da lista; mais de 100 compras; quantidade fracionada; o mesmo produto em
  dois itens; item a custo zero; vencimento no dia 31; excluir marca ou categoria
  em uso; excluir fornecedor sem compra; CPF e CNPJ alfanumérico.
- Dados de teste limpos: as três compras excluídas pela tela (sem compras,
  movimentos nem lançamentos no financeiro). **Ficaram, como apoio para as próximas
  fatias:** o fornecedor "Teste Distribuidora", a marca "Teste Marca" e a categoria
  "Teste Categoria", além dos dois produtos de teste.

### 8.9 Fatia 4c — estado (17/nov/2026)

- Na branch `claude/fase-4-estoque`, publicada, sem PR. Typecheck (db, web e
  mcp-server), lint dos arquivos alterados e testes passando; o build do preview da
  Vercel passou.
- **Migration 047: aplicada em produção em 17/nov/2026** (pelo assistente, com a
  autorização do dono dada na hora), conferida por leitura (`product_batches` com
  RLS, `deny_all`, sem acesso para `anon`/`authenticated`, CHECKs e índices no
  lugar, vazia) e registrada em `schema_migrations` (nome `product_batches`). Só
  cria tabela nova: não houve cópia de segurança a fazer.
- Em outro ambiente, **aplicar a 047 antes de publicar o código**: a tela de
  Estoque consulta a tabela.
- **Testada em uso em 17/nov/2026**, no preview da branch, no salão de teste, com o
  Teste Shampoo partindo de saldo zero:
  - Movimentar > Entrada de 10 com lote "L1" e validade em 10 dias → em Lotes, L1
    entrou 10, resta 10, "Vencendo", "vence em 10 dias", "veio de entrada"; o
    Estoque mostra o aviso "1 lote vencendo com produto na prateleira".
  - Nova compra com 5 Teste Shampoo, lote "L2", validade em 1 ano → L2 entrou 5,
    resta 5, "Em dia", "veio de compra". O item do Teste Pente (sem controle) não
    mostra os campos de lote.
  - Saída de 12 → saldo 3: L1 sai de "Em estoque" e aparece em "Esgotados" com
    resta 0; L2 resta 3; o aviso de validade some.
  - Lote solto: sem código e sem validade é recusado; validade antes da fabricação
    é recusada. "L0" com validade vencida e quantidade 2 → o saldo continua 3 e o
    L0 nasce "Esgotado" (é o primeiro a sair e o saldo não cobre os lotes).
  - Acerto para 20 → L0 resta 2 "Vencido" ("venceu há 200 dias"), L1 resta 10
    "Vencendo", L2 resta 5 "Em dia"; o aviso volta com "1 lote vencido e 1 lote
    vencendo".
  - Editar o L0 (validade futura) → passa a "Em dia" e muda de posição na lista;
    excluir o L0 → some, saldo igual.
  - Excluir a compra → o L2 some com ela.
- **Limites vistos no teste** (não corrigidos):
  - As unidades sem lote (saldo acima da soma dos lotes) não aparecem em lugar
    nenhum da tela — no teste eram 3.
  - Lote solto registrado quando os lotes já somam mais que o saldo nasce
    "Esgotado", sem a tela explicar por quê.
  - Uma vez, o modal "Novo lote" fechou sozinho entre duas ações do teste; não se
    repetiu na tentativa seguinte e a causa não foi encontrada.
- **Não testado em uso:** perfil com `inventory.access` sem `move` (sem os botões
  de lote); venda em comanda consumindo lote (o caminho é o mesmo da saída: mexe no
  saldo); lote sem validade; dois lotes com a mesma validade; fabricação informada
  na entrada; lote em produto que depois teve o controle desligado; excluir produto
  com lote.
- Dados de teste limpos: compra excluída pela tela; os três lançamentos de estoque
  apagados por SQL, pelos IDs — o lote L1 foi junto com a entrada dele (FK
  `CASCADE`). Sem compras, movimentos, lotes nem lançamentos no financeiro.

### 8.10 Fatia 4d — estado (17/nov/2026)

- Na branch `claude/fase-4-estoque`, publicada, sem PR. Typecheck (db, web e
  mcp-server), lint dos arquivos alterados e testes passando; o build do preview da
  Vercel passou.
- **Migration 048: aplicada em produção em 17/nov/2026** (pelo assistente, com a
  autorização do dono dada na hora), conferida por leitura (`service_products` com
  RLS, `deny_all` e sem acesso para `anon`/`authenticated`; os CHECKs de
  `stock_movements` e de `products` e os dois índices únicos no lugar; os 73
  produtos intactos, nenhum fracionado) e registrada em `schema_migrations` (nome
  `service_consumption`).
- Cópia de segurança antes da 048: `backups.products_pre_048_20261117` (73 linhas).
  **Apagar só com o OK do dono.**
- Em outro ambiente, **aplicar a 048 antes de publicar o código**: ela acrescenta
  colunas em `products`, e o INSERT do Drizzle lista todas as colunas.
- A fatia 3e veio em seguida, com a decisão do dono (consumo e custo fixo abatem
  a comissão) — ver §7.11.
- **Testada em uso em 17/nov/2026**, no preview da branch, no salão de teste (Teste
  Shampoo com saldo zero e custo R$ 20,00). A captura de tela do navegador falhou
  nesta sessão; as conferências foram pelo texto da página e, onde indicado, por
  leitura do banco:
  - Configurar o Teste Shampoo com "uma unidade equivale a 1000 ml" → a lista
    mostra "1.000 ml por unidade".
  - Consumo por serviço, Corte de Cabelo Masculino: o mesmo produto duas vezes é
    recusado ("Produto 2: já está na lista"); o rótulo da quantidade mostra "ml".
    Salvo com 30 ml de Teste Shampoo e 1 Teste Pente → a tela mostra "30 ml de
    Teste Shampoo", "1 un de Teste Pente · sem controle de estoque, não baixa" e
    custo estimado R$ 0,60.
  - Acerto para 2; comanda #12 com 2 Cortes, faturada → movimento "Consumo − 0,06"
    com "Comanda #12", saldo 1,94. O Teste Pente não gerou movimento.
  - Reabrir a comanda → o consumo some (conferido no banco: só o acerto ficou).
  - A mesma comanda com mais 1 Teste Shampoo vendido, faturada → "Venda − 1" e
    "Consumo − 0,06", saldo 0,94.
  - Consumo do serviço removido (lista vazia) → comanda reaberta e faturada de novo
    baixa só a venda (conferido no banco: acerto + 2 e venda − 1).
- **Não testado em uso:** perfil com `inventory.access` sem `manage`; produto não
  fracionado com controle ligado consumido em unidades; dois serviços com consumo
  na mesma comanda; consumo que arredonda para zero; mudar o fracionamento de um
  produto que já tem consumo; faturar com o módulo desligado; lotes diminuindo com
  o consumo (o caminho é o do saldo).
- Dados de teste limpos: comanda #12 excluída pela tela, consumo do serviço
  removido pela tela, o acerto apagado por SQL, pelo ID. Sem movimentos, consumos,
  compras nem lançamentos no financeiro. **Ficou, como apoio para a fatia 3e:** o
  Teste Shampoo com "1000 ml por unidade".

### 8.11 Fatia 4e — estado (17/nov/2026)

- Na branch `claude/fase-4-estoque`, **publicada**. Typecheck (db, web e
  mcp-server), lint dos arquivos alterados e testes passando.
- **Migration 050: aplicada em produção em 17/nov/2026** (pelo assistente, com a
  autorização do dono dada na hora), conferida por leitura e registrada em
  `schema_migrations` (nome `stock_requests`).
- Cópia de segurança antes da 050: `backups.products_pre_050_20261117` (73 linhas;
  `stock_movements` e `commission_adjustments` estavam vazias). **Apagar só com o
  OK do dono.**
- Em outro ambiente, **aplicar a 050 antes de publicar o código**: ela acrescenta
  colunas em `products`, `stock_movements` e `commission_adjustments`, e o INSERT
  do Drizzle lista todas as colunas.
- **Testada em uso em 17/nov/2026**, no preview da branch, no salão de teste. A
  captura de tela do navegador falhou nesta sessão; as conferências foram pelo
  texto da página e, onde indicado, por leitura do banco:
  - Configurar o Teste Shampoo com "Disponível para solicitação" e preço para
    profissional R$ 15,00 → a lista mostra "disponível para solicitação".
  - Acerto para 5. Nova solicitação de 2 Teste Shampoo para um profissional →
    pendente, R$ 30,00, "Pendentes (1)"; o estoque avisa "1 aguardando decisão".
  - Na nova solicitação, a lista de produtos traz só o Teste Shampoo (o Teste
    Pente, não marcado, não aparece).
  - Aprovar: a confirmação avisa "O produto sai do estoque e R$ 30,00 são
    debitados". Depois: saldo 3, movimento "Retirada − 2" com "Ver solicitações";
    em Comissões, "Vales e bonificações" mostra "Retirada de produto: 2 × Teste
    Shampoo − R$ 30,00", vales − R$ 30,00 e líquido − R$ 30,00 (sem comissões no
    período: o roteiro previa uma regra de 50%, que não foi criada).
  - Excluir a solicitação aprovada: a confirmação avisa que o produto volta e o
    débito sai. Conferido no banco: nenhuma solicitação, nenhum vale, só o acerto
    de + 5 nas movimentações.
  - Nova solicitação de 1 para outro profissional, recusada → fica "Recusada" em
    "Todas", sem movimento nem vale. Excluída pela tela.
- **Achado no teste, vindo da fatia 4d, e corrigido:** salvar "Configurar" de um
  produto com "1.000 ml por unidade" gravava 1 ml — o campo abria com o texto de
  exibição, com separador de milhar, e a leitura tratava o ponto como decimal. O
  mesmo valia para estoque mínimo, lotes e consumo por serviço a partir de mil.
  Correção em `apps/web/lib/utils/quantity.utils.ts` (`quantityToInput` sem
  separador de milhar no campo; `parseQuantity` lê "1.000" como mil), com teste
  em `__tests__/lib/utils/quantity.test.ts`. Conferido na tela: digitar "1.000" →
  a lista mostra "1.000 ml por unidade", e continua assim depois de abrir e salvar
  de novo sem mexer.
- **Não testado em uso:** perfil só com `inventory.request` (menu, redirecionamento
  e o que ele enxerga); solicitação acima do saldo; aprovar sem saldo; recusar ou
  excluir quando o vale já entrou num pagamento de comissão; o botão de excluir
  ausente no vale de retirada (o texto da página não mostra botões; a regra está
  coberta por teste de domínio); produto com lotes; produto fracionado.
- Dados de teste limpos: solicitações excluídas pela tela, o acerto apagado por
  SQL, pelo ID. Sem solicitações, vales nem movimentos. **Ficou, como apoio:** o
  Teste Shampoo disponível para solicitação, com preço para profissional R$ 15,00
  e "1000 ml por unidade".

### 8.12 Fatia 4f — estado (17/nov/2026)

- Na branch `claude/fase-4-estoque`, **publicada**. Typecheck (db e web), lint dos
  arquivos alterados e testes passando.
- **Sem migration**: os relatórios só leem `stock_movements`, `products`,
  `sale_items` e `services`.
- A importação de XML de NF-e de compra saiu da fatia: depende do provedor fiscal
  (fase 10).
- **Testada em uso em 17/nov/2026**, no preview da branch, no salão de teste (Teste
  Shampoo, custo R$ 20,00, 1000 ml por unidade). A captura de tela do navegador
  falhou nesta sessão; as conferências foram pelo texto da página:
  - Sem movimento: "Nenhum produto com movimento ou saldo no período" e "Nenhum
    produto consumido por atendimento no período"; os três números zerados.
  - Dados: um acerto de + 5 com data de 20/out/2026 (lançado por SQL, para existir
    saldo anterior ao mês); consumo do Corte com 30 ml de Teste Shampoo; comanda
    com 2 Cortes e 1 Teste Shampoo, faturada; solicitação de 1, aprovada.
  - Mês corrente (1 a 17/nov): Teste Shampoo com saldo inicial 5, vendas 1, consumo
    0,06, retiradas 1, saldo final 2,94 e custo das saídas R$ 41,20; saídas do
    período R$ 41,20. "Produtos consumidos": Corte de Cabelo Masculino · 1 item de
    comanda · 0,06 un, 60 ml, R$ 1,20.
  - Período de 1/out a 16/nov (pela URL): saldo inicial 0, acertos + 5, saldo final
    5, nenhuma saída e nenhum consumo.
  - Trocar o "Até" para 17/nov no campo de data → a URL muda e a linha passa a
    saldo inicial 0, vendas 1, consumo 0,06, retiradas 1, acertos + 5, saldo final
    2,94.
  - Reabrir a comanda → "Produtos consumidos" volta a ficar vazio.
- **Não testado em uso:** entrada manual, compra e saída manual no relatório (as
  colunas "Entradas" e "Saídas" ficaram sem valor; a soma está coberta por teste
  da regra); a linha da movimentação logo depois da reabertura (só o consumo vazio
  foi lido); mais de um produto e mais de um serviço; produto não fracionado;
  serviço apagado ("Serviço removido"); período acima de um ano e data inválida na
  URL; movimento perto da meia-noite (virada do dia em Brasília); perfil sem
  `inventory.access`.
- Dados de teste limpos: comanda excluída, solicitação excluída e consumo do Corte
  removido, os três pela tela; o acerto apagado por SQL, pelo ID. Sem movimentos,
  solicitações, vales, consumos, comissões nem lançamentos no financeiro.

## 9. Fase 5 — Pacotes e assinaturas (detalhe)

Responde: o que o cliente comprou adiantado, quanto ainda tem e quando vence.
Parte da comanda (fase 1) e do financeiro (fase 2). Itens da auditoria: P-06 a
P-10, T-05, F-02 (assinaturas de clientes), a aba Pacotes da ficha do cliente, o
relatório "Extrato de Pacotes" e a permissão Pacotes (Acessar, Criar, Editar,
Excluir). A auditoria diz pouco da regra: "Pacote predefinido: modelo com itens e
total (ex.: 5 sessões de laser)", "Pacote vendido: Cliente, Data, Validade, Pacote
Predefinido, Vendedor, Descrição, itens; Salvar ou Faturar", "a lista mostra
Disponibilidade (saldo de sessões)", e na ficha "Pacote, Qtde, Saldo,
Disponibilidade, Comandas". O resto foi decidido aqui (§9.3).

### 9.1 Fatias

| Fatia | Entrega | Estado |
|---|---|---|
| 5a | Pacotes predefinidos (itens, valor, validade, ativo); venda de pacote como item da comanda; o pacote do cliente nasce no faturamento e some na reabertura; lista de pacotes vendidos com disponibilidade e situação | Feita — migration 051 aplicada, testada em uso em 17/nov/2026 (§9.7) |
| 5b | Usar o pacote na comanda: item "do pacote" (serviço ou produto, sem cobrança), que baixa o saldo ao faturar e devolve ao reabrir; comissão de quem executou sobre o valor da sessão; produto do pacote baixa o estoque; aba Pacotes na ficha do cliente | Feita, migration 052 aplicada, publicada e testada em uso (§9.8) |
| 5c | Assinaturas de cliente: modelos (nome, valor, periodicidade, situação, visível), assinatura com vencimento e situação (Pendente, Ativa, Expirada, Desativada), renovação manual gerando a cobrança | Feita, migration 053 aplicada, publicada e testada em uso (§9.9) |
| 5d | Relatórios (extrato de pacotes, vendas por assinatura); saldo de pacote para o agente do WhatsApp | Pendente |

A página pública de planos com link copiável e a renovação automática de
assinatura dependem de pagamento online (fase 8).

### 9.2 Modelo de dados (migration 051)

**`package_templates`** — o pacote predefinido: `name` (único no salão, sem
diferença de maiúscula), `description`, `price` numeric(12,2), `validity_days`
(1 a 3650; NULL = não vence), `is_active`.

**`package_template_items`** — o que o modelo inclui: `kind` (`service` ou
`product`), `service_id` ou `product_id` (exatamente um), `quantity` inteira (1 a
999), `position`. O mesmo serviço (ou produto) uma vez por modelo.

**`sale_items`** — `kind` aceita `package`, com `package_template_id` (sem ON
DELETE). Item de pacote tem quantidade 1 (CHECK).

**`customer_packages`** — o pacote do cliente: `customer_id`, `sale_id` e
`sale_item_id` (único, CASCADE), `template_id`, `name` (cópia), `sold_on`,
`expires_on`, `seller_id`, `price` (o total do item).

**`customer_package_items`** — cópia dos itens do modelo no faturamento:
`kind`, `service_id`/`product_id`, `description`, `quantity`.

Todas com `salon_id`, RLS ligado, `deny_all` e sem acesso para
`anon`/`authenticated`.

**Migration 052 (fatia 5b):**

- `customer_package_items.value` numeric(12,2) — a parte do preço pago pelo pacote
  que cabe à linha (rateio no faturamento, regra 15).
- `sale_items.customer_package_item_id` (sem ON DELETE) — o item "do pacote": de
  qual linha do pacote do cliente ele sai. CHECK: só em serviço ou produto, com
  total e desconto zero e quantidade inteira.
- **Não há tabela de consumo.** O saldo de uma linha é a quantidade dela menos a
  soma das quantidades dos itens de comandas FATURADAS que a citam. Reabrir a
  comanda que usou devolve o saldo sem desfazer nada.

**Migration 053 (fatia 5c):**

- **`subscription_plans`** — o plano: `name` (único no salão, sem diferença de
  maiúscula), `description`, `price`, `interval_months` (1 a 36), `is_active`,
  `is_visible`.
- **`customer_subscriptions`** — a assinatura do cliente: `customer_id`,
  `plan_id`, cópias de `name`, `price` e `interval_months`, `started_on`,
  `deactivated_at` (NULL = em vigor). Uma em vigor por cliente e plano (índice
  único parcial).
- **`sale_items`** — `kind` aceita `subscription`, com
  `customer_subscription_id` (sem ON DELETE). Item de assinatura tem quantidade 1.
- **`customer_subscription_periods`** — o período pago: `subscription_id`,
  `sale_id` e `sale_item_id` (único, CASCADE), `period_start`, `period_end` (o
  vencimento), `amount`.
- **Não há coluna de situação.** Ela sai dos períodos e de `deactivated_at`
  (regra 26). Reabrir a comanda apaga o período e a situação volta sozinha.

### 9.3 Regras de negócio

1. **Vender pacote é um item da comanda** ("+ Pacote"). Pagamento, taxas,
   financeiro, caixa e fiado são os da comanda — nada novo. A Belasis tem uma tela
   "Novo pacote" com Salvar/Faturar própria; aqui a comanda faz esse papel.
2. **O pacote do cliente nasce quando a comanda é faturada**, um por item de
   pacote. Comanda pendente não dá pacote.
3. **Um item de pacote é UM pacote** (quantidade 1). Para vender dois, dois itens.
4. **O pacote do cliente COPIA o modelo no faturamento**: nome, itens, quantidades
   e validade. Mudar ou desativar o modelo depois não muda o que foi vendido.
5. **A data do pacote é o dia da comanda em Brasília**; a validade conta a partir
   dela e vale até o último dia, inclusive. Sem validade, não vence.
6. **O valor do pacote é o total do item da comanda**: o valor do modelo é
   sugestão, pode ser alterado e levar desconto, como qualquer item.
7. **Vendedor é opcional**: o profissional do item, como no produto.
8. **Reabrir a comanda apaga os pacotes que ela vendeu**; faturar de novo cria
   outros. (Na 5b: reabrir é barrado se uma sessão do pacote já foi usada.)
9. **Venda de pacote não gera comissão nem baixa estoque.** A comissão e a baixa
   acontecem no USO (5b), sobre o que foi feito.
10. **Modelo que já entrou em comanda (mesmo pendente) não se apaga**:
    desativa-se. Inativo some da comanda nova, mas continua na comanda que já o
    tinha.
11. **Situação do pacote vendido**: Disponível (tem saldo e está na validade),
    Vencido (passou da validade com saldo) ou Utilizado (sem saldo).
12. **Quantidade dos itens é inteira** — sessões e unidades.
13. **Sem o módulo `packages`, a comanda não vende pacote** (o servidor recusa o
    item). Mas uma comanda faturada com pacote cria o pacote mesmo que o módulo
    tenha sido desligado depois: o cliente pagou.

Fatia 5b — usar o pacote:

14. **Usar é um item da comanda "do pacote"**: o serviço (ou produto) da linha do
    pacote, sem cobrança (valor e desconto zero, travados), quantidade inteira. O
    serviço continua exigindo quem executou. Pode vir de agendamento; o
    agendamento fecha com valor cobrado zero (a receita entrou na venda do pacote).
15. **O valor de cada linha é o preço pago pelo pacote rateado** pelo preço de
    tabela × quantidade das linhas, no faturamento da venda (sem preço de tabela,
    pela quantidade). Em centavos, a soma das linhas é o preço. O valor de uma
    sessão é o valor da linha ÷ sessões.
16. **O saldo baixa quando a comanda que usa é FATURADA** e volta quando ela é
    reaberta. Ao faturar, as linhas usadas ficam travadas (FOR UPDATE) até o fim
    — duas comandas não usam a mesma última sessão. Salvar também confere, para
    avisar cedo, mas a palavra final é do faturamento.
17. **Só o pacote do próprio cliente**, só com saldo, e só no período do pacote: a
    data da comanda (Brasília) entre a compra e o último dia da validade,
    inclusive. Vencido não se usa (regra provisória — ver perguntas).
18. **Comissão no USO**, para quem executou, sobre o valor da sessão (regra 15),
    pela regra de comissão do serviço — sem desconto e sem taxa (a taxa foi da
    comanda que vendeu o pacote). A venda do pacote continua sem comissão (regra 9).
19. **Estoque**: o produto do pacote e o consumo do serviço do pacote baixam o
    estoque no faturamento da comanda que usa, como qualquer item.
20. **A comanda que vendeu um pacote não reabre se ele está em uso** em outra
    comanda (aberta ou faturada) — reabrir apagaria o pacote. A mensagem diz qual
    comanda. Excluir a comanda (aberta) que usava solta a ligação.
21. **Sem o módulo `packages`, a comanda não aceita item do pacote novo**; uma
    comanda que já tinha item do pacote ainda fatura (o saldo é conferido igual).

Fatia 5c — assinaturas de cliente:

22. **O plano de assinatura** tem nome, valor (maior que zero), periodicidade em
    meses (a tela oferece mensal, bimestral, trimestral, semestral e anual),
    ativo e visível. "Visível" só é guardado: a página pública de planos é da
    fase 8.
23. **A assinatura é o plano de UM cliente** e COPIA nome, valor e periodicidade
    no dia em que é criada: mudar o plano depois não muda quem já assina. Uma em
    vigor por cliente e plano. Nasce Pendente, sem cobrança.
24. **Cobrar (ou renovar) é um item da comanda.** "Renovar" na tela de
    Assinaturas abre uma comanda do cliente com o item, já no faturamento; a
    comanda também tem "+ Assinatura" quando o cliente tem uma em vigor. O valor
    da assinatura é sugestão: pode ser alterado e levar desconto. Quantidade 1,
    uma cobrança por assinatura em cada comanda, vendedor opcional. Se já existe
    comanda aberta com a cobrança, "Renovar" abre essa.
25. **O período pago nasce quando a comanda é FATURADA.** Em dia (a assinatura
    ainda vale no dia da comanda), emenda no vencimento atual — quem paga
    adiantado não perde dias. Atrasada ou primeira cobrança, começa no dia da
    comanda (Brasília). O vencimento é o mesmo dia do mês, N meses depois (31/jan
    + 1 mês = 28 ou 29/fev), e a assinatura vale até ele, inclusive.
26. **Situação**, sem coluna própria: Pendente (nunca paga), Ativa (o último
    período vence hoje ou depois), Expirada (o último período venceu) e
    Desativada (encerrada à mão — vale mais que as outras).
27. **Reabrir a comanda apaga o período que ela pagou.** Só a última renovação
    reabre: se a assinatura já foi renovada depois em outra comanda, a mensagem
    diz qual reabrir primeiro. Excluir a comanda (aberta) solta a assinatura.
28. **Desativar** não apaga o que foi pago; a assinatura deixa de aceitar
    cobrança, e uma comanda aberta com o item dela não fatura. Pode ser
    reativada. **Excluir** só a que nunca foi cobrada e não está em comanda.
    Plano que já teve assinatura não se apaga: desativa-se.
29. **Assinatura não gera comissão nem mexe no estoque.** O dinheiro entra pelo
    pagamento da comanda, como qualquer item — inclusive fiado: faturou, o
    período conta como pago.
30. **Anda com o módulo `packages`** e as permissões dele (§9.4). Sem o módulo, a
    comanda não aceita item de assinatura novo; a que já tinha ainda fatura.
31. **A renovação é manual.** Não há cobrança automática nem aviso de vencimento
    (dependem de pagamento online, fase 8).

Perguntas para o dono:

- Vender pacote pela comanda (regra 1) serve, ou a recepção precisa da tela
  própria "Novo pacote" da Belasis?
- O pacote vendido precisa ser editável (itens, validade) depois da venda, ou a
  cópia do modelo basta?
- A comissão do pacote deve ser no uso (regra 9, sobre o valor da sessão), na
  venda (para o vendedor), ou nos dois?
- O valor da sessão para a comissão no uso: preço do pacote ÷ sessões, ou o preço
  de tabela do serviço?
- Pacote vencido com saldo: o salão estende a validade, devolve dinheiro, ou só
  perde?
- O pacote deve poder ser usado em outro salão da mesma rede (multiunidade)?
- (5b) O rateio do preço do pacote pelo preço de tabela (regra 15) serve, ou cada
  linha do modelo deve ter o seu valor informado à mão?
- (5b) Usar sessão de pacote vencido deve ser possível com uma permissão (a
  recepção "estende" na hora), ou vencido é vencido?
- (5b) A comissão no uso deve seguir a regra do serviço (regra 18) ou ter um
  percentual próprio para sessões de pacote?
- (5c) O que o assinante leva? Hoje a assinatura só registra a cobrança e a
  situação; serviços inclusos por período ou desconto de assinante não existem.
- (5c) Assinatura cobrada no fiado conta como paga (regra 29), ou só depois de o
  dinheiro entrar?
- (5c) Renovação atrasada começa no dia do pagamento (regra 25), ou cobra desde o
  vencimento anterior?
- (5c) Mudar o valor do plano deve mudar as assinaturas que já existem?
- (5c) Quem vende a assinatura recebe comissão?
- (5c) Assinaturas precisam de permissão própria, separada da de pacotes?
- (5c) O salão quer avisar o cliente pelo WhatsApp quando a assinatura está para
  vencer?

### 9.4 Permissões e módulo

Módulo `packages` em `salons.settings.modules`. Recurso novo:

| Recurso | Ações |
|---|---|
| `packages` | `access` (ver pacotes vendidos e predefinidos), `manage` (criar, alterar e excluir predefinidos) |

Vender é pela comanda, com as permissões de comanda. A Belasis tem Acessar,
Criar, Editar e Excluir em Pacotes; aqui Criar/Editar/Excluir viraram `manage`.

Assinaturas (5c) usam o mesmo módulo e as mesmas chaves: `packages.access` vê
assinaturas e planos; `packages.manage` cria e altera planos e cria, desativa,
reativa e exclui assinaturas. "Renovar" abre comanda, então pede também o módulo
`sales` e `sales.create`.

### 9.5 Telas

- **Pacotes** no menu (módulo ligado + `packages.access`), em
  `/[salonId]/packages`: pacotes vendidos (data, comanda, cliente, pacote,
  disponibilidade por item, validade, vendedor, valor, situação), com os filtros
  Todos, Disponíveis, Vencidos e Utilizados, e os três totais.
- **Pacotes predefinidos** (`/[salonId]/packages/templates`): lista (pacote, o que
  inclui, valor, validade, vendidos), "Novo pacote", editar e excluir.
- **Comanda**: botão "+ Pacote" (com o módulo ligado), quantidade travada em 1; o
  aviso de reabrir diz que os pacotes da comanda deixam de existir.
- **Comanda (5b)**: "+ Do pacote" aparece quando o cliente tem saldo, com cada
  linha ("pacote · serviço (saldo N)"); o item entra com valor e desconto travados,
  "do pacote X" no rótulo, "Pacote" no total e quanto sobra do saldo. O aviso de
  reabrir diz que o usado volta para o saldo.
- **Pacotes (5b)**: a disponibilidade mostra o saldo real e "Usado em #N".
- **Ficha do cliente (5b)**: cartão Pacotes (módulo ligado + `packages.access`):
  pacote, data, comanda, valor, validade, saldo de cada item, comandas em que foi
  usado e a situação.
- **Assinaturas (5c)** (`/[salonId]/packages/subscriptions`): cliente, plano e
  periodicidade, valor, desde, vencimento com a comanda que pagou, situação e a
  cobrança aberta, se houver; filtros Todas, Pendentes, Ativas, Expiradas e
  Desativadas, com os quatro totais; "Nova assinatura" (cliente + plano),
  "Cobrar"/"Renovar", "Desativar"/"Reativar" e excluir a que nunca foi cobrada.
- **Planos de assinatura (5c)** (`/[salonId]/packages/subscription-plans`): plano,
  periodicidade, valor, assinantes e visível; "Novo plano", editar e excluir.
- **Comanda (5c)**: "+ Assinatura" aparece quando o cliente tem assinatura em
  vigor, com o vencimento de cada uma; o item entra com o valor da assinatura,
  sem troca de item e com quantidade travada em 1. O aviso de reabrir diz que a
  renovação é desfeita.

### 9.6 Onde o código mora

| O quê | Onde |
|---|---|
| Migration | `supabase/migrations/051_packages.sql` |
| Tabelas | `packages/db/src/schema.ts` (`packageTemplates`, `packageTemplateItems`, `customerPackages`, `customerPackageItems`, `saleItems.packageTemplateId`) |
| Regra pura | `packages/db/src/domain/packages.ts` (`planPackageTemplate`, `packageTemplateDeleteBlocker`, `packageExpiry`, `planCustomerPackages`, `customerPackageStatus`); o item de pacote em `planSaleItems` (`domain/sales.ts`) |
| I/O | `packages/db/src/services/packages.service.ts`; a comanda chama `recordSalePackages` no faturamento e `revertSalePackages` na reabertura (`sales.service.ts`) |
| Actions | `apps/web/app/actions/packages.ts`; a venda em `apps/web/app/actions/sales.ts` |
| Telas | `apps/web/app/[salonId]/packages/`; o item na comanda em `sales/[saleId]/sale-editor.tsx` |
| Testes | `apps/web/__tests__/lib/services/packages-domain.test.ts`; uso (5b) em `package-usage-domain.test.ts` |
| Uso (5b) | Migration `052_package_usage.sql`; regra `splitPackagePrice`, `planPackageUsage`, `packageUseValue` (`domain/packages.ts`), o item em `planSaleItems`, a base em `planSaleCommissions` (`packageValue`); I/O `loadPackageLines`, `salePackagesInUse`, `listCustomerPackageBalancesService` (`packages.service.ts`), chamados por `sales.service.ts` e `commissions.service.ts`; action `getSalePackageBalances` (`actions/sales.ts`); cartão `components/contacts/customer-packages-card.tsx` |
| Assinaturas (5c) | Migration `053_subscriptions.sql`; tabelas `subscriptionPlans`, `customerSubscriptions`, `customerSubscriptionPeriods` e `saleItems.customerSubscriptionId`; regra em `domain/subscriptions.ts` (`planSubscriptionPlan`, `planCustomerSubscription`, `nextSubscriptionPeriod`, `planSubscriptionPeriods`, `customerSubscriptionStatus`, `subscriptionReopenBlocker`) e o item em `planSaleItems`; I/O em `services/subscriptions.service.ts` — a comanda chama `recordSaleSubscriptions` no faturamento e `saleSubscriptionsRenewedLater` + `revertSaleSubscriptions` na reabertura; actions em `actions/subscriptions.ts` e `getSaleSubscriptionOptions` em `actions/sales.ts`; telas em `app/[salonId]/packages/subscriptions/` e `subscription-plans/`; testes em `subscriptions-domain.test.ts` |

### 9.7 Fatia 5a — estado (17/nov/2026)

- Na branch `claude/fase-5-pacotes` (sai de `claude/fase-4-estoque`),
  **publicada**. Typecheck (db, web e mcp-server), lint dos arquivos alterados e
  testes passando.
- **Migration 051: aplicada em produção em 17/nov/2026** (pelo assistente, com a
  autorização do dono dada na hora), conferida por leitura (as quatro tabelas com
  RLS, `deny_all` e sem acesso para `anon`; os três CHECKs de `sale_items`; as 19
  linhas de `sale_items` intactas) e registrada em `schema_migrations` (nome
  `packages`).
- Cópia de segurança antes da 051: `backups.sale_items_pre_051_20261117` (19
  linhas). **Apagar só com o OK do dono.**
- Em outro ambiente, **aplicar a 051 antes de publicar o código**: ela acrescenta
  a coluna `package_template_id` em `sale_items`, e o INSERT do Drizzle lista
  todas as colunas — sem ela, salvar QUALQUER comanda falharia.
- Módulo `packages` ligado no salão de teste em 17/nov/2026.
- **Testada em uso em 17/nov/2026**, no preview da branch, no salão de teste. A
  captura de tela do navegador falhou nesta sessão; as conferências foram pelo
  texto da página, pelo estado dos campos (lido no navegador) e por leitura do
  banco:
  - Pacotes predefinidos vazio → "Nenhum pacote predefinido". Criado "Teste 3
    Cortes" (3 × Corte de Cabelo Masculino, 1 × Teste Shampoo, R$ 400,00, 30 dias)
    → a lista mostra os itens, "(produto)" no shampoo, R$ 400,00, "30 dias" e 0
    vendidos. "teste 3 cortes" (minúsculas) é recusado: "Já existe um pacote com
    esse nome".
  - Comanda nova: "+ Pacote" lista só o pacote ativo; escolher preenche R$ 400,00;
    a quantidade fica travada em 1; vendedor Marcos; desconto R$ 20,00 → total
    R$ 380,00. Salva como #15, pendente: no banco, item `package` com o modelo,
    quantidade 1, total 380,00 e nenhum pacote do cliente.
  - Faturada em PIX → "Pacotes vendidos": 17/11/2026, Comanda #15, cliente, "3 de 3
    · Corte de Cabelo Masculino" e "1 de 1 · Teste Shampoo", validade 17/12/2026,
    Marcos Affonso, R$ 380,00, Disponível; totais 1/0/0. No banco: um lançamento de
    R$ 380,00 no financeiro, nenhuma comissão e nenhum movimento de estoque.
  - Excluir o modelo vendido → o diálogo já avisa que não pode; confirmar mostra
    "Este pacote já foi usado em comanda. Desative-o em vez de excluir". Desativado
    → a lista mostra "inativo" e 1 vendido; o "+ Pacote" de uma comanda nova fica
    sem opção.
  - Reabrir a #15 → o aviso inclui "Os pacotes vendidos nesta comanda deixam de
    existir e são criados de novo quando ela for faturada"; a lista fica "Nenhum
    pacote vendido". Faturada de novo (com o modelo já inativo) → o pacote volta,
    igual.
- **Não testado em uso:** editar um modelo (trocar itens, valor, validade) e
  excluir um que nunca foi vendido; modelo sem validade ("Não vence"); vender dois
  pacotes na mesma comanda; pacote junto com serviço e produto na mesma comanda;
  fiado com pacote; os filtros Vencidos e Utilizados (só existem com o tempo ou com
  a 5b); perfil só com `packages.access`; o módulo desligado com comanda aberta
  que já tinha pacote.
- Dados de teste limpos: a comanda #15 reaberta e excluída pela tela (fica como
  excluída, como as anteriores); o item de pacote dela e o modelo apagados por SQL,
  pelo ID — o modelo não sai pela tela porque a comanda excluída ainda apontava para
  ele. Sem modelos, pacotes, pagamentos, lançamentos, comissões nem movimentos.
  **Ficou:** o módulo `packages` ligado no salão de teste.

### 9.8 Fatia 5b — estado (17/nov/2026)

- Na branch `claude/fase-5-pacotes`, publicada. Typecheck (db, web e mcp-server),
  lint dos arquivos alterados e testes passando (web 1044, db 296).
- **Migration 052 aplicada em produção em 17/nov/2026** (registrada como
  `package_usage`), antes de o código ser publicado. Conferido por leitura: as
  duas colunas, os dois CHECKs, a FK e o índice parcial existem; `sale_items`
  seguiu com as 19 linhas. O advisor de segurança só mostra os avisos de sempre
  (cópias em `backups` com RLS e sem policy, `vector` em `public`, senha vazada).
- Cópias de segurança antes da 052: `backups.sale_items_pre_052_20261117` (19
  linhas) e `backups.customer_package_items_pre_052_20261117` (vazia), com RLS
  ligado e sem acesso para `anon`/`authenticated`.
- **Testada em uso** no preview da branch (que usa o banco de produção), no salão
  de teste, pela tela, com conferência no banco:
  - Modelo "TESTE 5b pacote" (3 × Corte de Cabelo Masculino, 1 × Teste Shampoo,
    R$ 432,00, 30 dias). Vendido na comanda #16 e faturado em PIX → no banco, a
    linha do corte vale R$ 408,00 e a do shampoo R$ 24,00 (rateio pelo preço de
    tabela, 510 e 30; a soma é o preço).
  - Comanda nova da mesma cliente: aparece "+ Do pacote" com "TESTE 5b pacote ·
    Corte de Cabelo Masculino (saldo 3)" e "· Teste Shampoo (saldo 1)". Cada item
    entra com "do pacote TESTE 5b pacote", item, valor e desconto travados,
    "Pacote" no total e "sobram 2" / "sobram 0"; a linha que zerou sai da lista e a
    do corte passa a "(saldo 2)". Total da comanda R$ 0,00.
  - Quantidade 5 no corte → "passa do saldo" na tela; salvar é recusado: 'Pacote
    "TESTE 5b pacote": Corte de Cabelo Masculino tem saldo de 3, e a comanda usa 5'.
  - Quantidade 1, profissional Marcos → faturar mostra "Esta comanda não tem valor
    a receber. Ela será finalizada sem pagamento"; faturada como #17. No banco: os
    dois itens com total 0 e a linha do pacote; **comissão com base R$ 136,00**
    (408 ÷ 3) para quem executou; **saída de 1 Teste Shampoo no estoque**; nenhuma
    comissão na #16.
  - "Pacotes vendidos": "2 de 3 · Corte de Cabelo Masculino", "0 de 1 · Teste
    Shampoo", "Usado em #17", Disponível. Ficha da cliente: cartão Pacotes com
    "17/11/2026 · Comanda #16 · R$ 432,00 · vale até 17/12/2026", "saldo 2 de 3",
    "saldo 0 de 1", "Usado em #17" e Disponível.
  - Reabrir a #16 (a da venda) → barrado: "Um pacote vendido nesta comanda já está
    em uso (comanda #17). Tire o item do pacote de lá antes de reabrir esta". Também
    barrado com a #17 só aberta.
  - Reabrir a #17 → o aviso inclui "O que esta comanda usou dos pacotes do cliente
    volta para o saldo"; a lista volta a "3 de 3" e "1 de 1", sem "Usado em"; no
    banco, a comissão e a saída de estoque somem.
  - Excluir a #17 (aberta) solta a ligação: a #16 reabre ("Comanda reaberta") e o
    pacote deixa de existir.
- **Limite do teste:** o salão de teste não tem regra de comissão, então o
  percentual saiu 0% e o valor da comissão R$ 0,00 — o que se viu foi a BASE
  (R$ 136,00). O percentual sobre a base é o cálculo da fase 3, coberto pelos
  testes automáticos.
- **Não testado em uso:** item do pacote vindo de agendamento; pacote vencido e
  comanda com data anterior à compra; pacote de outro cliente (trocar o cliente da
  comanda com item do pacote); duas comandas disputando a última sessão; auxiliar
  no serviço do pacote; item do pacote junto com itens cobrados na mesma comanda;
  consumo de produto pelo serviço do pacote; o filtro Utilizados; perfil sem
  `packages.access` (o cartão da ficha some); o módulo desligado com comanda que
  já tinha item do pacote.
- Dados de teste limpos: a #17 excluída pela tela; a #16 reaberta e excluída pela
  tela (as duas ficam como excluídas, como as anteriores); o item de pacote da #16
  e o modelo apagados por SQL, pelo ID. Sem modelos, pacotes, pagamentos,
  comissões nem movimentos de estoque.

### 9.9 Fatia 5c — estado (17/nov/2026)

- Na branch `claude/fase-5-pacotes`, publicada. Typecheck (db, web e mcp-server),
  lint dos arquivos alterados e testes passando (web 1086, db 296).
- **Migration 053 aplicada em produção em 17/nov/2026** (registrada como
  `subscriptions`), antes de o código ser publicado. Conferido por leitura: as
  três tabelas com RLS, a coluna `sale_items.customer_subscription_id`, os CHECKs
  de tipo, referência, assinatura e quantidade; `sale_items` seguiu com as 21
  linhas. O advisor de segurança só mostra os avisos de sempre.
- Cópia de segurança antes da 053: `backups.sale_items_pre_053_20261117` (21
  linhas), com RLS ligado e sem acesso para `anon`/`authenticated`.
- **Testada em uso** no preview da branch (que usa o banco de produção), no salão
  de teste, pela tela, com conferência no banco:
  - Planos de assinatura vazio → "Nenhum plano de assinatura". Criado "TESTE 5c
    clube" (R$ 120,00, mensal) → a lista mostra Mensal, R$ 120,00, 0 assinantes,
    visível Não.
  - "Nova assinatura" (busca da cliente + plano) → "Assinatura criada. Use
    “Cobrar” para abrir a comanda"; na lista: Pendente, sem vencimento, com
    "Cobrar" e "Desativar".
  - "Cobrar" → abre a comanda #18 da cliente com o item "Assinatura: TESTE 5c
    clube" a R$ 120,00, já no faturamento. Faturada em PIX → Ativa, vencimento
    17/12/2026, "Comanda #18"; o botão vira "Renovar".
  - "Renovar" → comanda #19; de volta à lista, "Cobrança aberta na comanda #19".
    "Renovar" de novo → abre a MESMA #19 (não cria outra). Faturada → vencimento
    17/01/2027, "Comanda #19 · 2 cobranças". No banco: períodos 17/11→17/12 (#18)
    e 17/12→17/01 (#19), R$ 120,00 cada; nenhuma comissão e nenhum movimento de
    estoque.
  - Reabrir a #18 → o aviso inclui "A renovação de assinatura paga por esta
    comanda é desfeita e volta quando ela for faturada"; confirmar é barrado: 'A
    assinatura "TESTE 5c clube" já foi renovada depois, na comanda #19. Reabra
    aquela antes desta'.
  - Reabrir a #19 → o vencimento volta a 17/12/2026 e a lista mostra "Cobrança
    aberta na comanda #19".
  - Desativar com a cobrança aberta → Desativada, só "Reativar". Faturar a #19 é
    barrado: 'A assinatura "TESTE 5c clube" foi desativada. Tire o item da comanda
    para faturar'; no banco, a #19 segue aberta e sem pagamento. Reativar → Ativa.
  - Comanda nova da cliente: "+ Assinatura" lista "TESTE 5c clube (vence em
    17/12/2026)"; o item entra a R$ 120,00, a quantidade traz a dica "Uma cobrança
    por comanda" e a opção some da lista. (Não foi salva; que o item e a
    quantidade ficam travados não foi conferido na tela.)
  - Excluir o plano com assinatura → "Este plano já tem assinatura. Desative-o em
    vez de excluir".
  - Com a #18 reaberta (assinatura de novo Pendente, mas numa comanda aberta),
    excluir a assinatura → "Esta assinatura está em uma comanda. Tire o item de lá
    ou desative a assinatura". Excluída a comanda, a assinatura sai ("Assinatura
    excluída") e depois o plano ("Plano excluído").
- **Não testado em uso:** renovação atrasada (assinatura expirada — só existe com
  o tempo) e a situação Expirada; periodicidade diferente de mensal; editar um
  plano e desativá-lo; segunda assinatura do mesmo plano para a mesma cliente;
  valor alterado e desconto no item; assinatura junto com outros itens na comanda;
  fiado; trocar o cliente de uma comanda com item de assinatura; os filtros da
  lista; perfil sem `packages.manage` ou sem `sales.create`; o módulo desligado.
- **Fora desta fatia:** as assinaturas na ficha do cliente; cobrança automática,
  aviso de vencimento e página pública de planos (fase 8); o relatório de vendas
  por assinatura (5d).
- Dados de teste limpos, tudo pela tela: a #19 excluída; a #18 reaberta e
  excluída (as duas ficam como excluídas, como as anteriores); a assinatura e o
  plano excluídos. Sem planos, assinaturas, períodos, pagamentos, lançamentos,
  comissões nem movimentos.

## 10. Pendências do dono

| Pendência | Trava |
|---|---|
| Respostas às perguntas da §5.3 | Fase 1c |
| Qual plano inclui cada módulo | Liberação comercial (não trava o piloto) |
| Em qual salão sem Belasis pilotar | Fase 1 em produção |
| Conta Belasis de teste para executar fluxos | Fidelidade das regras nas fases 2 a 5 |
| Provedor de pagamento e provedor fiscal | Fases 8 e 10 |
| Respostas às perguntas da §6.3 (baixa de cartão, retroativo, quem vê) | Fatias 2d em diante |
| Respostas às perguntas da §7.3 (item × percentual geral, liberação parcial, comissão paga, auxiliar, data de corte, conta obrigatória, recibo, padrão de quem arca com o custo, onde editar o custo adicional) | Ajustes na fase 3 antes do piloto |
| Revisar e mergear o PR #17 (fases 3 e 4, `claude/fase-4-estoque`) | Publicação das fases 3 e 4 |
| Respostas às perguntas da §8.3 (venda sem saldo, custo médio, campos no cadastro, estoque ideal, edição de compra, rateio de frete, permissão de fornecedores, lote calculado ou escolhido, prazo do aviso de validade, consumo do cadastro ou informado na comanda, o que abate a comissão na 3e) | Ajustes na fase 4 antes do piloto; fatia 3e |
| Dizer quando as cópias `backups.products_pre_045_20261116`, `backups.products_pre_046_20261116`, `backups.products_pre_048_20261117`, `backups.services_pre_049_20261117`, `backups.commission_settings_pre_049_20261117`, `backups.products_pre_050_20261117`, `backups.sale_items_pre_051_20261117`, `backups.sale_items_pre_052_20261117`, `backups.customer_package_items_pre_052_20261117` e `backups.sale_items_pre_053_20261117` podem ser apagadas | Limpeza do schema `backups` |
| Respostas às perguntas da §9.3 (tela própria de venda de pacote, edição do pacote vendido, comissão na venda ou no uso, valor da sessão e rateio, pacote vencido, multiunidade, percentual de comissão da sessão; na 5c: o que o assinante leva, fiado, renovação atrasada, mudança de valor do plano, comissão, permissão própria, aviso de vencimento) | Ajustes na fase 5 antes do piloto |
| Corrigir os dois problemas do plano SOLO (§6.8) | Salões SOLO com mais de um profissional |
