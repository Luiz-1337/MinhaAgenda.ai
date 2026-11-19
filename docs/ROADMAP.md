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
aplicada em 17/nov/2026, publicada e testada em uso — ver §9.9. Fatia 5d
(relatórios e saldo de pacote para o agente do WhatsApp) na mesma branch,
publicada, sem migration: os relatórios foram testados em uso; **o saldo de
pacote na conversa do agente NÃO foi testado em uso** — ver §9.10.
Fase 6 (fidelização): detalhada em §10. Fatia 6a (cashback) feita na branch
`claude/fase-6-fidelizacao` (sai de `claude/fase-5-pacotes`) e publicada, com a
migration 054 aplicada em 17/nov/2026, o módulo `cashback` ligado só no salão de
teste, e testada em uso — ver §10.7. Fatia 6b (promoções e cupons) na mesma
branch: migration 055 aplicada em 17/nov/2026, módulo `promotions` ligado só no
salão de teste, publicada e testada em uso — ver §10.8. Fatia 6c (avaliações
pós-atendimento) na mesma branch: migration 056 aplicada em 17/nov/2026, módulo
`reviews` ligado só no salão de teste, publicada e testada em uso — ver §10.9.
Fatia 6d (mensagens de cuidados e de retorno, e pedido de avaliação pelo WhatsApp)
na mesma branch: migration 057 aplicada em 17/nov/2026, módulo `care_messages`
ligado só no salão de teste, publicada, e o cadastro e a fila testados em uso —
**o envio de verdade pelo WhatsApp NÃO foi testado** — ver §10.10.
Fatia 6e (metas por mês) na mesma branch: migration 058 aplicada em 18/nov/2026,
módulo `goals` ligado só no salão de teste, publicada e testada em uso — ver
§10.11.
Fatia 6f (saldo de cashback para o agente do WhatsApp e relatório "Histórico de
cashback") na mesma branch, publicada, sem migration: o relatório foi testado em
uso — **a tool do agente NÃO foi testada em uso** (só roda no worker) — ver
§10.12. Com ela, todas as fatias da fase 6 estão escritas.
**As fases 3 a 6 estão na `main`**: fases 3 e 4 pelo PR #17, fase 5 pelo PR #18 e
fase 6 pelo PR #19, mesclado em 18/nov/2026 (commit `a3d74f4`) — ver §10.13. Os
módulos continuam ligados só no salão de teste.
Fase 7 (cliente e agenda): detalhada em §11. Fatia 7a (ficha do cliente completa)
feita na branch `claude/fase-7-cliente-agenda` (sai da `main` com a fase 6):
migration 059 aplicada em 18/nov/2026, publicada e testada em uso — ver §11.7.
Fatia 7b (etiquetas na agenda e remarcar pela tela) na mesma branch: migration
060 aplicada em 18/nov/2026, publicada e testada em uso — ver §11.8.
Fatia 7c (recorrência de agendamento) na mesma branch: migration 061 aplicada em
18/nov/2026, publicada e testada em uso — ver §11.9.
Fatia 7d (anamneses) feita na mesma branch — migration 062 aplicada em
18/nov/2026, publicada e testada em uso — ver §11.10.
Fatia 7e (documentos com assinatura) feita na mesma branch — migration 063
aplicada em 18/nov/2026, publicada e testada em uso — ver §11.11.
Fatia 7f (agendamento online público) feita na mesma branch, sem migration,
publicada e testada em uso em 18/nov/2026 — ver §11.12. O cálculo de horários
da IA não foi trocado. **A fase 7 NÃO está na `main`**: não há PR aberto.
Fase 9 (relatórios e multiunidade): detalhada em §13. Fatia 9a (central de
relatórios com favoritos) feita na branch `claude/fase-9-relatorios` (sai de
`claude/fase-7-cliente-agenda`): migration 064 aplicada em 18/nov/2026,
publicada e testada em uso em 19/nov/2026 — ver §13.6.
Fatia 9b (relatórios financeiros) feita na mesma branch, sem migration,
publicada e testada em uso em 19/nov/2026 — ver §13.7.
Fatia 9c (relatórios de agendamentos e de clientes) feita na mesma branch, sem
migration, publicada e testada em uso em 19/nov/2026 — ver §13.8.
Fatia 9d (relatórios de vendas e rankings) feita na mesma branch, sem migration,
publicada e testada em uso em 19/nov/2026 — ver §13.9.
Fatia 9e (painel de profissionais) feita na mesma branch, sem migration,
publicada e testada em uso em 19/nov/2026 (a ocupação; o valor realizado não
foi visto com comanda) — ver §13.10.
Fatia 9f (exportação em planilha) feita na mesma branch, sem migration,
publicada e testada em uso em 19/nov/2026 — **o arquivo não foi aberto em Excel
nem em Sheets** — ver §13.11.
Fatia 9g (organização multiunidade): levantamento em §13.12; o dono escolheu o
caminho A ("a organização é o dono") em 19/nov/2026. Feita na mesma branch, sem
migration — **em commit local, sem publicar e sem teste em uso** — ver §13.13.
Fases 8 e 10: planejamento.

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
| 5d | Relatórios (extrato de pacotes, vendas por assinatura); saldo de pacote para o agente do WhatsApp | Feita e publicada, sem migration. Relatórios testados em uso; **a tool do agente não foi testada em uso** (§9.10) |

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

Fatia 5d — relatórios e o agente do WhatsApp:

32. **Extrato de pacotes**, por período: as VENDAS (no dia da comanda, pelo que o
    cliente pagou) e os USOS (itens "do pacote" de comandas FATURADAS, no dia da
    comanda, pelo valor da sessão — regra 15) numa lista só, do mais recente para
    o mais antigo. Totais: pacotes vendidos e valor, sessões e unidades usadas e
    valor. Comanda reaberta sai do extrato.
33. **Vendas por assinatura**, por período: as cobranças faturadas (os períodos
    pagos), no dia da comanda — o total por plano (cobranças, assinantes
    distintos e valor, o que mais rendeu primeiro) e a lista. Agrupa pelo plano,
    mesmo que a assinatura guarde o nome antigo dele.
34. **O período** é o dos relatórios de estoque: sem datas, o mês corrente até
    hoje (Brasília); no máximo um ano. Cada lista mostra até 1.000 linhas; acima
    disso a tela avisa que os totais são parciais.
35. **O agente do WhatsApp consulta o saldo de pacote** (tool
    `getMyPackageBalance`): os pacotes com saldo e na validade do cliente DA
    CONVERSA, com o que resta de cada item e até quando vale. Só leitura: não
    vende pacote, não informa preço e não baixa saldo — o uso é da recepção, na
    comanda. Salão e cliente vêm do contexto do WhatsApp, nunca do modelo, e a
    resposta não leva ids internos. Cliente sem cadastro recebe "não tem pacote",
    não um erro.
36. **A tool só existe para a IA no salão com o módulo `packages` ligado.** Nos
    outros ela é removida antes de a conversa começar, como a do Kanban. O prompt
    do agente não mudou: a descrição da tool diz quando usar.

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
- (5d) O agente do WhatsApp deve também dizer a situação e o vencimento da
  assinatura do cliente? Hoje só informa pacote.
- (5d) Ao agendar um serviço que o cliente tem no pacote, o agente deve avisar
  que a sessão sai do pacote? Hoje ele só responde quando perguntam.
- (5d) O extrato de pacotes precisa mostrar o que falta entregar (o valor das
  sessões ainda não usadas)? E os relatórios precisam de exportação?

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
- **Relatórios (5d)** (`/[salonId]/packages/reports`, `packages.access`): o
  período na URL, quatro totais (pacotes vendidos, pacotes usados, assinaturas e
  assinantes que pagaram), o extrato de pacotes (data e comanda, Venda ou Uso,
  cliente, pacote, item e profissional, quantidade, valor) e as vendas por
  assinatura (por plano, e a lista de cobranças com o período pago).

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
| Relatórios (5d) | Regra em `domain/package-reports.ts` (`buildPackageStatement`, `buildSubscriptionSalesReport`); I/O em `services/package-reports.service.ts`; action `getPackageReports` (`actions/packages.ts`); tela em `app/[salonId]/packages/reports/`; testes em `package-reports-domain.test.ts` |
| Agente do WhatsApp (5d) | Tool `getMyPackageBalance` em `packages/mcp-server/src/presentation/tools/package.tools.ts` (lê `listCustomerPackageBalancesService`); o gate do módulo e o resumo da tool em `apps/web/lib/services/ai/generate-response.service.ts` (`isPackagesModuleEnabled`, `summarizeToolResult`); testes em `packages/mcp-server/__tests__/presentation/tools/package.tools.test.ts` e `apps/web/__tests__/ai/tool-summary.test.ts` |

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

### 9.10 Fatia 5d — estado (17/nov/2026)

- Na branch `claude/fase-5-pacotes`, publicada. Typecheck (db, web e mcp-server),
  lint dos arquivos alterados e testes passando (web 1098, db 296, mcp-server
  400).
- **Não tem migration**: só leitura do que as fatias 5a a 5c gravam.
- **Relatórios testados em uso** no preview da branch (que usa o banco de
  produção), no salão de teste, pela tela:
  - Sem dados → os quatro totais zerados, "Nenhum pacote vendido ou usado no
    período" e "Nenhuma cobrança de assinatura no período"; período padrão
    01/11/2026 a 17/11/2026.
  - Com um pacote de R$ 432,00 vendido (#20), uma sessão usada (#21) e uma
    assinatura de R$ 120,00 cobrada (#22): Pacotes vendidos R$ 432,00 ("1
    pacote"); Pacotes usados R$ 136,00 ("1 sessão ou unidade"); Assinaturas
    R$ 120,00 ("1 cobrança"); Assinantes que pagaram 1. O extrato traz o Uso da
    #21 (Corte de Cabelo Masculino, o profissional, 1, R$ 136,00) antes da Venda
    da #20 (R$ 432,00). Vendas por assinatura: o plano com 1 cobrança, 1
    assinante e R$ 120,00, e a cobrança da #22 com o período 17/11/2026 a
    17/12/2026.
  - Período de outubro → tudo zerado. Datas invertidas na URL → trocadas
    (17/11/2026 a 30/11/2026), com os dados. Mais de um ano → "O período do
    relatório é de no máximo um ano".
  - Reaberta a #21 → o Uso sai do extrato e Pacotes usados volta a R$ 0,00; a
    Venda e a assinatura continuam.
- **A tool do agente NÃO foi testada em uso.** O agente só roda no worker da fila
  (`workers/message-processor.ts`), a partir de uma mensagem real de WhatsApp —
  nenhuma tela do painel o aciona —, e este checkout não tem `.env` para rodar o
  eval ou o replay. Em qual ambiente o worker é publicado não foi verificado. O que existe é o teste
  automático da tool (cliente da conversa, sem ids, sem cadastro, falha do banco)
  e do resumo. Conferido no banco: só o salão de teste tem o módulo `packages`,
  então a tool não chega a nenhum outro agente. **Para testar:** com este código no
  ambiente em que o worker roda, mandar por um WhatsApp de teste do salão de
  teste "quantas sessões eu ainda tenho no pacote?", com e sem pacote com saldo.
- **Não testado em uso nos relatórios:** mais de um plano e mais de um assinante
  (a ordem por valor e a contagem de assinantes distintos); uso de produto;
  várias comandas no mesmo dia; os campos de data da tela (o período foi trocado
  pela URL); o aviso de teto de 1.000 linhas; perfil sem `packages.access`.
- **Limite conhecido:** se a consulta ao banco falhar, a tool devolve erro e o
  cliente recebe a mensagem genérica de dificuldade técnica (a mesma das outras
  tools de leitura), não um saldo inventado.
- Dados de teste limpos: as comandas #20, #21 e #22 reabertas (as faturadas) e
  excluídas pela tela — ficam como excluídas, como as anteriores; a assinatura e
  o plano excluídos pela tela; o item de pacote da #20 e o modelo apagados por
  SQL, pelo ID. Sem modelos, pacotes, planos, assinaturas, períodos, pagamentos,
  lançamentos, comissões nem movimentos.

## 10. Fase 6 — Fidelização (detalhe)

Responde: o que faz o cliente voltar. Parte da comanda (fase 1). Itens da
auditoria: M-05 (Promoções), M-06 (Avaliações), M-07 (Cashback), T-08 (Metas), as
abas Cashback, Cuidados e Retorno do serviço e do produto, a aba Cashback da ficha
do cliente e o relatório "Histórico de cashback". A auditoria leu as telas sem
executar nada; quase toda a regra foi decidida aqui.

### 10.1 Fatias

| Fatia | Entrega | Estado |
|---|---|---|
| 6a | Cashback: configuração do salão (ativo, valor padrão, mínimo para resgate), valor por serviço e produto, ganho no faturamento, uso no faturamento, extrato e ajuste na ficha do cliente, lista de clientes com saldo | Feita, migration 054 aplicada, publicada e testada em uso (§10.7) |
| 6b | Promoções e cupons: nome, cupom, vigência, dias da semana e situação; aplicar o cupom na comanda | Feita, migration 055 aplicada, publicada e testada em uso (§10.8) |
| 6c | Avaliações pós-atendimento: pedido de avaliação por comanda faturada, formulário público por link (personalizável), painel (média, total, taxa e tempo de resposta, distribuição por nota, por profissional) e lista filtrável | Feita, publicada e testada em uso (§10.9) |
| 6d | Mensagens de cuidados (pré e pós-atendimento) e de retorno por serviço e por produto; envio automático do pedido de avaliação pelo WhatsApp; fila e histórico de envios | Feita, migration 057 aplicada e publicada; cadastro e fila testados em uso — **o envio pelo WhatsApp não foi testado** (§10.10) |
| 6e | Metas por mês, do salão e por profissional (faturamento, serviços, produtos e comandas), com o realizado, o ritmo e "Copiar metas" | Feita, migration 058 aplicada, publicada e testada em uso (§10.11) |
| 6f | Saldo de cashback para o agente do WhatsApp; relatório "Histórico de cashback" | Feita e publicada; relatório testado em uso — **a tool do agente não foi testada em uso** (§10.12) |

O "Permitir resgate pelo agendamento online" do cashback depende do agendamento
online público (fase 7).

### 10.2 Modelo de dados (migration 054)

- **`cashback_settings`** — uma linha por salão: `is_enabled`, `default_kind`
  (`percent` ou `fixed`), `default_value`, `min_redeem`.
- **`cashback_rules`** — o cashback de um serviço ou de um produto (exatamente
  um): `kind`, `value` (0 = usa o padrão), `is_active`. Um por item.
- **`cashback_entries`** — o extrato do cliente: `kind` (`earn`, `redeem`,
  `adjustment`), `amount` com sinal (ganho > 0, resgate < 0, ajuste ≠ 0),
  `sale_id` e `sale_item_id` (CASCADE), `reason`, `created_by`. Um resgate por
  comanda (índice único parcial).
- **`sales.cashback_redeemed`** — quanto da comanda foi pago com cashback. CHECK:
  de 0 ao total, e só em comanda faturada.
- **Não há coluna de saldo.** O saldo do cliente é a soma do extrato.

**Migration 055 (fatia 6b):**

- **`promotions`** — `name`, `code` (o cupom, único no salão sem diferença de
  maiúscula), `discount_kind` (`percent` ou `fixed`), `discount_value`,
  `applies_to` (`all`, `services`, `products`), `starts_on`, `ends_on`,
  `weekdays` (0 = domingo … 6 = sábado; vazio = todos), `is_active`.
- **`sales.promotion_id`** (sem ON DELETE) e **`sales.coupon_code`** (cópia do
  código) — andam juntos (CHECK).
- **`sale_items.coupon_discount`** — a parte de `discount_amount` que veio do
  cupom. CHECK: de 0 ao desconto do item.

**Migration 056 (fatia 6c)** — não mexe em tabela existente:

- **`review_settings`** — uma linha por salão: `is_enabled`, `title`,
  `welcome_text`, `thanks_text` (NULL = texto padrão do sistema).
- **`reviews`** — o pedido de avaliação e a resposta: `sale_id` (único, CASCADE),
  `customer_id`, `token` (único; a credencial do formulário público),
  `service_date`, `rating` (1 a 5; NULL = pendente), `comment`, `requested_at`,
  `responded_at`. CHECK: nota e data de resposta andam juntas.

**Migration 057 (fatia 6d)** — MEXE em `review_settings` (três colunas com
DEFAULT); tem que ser aplicada antes de publicar o código:

- **`care_message_rules`** — a mensagem de um serviço ou produto: `kind`
  (`pre_care`, `post_care`, `return`), `service_id` ou `product_id` (exatamente
  um; `pre_care` só serviço), `offset_days`, `message`, `is_active`. Uma por
  tipo e por item (índices únicos).
- **`care_message_dispatches`** — a fila e o histórico: `customer_id`, `kind` (os
  três, mais `review`), `rule_id` (SET NULL), a origem (`sale_id` ou
  `appointment_id`), `review_id`, `item_name`, `scheduled_for`, `status`
  (`pending`, `sending`, `sent`, `failed`, `skipped`), `body` (o texto que
  saiu), `detail` (o motivo), `sent_at`. Índices únicos: um envio por comanda e
  mensagem, um por agendamento e mensagem, um por pedido de avaliação.
- **`review_settings`** ganha `send_whatsapp`, `whatsapp_delay_hours` (0 a 72,
  padrão 2) e `whatsapp_text` (NULL = texto padrão).

**Migration 058 (fatia 6e)** — não mexe em tabela existente:

- **`goals`** — a meta de um mês: `month` (sempre o dia 1), `professional_id`
  (NULL = meta do salão), `metric` (`revenue`, `services`, `products`,
  `sales_count`) e `target` (> 0). Uma por mês, indicador e dono. **O realizado
  não é gravado**: é somado das comandas faturadas do mês.

Todas com `salon_id`, RLS ligado, `deny_all` e sem acesso para
`anon`/`authenticated`.

### 10.3 Regras de negócio

1. **Duas chaves**: o módulo `cashback` do salão (piloto) e, dentro dele, o
   "Cashback ativo" das configurações. Sem as duas, a comanda não gera nem aceita
   cashback.
2. **Valor padrão do salão e valor por item.** O padrão é um percentual do item ou
   um valor fixo por unidade. Cada serviço e produto pode ter o seu (0 = usa o
   padrão) ou ficar inativo (não dá cashback, nem pelo padrão).
3. **O ganho nasce quando a comanda é FATURADA**, um lançamento por item de
   serviço ou produto: percentual sobre o total do item (já com o desconto), ou o
   valor fixo × quantidade — nunca mais do que foi cobrado pelo item. Venda de
   pacote, cobrança de assinatura e item "do pacote" (que vale zero) não rendem.
4. **A parte da comanda paga com cashback não rende cashback**: a base de cada
   item cai na mesma proporção (R$ 100 com R$ 20 de cashback rende sobre R$ 80).
5. **Usar é no faturamento**, no campo "Usar cashback do cliente". Não é
   pagamento: não tem forma, taxa nem prazo, e não entra no financeiro nem no
   caixa — o salão recebe menos. Os pagamentos mais o cashback têm de fechar o
   total. A comissão dos itens não muda.
6. **Situação do saldo**: Disponível para resgate (alcança o mínimo), Abaixo do
   mínimo, ou Sem saldo. Só usa quem está em "Disponível"; usa até o saldo e até
   o total da comanda.
7. **O saldo é a soma do extrato.** Quem gasta ou tira saldo (resgate, ajuste,
   reabertura) trava antes o cliente — dois faturamentos ao mesmo tempo não
   gastam o mesmo crédito.
8. **Reabrir a comanda** apaga os ganhos dela e devolve o que ela usou. É barrado
   quando o saldo do cliente ficaria negativo: o ganho já foi gasto em outra
   comanda.
9. **Ajuste manual** (crédito ou débito) na ficha do cliente, com motivo
   obrigatório; não deixa o saldo negativo.
10. **Desativar o cashback não apaga saldo**: para de gerar e de aceitar, e o
    saldo fica guardado.
11. **Fiado**: o ganho nasce no faturamento, mesmo com valor em aberto.
12. **O cashback não vence.**

Fatia 6b — promoções e cupons:

13. **A promoção** tem nome, cupom (3 a 30 caracteres: letras sem acento, números,
    hífen ou sublinhado; guardado em maiúsculas; único no salão), desconto
    (percentual, ou valor fixo abatido da comanda), em quais itens vale (serviços
    e produtos, só serviços ou só produtos), vigência opcional, dias da semana
    (nenhum marcado = todos) e ativa.
14. **Aplicar é na comanda**: o campo Cupom confere o código e mostra o desconto;
    ao salvar, o servidor confere de novo e grava. Um cupom por comanda.
15. **O cupom vale pelo DIA DA COMANDA** (em Brasília), não pelo dia em que foi
    digitado: vigência com as pontas incluídas e dia da semana. É conferido a
    cada gravação da comanda aberta; faturar não confere de novo (fatura-se o
    gravado).
16. **O desconto do cupom soma ao desconto dado à mão** em cada item. Percentual:
    sobre o que o item custa depois do desconto à mão. Fixo: repartido entre os
    itens que valem, na proporção de cada um, com a soma exata. Nunca mais do que
    o item custa. Pacote, assinatura e item "do pacote" não recebem. Total,
    comissão e cashback continuam lendo um desconto só — na comissão, vale a
    configuração "quem arca com o desconto" do salão (fase 3), como para qualquer
    desconto.
17. **Situação**: Ativa, Agendada (ainda não começou), Encerrada (a vigência
    acabou) ou Desativada.
18. **Promoção que está em comanda (aberta ou faturada) não se apaga**:
    desativa-se. Desativar não tira o desconto das comandas já gravadas, mas
    regravar uma comanda aberta com o cupom desativado é recusado. A comanda
    EXCLUÍDA solta a promoção (como solta pacote e assinatura); o desconto que os
    itens receberam continua gravado neles.
19. **Não há limite de usos**, nem por cliente.
20. **Sem o módulo `promotions`, a comanda não aceita cupom.**

Fatia 6c — avaliações pós-atendimento:

21. **Duas chaves**: o módulo `reviews` do salão (piloto) e, dentro dele, o "Pedir
    avaliação" das configurações.
22. **O pedido nasce quando a comanda é FATURADA e tem pelo menos um serviço.**
    Venda só de produto, de pacote ou cobrança de assinatura não é atendimento.
    Um pedido por comanda: reabrir e faturar de novo mantém o mesmo link. Excluir
    a comanda apaga o pedido que ninguém respondeu; a avaliação respondida fica.
23. **O cliente responde num formulário público**, pelo link — sem login. A única
    credencial é o token do link (aleatório, 192 bits). A página mostra só o nome
    do salão e o dia do atendimento: nem nome do cliente, nem comanda, nem valor.
24. **A resposta** é uma nota inteira de 1 a 5 e um comentário opcional (até
    1.000 caracteres). Responde-se uma vez só; depois o link mostra o
    agradecimento.
25. **Personalização**: título, boas-vindas e agradecimento. Em branco, vale o
    texto padrão. A nota, o comentário e o rodapé com a data do atendimento são
    fixos.
26. **O envio do link é manual**: copia-se na comanda faturada ou na lista de
    Avaliações e manda-se ao cliente. O envio automático pelo WhatsApp fica para
    a fatia 6d.
27. **O painel é por dia do atendimento**: média, respondidas e pedidas, taxa de
    resposta, tempo médio entre o pedido e a resposta, distribuição por nota e por
    profissional. A nota de uma comanda conta para CADA profissional que executou
    serviço nela.
28. **Excluir** uma avaliação (ou um pedido pendente) é de quem tem
    `reviews.manage`; o link do pedido excluído deixa de funcionar.

Fatia 6d — mensagens de cuidados e de retorno:

29. **Três tipos de mensagem, por serviço ou por produto**: cuidados ANTES do
    atendimento (só serviço), cuidados DEPOIS e RETORNO. Uma mensagem por tipo e
    por item. Texto livre de até 1.000 caracteres, com `{cliente}` (primeiro
    nome), `{item}` e `{salao}`.
30. **Quando sai**: cuidados de antes, de 1 a 30 dias antes do AGENDAMENTO
    (pendente ou confirmado); cuidados de depois, de 0 a 30 dias depois da COMANDA
    faturada (0 = no mesmo dia); retorno, de 1 a 365 dias depois da comanda.
    Agendamento marcado já dentro da janela recebe os cuidados na próxima rodada.
31. **Um envio por origem e por mensagem.** Reabrir e faturar de novo não manda
    outra vez. Excluir a comanda cancela o que ainda não saiu. Comanda lançada
    com data antiga não dispara mensagem vencida há mais de um dia.
32. **O retorno mais novo substitui o antigo** que ainda estava na fila para o
    mesmo cliente e a mesma mensagem, e **não sai para quem já tem horário
    marcado** na hora do envio.
33. **Confere de novo na hora de enviar**: módulo ligado, mensagem ativa, cliente
    com telefone, comanda faturada (reaberta, espera até 3 dias e desiste),
    agendamento de pé. **Nada sai para quem pediu para não receber mensagens**
    (`customers.opted_out_at`) — nem cuidado, nem retorno, nem avaliação.
34. **A fila roda a cada meia hora e só envia das 9h às 20h** de Brasília. O que
    vence fora desse horário sai na primeira rodada do dia seguinte.
35. **Falha não é reenviada.** Fica na lista de envios com o motivo; reenviar
    sozinho arrisca mandar duas vezes. Quem tem `care_messages.manage` pode
    cancelar um envio que está na fila.
36. **A mensagem enviada é gravada na conversa do cliente**, para a IA saber o que
    ele recebeu quando responder.
37. **Pedido de avaliação pelo WhatsApp** (opção das Avaliações, desligada por
    padrão): sai N horas depois de faturar (0 a 72, padrão 2), uma vez por pedido,
    e só se o cliente ainda não avaliou. O texto é do salão ou o padrão, e precisa
    ter `{link}`.
38. **No WhatsApp oficial (Cloud API), fora das 24 horas da última mensagem do
    cliente o envio FALHA**: a Meta só aceita modelo aprovado, e não há modelo para
    estas mensagens. Na Evolution sai a qualquer momento. A falha aparece na
    lista, com esse motivo.

Fatia 6e — metas por mês:

39. **A meta é por mês, do salão e de cada profissional**, em quatro indicadores:
    faturamento, serviços, produtos (em reais) e comandas (contagem). Cada
    indicador é opcional: em branco, fica sem meta.
40. **O realizado vem das comandas FATURADAS do mês**, pelo dia da comanda (em
    Brasília): a soma do total dos itens, já com desconto e cupom. Faturamento
    soma todos os itens (serviço, produto, pacote e assinatura); serviços e
    produtos, só os desse tipo. Comanda excluída ou reaberta não conta. O
    resgate de cashback não reduz o realizado (é forma de pagar, não desconto).
41. **Na linha do profissional** entra o item em que ele é o profissional (quem
    executou o serviço ou vendeu o produto); o auxiliar não conta. "Comandas" do
    profissional são as comandas em que ele aparece. Por isso a soma dos
    profissionais pode ser menor que a do salão (item sem profissional) e as
    comandas, maior (duas pessoas na mesma comanda).
42. **O ritmo** compara o realizado com a parte da meta que os dias corridos
    pedem (dia 10 de um mês de 30 = um terço): "No ritmo", "Abaixo do ritmo",
    "Meta batida", "Não bateu" (mês encerrado) ou "Ainda não começou". É régua
    linear: não conhece dia fechado nem sazonalidade. O percentual arredonda
    para baixo — 99,9% não vira 100%.
43. **"Copiar metas"** traz as metas de outro mês para o mês aberto, **sem passar
    por cima** do que ele já tem, e não copia meta de profissional inativo.
44. **Quem aparece no quadro**: o salão, os profissionais ativos e os inativos que
    têm meta ou venda no mês.

Fatia 6f — cashback para o agente e histórico:

45. **O agente do WhatsApp só INFORMA o saldo** do cliente da conversa: quanto
    tem, o mínimo para usar e se já pode usar. Não aplica desconto, não reserva
    saldo, não mostra o extrato e não promete quanto um serviço vai render. Usar
    o cashback continua sendo da equipe, no fechamento da comanda.
46. **A tool só existe para a IA no salão com o módulo `cashback` ligado.** Com o
    módulo ligado e o cashback desativado nas configurações, ela responde que o
    programa não está ativo e manda não informar saldo.
47. **Cliente sem cadastro** recebe "sem saldo", não erro.
48. **O "Histórico de cashback" é por dia do LANÇAMENTO** (em Brasília), de todos
    os clientes: gerado, resgatado, ajustes e a variação do saldo no período. Os
    totais somam o período inteiro, mesmo quando a lista é cortada em 500 linhas.
49. **Comanda reaberta ou excluída sai do histórico**: os lançamentos dela são
    apagados (regra da 6a), não estornados. O histórico mostra o que está
    valendo; não é trilha de auditoria.

Perguntas para o dono:

- O cashback deve vencer (ex.: 90 dias)?
- A base do ganho é o valor com desconto (regra 3) ou o preço cheio?
- Comanda paga com cashback: a comissão continua sobre o valor do item (regra 5),
  ou cai junto?
- Venda de pacote e cobrança de assinatura devem render cashback?
- No fiado, o ganho deve esperar o cliente pagar?
- O cashback usado deve aparecer no financeiro como despesa de marketing? Hoje ele
  só reduz o que a comanda recebe.
- (6b) Quanto e sobre o quê o cupom desconta? A auditoria só mostra "Nome, Cupom,
  Datas, Dias da semana, Status"; o desconto (percentual ou fixo, em serviços,
  produtos ou nos dois) foi decidido aqui.
- (6b) O cupom deve ter limite de usos, ou valer uma vez por cliente?
- (6b) O cupom pode somar com o desconto dado à mão (regra 16), ou um exclui o
  outro?
- (6b) Com cupom, a comissão segue a configuração de desconto do salão (regra
  16). A promoção deve ter regra própria (ex.: o salão sempre arca)?
- (6b) A Belasis tem a permissão "Acessar todas ou somente as suas" em Promoções.
  A promoção deve poder ser de um profissional só?
- (6b) O agente do WhatsApp deve divulgar ou aceitar cupom?
- (6c) Uma avaliação por comanda (regra 22), ou uma por profissional ou por
  serviço?
- (6c) O pedido deve sair sozinho pelo WhatsApp? Quanto tempo depois de faturar, e
  com que texto?
- (6c) O link deve vencer depois de alguns dias?
- (6c) O profissional pode ver as próprias avaliações, ou só quem gerencia?
- (6c) O salão quer responder ao comentário do cliente, ou mostrar as avaliações
  no agendamento online (a Belasis tem "Mostrar avaliações")?
- (6d) Os prazos (regra 30) e o horário de envio (regra 34) servem? Sábado e
  domingo enviam normalmente?
- (6d) O retorno deve sair mesmo para quem já tem horário marcado (regra 32)?
- (6d) As mensagens devem ser cadastradas também na ficha do serviço e do produto
  (abas Cuidados e Retorno, como na Belasis), além da tela única?
- (6d) Para os salões no WhatsApp oficial: vale aprovar modelos na Meta para
  cuidados, retorno e avaliação (regra 38)? Sem isso, quase nada sai neles.
- (6d) O retorno automático convive com a retenção por IA (que já chama o cliente
  parado, pelo ciclo médio do serviço)? Hoje nenhum dos dois sabe do outro.
- (6e) Os quatro indicadores (regra 39) são os que o salão acompanha? Faltam
  ticket médio, clientes novos, pacotes vendidos?
- (6e) O faturamento da meta deve ser o que foi VENDIDO (regra 40) ou o que foi
  RECEBIDO no mês? Pacote vendido conta na venda ou só quando a sessão é usada?
- (6e) O profissional pode ver a própria meta — e só a dele? Hoje quem tem
  `goals.access` vê todas.
- (6e) Bater a meta muda a comissão (bônus)? Hoje a meta é só acompanhamento.
- (6f) O agente deve só informar o saldo (regra 45), ou também oferecer o uso do
  cashback ao marcar o horário?
- (6f) O histórico deve guardar o que foi desfeito (comanda reaberta), como
  trilha de auditoria (regra 49)?

### 10.4 Permissões e módulo

Módulo `cashback` em `salons.settings.modules`. Recurso novo:

| Recurso | Ações |
|---|---|
| `cashback` | `access` (ver saldos e extratos), `manage` (configurar o salão e os itens, lançar ajuste) |

Usar o cashback do cliente é de quem fatura (`sales.invoice`).

Promoções (6b): módulo `promotions` e recurso `promotions` com `access` (ver) e
`manage` (criar, alterar e excluir). Aplicar o cupom é de quem monta a comanda
(`sales.create` / `sales.edit`).

Avaliações (6c): módulo `reviews` e recurso `reviews` com `access` (painel, lista
e link de cada pedido) e `manage` (ativar, personalizar e excluir). Quem vê a
comanda faturada (`sales.access`) também vê e copia o link dela. O formulário
público não tem permissão: a credencial é o token.

Cuidados e retorno (6d): módulo `care_messages` e recurso `care_messages` com
`access` (ver as mensagens e os envios) e `manage` (criar, alterar, excluir e
cancelar um envio da fila). O pedido de avaliação pelo WhatsApp é configurado em
Avaliações (`reviews.manage`) e não depende do módulo `care_messages`. O cron
que envia não tem sessão: autentica com `CRON_SECRET`.

Metas (6e): módulo `goals` e recurso `goals` com `access` (ver o quadro — do
salão e de todos os profissionais) e `manage` (definir e copiar metas).

### 10.5 Telas

- **Cashback** no menu (módulo ligado + `cashback.access`), em
  `/[salonId]/cashback`: três totais e as abas Clientes (ganhou, usou, saldo,
  situação), Serviços e produtos (o que cada item rende, com edição) e
  Configurações (ativo, valor padrão, mínimo para resgate).
- **Comanda**: no faturamento, "Usar cashback do cliente (saldo R$ X)" quando o
  cliente tem saldo; com uma forma de pagamento só, o valor dela se ajusta. A
  comanda faturada mostra "Pago com cashback" e "Cashback gerado para o cliente".
  O aviso de reabrir diz o que acontece com o cashback.
- **Ficha do cliente**: cartão Cashback (módulo ligado + `cashback.access`) com
  saldo, situação, extrato (movimentação, motivo, data, comanda, valor) e "Ajustar
  saldo" para quem tem `cashback.manage`.
- **Promoções (6b)** no menu (módulo ligado + `promotions.access`), em
  `/[salonId]/promotions`: promoção, cupom, desconto e onde vale, vigência, dias,
  usos (comandas faturadas e quanto já descontou) e situação; "Nova promoção",
  editar e excluir.
- **Comanda (6b)**: bloco Cupom ao lado dos totais — campo e "Aplicar"; aplicado,
  mostra o código, o nome e o desconto, com "Remover". Os totais ganham a linha
  "Cupom X", e o total de cada item já desconta a parte dele.
- **Avaliações (6c)** no menu (módulo ligado + `reviews.access`), em
  `/[salonId]/reviews`: período na URL; quatro totais (média, avaliações, taxa de
  resposta, tempo de resposta); distribuição por nota; por profissional; e a
  lista (data e comanda, cliente, profissional, nota ou "Pendente", comentário)
  com busca por cliente e filtros de situação, nota e profissional, o botão de
  copiar o link do pedido pendente e excluir. "Personalizar" abre a configuração.
- **Formulário público (6c)** em `/avaliar/[token]`, sem login: nome do salão,
  título, boas-vindas, cinco estrelas, comentário opcional e o rodapé "Atendimento
  de dd/mm/aaaa"; depois de responder, o agradecimento. Link desconhecido mostra
  "Link de avaliação inválido".
- **Comanda (6c)**: a comanda faturada mostra o bloco Avaliação — "Copiar link de
  avaliação" enquanto pendente, ou a nota dada.
- **Cuidados e retorno (6d)** no menu (módulo ligado + `care_messages.access`), em
  `/[salonId]/care-messages`: a tabela de Mensagens (item, tipo, quando, texto,
  situação; alterar e excluir) com "Nova mensagem" (tipo, serviço ou produto,
  dias, texto, ativa); e a tabela de Envios (quando, cliente, tipo, situação — na
  fila, enviada, falhou, não enviada — e o texto ou o motivo), com filtro de
  situação e o botão de cancelar o que está na fila.
- **Avaliações (6d)**: "Personalizar" ganha "Enviar o pedido pelo WhatsApp", as
  horas depois de faturar e a mensagem.
- **Metas (6e)** no menu (módulo ligado + `goals.access`), em `/[salonId]/goals`:
  o mês na URL (`?month=YYYY-MM`), com anterior, seguinte e "Mês atual"; um
  bloco para o salão e um por profissional, cada um com os quatro indicadores —
  realizado, barra, "% de [meta] · faltam [valor]" e o ritmo, ou "Sem meta". O
  lápis abre as quatro metas do dono; "Copiar metas" pede o mês de origem.
- **Histórico de cashback (6f)** em `/[salonId]/cashback/history`, aberto pelo
  botão "Histórico" da tela de Cashback (`cashback.access`): período na URL;
  quatro totais (gerado, resgatado, ajustes, variação do saldo); e a lista (data,
  cliente, tipo, origem — o item ou o motivo, com a comanda — e valor com
  sinal), com busca por cliente e filtro de tipo.

### 10.6 Onde o código mora

| O quê | Onde |
|---|---|
| Migration | `supabase/migrations/054_cashback.sql` |
| Tabelas | `packages/db/src/schema.ts` (`cashbackSettings`, `cashbackRules`, `cashbackEntries`, `sales.cashbackRedeemed`) |
| Regra pura | `packages/db/src/domain/cashback.ts` (`planCashbackSettings`, `planCashbackRule`, `effectiveCashbackRate`, `cashbackForItem`, `planSaleCashbackEarn`, `planCashbackRedeem`, `cashbackStatus`, `cashbackReopenBlocker`, `planCashbackAdjustment`); a parte coberta por cashback em `planInvoice` (`creditCents`, `domain/sales.ts`) |
| I/O | `packages/db/src/services/cashback.service.ts`; a comanda chama `planSaleCashbackRedeem` e `recordSaleCashback` no faturamento e `revertSaleCashback` na reabertura (`sales.service.ts`) |
| Actions | `apps/web/app/actions/cashback.ts`; `getSaleCashback` e o faturamento em `apps/web/app/actions/sales.ts` |
| Telas | `apps/web/app/[salonId]/cashback/`; o faturamento em `sales/[saleId]/sale-editor.tsx`; `components/contacts/customer-cashback-card.tsx` |
| Testes | `apps/web/__tests__/lib/services/cashback-domain.test.ts` |
| Promoções (6b) | Migration `055_promotions.sql`; tabela `promotions`, `sales.promotionId`/`couponCode` e `saleItems.couponDiscount`; regra em `domain/promotions.ts` (`planPromotion`, `promotionBlocker`, `promotionStatus`, `splitCouponDiscount`, `applyCouponToSale`); I/O em `services/promotions.service.ts` — a comanda chama `loadSaleCoupon` ao criar e ao salvar (`withCoupon`, `sales.service.ts`); actions em `actions/promotions.ts` e `checkSaleCoupon` em `actions/sales.ts`; tela em `app/[salonId]/promotions/`; testes em `promotions-domain.test.ts` |
| Avaliações (6c) | Migration `056_reviews.sql`; tabelas `reviewSettings` e `reviews`; regra em `domain/reviews.ts` (`planReviewSettings`, `reviewFormTexts`, `shouldRequestReview`, `planReviewResponse`, `buildReviewDashboard`); I/O em `services/reviews.service.ts` — a comanda chama `requestSaleReview` no faturamento e `discardPendingSaleReview` na exclusão (`sales.service.ts`); actions do salão em `actions/reviews.ts`, `getSaleReview` em `actions/sales.ts` e a action PÚBLICA em `actions/public-reviews.ts` (sem sessão, fora da guarda de autorização de propósito); telas em `app/[salonId]/reviews/` e `app/avaliar/[token]/`; testes em `reviews-domain.test.ts` |
| Cuidados e retorno (6d) | Migration `057_care_messages.sql`; tabelas `careMessageRules` e `careMessageDispatches`; regra em `domain/care-messages.ts` (`planCareMessageRule`, `renderCareMessage`, `saleMessageSchedule`, `isWithinCareSendHours`, `decideCareDispatch`, `toWhatsAppNumber`); I/O em `services/care-messages.service.ts` — a comanda chama `enqueueSaleCareMessages` no faturamento e `discardPendingSaleCareMessages` na exclusão; `requestSaleReview` enfileira o pedido de avaliação; a fila é `enqueueDuePreCareMessages`, `claimDueCareDispatches` e `finishCareDispatch`; o ENVIO é do app: `apps/web/lib/services/care-messages/dispatcher.service.ts`, chamado pelo cron `app/api/cron/care-messages` (`vercel.json`, a cada 30 min); actions em `actions/care-messages.ts`; tela em `app/[salonId]/care-messages/`; testes em `care-messages-domain.test.ts` |
| Metas (6e) | Migration `058_goals.sql`; tabela `goals`; regra em `domain/goals.ts` (`planGoalTargets`, `planGoalCopy`, `goalProgress`, `buildGoalBoard`, `goalMonthRange`); I/O em `services/goals.service.ts` (`getGoalBoardService` soma o realizado de `sale_items` das comandas faturadas; `saveGoalTargetsService`; `copyGoalsService`); actions em `actions/goals.ts`; tela em `app/[salonId]/goals/`; testes em `goals-domain.test.ts` |
| Cashback para o agente e histórico (6f) | Sem migration. Tool `getMyCashbackBalance` em `packages/mcp-server/src/presentation/tools/cashback.tools.ts` (`presentCashbackBalance`), liberada por módulo em `apps/web/lib/services/ai/generate-response.service.ts` (`fetchSalonModulesForAi`, que também passou a liberar a de pacotes) e resumida em `summarizeToolResult`; relatório: `summarizeCashbackHistory` em `domain/cashback.ts`, `listCashbackHistoryService` em `services/cashback.service.ts`, `getCashbackHistory` em `actions/cashback.ts`, tela em `app/[salonId]/cashback/history/`; testes em `cashback.tools.test.ts` (mcp-server), `tool-summary.test.ts` e `cashback-domain.test.ts` |

### 10.7 Fatia 6a — estado (17/nov/2026)

- Na branch `claude/fase-6-fidelizacao`, publicada. Typecheck (db, web e
  mcp-server), lint dos arquivos alterados e testes passando (web 1142, db 296,
  mcp-server 400).
- **Migration 054 aplicada em produção em 17/nov/2026** (registrada como
  `cashback`), antes de o código ser publicado. Conferido por leitura: as três
  tabelas com RLS, a coluna `sales.cashback_redeemed` (NOT NULL, default 0) e o
  CHECK dela; `sales` seguiu com as 22 linhas. O advisor de segurança só mostra
  os avisos de sempre.
- Cópia de segurança antes da 054: `backups.sales_pre_054_20261117` (22 linhas),
  com RLS ligado e sem acesso para `anon`/`authenticated`.
- **O módulo `cashback` foi ligado no salão de teste** (por SQL, em
  `salons.settings.modules`, em 17/nov/2026). É o único salão com ele.
- **Testada em uso** no preview da branch (que usa o banco de produção), no salão
  de teste, pela tela, com conferência no banco. O preview desta branch fica em
  outro endereço (`…-git-claude-fase-6-fidelizacao-…`) e pediu login de novo.
  - Tela Cashback com o módulo ligado e o cashback desativado → item no menu,
    aviso "O cashback está desativado…", totais zerados, "Nenhum cliente com
    movimento de cashback".
  - Configurações: ativo, 10% e mínimo de R$ 10,00 → "Configurações salvas"; o
    total "Valor padrão" passa a "10%" e "Mínimo para resgate: R$ 10,00".
  - Serviços e produtos: Teste Shampoo com R$ 2,00 fixo e Teste Pente inativo →
    a lista mostra "Padrão (10%)" no corte, "R$ 2,00 por unidade" no shampoo e
    "Não dá cashback" no pente.
  - Comanda #23 (1 corte de R$ 170,00, 2 shampoos, 1 pente; R$ 250,00 em PIX): o
    faturamento não oferece cashback (cliente sem saldo); faturada, mostra
    "Cashback gerado para o cliente R$ 21,00". No banco: ganho de R$ 17,00 no
    corte, R$ 4,00 nos shampoos e nada no pente.
  - Ficha da cliente: cartão Cashback com R$ 21,00, "Disponível para resgate", os
    dois ganhos com a comanda. Aba Clientes: ganhou R$ 21,00, usou R$ 0,00, saldo
    R$ 21,00; "Podem resgatar" 1.
  - Comanda #24 (1 corte, R$ 170,00): o faturamento mostra "Usar cashback do
    cliente (saldo R$ 21,00)". Com R$ 30,00 → "Passa do saldo de cashback do
    cliente" e, ao confirmar, "O cliente só tem R$ 21,00 de cashback". Com
    R$ 21,00 → o pagamento em PIX se ajusta sozinho para R$ 149,00 e "Pagamentos
    fecham o total". Faturada: "Pago com cashback − R$ 21,00", "Cashback gerado
    R$ 14,90" (10% de R$ 149,00). No banco: pagamento e lançamento no financeiro
    de R$ 149,00, resgate de −R$ 21,00, e a base da comissão continua R$ 170,00.
  - Reabrir a #23 (ganho já gasto) → o aviso inclui "O cashback que esta comanda
    gerou sai do saldo do cliente, e o que ela usou volta"; confirmar é barrado:
    "O cashback gerado por esta comanda já foi usado pelo cliente…".
  - Reabrir a #24 → "Comanda reaberta"; o saldo volta a R$ 21,00 e o extrato fica
    só com os dois ganhos da #23.
  - Ajuste manual: débito de R$ 100,00 → "O cliente só tem R$ 21,00 de cashback";
    débito de R$ 15,00 com motivo → "Ajuste lançado", saldo R$ 6,00, "Abaixo do
    mínimo", e a linha "Ajuste · (motivo)" no extrato.
  - Faturamento da #24 com saldo abaixo do mínimo → "Usar cashback do cliente
    (saldo R$ 6,00)" e "Abaixo do mínimo para resgate (R$ 10,00)", sem campo.
  - Desativar o cashback → "Configurações salvas" e o aviso de desativado volta.
- **Corrigido depois do teste:** a mensagem que barra a reabertura mandava
  "ajustar o saldo em Cashback"; o ajuste é na ficha do cliente, e a mensagem
  passou a dizer isso.
- **Limite do teste:** o salão de teste não tem regra de comissão; conferi que a
  BASE da comissão não muda com o cashback usado, não o valor.
- **Não testado em uso:** valor padrão fixo; comanda paga inteira com cashback
  (sem pagamento); cashback com a comanda dividida em duas formas; cashback junto
  com fiado; desconto no item; ajuste de crédito; comanda com cliente trocado
  depois de digitar o cashback; o que a comanda e a ficha mostram com o cashback
  desativado e saldo guardado; perfil sem `cashback.access` ou sem
  `cashback.manage`; o módulo desligado.
- Dados de teste limpos: a #24 excluída pela tela; o ajuste manual apagado por
  SQL, pelo ID (sem ele a #23 não reabria); a #23 reaberta e excluída pela tela
  (as duas ficam como excluídas, como as anteriores). Sem lançamentos de cashback,
  pagamentos, lançamentos no financeiro, comissões nem movimentos de estoque.
  **Ficaram, como apoio para as próximas fatias:** o módulo `cashback` ligado no
  salão de teste, com o cashback DESATIVADO nas configurações (10%, mínimo
  R$ 10,00), e as regras do Teste Shampoo (R$ 2,00 fixo) e do Teste Pente
  (inativo).

### 10.8 Fatia 6b — estado (17/nov/2026)

- Na branch `claude/fase-6-fidelizacao`, publicada. Typecheck (db, web e
  mcp-server), lint dos arquivos alterados e testes passando (web 1174, db 296,
  mcp-server 400).
- **Migration 055 aplicada em produção em 17/nov/2026** (registrada como
  `promotions`), antes de o código ser publicado. Conferido por leitura: a tabela
  com RLS, as três colunas novas e os CHECKs; `sales` seguiu com 24 linhas e
  `sale_items` com 29. O advisor de segurança só mostra os avisos de sempre.
- Cópias de segurança antes da 055: `backups.sales_pre_055_20261117` (24 linhas)
  e `backups.sale_items_pre_055_20261117` (29 linhas), com RLS ligado e sem
  acesso para `anon`/`authenticated`.
- **O módulo `promotions` foi ligado no salão de teste** (por SQL, em
  `salons.settings.modules`, em 17/nov/2026). É o único salão com ele.
- **Testada em uso** no preview da branch (que usa o banco de produção), no salão
  de teste, pela tela, com conferência no banco (17/nov/2026 foi terça):
  - Tela Promoções vazia → "Nenhuma promoção"; item no menu.
  - Promoção de 10% só em serviços, só às terças, com o cupom digitado em
    minúsculas → "Promoção criada"; a lista mostra o cupom em maiúsculas, "10%",
    "Só serviços", "Sem prazo", "Ter", 0 usos, Ativa.
  - Segunda promoção com o mesmo cupom → "Já existe uma promoção com esse cupom".
  - Outras três: valor fixo de R$ 500,00; só às quartas; e com vigência até
    10/11/2026, que a lista mostra como "Encerrada".
  - Comanda (corte de R$ 170,00 com R$ 20,00 de desconto à mão, 2 shampoos de
    R$ 30,00). Cupom inexistente → "Cupom não encontrado"; o de quarta → "Este
    cupom só vale em: quarta"; o vencido → "Este cupom valeu até 10/11/2026".
  - Cupom de R$ 500,00 → "Cupom … − R$ 210,00" e total R$ 0,00 (não desconta mais
    do que a comanda custa). "Remover" tira o cupom.
  - Cupom de 10% em serviços (aplicado com Enter) → o bloco mostra o código, o nome
    e "10% nos serviços"; corte R$ 135,00, shampoos R$ 60,00; "Descontos
    − R$ 20,00", "Cupom … − R$ 15,00", total R$ 195,00. Salva como #25: no banco,
    desconto de R$ 35,00 no corte, dos quais R$ 15,00 do cupom, e nada no produto.
  - Tela recarregada: o desconto à mão continua R$ 20,00, separado do cupom.
  - Faturada em PIX: pagamento e lançamento no financeiro de R$ 195,00. A base da
    comissão ficou em R$ 170,00 porque o salão de teste usa "o salão arca com o
    desconto".
  - Excluir a promoção usada → o diálogo já avisa; confirmar mostra "Esta promoção
    já foi usada em comanda. Desative-a em vez de excluir". Excluir uma nunca
    usada → "Promoção excluída".
- **Defeito achado e corrigido no teste:** na lista, "Usos" mostrava 1, mas o
  valor descontado não aparecia. A subconsulta que soma `coupon_discount` usava a
  coluna `sales.id` pelo Drizzle, que numa consulta de uma tabela só a escreve
  sem o nome da tabela — dentro da subconsulta virava o id do item, e a soma
  dava zero. Corrigido (`"sales"."id"` por extenso), publicado e conferido no
  preview: "1 · R$ 15,00 em descontos".
- **Mudança depois do teste, sem teste em uso:** a comanda excluída passou a
  soltar a promoção (regra 18). No teste, a comanda excluída ainda segurava a
  promoção, e foi preciso soltar por SQL para limpar.
- **Não testado em uso:** promoção desativada (a mensagem e a regravação da
  comanda); vigência com data de início; cupom só de produtos; cupom em comanda
  com pacote, assinatura ou item do pacote; trocar a data da comanda para um dia
  em que o cupom não vale; editar uma promoção; cashback junto com cupom (o
  cashback estava desativado); perfil sem `promotions.access` ou sem
  `promotions.manage`; o módulo desligado.
- Dados de teste limpos: a #25 reaberta e excluída pela tela (fica como excluída,
  como as anteriores); uma promoção excluída pela tela; a ligação da #25 com a
  promoção e as outras três promoções apagadas por SQL, pelos IDs. Sem
  promoções, pagamentos, lançamentos, comissões nem movimentos de estoque.
  **Ficou:** o módulo `promotions` ligado no salão de teste.

### 10.9 Fatia 6c — estado (17/nov/2026)

- Na branch `claude/fase-6-fidelizacao`, publicada. Typecheck (db, web e
  mcp-server), lint dos arquivos alterados e testes passando (web 1199, db 296,
  mcp-server 400).
- **Migration 056 aplicada em produção em 17/nov/2026** (registrada como
  `reviews`). Só cria tabelas novas, por isso não houve cópia em `backups`.
  Conferido por leitura: as duas tabelas com RLS e sem acesso para
  `anon`/`authenticated`.
- **O módulo `reviews` foi ligado no salão de teste** (por SQL, em
  `salons.settings.modules`, em 17/nov/2026). É o único salão com ele. As
  avaliações continuam DESATIVADAS nas configurações: nenhuma comanda gera pedido
  até alguém ativar em Personalizar.
- **Primeira rota pública com dado de salão.** `/avaliar/[token]` e a action
  `submitPublicReview` não têm sessão. O que as protege: o token aleatório de 192
  bits, a resposta única, e o fato de não receberem nem devolverem id de salão,
  de cliente ou de comanda. Não há limite de tentativas por IP.
- **Testada em uso em 17/nov/2026**, no preview da branch, no salão de teste
  (comandas #26 a #28). Passou:
  - ativar em Personalizar e trocar o título (o aviso de "desativadas" some);
  - comanda com serviço faturada → bloco Avaliação com "Copiar link de avaliação"
    (o aviso "Link de avaliação copiado" aparece) e pedido "Pendente" na lista;
  - comanda só de produto faturada → sem bloco e sem pedido;
  - formulário: nome do salão, o título trocado, as boas-vindas padrão e
    "Atendimento de 17/11/2026" (dia local, com a comanda faturada às 22h33);
  - enviar sem nota → "Escolha uma nota de 1 a 5"; nota 4 com comentário →
    agradecimento; reabrir o link → só o agradecimento, sem campo nem botão;
  - link inventado → "Link de avaliação inválido";
  - painel: média 4,0, 1 avaliação, taxa 100% (50% com o segundo pedido,
    pendente), "Menos de 1 h", distribuição e a linha do profissional; filtros de
    situação, nota e profissional; a nota e o "Ver em Avaliações" na comanda;
  - reabrir e faturar de novo a comanda avaliada → mesmo link, nota mantida;
  - excluir a comanda com pedido pendente → o pedido some da lista;
  - excluir a avaliação respondida → lista zerada e o link passa a "inválido".
- **Não testado em uso:**
  - **o link aberto por quem não tem login.** O preview da Vercel exige login da
    Vercel em qualquer endereço (sem sessão, o link responde 302 para
    `vercel.com/sso-api`), então só deu para abrir no navegador já logado. O
    aplicativo não tem middleware que barre `/avaliar`, mas isso só se confirma
    em produção;
  - boas-vindas e agradecimento personalizados; os limites de tamanho dos textos;
  - comanda com dois profissionais (a nota contando para os dois);
  - a busca por cliente e o período do painel; perfil sem `reviews.access` ou sem
    `reviews.manage`; o módulo desligado.
- Dados de teste limpos pela tela: a avaliação excluída, as comandas #26, #27 e
  #28 reabertas e excluídas (ficam como excluídas, como as anteriores), as
  avaliações DESATIVADAS de novo e o título em branco. Conferido por leitura: sem
  linhas em `reviews` no salão de teste.

### 10.10 Fatia 6d — estado (17/nov/2026)

- Na branch `claude/fase-6-fidelizacao`, publicada. Typecheck (db, web e
  mcp-server), lint dos arquivos alterados e testes passando (web 1232, db 296,
  mcp-server 400).
- **Migration 057 aplicada em produção em 17/nov/2026** (registrada como
  `care_messages`). Cópia antes: `backups.review_settings_pre_057_20261117` (1
  linha). Conferido por leitura: as duas tabelas novas com RLS e sem acesso para
  `anon`/`authenticated`; a linha de `review_settings` com os padrões novos.
- **O módulo `care_messages` foi ligado no salão de teste** (por SQL, em
  `salons.settings.modules`, em 17/nov/2026). É o único salão com ele.
- **A auditoria não descreve os campos** das abas Cuidados e Retorno da Belasis:
  só diz que existem. Tipos, prazos e variáveis foram decididos aqui (regras 29 a
  38).
- **Uma tela só, não abas na ficha do serviço e do produto.** As mensagens ficam
  em Cuidados e retorno; a ficha do serviço e a do produto não mudaram.
- **O que o envio reaproveita**: `sendProactiveMessage` (o mesmo caminho do
  lembrete e do marketing), que escolhe o canal do salão. Diferente do lembrete,
  esta fila respeita o pedido de não receber mensagens e procura a conversa do
  cliente pelas duas formas do telefone (com e sem `+`), criando-a só com
  dígitos — como a mensagem recebida grava.
- **Limites conhecidos:**
  - no WhatsApp oficial quase tudo falha fora das 24 horas (regra 38) — vale
    para o salão que já usa esse canal;
  - o cron da Vercel só roda em PRODUÇÃO. No preview a fila não anda sozinha: o
    envio só pode ser testado chamando `/api/cron/care-messages` com o
    `CRON_SECRET`, ou depois de a fase ir para produção;
  - o link da avaliação usa `NEXT_PUBLIC_APP_URL`. Enquanto a fase 6 não estiver
    em produção, um pedido enviado de um preview levaria a um endereço que ainda
    não tem a página;
  - sem limite de envios por salão ou por cliente por dia, além dos 40 por rodada
    no total; envio que espera (comanda reaberta) volta para a fila e é
    reavaliado a cada rodada, por até 3 dias;
  - a fila não avisa ninguém quando falha (não abre alerta): é preciso olhar a
    lista de envios.
- **Cadastro e fila testados em uso em 17/nov/2026**, no preview da branch, no
  salão de teste (comanda #29). Passou:
  - a tela no menu, vazia; criar cuidados de depois (0 dias) e retorno (30 dias)
    para um serviço, e retorno (45 dias) para um produto;
  - duplicar tipo e item → "Este item já tem uma mensagem desse tipo";
  - escolher "cuidados antes" trava o campo em Serviço e troca o limite para 1 a
    30; "retorno" mostra 1 a 365;
  - em Avaliações, a mensagem do WhatsApp sem `{link}` é recusada; com ele, salva,
    e o rodapé da lista passa a dizer que o pedido sai sozinho;
  - faturar a comanda com o serviço e o produto → quatro envios "Na fila":
    cuidados (na hora), pedido de avaliação (2 h depois), retorno do serviço (30
    dias) e do produto (45 dias), com o link da comanda;
  - reabrir e faturar de novo → continuam quatro (conferido por leitura);
  - cancelar um envio da fila; excluir uma mensagem leva junto o envio dela;
  - excluir a comanda → a fila esvazia, inclusive o pedido de avaliação.
- **NÃO testado em uso — o envio de verdade.** Nenhuma mensagem saiu: o cron não
  roda no preview, e não chamei a rota porque ela pede o `CRON_SECRET`. Ficaram
  sem teste: a fila ser consumida, o texto com as variáveis trocadas, a mensagem
  chegar no WhatsApp e cair na conversa, as recusas na hora do envio (cliente que
  pediu para parar, mensagem desativada, comanda reaberta, quem já tem horário), o
  horário das 9h às 20h, a falha no WhatsApp oficial e TODO o caminho dos
  cuidados de antes (que nasce no cron). A consulta dos cuidados de antes foi
  rodada por leitura no banco, só para conferir que é válida. Essa parte está
  coberta apenas pelos testes da regra pura.
- **Também não testado:** alterar e desativar uma mensagem; o filtro de situação
  dos envios; perfil sem `care_messages.access` ou sem `care_messages.manage`; o
  módulo desligado.
- **Achado no teste:** cancelar um envio e depois reabrir e faturar a mesma
  comanda agenda o envio de novo (o cancelamento apaga a linha, então nada lembra
  que ele foi cancelado). Não corrigido.
- Dados de teste limpos pela tela: a comanda #29 reaberta e excluída (fica como
  excluída), as três mensagens excluídas, as avaliações DESATIVADAS de novo, o
  envio pelo WhatsApp desmarcado e o texto em branco. Conferido por leitura: sem
  linhas em `care_message_rules`, `care_message_dispatches` nem `reviews`.

### 10.11 Fatia 6e — estado (18/nov/2026)

- Na branch `claude/fase-6-fidelizacao`, publicada. Typecheck (db, web e
  mcp-server), lint dos arquivos alterados e testes passando (web 1254, db 296,
  mcp-server 400).
- **Migration 058 aplicada em produção em 18/nov/2026** (registrada como
  `goals`). Só cria a tabela `goals`, por isso não houve cópia em `backups`.
  Conferido por leitura: RLS ligado e sem acesso para `anon`/`authenticated`.
- **O módulo `goals` foi ligado no salão de teste** (por SQL, em
  `salons.settings.modules`, em 18/nov/2026). É o único salão com ele.
- **A auditoria só cita "Metas" (T-08) e o "Copiar metas"**, sem os campos.
  Indicadores, de onde vem o realizado e o ritmo foram decididos aqui (regras 39
  a 44).
- **Não mexe na comanda nem na comissão**: a fatia só lê `sales` e `sale_items`.
- **Limites conhecidos:** não há meta por dia nem por semana; não há histórico
  de quem mudou a meta; o agente do WhatsApp não conhece as metas; o realizado é
  recalculado a cada abertura da tela (duas consultas com soma por mês — leve
  para o tamanho de hoje).
- **Testada em uso em 18/nov/2026**, no preview da branch, no salão de teste
  (comanda #30). Passou:
  - a tela no menu, no mês atual, com o aviso de "nenhuma meta" e o salão e os
    dois profissionais zerados (o salão não tinha comanda faturada em novembro,
    conferido por leitura);
  - definir as quatro metas do salão (comandas "10,5" é recusado) e a meta de
    serviços de um profissional;
  - faturar uma comanda com um serviço de R$ 170 e um produto de R$ 30 → salão:
    faturamento R$ 200 (20% de R$ 1.000), serviços R$ 170 ("Meta batida", 100%
    de R$ 170), produtos R$ 30, 1 comanda; profissional: R$ 170 em serviços (3%
    de R$ 5.000) e 1 comanda; o produto sem vendedor não entrou na linha dele;
  - "Copiar metas" de novembro para dezembro → "5 metas copiadas", tudo "Ainda
    não começou"; copiar de novo → "Nada a copiar"; copiar de um mês sem metas →
    recusado; copiar para outubro → tudo "Não bateu";
  - apagar uma meta deixando o campo em branco (a linha some do banco);
  - excluir a comanda → o realizado volta a zero.
- **Não testado em uso:** "No ritmo" (nenhuma meta de teste ficou acima do
  ritmo sem bater); as setas de mês e o "Mês atual"; meta de profissional
  inativo na cópia; profissional inativo com venda no mês; duas pessoas na mesma
  comanda; item de pacote ou assinatura no faturamento; perfil sem
  `goals.access` ou sem `goals.manage`; o módulo desligado.
- **Corrigido depois do teste, sem teste em uso:** o nome do mês aparecia como
  "Novembro De 2026" (maiúscula em toda palavra); passou a ter maiúscula só na
  primeira letra.
- Dados de teste limpos: a comanda #30 reaberta e excluída pela tela (fica como
  excluída); as 14 metas de teste (outubro, novembro e dezembro) apagadas por
  SQL, pelo ID do salão. Conferido por leitura: `goals` vazia.

### 10.12 Fatia 6f — estado (18/nov/2026)

- Na branch `claude/fase-6-fidelizacao`, publicada em 18/nov/2026. Typecheck (db, web e mcp-server), lint dos arquivos alterados e testes
  passando (web 1259, db 296, mcp-server 409). O
  `generate-response.service.ts` continua com os 12 erros de lint antigos
  (`any`), nenhum novo.
- **Sem migration.** Só lê o que a 054 já criou.
- **Muda o caminho do agente para TODOS os salões, não só o de teste:** a
  consulta que liberava a tool de pacotes virou uma consulta só, dos módulos do
  salão, que libera as duas tools. Para o salão sem os módulos o efeito é o
  mesmo de antes (as duas tools são retiradas), mas o código por onde toda
  resposta da IA passa mudou.
- **O prompt do agente não foi mexido.** A tool se descreve sozinha; se o prompt
  de algum salão disser que não há cashback, é ele que vale para a IA.
- **Relatório testado em uso em 18/nov/2026**, no preview da branch, no salão de
  teste (comandas #31 e #32). Passou:
  - o botão "Histórico" na tela de Cashback;
  - com o cashback ativado: a #31 (serviço de R$ 170 e produto) gerou R$ 17,00 e
    R$ 2,00; a #32 usou R$ 12,00 e gerou R$ 15,80 (10% dos R$ 158 que sobraram);
    um ajuste de + R$ 5,00 na ficha;
  - o Histórico mostrou as cinco linhas, com o item ou o motivo e a comanda, e os
    totais: gerado R$ 34,80, resgatado R$ 12,00, ajustes R$ 5,00, variação
    R$ 27,80 — igual ao saldo da cliente;
  - filtro de tipo (só o resgate) e busca por cliente sem resultado;
  - excluir a #32 → as duas linhas dela somem e o resgatado volta a R$ 0,00.
- **NÃO testado em uso — a tool do agente.** O agente só roda no worker: não dá
  para testar pela tela. Falta, pelo WhatsApp do salão de teste, perguntar
  "tenho cashback?" com saldo, com saldo abaixo do mínimo, sem saldo e com o
  cashback desativado. A tool de pacotes da fase 5 está na mesma situação. A
  troca da verificação de módulos também só foi exercitada pelos testes
  automáticos.
- **Também não testado:** trocar o período do relatório; ajuste negativo; a lista
  cortada em 500 linhas; o link do cliente para a ficha.
- Dados de teste limpos: as comandas #31 e #32 reabertas e excluídas pela tela
  (ficam como excluídas); o cashback DESATIVADO de novo pela tela; o ajuste de
  teste apagado por SQL, pelo ID do salão e da cliente. Conferido por leitura:
  sem lançamentos de cashback no salão de teste.

### 10.13 Fase 6 na `main` (18/nov/2026)

- **PR #19 mesclado na `main`** em 18/nov/2026 (commit `a3d74f4`), só com a
  fase 6 (15 commits): a `main` já tinha as fases 3 e 4 (PR #17) e a fase 5
  (PR #18).
- **O deploy de produção desse commit terminou sem erro** (estado READY na
  Vercel, conferido em 18/nov/2026). Nenhuma tela foi aberta em produção depois
  dele.
- **Banco:** as migrations 054 a 058 já estavam aplicadas; o merge não exigiu
  nada.
- **O CI do PR falhou, e não foi pela fase 6.** O passo de lint
  (`pnpm turbo run lint`) acusa 152 erros no `apps/web` inteiro, quase todos
  `any` antigos, e o workflow falha em toda execução recente — nos PRs #17 e
  #18 e na própria `main`. Nos arquivos que a fase 6 alterou, os erros de lint
  são anteriores a ela (`generate-response.service.ts` e
  `customer-detail-client.tsx`). Enquanto o lint não for zerado, o CI não
  distingue PR bom de PR ruim, e os passos de tipos e de build nem chegam a
  rodar.
- **O que passa a valer em produção:**
  - o cron `/api/cron/care-messages` roda a cada 30 minutos. Sem mensagem
    cadastrada e sem envio na fila, não manda nada — e só o salão de teste tem
    o módulo;
  - a rota pública `/avaliar/[token]` existe em produção;
  - o agente passa a consultar os módulos do salão para liberar as tools de
    saldo de pacote e de cashback (o worker precisa estar com esta versão).
- **Os testes que dependiam de produção deixaram de estar travados** (lista em
  §12): o link de avaliação sem login, o envio de verdade das mensagens da 6d e
  as duas tools do agente.

## 11. Fase 7 — Cliente e agenda

Responde: quem é o cliente, e como ele chega à agenda. Parte da ficha do cliente
e da agenda que já existem. A auditoria lista as telas da Belasis (ficha completa,
anamneses, documentos com assinatura, recorrência e etiquetas na agenda,
agendamento online), sem os campos nem as regras; quase tudo é decidido aqui.

### 11.1 Fatias

| Fatia | O que entra | Estado |
|---|---|---|
| 7a | Ficha do cliente completa: nascimento, CPF, gênero, endereço e "como conheceu", editáveis na própria ficha | Feita, migration 059 aplicada, publicada e testada em uso (§11.7) |
| 7b | Etiquetas na agenda (rótulo com cor no agendamento) e remarcar pela tela — antes só a IA remarcava | Feita, migration 060 aplicada, publicada e testada em uso (§11.8) |
| 7c | Recorrência de agendamento: repetir a cada N semanas, por X vezes, e cancelar "este e os próximos" | Feita, migration 061 aplicada, publicada na branch e testada em uso (§11.9) |
| 7d | Anamneses: modelos de ficha com perguntas, respondidas na ficha do cliente, com histórico | Feita — migration 062 aplicada, publicada na branch e testada em uso (§11.10) |
| 7e | Documentos com assinatura: termo do salão assinado pelo cliente por link | Feita — migration 063 aplicada, publicada na branch e testada em uso (§11.11) |
| 7f | Agendamento online público: página do salão, sem login, em que o cliente marca horário | Feita, sem migration, publicada na branch e testada em uso (§11.12). O cálculo da IA NÃO foi trocado |

A ordem vai do que só acrescenta ao que mexe no caminho crítico. O agendamento
online fica por último de propósito: depende de UM cálculo de horários livres, e
hoje há dois que divergem (§11.2).

### 11.2 O que o levantamento encontrou (18/nov/2026)

Vale para a fase inteira; cada item volta na fatia que o toca.

- **Dois cálculos de horários livres.** `getAvailableSlots`
  (`packages/db/src/services/availability.ts`) ignora intervalos (almoço),
  Google e agenda oficial; o `CheckAvailabilityUseCase` do mcp-server considera
  os três. Uma página pública em cima do primeiro ofereceria horário de almoço e
  horário já vendido na Belasis, que falhariam ao confirmar. **Trava a 7f.**
- **`schedule_overrides` (folgas e bloqueios pontuais) não é lido por ninguém**:
  nem pelos dois cálculos, nem pelo `createAppointmentService`, e não há tela
  para criar. Quem está de férias aparece como livre.
- **`createAppointmentService` aceita marcar dentro do intervalo** (`is_break`) e
  **não confere se o cliente é do salão** (só a FK segura).
- **A tela não remarca nem edita agendamento**: só cria, cancela, conclui e marca
  falta. `updateAppointmentService` existe, mas só a IA chama. O formulário de
  criar pede a hora digitada, sem mostrar horários livres.
- **A trava de horário duplo é só na aplicação** (`pg_advisory_xact_lock` +
  consulta de sobreposição dentro do serviço). Não há constraint no banco: quem
  inserir por fora do serviço não é barrado.
- **`salons.slug` está aposentado** desde a migration 023 (nullable, o app não
  gera nem lê). A página pública vai precisar de um endereço próprio.
- **`salons` não tem logo nem endereço estruturado.**
- **Não há middleware**: quem exige login é o layout de `app/[salonId]`. Rota
  pública nova precisa de um primeiro segmento fixo (como `/avaliar`).
- **Excluir cliente é exclusão de verdade** (`deleteSalonCustomer`). Com anamnese
  e documento assinado ligados ao cliente, isso precisa de decisão (7d e 7e).
- **O único storage é o do WhatsApp** (`lib/supabase/storage.ts`, bucket
  `whatsapp-media`, com `chatId` e `messageId` no caminho). Documento assinado
  vai precisar de bucket e caminho próprios.

### 11.3 Modelo de dados

**Migration 059 (fatia 7a)** — MEXE em `customers` (onze colunas novas, sem
DEFAULT, todas opcionais); tem que ser aplicada antes de publicar o código:

- **`customers`** ganha `birth_date`, `cpf` (11 dígitos), `gender` (`female`,
  `male`, `other`), `zip_code` (8 dígitos), `address_street`, `address_number`,
  `address_complement`, `address_district`, `address_city`, `address_state` (UF)
  e `referral_source`. Índice único `(salon_id, cpf)` e índice de aniversário
  (mês e dia).

**Migration 060 (fatia 7b)** — MEXE em `appointments` (uma coluna nova, sem
DEFAULT); tem que ser aplicada antes de publicar o código:

- **`appointment_labels`** — as etiquetas do salão: `name` (até 30 caracteres,
  único no salão sem diferença de maiúscula) e `color` (`#RRGGBB`).
- **`appointments.label_id`** — a etiqueta do agendamento, no máximo uma. Excluir
  a etiqueta deixa NULL (`ON DELETE SET NULL`).

**Migration 061 (fatia 7c)** — MEXE em `appointments` (uma coluna nova, sem
DEFAULT); tem que ser aplicada antes de publicar o código:

- **`appointment_series`** — a série: `interval_weeks` (1 a 8), `occurrences`
  (2 a 12, o que foi PEDIDO) e `created_by`. Não guarda regra para o futuro: só
  amarra os agendamentos criados de uma vez.
- **`appointments.series_id`** — a série do agendamento. NULL = avulso.

**Migration 062 (fatia 7d)** — só tabelas novas, não mexe em nenhuma existente:

- **`anamnesis_templates`** — os modelos do salão: `name` (único no salão, sem
  diferença de maiúscula), `questions` (jsonb: `id`, `label`, `type`,
  `required`, `options`) e `is_active`.
- **`customer_anamneses`** — cada ficha respondida: `customer_id` (CASCADE),
  `template_id` (SET NULL), `template_name` e `answers` (jsonb: `questionId`,
  `label`, `type`, `value`) como RETRATO do dia, e `filled_by`.

**Migration 063 (fatia 7e)** — só tabelas novas, não mexe em nenhuma existente.
Mesmo assim **tem que ser aplicada antes de publicar o código**: a exclusão de
contato passa a consultar `customer_documents` (regra 39).

- **`document_templates`** — os modelos do salão: `name` (único no salão, sem
  diferença de maiúscula; é o título do documento), `body` (até 20.000
  caracteres) e `is_active`.
- **`customer_documents`** — cada documento gerado: `customer_id` (CASCADE),
  `template_id` (SET NULL), `title` e `body` como RETRATO do dia (com os
  campos preenchidos), `body_hash` (SHA-256 de título + texto), `token` (único
  no sistema), `expires_at`, e a assinatura: `signed_at`, `signer_name`,
  `signature_image` (PNG em data URL, até 200.000 caracteres), `signer_ip` e
  `signer_user_agent`. Um CHECK garante que nome, imagem e data andam juntos.

**Fatia 7f — sem migration.** O agendamento online é o módulo `online_booking`
em `salons.settings.modules` (como os outros módulos), e o endereço da página
usa o id do salão. O agendamento criado pela página é uma linha comum de
`appointments`, com a observação "Agendado pelo cliente na página de
agendamento online".

### 11.4 Regras decididas

Fatia 7a — ficha do cliente:

1. **Tudo é opcional.** O cadastro que nasce do WhatsApp continua só com nome e
   telefone; a ficha é completada no salão.
2. **CPF**: só entra o que tem os dígitos verificadores certos; sequência
   repetida ("111.111.111-11") é recusada. **Um CPF por salão**: o segundo
   cadastro com o mesmo CPF é recusado com aviso.
3. **Nascimento**: não pode ser no futuro nem antes de 1900 (o "futuro" é
   conferido no código; o banco só barra antes de 1900). A ficha mostra a
   idade e avisa quando é o aniversário (quem nasceu em 29/fev comemora em 28/fev
   fora de ano bissexto).
4. **Endereço**: CEP com 8 dígitos e UF da lista; o resto é texto. Não há busca
   de endereço pelo CEP.
5. **"Como conheceu"** é texto curto e livre (até 80 caracteres), separado da
   origem do lead (anúncio × orgânico), que é automática.
6. **Quem edita**: quem tem `customers.edit`. **Quem só lê a ficha vê o CPF
   mascarado** ("•••.•••.•••-09"), e a máscara é feita no servidor. Endereço e
   nascimento aparecem para quem lê a ficha.
7. **Nome, telefone, e-mail e etiquetas** continuam sendo editados na lista de
   contatos, como antes.
8. **O agente do WhatsApp não recebe estes dados.** Nenhuma tool nova, e o
   contexto que a IA lê do cliente não foi mexido.

Fatia 7b — etiquetas na agenda e remarcar:

9. **A etiqueta é um marcador de tela**: nome e cor, uma por agendamento. Não
   muda horário, status, cobrança nem comissão, e o agente do WhatsApp não a vê.
10. **O salão cria as suas** (até 30), escolhendo entre nove cores. O texto sobre
    a cor é preto ou branco, o que der mais contraste.
11. **Pôr ou tirar a etiqueta** é no detalhe do agendamento, inclusive nos já
    concluídos. Ainda não dá para escolher a etiqueta ao CRIAR o agendamento.
12. **Excluir a etiqueta** tira a marca dos agendamentos que a usavam; eles
    continuam como estão.
13. **Quem mexe**: ver as etiquetas é de quem tem `schedule.access`; criar,
    alterar, excluir e etiquetar é de quem tem `schedule.edit`.
14. **Remarcar pela tela** muda só a data e a hora — mesmo cliente, serviço e
    profissional. Só o que está pendente ou confirmado é remarcado.
15. **O horário novo passa pelas mesmas conferências de um agendamento novo**
    (o mesmo serviço que a IA usa): expediente, regra de dia e horário do
    serviço, conflito com outro agendamento, agenda oficial e Google. A equipe
    pode furar a regra de dia e horário do serviço depois de confirmar, como no
    criar; conflito não se fura.
16. **Quem remarca** é quem já podia concluir ou cancelar aquele agendamento:
    dono, gerente, ou o profissional do próprio atendimento.

Fatia 7c — recorrência:

17. **Repetir é criar vários agendamentos de uma vez**: o mesmo cliente, serviço
    e profissional, no mesmo dia da semana e na mesma hora, a cada 1 a 8 semanas,
    de 2 a 12 vezes contando o primeiro. Não existe série "sem fim".
18. **Cada data é conferida como um agendamento avulso** (expediente, regra do
    serviço, conflito, agenda oficial, Google). **A primeira precisa caber**: se
    ela falha, nada é criado. As seguintes que não couberem são puladas e
    listadas num aviso que fica na tela, com o motivo de cada uma.
19. **Furar a regra de dia e horário do serviço**, depois de confirmar, vale para
    a série inteira. Conflito não se fura.
20. **Cada agendamento da série é comum**: pode ser remarcado, etiquetado,
    concluído ou cancelado sozinho. Remarcar um não move os outros.
21. **Cancelar "este e os próximos"** cancela, daquela data em diante, os que
    ainda estão pendentes ou confirmados. Os anteriores e os já concluídos ficam.
    Não há "cancelar a série inteira" nem "remarcar a série".
22. **Se só uma data coube**, o agendamento fica avulso: um sozinho não é série.
23. **Quem cria a série** é quem já podia criar agendamento (dono ou profissional
    ativo; no plano SOLO, sempre para o profissional do dono).

Fatia 7d — anamneses:

24. **O salão monta modelos**: um nome e de 1 a 40 perguntas, em ordem. Tipos de
    pergunta: resposta curta (até 200 caracteres), resposta longa (até 2.000),
    sim ou não, uma opção e várias opções (de 2 a 20 opções). Cada pergunta pode
    ser obrigatória. Até 30 modelos por salão.
25. **Responder é na ficha do cliente**, por quem atende — não há link para o
    cliente responder sozinho (isso é parente da 7e). Pergunta obrigatória não
    passa em branco, e "Não" conta como resposta. Ficha toda em branco não é
    gravada.
26. **A ficha respondida é um retrato**: guarda o nome do modelo e o texto de
    cada pergunta como estavam no dia. Alterar, desativar ou excluir o modelo não
    muda o que já foi respondido.
27. **A ficha respondida não se edita.** Responder de novo cria outra; o
    histórico é a lista, da mais recente para a mais antiga, com data e quem
    preencheu.
28. **Modelo inativo** não aparece para responder; continua na lista de modelos.
29. **Anamnese é dado de saúde, com permissão própria** (`customers.anamneses`,
    "Anamneses" em Clientes): ver, responder e gerenciar os modelos. Ter acesso
    aos contatos NÃO basta. Dono e gerente sem perfil têm; funcionário sem
    perfil não tem; perfil de acesso existente não tem até alguém marcar.
30. **Excluir uma ficha respondida** pede, além dessa permissão, a de excluir
    clientes (`customers.delete`).
31. **Excluir o cliente apaga as anamneses dele**, sem aviso a mais na tela de
    exclusão.

Fatia 7e — documentos com assinatura:

32. **O salão escreve modelos de documento**: um nome (que é o título que o
    cliente vê) e o texto, até 20.000 caracteres, sem formatação além das quebras
    de linha. Até 30 modelos. O texto aceita três campos, preenchidos na hora de
    gerar: `{{cliente}}`, `{{salao}}` e `{{data}}` (o dia, em Brasília).
    Campo que não existe (`{{cpf}}`) é recusado ao salvar o modelo.
33. **Gerar é na ficha do cliente**, a partir de um modelo ativo. O documento é
    um retrato: guarda título e texto do dia, já com os campos preenchidos, e o
    SHA-256 desse texto. Alterar, desativar ou excluir o modelo não muda o
    documento, assinado ou não.
34. **O cliente assina por um link sem login** (`/assinar/<token>`). A única
    credencial é o token (192 bits aleatórios). **O sistema não envia o link**:
    gerar copia o link, e quem atende manda pelo canal que quiser.
35. **Assinar** é: ler o texto, escrever o nome completo, desenhar a assinatura
    (dedo, caneta ou mouse) e marcar "li e concordo". Ficam gravados o nome, a
    imagem da assinatura, a data e a hora, o endereço de internet (IP) e o
    navegador. **Não há conferência de identidade**: assina quem tem o link.
    Não é assinatura com certificado digital (ICP-Brasil).
36. **Assina-se uma vez só.** Depois de assinado, o documento não muda, e o
    mesmo link passa a mostrar o documento com a assinatura — é a via do
    cliente. O link nunca mostra IP, telefone nem outro dado do cadastro.
37. **O link vale 30 dias.** Vencido sem assinatura, não aceita mais; o salão
    gera outro. Até 10 documentos esperando assinatura por cliente.
38. **Permissão própria** (`customers.documents`, "Documentos" em Clientes):
    ver os documentos, gerar, copiar o link e gerenciar os modelos. Ter acesso
    aos contatos NÃO basta. Dono e gerente sem perfil têm; funcionário sem
    perfil não tem; perfil de acesso existente não tem até alguém marcar.
39. **Excluir documento**: o que ainda não foi assinado sai com a permissão
    acima; o ASSINADO pede também `customers.delete`. **Contato com documento
    assinado não é excluído**: a tela avisa para excluir os documentos antes.
    (Diferente da anamnese, regra 31: o documento assinado é registro do salão.)
40. **A imagem da assinatura fica no banco**, na linha do documento, e não em
    storage: é um PNG pequeno, e assim fica atrás do mesmo RLS do resto. O
    servidor só aceita data URL de PNG.
41. **O agente do WhatsApp não vê nem envia documento.**

Fatia 7f — agendamento online público:

42. **Um cálculo de horários livres para a página**
    (`listProfessionalDaySlotsService`, com a conta em
    `domain/booking-slots.ts`). Um horário só é oferecido se o atendimento
    INTEIRO — a duração que a agenda reserva — cabe num período de trabalho do
    profissional, não encosta em intervalo e não encosta em nada ocupado.
    "Ocupado" junta: agendamentos da pessoa em qualquer salão, folgas e
    bloqueios (`schedule_overrides`, lidos aqui pela primeira vez), Google e
    agenda oficial. Grade de 15 em 15 minutos, ou só os horários próprios do
    serviço quando ele tem.
43. **O cálculo da IA do WhatsApp NÃO foi trocado nesta fatia.** Ele está no
    caminho crítico e só roda no worker, onde não dá para testar em uso daqui.
    Continuam existindo o `CheckAvailabilityUseCase` (IA) e o
    `getAvailableSlots` (só o chat de teste do painel). Diferenças conhecidas
    do cálculo da IA: a grade anda de duração em duração, e um horário que
    começa antes do intervalo e termina dentro dele é oferecido. Trocar a IA
    para o cálculo novo é uma fatia própria (§12).
44. **A página só oferece o que a criação aceita.** Profissional sem expediente
    cadastrado no dia não aparece com horário — a página NÃO usa o horário de
    funcionamento do salão no lugar (a criação recusaria).
45. **Marcar confere de novo.** O horário pedido tem que estar entre os que a
    página oferece naquele instante; a lista é recalculada no servidor. É isso
    que impede marcar fora do expediente, em cima do almoço ou além da janela,
    mesmo com o pedido montado à mão. Quem grava é o
    `createAppointmentService`, com a trava de conflito e a agenda oficial.
46. **Opt-in por salão**: módulo `online_booking`, desligado para todos. Sem o
    módulo, o endereço responde como se o salão não existisse.
47. **O endereço** é `/agendar/<id do salão>`. O id é um identificador, não um
    segredo. Endereço curto com o nome do salão fica para depois (o `slug` está
    aposentado).
48. **O cliente escolhe** serviço, profissional (quando mais de um faz o
    serviço), dia e horário, e informa nome e WhatsApp com DDD. Entram os
    serviços ativos que têm profissional ativo. Aparecem nome, duração
    reservada, descrição e preço (valor, faixa ou "Sob avaliação").
49. **Janela**: de hoje a 30 dias, e hoje só com uma hora de antecedência.
50. **O cadastro** é achado pelo telefone (em qualquer formato) ou criado.
    Cadastro que já existe NÃO tem o nome trocado: quem digita o telefone de
    outra pessoa não renomeia o cliente do salão. A página nunca diz se o
    telefone já era cliente.
51. **Sem confirmação do telefone.** Não há código por WhatsApp nem SMS. O que
    segura abuso: no máximo 3 agendamentos futuros por telefone no salão, a
    antecedência, a janela e um campo-isca para robôs. Não há limite de
    tentativas por endereço de internet.
52. **O agendamento entra como os outros** (pendente), com a observação de que
    veio da página. Segue o que já existe: espelho no Google, agenda oficial,
    lembrete. **A página não cancela nem remarca**: isso é com o salão.
53. **Quem vê o link**: botão "Link online" na agenda, para quem está no salão
    com o módulo ligado. Não há permissão própria.

Perguntas para o dono:

- (7a) Algum destes campos deve ser obrigatório? Para quem (todo cliente, ou só
  para assinar documento)?
- (7a) Faltam campos da ficha da Belasis: RG, profissão, estado civil, e-mail
  secundário, foto, "indicado por" ligando a outro cliente?
- (7a) O CPF mascarado para quem só lê (regra 6) é o que o salão quer? E o
  endereço?
- (7a) Lista de aniversariantes do mês e mensagem de parabéns pelo WhatsApp entram
  nesta fase?
- (7a) A IA deve poder perguntar e gravar a data de nascimento na conversa?
- (7b) Uma etiqueta por agendamento basta, ou a Belasis deixa várias?
- (7b) A etiqueta deve mudar a cor do cartão inteiro na agenda? Hoje a cor do
  cartão é só para diferenciar um do outro, e a etiqueta entra como um selo.
- (7b) Remarcar deve também trocar o profissional e o serviço? Hoje só data e
  hora.
- (7b) O cliente deve ser avisado pelo WhatsApp quando o salão remarca?
- (7c) Os limites servem (até 8 semanas de intervalo, até 12 vezes)? Precisa de
  repetição mensal por data ("todo dia 10") ou a cada N dias?
- (7c) Quando uma data da série não cabe, pular e avisar (regra 18) é o certo, ou
  o sistema deve procurar outro horário próximo?
- (7c) A IA deve poder marcar e cancelar séries pelo WhatsApp? Hoje ela só vê
  cada agendamento isolado.
- (7c) O lembrete de 24 horas de cada agendamento da série basta, ou o cliente
  recebe um resumo com todas as datas ao marcar?
- (7d) Quem pode ver anamnese? Hoje é uma permissão só (ver, responder e
  gerenciar modelos — regra 29). Precisa separar "ver" de "gerenciar modelos"?
- (7d) A ficha respondida deve poder ser corrigida, ou só refeita (regra 27)?
- (7d) O cliente deve responder sozinho, por um link no WhatsApp, antes do
  atendimento? E a anamnese precisa de assinatura (liga com a 7e)?
- (7d) Faz falta pergunta "Sim → qual?" (um campo que só abre quando a resposta
  é sim), data, ou foto? Hoje o salão resolve com uma pergunta de texto em
  seguida.
- (7d) A IA deve saber o que está na anamnese (por exemplo, alergia) ao
  conversar com o cliente? Hoje ela não lê.
- (7d) Ao excluir um cliente com anamnese, a tela deve avisar que as fichas vão
  junto (regra 31), ou impedir?
- (7e) O desenho da assinatura na tela basta para o que o salão precisa, ou é
  preciso assinatura com validade jurídica mais forte (confirmação por código no
  WhatsApp, CPF, ou certificado digital por um serviço de terceiros)?
- (7e) O sistema deve mandar o link pelo WhatsApp do salão, em vez de só copiar?
  Na API oficial isso pede um modelo de mensagem aprovado.
- (7e) 30 dias de validade do link está bom? O salão deve poder escolher?
- (7e) O salão precisa assinar também (duas assinaturas no mesmo documento)?
- (7e) Faz falta imprimir ou baixar o documento assinado em PDF? Hoje se vê na
  tela (do salão e do cliente).
- (7e) Faz falta formatação no texto (negrito, títulos), outros campos (CPF,
  serviço, profissional) ou anexar a anamnese ao termo?
- (7e) Bloquear a exclusão do contato com documento assinado (regra 39) é o
  certo, ou o salão prefere que tudo saia junto, como na anamnese?
- (7e) O documento deve poder ser pedido automaticamente (por exemplo, antes do
  primeiro atendimento de um serviço)?
- (7f) **Salão que cobra sinal antecipado**: a página pública deve pedir o
  sinal (e como, sem pagamento online — fase 8), marcar como "aguardando
  sinal", ou simplesmente não existir para esse salão? Hoje marca sem sinal.
- (7f) O agendamento online deve entrar direto, ou esperar o salão aceitar?
  Hoje entra direto, como pendente (regra 52).
- (7f) É preciso confirmar o telefone por código no WhatsApp antes de marcar
  (regra 51)? Sem isso, qualquer pessoa pode marcar em nome de um telefone — e
  esse telefone recebe o lembrete do salão.
- (7f) Uma hora de antecedência e 30 dias de janela estão bons (regra 49)? E o
  teto de 3 agendamentos futuros por telefone?
- (7f) O cliente deve poder escolher "qualquer profissional"? E marcar mais de
  um serviço de uma vez?
- (7f) Todos os serviços ativos aparecem na página. O salão precisa esconder
  alguns (por exemplo, os "sob avaliação")?
- (7f) O cliente deve poder cancelar ou remarcar pelo link?
- (7f) O salão quer um endereço curto (`/agendar/nome-do-salao`), logo e
  endereço na página?
- (7f) O salão deve ser avisado na hora (no painel ou no WhatsApp) quando entra
  um agendamento pela página?
- (7f) No plano SOLO a tela do salão marca tudo para o profissional do dono; a
  página pública lista os profissionais ativos que fazem o serviço. Está certo?

### 11.5 Telas

- **Ficha do cliente (7a)**: cartão "Dados cadastrais", acima de Vendas —
  nascimento (com idade e "Aniversário hoje"), CPF, gênero, endereço numa linha e
  "como conheceu"; ficha vazia mostra um aviso. "Editar" troca o cartão pelo
  formulário (onze campos) no lugar.
- **Agenda (7b)**: botão "Etiquetas" no cabeçalho abre o diálogo das etiquetas do
  salão (lista com quantos agendamentos usam cada uma, criar, alterar a cor e o
  nome, excluir). Os cartões do dia e da semana mostram a etiqueta como um selo
  colorido embaixo do nome do cliente.
- **Detalhe do agendamento (7b)**: campo "Etiqueta" (aparece quando o salão tem
  etiquetas) e botão "Remarcar", que pede a nova data e a nova hora.
- **Novo agendamento (7c)**: caixa "Repetir este agendamento", que abre "A cada
  [1 a 8 semanas]" e "Quantas vezes [2 a 12]". Ao criar, o aviso diz quantos
  entraram e, se alguma data não coube, lista as datas e fica na tela até ser
  fechado.
- **Detalhe do agendamento (7c)**: linha "Recorrência — faz parte de uma série, a
  cada N semanas"; ao cancelar, a caixa "Cancelar também os próximos desta
  série".
- **Ficha do cliente (7d)**: cartão "Anamneses", logo abaixo dos dados
  cadastrais, só para quem tem a permissão. Mostra o que dá para responder (um
  botão quando há um modelo; uma lista quando há mais), o formulário do modelo
  escolhido e o histórico — cada ficha abre para mostrar pergunta e resposta.
- **Modelos de anamnese (7d)**: janela aberta por "Modelos" no cartão. Lista os
  modelos (perguntas, fichas respondidas, "Inativo") e edita: nome, ativo, e as
  perguntas com texto, tipo, obrigatória, opções (uma por linha) e ordem.
- **Ficha do cliente (7e)**: cartão "Documentos", abaixo das anamneses, só para
  quem tem a permissão. "Gerar" (com a lista de modelos quando há mais de um)
  cria o documento e copia o link. Cada documento mostra a situação (Aguardando
  assinatura, Assinado, Link vencido), "Copiar link" enquanto dá para assinar,
  ver e excluir. Ver abre o texto e, se assinado, a assinatura, o nome, a data,
  o IP e o navegador, além do SHA-256.
- **Modelos de documento (7e)**: janela aberta por "Modelos" no cartão: nome,
  ativo e o texto, com a lista dos campos aceitos.
- **Página pública (7e)** (`/assinar/<token>`, sem login): nome do salão, título
  e texto; o formulário de assinatura (nome, quadro para desenhar com "Limpar",
  "li e concordo"); depois de assinado, a assinatura e a data. Link desconhecido
  ou vencido mostra um aviso.
- **Página pública de agendamento (7f)** (`/agendar/<id do salão>`, sem
  login): nome do salão; serviço (com duração e preço); profissional, quando
  há mais de um; dia (de hoje a 30 dias); os horários livres em botões; nome e
  WhatsApp; "Marcar para DD/MM/AAAA às HH:mm". Depois: "Horário marcado", com
  serviço, profissional, dia e hora. Salão sem o módulo, ou id desconhecido:
  "Agendamento online indisponível".
- **Agenda (7f)**: botão "Link online", que copia o endereço da página — só
  com o módulo `online_booking` ligado.

### 11.6 Onde está o código

| Parte | Arquivos |
|---|---|
| Ficha do cliente (7a) | Migration `059_customer_profile.sql`; colunas em `customers` (`schema.ts`); regra em `domain/customer-profile.ts` (`planCustomerProfile`, `isValidCpf`, `maskCpf`, `customerAge`, `isBirthday`, `formatCustomerAddress`); I/O em `services/customer-profile.service.ts`; action em `actions/customer-profile.ts`; `getCustomerDetail` (`actions/customers.ts`) devolve `profile` e `canEditProfile`; cartão em `components/contacts/customer-profile-card.tsx`; testes em `customer-profile-domain.test.ts` |
| Etiquetas e remarcar (7b) | Migration `060_appointment_labels.sql`; tabela `appointmentLabels` e `appointments.labelId`; regra em `domain/appointment-labels.ts` (`planAppointmentLabel`, `labelTextColor`); I/O em `services/appointment-labels.service.ts`; actions em `actions/appointment-labels.ts`; `rescheduleAppointment` em `actions/appointments.ts` (chama `updateAppointmentService`); a consulta da grade (`lib/repositories/appointment.repository.ts`) traz a etiqueta; telas em `components/scheduler/` (`appointment-labels-dialog.tsx`, `appointment-detail-dialog.tsx`, `scheduler-view.tsx`, `daily-scheduler.tsx`, `weekly-scheduler.tsx`); testes em `appointment-labels-domain.test.ts` |
| Recorrência (7c) | Migration `061_appointment_series.sql`; tabela `appointmentSeries` e `appointments.seriesId`; regra em `domain/appointment-series.ts` (`planAppointmentSeries`, `addCalendarDays`, `describeSeriesOutcome`); I/O em `services/appointment-series.service.ts` (`createAppointmentSeriesService` repete o `createAppointmentService`; `cancelAppointmentSeriesService` repete o `cancelAppointmentService`); actions `createAppointmentSeries` e `cancelAppointmentSeries` em `actions/appointments.ts`, com o portão de criação extraído para `authorizeAppointmentCreation`; telas em `components/scheduler/create-appointment-dialog.tsx` e `appointment-detail-dialog.tsx`; testes em `appointment-series-domain.test.ts` |
| Anamneses (7d) | Migration `062_anamneses.sql`; tabelas `anamnesisTemplates` e `customerAnamneses`; regra em `domain/anamneses.ts` (`planAnamnesisTemplate`, `planAnamnesisAnswers`, `parseAnamnesisQuestions`, `parseAnamnesisAnswers`, `formatAnamnesisAnswer`); I/O em `services/anamneses.service.ts`; actions em `actions/anamneses.ts` (na guarda de `actions-authz.test.ts`); permissão `customers.anamneses` em `domain/permissions.ts`, com rótulo em `permissions.constants.ts`; telas em `components/contacts/customer-anamneses-card.tsx` e `anamnesis-templates-dialog.tsx`; testes em `anamneses-domain.test.ts` |
| Documentos com assinatura (7e) | Migration `063_customer_documents.sql`; tabelas `documentTemplates` e `customerDocuments`; regra em `domain/customer-documents.ts` (`planDocumentTemplate`, `renderDocument`, `documentStatus`, `planDocumentSignature`, `isDocumentToken`); I/O em `services/customer-documents.service.ts` (as duas funções públicas no fim do arquivo); actions em `actions/customer-documents.ts` (na guarda de `actions-authz.test.ts`) e `actions/public-documents.ts` (pública, FORA da guarda de propósito); permissão `customers.documents`; telas em `components/contacts/customer-documents-card.tsx` e `document-templates-dialog.tsx`; página pública em `app/assinar/[token]/`; a trava de exclusão em `deleteSalonCustomer` (`actions/customers.ts`); testes em `customer-documents-domain.test.ts` |
| Agendamento online (7f) | Sem migration; módulo `online_booking` em `domain/permissions.ts`; a conta em `domain/booking-slots.ts` (`computeDaySlots`, a régua de dia em Brasília, `onlineBookingNotBefore`, `planOnlineBookingCustomer`); I/O em `services/online-booking.service.ts` (`listProfessionalDaySlotsService` e as três funções públicas); actions em `actions/public-booking.ts` (públicas, FORA da guarda de `actions-authz.test.ts` de propósito); página em `app/agendar/[salonId]/`; o botão do link em `components/scheduler/scheduler-view.tsx`; testes em `booking-slots-domain.test.ts` |

### 11.7 Fatia 7a — estado (18/nov/2026)

- Na branch `claude/fase-7-cliente-agenda`, publicada. Typecheck (db, web e
  mcp-server), lint dos arquivos novos e testes passando (web 1278, db 296,
  mcp-server 409).
- **Migration 059 aplicada em produção em 18/nov/2026** (registrada como
  `customer_profile`). Cópia antes: `backups.customers_pre_059_20261118` (1.796
  linhas). Conferido por leitura: as onze colunas, os 1.796 clientes e o índice
  de CPF. Antes de aplicar, saiu do CHECK do banco o "nascimento não pode ser no
  futuro": dependia da data do dia, e a regra já está no código.
- **Endereço do preview:** o nome da branch é longo e a Vercel encurta o alias
  com um código (`…-git-claude-fase-7-clie-57d368-…`); o endereço montado à mão
  não existe.
- **Sem módulo.** A ficha do cliente é do produto base: o cartão aparece em todos
  os salões assim que o código for publicado.
- **Correção junto, em código antigo — e o que o teste mostrou:** o servidor
  (`updateSalonCustomer`) apagava o `preferences` INTEIRO quando a observação
  chegava vazia, inclusive o que a IA tinha aprendido. **Pela tela isso não
  acontecia**: o diálogo de edição mandava "nada mudou" quando o campo ficava
  vazio, então o defeito visível era outro — não dava para apagar uma observação
  nem um e-mail. Ficou assim: o diálogo manda o campo vazio quando ele tinha
  valor, e o servidor apaga só aquele dado. Vale para todos os salões.
- **`actions/customer-profile.ts` entrou na guarda de autorização**;
  `actions/customers.ts` (antigo) continua fora dela, com o padrão anterior.
- **Testada em uso em 18/nov/2026**, no preview da branch, no salão de teste.
  Passou:
  - a ficha abre com o cartão vazio e o aviso;
  - CPF com dígito verificador errado → "CPF inválido"; nascimento no futuro →
    recusado;
  - gravar nascimento, CPF, gênero, CEP, endereço, cidade, UF e "como conheceu" →
    o cartão mostra a data com a idade (36 anos) e "Aniversário hoje", o CPF
    formatado e o endereço numa linha, com os espaços dobrados enxugados;
  - o mesmo CPF em outro cliente → "Já existe outro cliente com esse CPF neste
    salão";
  - apagar todos os campos e gravar → cartão vazio de novo;
  - na lista, esvaziar a observação de um contato que tinha observação e mais
    uma chave no `preferences` → sai só a observação, a outra chave fica, e os
    dados cadastrais não são tocados.
- **Não testado em uso:** o CPF mascarado e a falta do "Editar" para quem não tem
  `customers.edit` (só há o usuário dono no salão de teste); criar cliente pela
  lista e pelo WhatsApp depois da migration (nenhum cliente novo foi criado no
  teste — a criação só foi exercitada pelo typecheck); apagar o e-mail pelo
  diálogo; complemento e bairro; a ficha de um cliente de outro salão.
- Dados de teste limpos: os dados cadastrais apagados pela própria ficha; a
  chave de teste posta no `preferences` por SQL, e tirada por SQL, pelo ID da
  cliente. Conferido por leitura: nenhum cliente com dado cadastral, e os
  clientes do salão de teste idênticos à cópia de antes.

### 11.8 Fatia 7b — estado (18/nov/2026)

- Na branch `claude/fase-7-cliente-agenda`, publicada. Typecheck (db, web e
  mcp-server), lint (nenhum erro novo nos arquivos alterados) e testes passando
  (web 1293, db 296, mcp-server 409).
- **Migration 060 aplicada em produção em 18/nov/2026** (registrada como
  `appointment_labels`). Cópia antes: `backups.appointments_pre_060_20261118`
  (181 linhas). Conferido por leitura: os 181 agendamentos, a tabela nova com RLS
  e sem acesso para `anon`/`authenticated`.
- **O worker da IA também grava em `appointments`.** Ele roda outra cópia do
  código; com a migration aplicada, tanto a versão antiga (que não conhece a
  coluna) quanto a nova funcionam.
- **Sem módulo.** A agenda é do produto base: o botão "Etiquetas", o campo no
  detalhe e o "Remarcar" aparecem em todos os salões assim que o código for
  publicado.
- **Remarcar não tem código novo de regra**: a action só confere quem pode e o
  status, e chama o `updateAppointmentService` que a IA já usa. Os achados da
  §11.2 valem aqui também — ele aceita marcar dentro do intervalo de almoço e não
  lê folgas.
- **Limites desta fatia:** não se escolhe a etiqueta ao criar o agendamento; a
  visão mensal não mostra a etiqueta; não há filtro por etiqueta; remarcar não
  troca profissional nem serviço e não avisa o cliente; o formulário de remarcar
  pede a hora digitada, sem mostrar horários livres (como o de criar).
- **Testada em uso em 18/nov/2026**, no preview da branch, no salão de teste.
  Passou:
  - o botão "Etiquetas" abre o diálogo vazio; criar duas etiquetas (amarela e
    azul); o mesmo nome com outra caixa não entra (conferido por leitura: só as
    duas no banco — o texto do aviso não foi capturado); trocar a cor de uma;
  - criar agendamento pela tela DEPOIS da migration funciona (dois criados, os
    dois espelhados no Google);
  - no detalhe, pôr a etiqueta → "Etiqueta aplicada" e o selo aparece no cartão
    da semana; a lista de etiquetas passa a mostrar "1 agendamento";
  - remarcar para o passado → "Não é possível reagendar para um horário que já
    passou"; remarcar de quinta 14h para sexta 15h → o cartão muda de lugar e a
    etiqueta continua nele;
  - remarcar para cima de outro agendamento do mesmo profissional → recusado (o
    diálogo fica aberto e o horário não muda — o texto do aviso não foi
    capturado);
  - excluir a etiqueta em uso → o agendamento fica sem etiqueta e continua de
    pé; sem nenhuma etiqueta no salão, o campo "Etiqueta" some do detalhe.
- **Não testado em uso:** tirar a etiqueta pelo campo ("Sem etiqueta"); o selo na
  visão do dia (só a semana foi olhada); o limite de 30 etiquetas; furar a regra
  de dia e horário do serviço ao remarcar; "Remarcar" ausente em agendamento
  concluído; remarcar por um profissional que não é dono (só há o usuário dono);
  remarcar com agenda oficial — **o salão de teste não tem Belasis**, só o Google
  Calendar; e a IA criando agendamento depois da migration (o worker).
- Dados de teste limpos pela tela: as duas etiquetas excluídas e os dois
  agendamentos cancelados (ficam no histórico da cliente de teste como
  cancelados, e saíram do Google). Conferido por leitura: nenhuma etiqueta,
  nenhum agendamento etiquetado, e os 181 agendamentos de antes iguais à cópia.

### 11.9 Fatia 7c — estado (18/nov/2026)

- Na branch `claude/fase-7-cliente-agenda`, publicada (preview da Vercel; não
  está na `main`). Typecheck (db, web e mcp-server), lint (nenhum erro novo nos
  arquivos alterados) e testes passando (web 1304, db 296, mcp-server 409).
- **Migration 061: aplicada em produção em 18/nov/2026** (registrada como
  `appointment_series`), ANTES de publicar o código. Cópia anterior em
  `backups.appointments_pre_061_20261118` (183 linhas); depois de aplicar, os
  agendamentos conferem com a cópia e nenhum tem série. Ela acrescenta
  `series_id` a `appointments`: quem publicar este código em outro banco
  precisa aplicar a 061 antes, ou a criação de agendamento quebra.
- **Mexe no caminho de criar agendamento pela tela, para todos os salões:** o
  trecho que confere quem pode criar (dono ou profissional ativo, e a troca de
  profissional no plano SOLO) saiu de dentro do `createAppointment` para a
  função `authorizeAppointmentCreation`, sem mudar a regra, para a série passar
  pelo mesmo portão. O agendamento avulso continua chamando o mesmo serviço.
- **Sem módulo.** A caixa "Repetir" aparece em todos os salões assim que o código
  for publicado.
- **Sem regra de agenda nova**: a série só repete o `createAppointmentService` e
  o `cancelAppointmentService`. Os achados da §11.2 valem para cada data.
- **Limites desta fatia:**
  - as datas são criadas uma depois da outra, cada uma com as suas conferências
    (e a gravação na agenda oficial, onde houver). Doze datas num salão com
    Belasis podem demorar; não medi;
  - se a tela cair no meio, ficam criados os que já tinham entrado, avulsos (a
    série só é amarrada no fim);
  - a grade não marca visualmente o agendamento de série; só o detalhe mostra;
  - a IA não conhece séries: vê e mexe em cada agendamento isolado.
- **Testada em uso em 18/nov/2026**, no preview, no salão de teste:
  - agendamento avulso continua sendo criado depois da 061;
  - série a cada 1 semana, 3 vezes → três agendamentos, no mesmo dia da semana e
    hora, amarrados na mesma série, com quem criou gravado;
  - série que esbarra num horário ocupado → aviso "2 agendamentos criados. Não
    coube: 26/11/2026 (…)", que fica na tela; os dois que couberam viram série;
  - série cuja primeira data não cabe → nada é criado, o formulário fica aberto
    com o erro;
  - detalhe mostra "Recorrência — faz parte de uma série, a cada semana"; o
    avulso não mostra, nem oferece "cancelar os próximos";
  - remarcar um da série muda só ele;
  - cancelar o segundo com "também os próximos" → o primeiro fica, o segundo e o
    terceiro são cancelados, a outra série não é tocada.
- **O que o teste mostrou e não é desta fatia:**
  - o salão de teste está no plano SOLO: o formulário deixa escolher outro
    profissional, e o agendamento é gravado para o profissional do dono, sem
    aviso (regra antiga; a série segue a mesma troca);
  - o motivo de conflito que apareceu foi "conflito com Google Calendar", porque
    o agendamento que ocupava o horário já tinha ido para o Google do salão;
  - o formulário lembra o "Quantas vezes" da série anterior enquanto a tela não
    é recarregada.
- **Não testado em uso:** salão com agenda oficial (Belasis), série longa (tempo
  de 12 datas), furar a regra de dia e horário do serviço numa série, usuário
  que não é o dono, e a IA criando agendamento depois da 061.
- **Ficou no salão de teste:** seis agendamentos cancelados com observação
  "TESTE 7c…" e duas séries (histórico, como os da 7b).

### 11.10 Fatia 7d — estado (18/nov/2026)

- Na branch `claude/fase-7-cliente-agenda`, publicada (preview da Vercel).
  Typecheck (db, web e mcp-server), lint (nenhum erro novo nos arquivos
  alterados) e testes passando (web 1324, db 296, mcp-server 409).
- **Migration 062: aplicada em produção em 18/nov/2026** (registrada como
  `anamneses`). Só cria duas tabelas; não mexe em nenhuma existente, então não
  houve cópia antes. Conferido depois: RLS ligado, policy `deny_all`, sem
  privilégio para anon/authenticated, e nenhum aviso novo nos advisors de
  segurança.
- **Sem módulo.** O cartão aparece em todos os salões assim que o código for
  publicado, para quem tem a permissão nova (regra 29).
- **Permissão nova no catálogo** (`customers.anamneses`): aparece na tela de
  perfis de acesso, desmarcada nos perfis que já existem.
- **Limites desta fatia:**
  - só quem atende responde; não há link para o cliente, nem assinatura;
  - sem pergunta condicional, data ou foto;
  - a ficha respondida não se edita, e não há impressão nem exportação;
  - a IA não lê anamnese;
  - a tela de excluir cliente não avisa que as anamneses vão junto;
  - os modelos só se abrem por dentro da ficha de um cliente.
- **Teste em uso (18/nov/2026)**, no preview da branch, no salão de teste, na
  ficha de um cliente, com o usuário dono:
  - cartão "Anamneses" sem modelo, e a janela "Modelos" vazia — ok;
  - modelo criado com os cinco tipos de pergunta e uma obrigatória — ok;
  - responder deixando a obrigatória em branco — recusa, com o aviso
    'Responda: "…"'; responder completo (com "Não" na obrigatória) — salva;
  - a ficha abre no histórico com as cinco respostas, as várias opções na ordem
    do modelo e a resposta longa com quebra de linha — ok;
  - texto de uma pergunta alterado no modelo — a ficha antiga continua com o
    texto do dia; o formulário novo mostra o texto novo — ok;
  - responder de novo — duas fichas, a mais recente em cima; o modelo mostra
    "2 fichas respondidas" — ok;
  - modelo desativado — some do "responder", aparece "Inativo" na lista de
    modelos, histórico fica — ok;
  - modelo excluído — histórico fica, com o nome do modelo — ok;
  - fichas de teste excluídas pela tela. As duas tabelas ficaram vazias.
- **Achado do teste:** com modelo cadastrado mas inativo, o cartão diz "Use
  Modelos para criar o primeiro" — o texto serve para "nenhum modelo", não para
  "nenhum ativo". Ajuste de texto, não feito.
- **Não testado:** usuário sem a permissão (o cartão some; só o dono existe no
  salão de teste), funcionário com perfil de acesso, a lista de escolha com
  mais de um modelo ativo, os limites (40 perguntas, 30 modelos), nome de
  modelo repetido, mudar a ordem das perguntas, e excluir um cliente com
  anamnese.

### 11.11 Fatia 7e — estado (18/nov/2026)

- Na branch `claude/fase-7-cliente-agenda`, publicada (preview da Vercel).
  Typecheck (db, web e mcp-server), lint (nenhum erro novo nos arquivos
  alterados) e testes passando (web 1351, db 296, mcp-server 409).
- **Migration 063: aplicada em produção em 18/nov/2026** (registrada como
  `customer_documents`), ANTES de publicar o código — sem ela, excluir contato
  falharia, porque a exclusão consulta a tabela nova. Só cria duas tabelas,
  então não houve cópia antes. Conferido depois: RLS ligado, policy `deny_all`,
  sem privilégio para anon/authenticated, e nenhum aviso novo nos advisors de
  segurança.
- **Sem módulo.** O cartão aparece em todos os salões assim que o código for
  publicado, para quem tem a permissão nova (regra 38).
- **Segunda rota pública do sistema** (a primeira é `/avaliar`). Como lá, não
  há limite de tentativas por endereço: a proteção é o tamanho do token.
- **Limites desta fatia:**
  - o sistema não envia o link; quem atende copia e manda;
  - sem conferência de identidade de quem assina, e sem certificado digital;
  - só o cliente assina; o salão não assina;
  - texto sem formatação, três campos, sem anexo;
  - sem PDF, impressão dedicada nem exportação;
  - documento não é pedido automaticamente, e não aparece na agenda nem na
    comanda;
  - a trava de exclusão vale para `deleteSalonCustomer`; outro caminho que
    apague cliente direto no banco leva os documentos junto (CASCADE);
  - os modelos só se abrem por dentro da ficha de um cliente.
- **Teste em uso (18/nov/2026)**, no preview da branch, no salão de teste, na
  ficha de um cliente, com o usuário dono:
  - cartão "Documentos" sem modelo, e a janela "Modelos" vazia — ok;
  - modelo com `{{cpf}}` — recusa: "O campo {{cpf}} não existe. Os campos
    são: …"; com os três campos válidos — criado;
  - "Gerar" — o documento aparece como "Aguardando assinatura", com quem gerou
    e "vale até" 30 dias depois; aviso de link copiado;
  - link inventado — "Link inválido";
  - o link do documento — nome do salão, título e o texto com cliente, salão e
    data preenchidos, e o SHA-256;
  - assinar sem nome, sem desenho e sem o "li e concordo" — três recusas, cada
    uma com o seu aviso; o quadro desenha com o mouse;
  - assinar — a página passa a mostrar a assinatura, o nome e a data;
  - na ficha — "Assinado em … por …"; o ver mostra o texto, a imagem da
    assinatura (PNG 600×200, cerca de 8 mil caracteres), o IP, o navegador e o
    SHA-256, que confere com o recalculado no banco;
  - modelo alterado e desativado — o documento assinado não mudou; o cartão
    deixa de oferecer "Gerar"; a lista de modelos mostra "Inativo" e "1
    documento gerado";
  - excluir o contato — recusa: "Este contato tem documento assinado. Exclua os
    documentos na ficha dele antes de remover o contato"; o contato continua;
  - documento assinado excluído pela tela (o dono tem as duas permissões); o
    link dele passa a dizer "Link inválido"; modelo excluído. As duas tabelas
    ficaram vazias.
- **Não testado:**
  - **o link sem login de verdade**: o preview fica atrás do login da Vercel, e
    o navegador do teste estava logado no painel. Em produção a rota é pública
    como `/avaliar`; falta abrir num aparelho sem sessão;
  - assinar com o dedo, no celular;
  - a segunda assinatura no mesmo link (recusa no servidor; só há teste de
    regra) e o link vencido (só existe com o tempo);
  - usuário sem a permissão, funcionário com perfil de acesso, e excluir
    documento assinado sem `customers.delete`;
  - a lista de escolha com mais de um modelo ativo, os limites (30 modelos, 10
    pendentes, texto de 20.000 caracteres) e nome de modelo repetido;
  - se o link foi mesmo para a área de transferência (o aviso apareceu).

### 11.12 Fatia 7f — estado (18/nov/2026)

- Na branch `claude/fase-7-cliente-agenda`, publicada (preview da Vercel).
  Typecheck (db, web e mcp-server), lint (nenhum erro novo nos arquivos
  alterados) e testes passando (web 1368, db 296, mcp-server 409).
- **Sem migration.** Publicar não muda nada para nenhum salão: o módulo
  `online_booking` nasce desligado. **Está ligado só no salão de teste**
  (UPDATE em `salons.settings`, pelo id, em 18/nov/2026) — e ficou ligado.
- **O que esta fatia NÃO mexeu, de propósito:** o cálculo de horários da IA
  (regra 43), o `createAppointmentService` (continua aceitando marcar dentro do
  intervalo quando chamado pela tela do salão ou pela IA) e a tela de criar
  agendamento do salão (continua pedindo a hora digitada).
- **Terceira rota pública do sistema** (`/avaliar`, `/assinar`, `/agendar`), e
  a primeira que CRIA agendamento e cadastro de cliente sem login.
- **Riscos conhecidos, aceitos nesta fatia:**
  - sem confirmação do telefone, dá para marcar com o telefone de outra
    pessoa; ela receberia o lembrete do salão. O teto é de 3 por telefone;
  - sem limite de tentativas por endereço de internet: um robô pode encher a
    agenda usando telefones diferentes. O módulo é opt-in por isso;
  - Google e agenda oficial fora do ar: a página mostra o horário, e a criação
    barra (agenda oficial) ou deixa passar (Google), como já é na IA;
  - `schedule_overrides` passa a ser lido aqui, mas continua sem tela para
    criar folga, e a criação continua sem conferi-lo.
- **Limites desta fatia:** um serviço por agendamento; sem "qualquer
  profissional"; sem cancelar nem remarcar pelo cliente; sem aviso ao salão
  além do agendamento aparecer na agenda; sem pagamento de sinal (fase 8); sem
  logo, endereço nem endereço curto.
- **Teste em uso (18/nov/2026)**, no preview da branch, no salão de teste:
  - id desconhecido — "Agendamento online indisponível";
  - a página do salão — 12 serviços, com duração e preço (valor ou faixa);
  - serviço com um profissional só — a página não pergunta o profissional e
    mostra "Dia · com <nome>"; o campo de dia vai de hoje a 30 dias;
  - sexta, expediente das 10h às 18h, serviço de 1h, com um bloqueio de teste
    em `schedule_overrides` das 12h às 13h — horários de 10:00 a 11:00 e de
    13:00 a 17:00, de 15 em 15 minutos: nada encosta no bloqueio e o último
    cabe no expediente;
  - telefone inválido (dígitos repetidos) — recusa do servidor, com o aviso;
  - marcar às 14:00 com telefone novo — "Horário marcado"; no banco, o
    agendamento certo (14:00 de Brasília, pendente, com a observação) e o
    cadastro novo, com o telefone no formato do WhatsApp;
  - recarregar — 13:15 a 14:45 saíram da lista;
  - marcar às 10:00 com o MESMO telefone em outro formato e outro nome — um
    cadastro só, e o nome dele não mudou;
  - na agenda do salão — os dois agendamentos, com a observação no detalhe, e
    o botão "Link online"; os dois foram espelhados no Google;
  - os dois cancelados pela tela.
- **Achados do teste:**
  - **o sinal antecipado do salão não é cobrado pela página.** O salão de
    teste tem `advance_payment` ligado (a IA pede o PIX antes de marcar); a
    página pública marca sem ele. Salão que exige sinal não deve ligar o
    módulo até isso ser decidido (§11.4);
  - serviço com preço simbólico (R$ 0,01, usado como "a combinar") aparece
    com esse valor na página;
  - o bloqueio de `schedule_overrides` tira o horário da página, mas não
    aparece na agenda do salão (não há tela para ele);
  - depois de um erro de nome ou de telefone, a página fazia o cliente
    escolher o horário de novo — corrigido depois do teste.
- **Não testado:**
  - **a página sem login de verdade** (o preview fica atrás do login da
    Vercel) e no celular;
  - intervalo (almoço) cadastrado — o salão de teste não tem; há teste de
    regra;
  - serviço com mais de um profissional, com dias ou horários próprios, e dia
    sem expediente;
  - hoje com uma hora de antecedência (o teste foi à noite);
  - dois pedidos para o mesmo horário ao mesmo tempo, e o campo-isca;
  - salão com agenda oficial (Belasis) e o que ela recusa;
  - se o link foi mesmo para a área de transferência.
- **Teto de 3 agendamentos por telefone — coberto depois (18/nov/2026):** a
  comparação saiu do serviço para `onlineBookingLimitError`
  (`domain/booking-slots.ts`), com teste da fronteira (2 passa, 3 recusa,
  contagem inválida recusa). Em uso, no preview: com dois agendamentos futuros
  do cliente de teste (inseridos por SQL, pelo id), o terceiro entrou pela
  página e o quarto foi recusado com "Este telefone já tem 3 horários
  marcados. Fale com o salão para marcar mais"; no banco ficaram exatamente
  três. No mesmo teste, a correção do formulário foi conferida: depois de um
  erro de telefone, o horário escolhido e os campos continuaram.
- **Achado:** `/schedule?date=` não leva a agenda para a semana pedida; ela
  abre na semana de hoje.
- **Ficou no salão de teste:** o cadastro "Cliente Teste Sete F" com três
  agendamentos cancelados. O bloqueio de teste e os dois agendamentos
  inseridos por SQL foram apagados.

## 12. Pendências do dono

| Pendência | Trava |
|---|---|
| Respostas às perguntas da §5.3 | Fase 1c |
| Qual plano inclui cada módulo | Liberação comercial (não trava o piloto) |
| Em qual salão sem Belasis pilotar | Fase 1 em produção |
| Conta Belasis de teste para executar fluxos | Fidelidade das regras nas fases 2 a 5 |
| Provedor de pagamento e provedor fiscal | Fases 8 e 10 |
| Respostas às perguntas da §6.3 (baixa de cartão, retroativo, quem vê) | Fatias 2d em diante |
| Respostas às perguntas da §7.3 (item × percentual geral, liberação parcial, comissão paga, auxiliar, data de corte, conta obrigatória, recibo, padrão de quem arca com o custo, onde editar o custo adicional) | Ajustes na fase 3 antes do piloto |
| Respostas às perguntas da §8.3 (venda sem saldo, custo médio, campos no cadastro, estoque ideal, edição de compra, rateio de frete, permissão de fornecedores, lote calculado ou escolhido, prazo do aviso de validade, consumo do cadastro ou informado na comanda, o que abate a comissão na 3e) | Ajustes na fase 4 antes do piloto; fatia 3e |
| Dizer quando as cópias `backups.products_pre_045_20261116`, `backups.products_pre_046_20261116`, `backups.products_pre_048_20261117`, `backups.services_pre_049_20261117`, `backups.commission_settings_pre_049_20261117`, `backups.products_pre_050_20261117`, `backups.sale_items_pre_051_20261117`, `backups.sale_items_pre_052_20261117`, `backups.customer_package_items_pre_052_20261117`, `backups.sale_items_pre_053_20261117`, `backups.sales_pre_054_20261117`, `backups.sales_pre_055_20261117` e `backups.sale_items_pre_055_20261117` podem ser apagadas | Limpeza do schema `backups` |
| Respostas às perguntas da §9.3 (tela própria de venda de pacote, edição do pacote vendido, comissão na venda ou no uso, valor da sessão e rateio, pacote vencido, multiunidade, percentual de comissão da sessão; na 5c: o que o assinante leva, fiado, renovação atrasada, mudança de valor do plano, comissão, permissão própria, aviso de vencimento; na 5d: assinatura e uso do pacote na conversa do agente, saldo a entregar e exportação nos relatórios) | Ajustes na fase 5 antes do piloto |
| Testar o saldo de pacote na conversa do agente, por um WhatsApp de teste do salão de teste, quando o código estiver no ambiente do worker — ver §9.10 | Liberar o módulo de pacotes em salão com agente em produção |
| Respostas às perguntas da §10.3 (validade do cashback, base do ganho, comissão em comanda paga com cashback, pacote e assinatura, fiado, cashback no financeiro; na 6b: o que o cupom desconta, limite de usos, soma com o desconto à mão, comissão, promoção por profissional, cupom no WhatsApp; na 6c: avaliação por comanda ou por profissional, envio pelo WhatsApp, validade do link, quem vê, resposta do salão) | Ajustes na fase 6 antes do piloto |
| Com a fase 6 em produção, no salão de teste: ativar as avaliações, faturar uma comanda e abrir o link de avaliação numa janela anônima — ver §10.9 | Confirmar que o formulário de avaliação é mesmo público |
| Com a fase 6 em produção, no salão de teste: cadastrar uma mensagem de cuidados de depois (0 dias), faturar uma comanda de um cliente com WhatsApp de teste e esperar a rodada do cron (a cada 30 min, das 9h às 20h) — ver §10.10 | Saber se a mensagem chega ao cliente e cai na conversa |
| Zerar os 152 erros de lint do `apps/web` (ou tirar o lint do caminho obrigatório do CI) — ver §10.13 | O CI falha em todo PR e não chega a rodar tipos nem build |
| Responder às perguntas da 6d em §10.3 (prazos e horário, retorno para quem já remarcou, abas na ficha, modelos da Meta, convívio com a retenção por IA) | Ajustes na 6d antes do piloto |
| Responder às perguntas da 6e em §10.3 (indicadores, vendido ou recebido, quem vê a meta, meta e comissão) | Ajustes na 6e antes do piloto |
| Testar pelo WhatsApp do salão de teste as duas tools do agente: saldo de pacote (fase 5) e saldo de cashback (6f) — ver §10.12 | Saber se a IA responde certo sobre pacote e cashback |
| Responder às perguntas da 7a em §11.4 (campos obrigatórios, campos que faltam, CPF mascarado, aniversariantes, IA e nascimento) | Ajustes na 7a antes do piloto |
| Responder às perguntas da 7b em §11.4 (uma ou várias etiquetas, cor do cartão, trocar profissional ao remarcar, avisar o cliente) | Ajustes na 7b antes do piloto |
| Responder às perguntas da 7c em §11.4 (limites da repetição, o que fazer com data que não cabe, séries pela IA, aviso ao cliente) | Ajustes na 7c antes do piloto |
| Responder às perguntas da 7d em §11.4 (quem vê anamnese, corrigir ficha, link para o cliente e assinatura, tipos de pergunta, IA, excluir cliente) | Ajustes na 7d antes do piloto |
| Marcar "Anamneses" nos perfis de acesso de quem deve ver e preencher | Funcionário com perfil usar as anamneses |
| Abrir um link de `/assinar` num celular sem login no painel, depois que a fase 7 estiver em produção, e assinar com o dedo | Confirmar a página pública de assinatura |
| Responder às perguntas da 7e em §11.4 (força da assinatura, envio pelo WhatsApp, validade do link, PDF, exclusão de contato) | Ajustes na 7e antes do piloto |
| Marcar "Documentos" nos perfis de acesso de quem deve gerar e ver documentos | Funcionário com perfil usar os documentos |
| Ter o texto dos termos do salão revisado por quem entende (advogado), antes de usar com clientes | Uso dos documentos no piloto |
| Abrir `/agendar/<id>` num celular sem login no painel, depois que a fase 7 estiver em produção, e marcar um horário | Confirmar a página pública de agendamento |
| Responder às perguntas da 7f em §11.4 (entrar direto ou esperar aceite, confirmar o telefone, janela e teto, esconder serviços, cancelar pelo link) | Ligar o agendamento online num salão de verdade |
| Decidir quando trocar o cálculo de horários da IA para o cálculo novo (regra 43) — pede teste com o worker e conversa de verdade | Um cálculo só no sistema inteiro |
| Aplicar a migration 064 (ou autorizar a aplicação), publicar a fatia 9a e ligar o módulo `reports` no salão de teste — ver §13.6 | Teste em uso da fatia 9a |
| Responder às perguntas da fase 9 em §13.4 (colunas e filtros de cada relatório, exportação, favoritos, permissão por categoria) | As fatias 9b a 9e |
| Marcar "Relatórios — Acessar" nos perfis de acesso de quem deve ver a central | Funcionário com perfil usar a central |
| Responder às perguntas da 9b em §13.4 (custo do dia ou de hoje, consumo no resultado, taxa por item, faixa de preço na projeção) | Ajustes na 9b antes do piloto |
| Responder às perguntas da 9c em §13.4 (guardar quem marcou, filtros, prazo de inatividade) | Ajustes na 9c antes do piloto |
| Responder às perguntas da 9d em §13.4 (faturado ou pago no ranking, pacote no ranking de vendas, "como conheceu" em lista) | Ajustes na 9d antes do piloto |
| Responder às perguntas da 9e em §13.4 (limite de baixa ocupação, folgas na ocupação, o que é frequência) | Ajustes na 9e antes do piloto |
| Abrir no Excel um CSV exportado dos relatórios e conferir acentos, colunas, valores como número e datas — ver §13.11 | Confirmar o formato da exportação |
| Responder às perguntas da 9f em §13.4 (PDF, exportar os relatórios antigos, permissão para exportar) | Ajustes na 9f antes do piloto |
| Autorizar publicar a fatia 9g — ver §13.13 | Teste em uso da fatia 9g |
| Responder às perguntas da multiunidade em §13.12 (gerente que vê todas as unidades, dado compartilhado, despesa organizacional, cobrança) | Decidir se o caminho B (entidade "organização") é necessário |
| Decidir o que fazer com os achados do levantamento da fase 7 (§11.2): folgas que ninguém lê, agendamento dentro do intervalo, dois cálculos de horários | Antes do agendamento online (7f) |
| Corrigir os dois problemas do plano SOLO (§6.8) | Salões SOLO com mais de um profissional |

## 13. Fase 9 — Relatórios e multiunidade

Responde: onde o dono olha os números. A auditoria lista 38 sub-relatórios em
oito categorias, um painel de profissionais, os favoritos e a organização com
unidades — mas **nenhum relatório teve as colunas de saída lidas** (a auditoria
só viu os filtros). Colunas e totais são decididos aqui, fatia a fatia.

A fase vem antes da 8 (pagamento online) na ordem do dono (§1).

### 13.1 Fatias

| Fatia | O que entra | Estado |
|---|---|---|
| 9a | Central de relatórios: o catálogo dos 38, apontando para a tela que já responde a cada um; "em breve" para o que falta; favoritos por pessoa | Feita — migration 064 aplicada, publicada na branch e testada em uso (§13.6) |
| 9b | Financeiro que falta: resultado líquido de serviços e de produtos, projeção de faturamento, extrato de contas | Feita, sem migration, publicada na branch e testada em uso (§13.7) |
| 9c | Agendamentos (todos, cancelados, origem, criação) e clientes (aniversariantes, inativos) | Feita, sem migration, publicada na branch e testada em uso (§13.8) |
| 9d | Vendas e ranking: produtos e serviços vendidos, lista de produtos e serviços, ranking de clientes, ranking de vendas, indicação de clientes | Feita, sem migration, publicada na branch e testada em uso (§13.9) |
| 9e | Painel de profissionais: clientes únicos, valor realizado, ticket médio, frequência, ocupação | Feita, sem migration, publicada na branch e testada em uso — a ocupação; o valor realizado não foi visto com comanda (§13.10) |
| 9f | Exportação (planilha) nos relatórios, num formato só | Feita, sem migration, publicada na branch e testada em uso; **o arquivo não foi aberto em Excel nem em Sheets** (§13.11) |
| 9g | Organização: membros com papel e unidades (multiunidade) | Caminho A feito em código, sem migration — **sem publicar e sem teste em uso** (§13.12 e §13.13) |

"Todas as notas fiscais" é da fase 10.

### 13.2 O que o levantamento encontrou (18/nov/2026)

- (Depois da fatia 9b, são 26 dos 38 com tela; depois da 9c, 32; depois da
  9d, 37 — só falta a nota fiscal, da fase 10. O painel de profissionais, que
  não é um dos 38, fica para a 9e.)
- **22 dos 38 sub-relatórios já têm uma tela que responde**, feita nas fases 2
  a 6: financeiro (resumo, lançamentos, caixa), estoque (saldo, relatórios,
  compras), pacotes (relatórios), cashback (histórico), avaliações, cuidados e
  retorno, comandas e contatos. Faltam 15, mais a nota fiscal (fase 10) e o
  painel de profissionais. (O levantamento contou 21; o teste em uso mostrou
  que o fluxo de caixa por dia já está no resumo do financeiro.)
- **"Já tem tela" não quer dizer "igual à Belasis"**: a tela responde à
  pergunta do relatório, com os filtros que a fase dela entregou. Vários
  relatórios caem na mesma tela (por exemplo, Recebimentos, Despesas e Extrato
  de movimentações caem nos lançamentos do financeiro).
- **Não havia tela de relatórios**, e a permissão `reports.access` já existia
  no catálogo sem proteger nada.
- **Só a lista de contatos exporta** (CSV). Os outros relatórios não exportam.
- **Não existe "unidade"**: cada salão é uma conta isolada (`salons`). A
  organização multiunidade da auditoria (membros com papel e unidades) não tem
  nada pronto; `professionals.person_key` só une a agenda da mesma pessoa
  entre salões.

### 13.3 Modelo de dados

**Migration 064 (fatia 9a)** — só tabela nova, não mexe em nenhuma existente:

- **`report_favorites`** — o relatório que UMA pessoa marcou, num salão:
  `salon_id`, `user_id` (os dois com CASCADE) e `report_key` (a chave do
  catálogo em código). Único por pessoa, salão e relatório.

### 13.4 Regras decididas

Fatia 9a — central de relatórios:

1. **O catálogo vive em código** (`domain/report-catalog.ts`): os 38
   sub-relatórios da auditoria e o painel de profissionais, cada um com a
   categoria, um resumo e — quando já existe — a tela que responde, com o
   módulo e a permissão dela.
2. **A central não calcula nada.** Ela aponta para a tela de destino, que
   continua conferindo o próprio módulo e a própria permissão.
3. **Cada pessoa vê o que abriria**: relatório com tela só aparece se o salão
   tem o módulo da tela ligado e a pessoa tem a permissão dela. O que ainda não
   existe aparece para todos como "Em breve", com a fatia prevista.
4. **Favoritos são da pessoa, no salão** (não do salão): até 20, na ordem em
   que foram marcados. Só o que já tem tela pode ser favorito. Favorito de uma
   tela que a pessoa deixou de abrir fica guardado, mas não aparece.
5. **Módulo `reports`**, desligado para todos, e permissão `reports.access`
   (que já existia). Dono e gerente sem perfil têm; funcionário sem perfil não.
6. **Não há permissão por categoria** (a Belasis tem "acessar por relatório"):
   quem decide o que cada um vê é a permissão de cada tela de destino.

Fatia 9b — relatórios financeiros:

7. **Resultado líquido de serviços e de produtos**, por período, pelo dia da
   comanda, só de comandas FATURADAS. Uma linha por serviço (ou produto):
   quantidade, receita, taxas, comissão, custo, resultado e margem. Quem mais
   rendeu vem primeiro.
   - **Receita**: o total do item, já com desconto e cupom.
   - **Taxas**: a taxa das formas de pagamento da comanda, repartida entre
     TODOS os itens dela (inclusive pacote e assinatura), na proporção do total
     de cada um, sem perder centavo.
   - **Comissão**: a que o item gerou (profissional e auxiliar).
   - **Custo**: no serviço, o custo fixo cadastrado nele; no produto, o custo
     de compra que ele tem HOJE × a quantidade. Produto sem custo entra com
     custo zero e o relatório avisa.
   - **Resultado** = receita − taxas − comissão − custo.
8. **O que o resultado líquido NÃO desconta**: o produto consumido no
   atendimento (consumo por serviço), despesas do salão (aluguel, salário) e o
   cashback. Item "do pacote" entra com receita zero e a comissão que gerou.
9. **Projeção de faturamento**, de hoje a 30 dias (até 120): por dia, quantos
   agendamentos, o valor agendado, o que vence a receber e a pagar, e o
   previsto (agendado + a receber − a pagar).
   - **Agendado**: o preço de tabela dos agendamentos pendentes e confirmados
     que ainda não viraram comanda faturada. Serviço com faixa entra pelo menor
     valor; "sob avaliação" não soma (aparece como "sem preço").
   - **A receber e a pagar**: os lançamentos em aberto, pelo vencimento, pelo
     valor líquido. O que já venceu fica fora dos dias, num aviso à parte.
   - Não conta desconto, falta, cancelamento nem o que ainda vai ser agendado.
10. **Extrato de contas**: uma conta por vez (a primeira ativa, se nenhuma for
    escolhida). Saldo anterior, as baixas do período pelo dia da baixa (a mais
    antiga primeiro), entrada ou saída pelo valor líquido, saldo corrido e saldo
    final. Transferências entram. O que está em aberto não aparece.
11. **Quem vê**: são números do financeiro — pedem o módulo `finance` e
    `finance.access`, além do módulo `reports`. `reports.access` sozinho abre
    a central, não estes relatórios.
12. **O relatório e os filtros vivem na URL**: dá para recarregar, mandar o
    link e marcar como favorito na central.

Fatia 9c — relatórios de agendamentos e de clientes:

13. **Todos os agendamentos**, por período, pelo dia do atendimento, de todos
    os profissionais: a contagem por situação (pendente, confirmado, concluído,
    falta, cancelado) e a lista com dia e hora, cliente, serviço, profissional e
    situação. Bloqueios de horário não entram.
14. **Agendamentos cancelados**, pelo dia em que o atendimento ia acontecer: a
    lista com quando foi cancelado, por quem e o motivo, e quantos ficaram sem
    motivo. "Por quem" só existe quando o cancelamento veio de alguém logado no
    painel.
15. **Origem dos agendamentos**: quatro linhas — anúncio, orgânico, "veio do
    Google Calendar" e "não se sabe" — com total, parte do total, concluídos,
    faltas, cancelados e comparecimento (concluídos ÷ os que já tiveram
    desfecho). A origem é a que o cliente tinha quando o agendamento foi criado.
    **O sistema não guarda quem marcou** (IA, painel ou página online): isso
    pediria uma coluna nova em `appointments`.
16. **Criação de agendamento**, pelo dia em que foi CRIADO: quantos por dia, a
    antecedência média e quatro faixas (no mesmo dia, 1 a 2 dias, 3 a 7, mais
    de 7). Conta todos, qualquer que seja a situação hoje.
17. **Aniversariantes**: por mês (sem mês, o de hoje), pelo dia, com a idade que
    a pessoa completa no ano. Só entra quem tem a data de nascimento na ficha
    (fatia 7a).
18. **Inativos**: quem já veio (atendimento concluído ou comanda faturada), não
    vem há N dias ou mais (30, 60, 90, 180 ou 365; padrão 60) e não tem horário
    marcado. Quem sumiu há menos tempo vem primeiro. Não usa o ciclo médio de
    cada serviço.
19. **Quem vê**: agendamentos pedem `schedule.view_all` (mostram a agenda de
    todos); clientes pedem `customers.access`, e o telefone só aparece — e só
    sai do banco — para quem tem `customers.view_phones`. Os dois pedem o
    módulo `reports`.

Fatia 9d — relatórios de vendas e rankings:

20. **Produtos e serviços vendidos**, por período, pelo dia da comanda, só de
    comandas FATURADAS: uma linha por item (serviço, produto, pacote ou
    assinatura), com quantidade, em quantas comandas apareceu, valor e parte do
    total; e o total por tipo. O que mais rendeu vem primeiro. Item usado de um
    pacote entra com valor zero.
21. **Ranking de clientes**: quem mais gastou no período — comandas, total,
    ticket médio (total ÷ comandas) e a última comanda. A lista mostra os 100
    primeiros; os cartões somam todos. Conta o que foi FATURADO, pago ou não.
22. **Ranking de vendas**, por profissional: serviços realizados (quantidade e
    valor) e produtos vendidos (quantidade e valor). Serviço conta para quem
    executou; produto, para quem vendeu; o auxiliar não entra. Produto sem
    vendedor fica em "Sem profissional", no fim. Pacote e assinatura não entram.
23. **Lista de produtos e serviços**: o catálogo como está hoje, ativos e
    inativos. Serviço: duração, preço (valor, faixa ou "sob avaliação") e custo
    fixo. Produto: código, preço, custo de compra, preço para profissional e se
    o estoque é controlado. Não mostra saldo nem comissão por item.
24. **Indicação de clientes**: o "como conheceu" (fatia 7a) dos clientes
    CADASTRADOS no período. O campo é texto livre: o relatório junta o que só
    difere por maiúscula, acento ou espaço, e mostra a grafia mais usada. A
    parte é calculada sobre quem informou.
25. **Quem vê**: vendidos e os dois rankings pedem o módulo `sales` e
    `sales.view_all` (leem todas as comandas). A lista pede `products.access`,
    e os serviços só entram para quem tem também `services.access`. Indicação
    pede `customers.access`. Todos pedem o módulo `reports`.

Fatia 9e — painel de profissionais:

26. **Uma linha por profissional**, no período (sem datas, o mês até hoje):
    clientes únicos, valor realizado, ticket médio, frequência, agendamentos e
    ocupação. Entra todo profissional ativo, e o inativo que teve venda ou
    agendamento no período. Quem mais realizou vem primeiro.
27. **Valor realizado, clientes únicos, ticket e frequência saem das comandas
    FATURADAS**, pelo dia da comanda: serviço conta para quem executou, produto
    para quem vendeu; pacote, assinatura e o auxiliar não entram. Ticket médio
    = valor ÷ comandas. Frequência = comandas ÷ clientes únicos.
28. **Ocupação** = tempo dos agendamentos não cancelados (falta conta: o
    horário ficou reservado) ÷ tempo de expediente cadastrado, sem os
    intervalos, nos dias do período. Bloqueio de horário não é agendamento.
    Sem expediente cadastrado, a ocupação fica em branco. **Folgas e bloqueios
    não são descontados do expediente.**
29. **"BAIXA OCUPAÇÃO"** aparece abaixo de 30%.
30. **Os cartões são do salão**, não a soma das linhas: o cliente que passou
    por dois profissionais conta uma vez, e a comanda também.
31. **Quem vê**: pede os módulos `reports` e `sales`, `sales.view_all` E
    `schedule.view_all` (mostra as vendas e a agenda de todos).

Fatia 9f — exportação em planilha:

32. **"Exportar" em todos os relatórios da fase 9** (financeiros, agendamentos,
    clientes, vendas e rankings, painel de profissionais): baixa em CSV **o que
    a tela está mostrando** — as mesmas linhas, com o mesmo relatório e os
    mesmos filtros. Os cartões de totais não vão no arquivo.
33. **Um formato só, para abrir direto no Excel em português**: separador
    ponto e vírgula, UTF-8 com marca BOM (acentos certos), número com vírgula
    decimal e sem ponto de milhar (a planilha soma), dinheiro em reais, data
    como DD/MM/AAAA. O nome do arquivo leva o relatório e o período.
34. **Texto que começa com `=`, `+`, `-` ou `@` ganha um apóstrofo na
    frente**: Excel e Sheets leem isso como fórmula, e nome de cliente, motivo
    de cancelamento e "como conheceu" são digitados por gente de fora.
35. **A planilha é montada no navegador**, com o que o servidor já entregou
    para a tela. Não há action nova: a permissão é a de abrir o relatório. O
    telefone só vai no arquivo se a tela o mostra.
36. **O teto de linhas é o da tela** (regra de cada relatório): se a tela avisa
    que o período foi cortado, a planilha sai cortada igual.
37. **Fora desta fatia**: os relatórios das fases 2 a 6 (resumo do financeiro,
    estoque, pacotes, cashback, avaliações) continuam sem exportar; a lista de
    contatos já exportava, no formato antigo (vírgula, sem BOM).

Fatia 9g — organização (caminho A):

38. **A organização é o dono.** As unidades são os salões de que a pessoa
    logada é DONA (`salons.owner_id`). Gerente e profissional não veem a tela,
    tenham a permissão que tiverem. Não há entidade nova no banco.
39. **Unidades lado a lado**, no período: faturamento, parte do total, comandas,
    ticket médio, clientes que compraram e agendamentos; e, de hoje, clientes
    cadastrados e profissionais ativos. A que mais faturou vem primeiro, e a
    última linha soma a organização.
40. **A soma é simples.** Cada unidade tem o seu cadastro: a mesma pessoa
    cliente (ou profissional) de duas unidades conta duas vezes.
41. **Equipe numa lista só**, uma linha por PESSOA: cadastros com o mesmo login,
    a mesma chave de pessoa (a da agenda) ou o mesmo e-mail são a mesma pessoa.
    Mostra em que unidades ela está, com o papel em cada uma. Quem está em mais
    unidades vem primeiro.
42. **Só leitura.** Para incluir alguém numa unidade ou ver o detalhe, o nome
    da unidade leva para o salão dela. Nada é compartilhado entre unidades.
43. **A lista de salões nunca vem do navegador**: o servidor lê os salões do
    usuário da sessão. É o único serviço que lê mais de um salão de uma vez.
44. **Quem vê**: o dono, abrindo a tela de um salão DELE que tenha o módulo
    `reports`. Quem é dono de uma unidade só também abre (com um aviso).

Perguntas para o dono:

- (9a) A central deve mostrar o que ainda não existe ("Em breve"), ou só o que
  já abre?
- (9a) Os favoritos devem ser de cada pessoa (regra 4) ou do salão?
- (9a) Faz falta a permissão por categoria de relatório, como na Belasis, ou a
  permissão de cada tela basta (regra 6)?
- (9b) O custo do produto deve ser o do dia da venda, e não o de hoje
  (regra 7)? Hoje o sistema não guarda o custo no item da comanda.
- (9b) O resultado líquido de serviços deve descontar o produto consumido no
  atendimento (regra 8)?
- (9b) A taxa da forma de pagamento deve ser repartida entre os itens (regra
  7), ou ficar fora do resultado por item?
- (9b) Na projeção, serviço com faixa de preço deve entrar pelo menor valor,
  pelo maior ou pela média (regra 9)?
- (9b) A projeção deve descontar uma taxa de falta ou de cancelamento?
- (9b) O extrato deve mostrar também o que está em aberto, como previsão?
- (9c) Vale guardar QUEM marcou o agendamento (IA, painel, página online)? Sem
  isso, "origem" só sabe anúncio × orgânico (regra 15). Pede migration.
- (9c) Os relatórios de agendamentos precisam de filtro por profissional, por
  serviço e por situação?
- (9c) "Inativo" deve seguir um prazo fixo (regra 18) ou o tempo de retorno de
  cada serviço?
- (9c) Aniversariantes: por mês basta, ou é preciso um período livre e o filtro
  de ativos e inativos, como na Belasis?
- (9c) Dos aniversariantes e dos inativos, o dono quer sair direto para uma
  campanha no WhatsApp?
- (9d) O ranking de clientes deve contar o que foi faturado (regra 21) ou só
  o que foi pago?
- (9d) No ranking de vendas, venda de pacote e de assinatura deve contar para
  alguém? E o auxiliar?
- (9d) "Como conheceu" deve virar uma lista de opções (em vez de texto livre),
  para o relatório de indicação não depender de grafia?
- (9d) A lista de produtos e serviços deve trazer a comissão de cada item e o
  saldo de estoque?
- (9e) O limite de "baixa ocupação" é 30% (regra 29). Qual o número certo?
- (9e) A ocupação deve descontar folgas, feriados e bloqueios do expediente
  (regra 28)? Hoje não há tela para cadastrar folga.
- (9e) "Frequência" é comandas ÷ clientes únicos (regra 27). É isso que o dono
  entende por frequência, ou é o intervalo médio entre as visitas?
- (9e) O painel deve mostrar também a comissão e as faltas de cada um?
- (9f) CSV basta, ou é preciso PDF e impressão? E arquivo `.xlsx` de verdade?
- (9f) A exportação deve chegar também aos relatórios das fases anteriores
  (financeiro, estoque, pacotes, cashback, avaliações)?
- (9f) Exportar deve pedir uma permissão própria? Hoje quem abre o relatório
  exporta (regra 35) — e a planilha leva nome de cliente e, se a pessoa pode
  ver, telefone.
- (9f) A exportação de contatos deve passar para o mesmo formato (ponto e
  vírgula, com BOM)?
- (9b–9e) Para cada relatório que falta: que colunas e que totais o dono espera
  ver? A auditoria não leu a saída de nenhum.
- (9f) Exportar em planilha (CSV) basta, ou é preciso PDF?
- (9g) O dono tem mais de uma unidade? Como ele quer ver os números: por
  unidade, somados, ou os dois?

### 13.5 Telas e código

- **Central de relatórios (9a)** (`/[salonId]/reports`, item "Relatórios" no
  menu): "N de M relatórios disponíveis"; o bloco "Favoritos"; e um bloco por
  categoria, com o nome e o resumo de cada relatório, a estrela e "Abrir".
- **Relatórios financeiros (9b)** (`/[salonId]/reports/finance?view=…`): o
  seletor de relatório, o período (na projeção, só o "até") e, no extrato, a
  conta. Cada relatório tem os totais em cartões, a tabela e uma nota dizendo o
  que entra e o que não entra na conta.
- **Relatórios de agendamentos (9c)** (`/[salonId]/reports/appointments?view=…`):
  seletor de relatório e período; cartões com as contagens; e a tabela de cada
  um (lista, cancelados, origem, criação).
- **Relatórios de clientes (9c)** (`/[salonId]/reports/customers?view=…`):
  aniversariantes (seletor de mês) e inativos (seletor de prazo), com o nome
  levando à ficha do cliente.
- **Relatórios de vendas (9d)** (`/[salonId]/reports/sales?view=…`): vendidos,
  ranking de clientes, ranking de vendas e indicação, com período; e a lista
  de produtos e serviços, sem período.
- **Painel de profissionais (9e)** (`/[salonId]/reports/professionals`): o
  período; quatro cartões do salão (clientes únicos, valor realizado, ticket
  médio, ocupação); e a tabela por profissional, com a ocupação em porcentagem,
  em horas ("12h de 40h") e o selo "BAIXA OCUPAÇÃO".
- **Exportar (9f)**: botão no fim da barra de filtros de cada relatório da
  fase 9; avisa quantas linhas saíram, ou que não há linhas.
- **Organização (9g)** (`/[salonId]/organization`, atalho no topo da central
  de relatórios, só para o dono): o período; a tabela de unidades com a linha
  de soma; a tabela da equipe; e "Exportar" (as unidades).

| Assunto | Onde está |
|---|---|
| Central de relatórios (9a) | Migration `064_report_favorites.sql`; tabela `reportFavorites`; catálogo e regra em `domain/report-catalog.ts` (`REPORT_CATALOG`, `resolveReportCatalog`, `sanitizeReportFavorites`); I/O em `services/report-favorites.service.ts`; actions em `actions/reports.ts` (na guarda de `actions-authz.test.ts`); módulo `reports` em `domain/permissions.ts`; tela em `app/[salonId]/reports/`; item do menu em `components/dashboard/sidebar.tsx`; testes em `report-catalog-domain.test.ts` |
| Relatórios financeiros (9b) | Sem migration; regra em `domain/finance-reports.ts` (`allocateByWeight`, `buildNetResult`, `planProjectionPeriod`, `buildRevenueProjection`, `buildAccountStatement`); I/O em `services/finance-reports.service.ts`; action em `actions/finance-reports.ts` (na guarda de `actions-authz.test.ts`); tela em `app/[salonId]/reports/finance/`; os quatro destinos no catálogo (`domain/report-catalog.ts`); testes em `finance-reports-domain.test.ts` |
| Relatórios de agendamentos e de clientes (9c) | Sem migration; regra em `domain/agenda-reports.ts` (`countByStatus`, `appointmentOrigin`, `buildOriginReport`, `buildCreationReport`, `buildBirthdayList`, `buildInactiveList`); I/O em `services/agenda-reports.service.ts`; actions em `actions/agenda-reports.ts` (na guarda de `actions-authz.test.ts`); telas em `app/[salonId]/reports/appointments/` e `reports/customers/`; os seis destinos no catálogo; testes em `agenda-reports-domain.test.ts` |
| Relatórios de vendas e rankings (9d) | Sem migration; regra em `domain/sales-reports.ts` (`buildSoldItemsReport`, `buildCustomerRanking`, `buildProfessionalRanking`, `buildReferralReport`); I/O em `services/sales-reports.service.ts`; action em `actions/sales-reports.ts` (na guarda de `actions-authz.test.ts`; a permissão depende do relatório); tela em `app/[salonId]/reports/sales/`; os cinco destinos no catálogo; testes em `sales-reports-domain.test.ts` |
| Painel de profissionais (9e) | Sem migration; regra em `domain/professional-panel.ts` (`countWeekdays`, `weeklyWorkMinutes`, `buildProfessionalPanel`); I/O em `services/professional-panel.service.ts` (reusa `listSoldItemsService`); action em `actions/professional-panel.ts` (na guarda de `actions-authz.test.ts`); tela em `app/[salonId]/reports/professionals/`; o destino no catálogo; testes em `professional-panel-domain.test.ts` |
| Exportação em planilha (9f) | Sem migration e sem action nova; o formato em `apps/web/lib/utils/csv.utils.ts` (`toCsv`, `csvMoney`, `csvDate`, `csvFileName`); o botão em `components/reports/export-csv-button.tsx`; a função `sheet()` de cada tela em `app/[salonId]/reports/*/…-client.tsx`; testes em `__tests__/lib/utils/csv.utils.test.ts` |
| Organização (9g, caminho A) | Sem migration; regra em `domain/organization.ts` (`buildOrganizationUnits`, `groupOrganizationMembers`); I/O em `services/organization.service.ts` (o único que lê mais de um salão; a lista sai de `salons.owner_id`); action em `actions/organization.ts` (na guarda de `actions-authz.test.ts`); tela em `app/[salonId]/organization/`; o atalho em `reports/reports-client.tsx` (`ownedSalons` em `actions/reports.ts`); testes em `organization-domain.test.ts` |

### 13.6 Fatia 9a — estado (19/nov/2026)

- Na branch `claude/fase-9-relatorios` (sai de `claude/fase-7-cliente-agenda`,
  que não está na `main`), publicada (preview da Vercel — endereço novo, com
  login próprio). Typecheck (db, web e mcp-server), lint (nenhum erro novo nos
  arquivos alterados) e testes passando (web 1383, db 296, mcp-server 409).
- **Migration 064: aplicada em produção em 18/nov/2026** (registrada como
  `report_favorites`). Só cria uma tabela; não houve cópia antes. Conferido
  depois: RLS ligado, policy `deny_all`, sem privilégio para
  anon/authenticated, e nenhum aviso novo nos advisors de segurança.
- **O módulo `reports` está ligado só no salão de teste** (UPDATE em
  `salons.settings`, pelo id) — e ficou ligado.
- **Limites desta fatia:** nenhum relatório novo; sem exportação; a central
  não leva filtro nem período para a tela de destino; relatórios que caem na
  mesma tela abrem a mesma tela.
- **Teste em uso (19/nov/2026)**, no preview da branch, no salão de teste, com
  o usuário dono (todos os módulos ligados):
  - o item "Relatórios" no menu e "21 de 39 relatórios disponíveis";
  - o que ainda não existe aparece como "Em breve · fatia 9x", sem estrela
    ativa e sem "Abrir";
  - **as 12 telas de destino foram abertas, uma a uma**, e respondem ao que os
    relatórios prometem: resumo do financeiro (recebido, pago, resultado, a
    receber, a pagar, fiado, por categoria, por forma de pagamento e fluxo de
    caixa por dia); lançamentos (filtros de tipo, situação, conta e
    vencimento); caixa (caixas fechados, com esperado, contado e diferença);
    cuidados e retorno (mensagens e envios, com filtro de situação); comandas
    (filtros de situação e período); relatórios de pacotes; histórico de
    cashback; avaliações; estoque (saldo, mínimo e "Comprar"); relatórios de
    estoque; compras; e contatos (com "Exportar");
  - favoritos — marcar dois, recarregar: os dois aparecem em "Favoritos", na
    ordem em que foram marcados, com "Abrir"; desmarcar os dois: "Nenhum
    favorito ainda", e a tabela ficou vazia.
- **Achados do teste:**
  - o **fluxo de caixa por dia já existe** no resumo do financeiro: o catálogo
    foi corrigido depois do teste (22 disponíveis, e a 9b perdeu esse item). A
    correção tem teste de unidade, mas não foi vista em uso;
  - **"Cuidados para hoje" e "Retornos para hoje" são aproximações**: a tela
    de cuidados e retorno lista os envios com filtro de situação, mas não tem
    filtro "hoje" nem separa cuidado de retorno;
  - "Extrato de contas" continua em falta: os lançamentos filtram por conta,
    mas não mostram saldo corrido;
  - o resumo do financeiro mostra o total de fiado; a lista de quem deve está
    nas comandas, no filtro "Com valor em aberto".
- **Não testado:** usuário sem `reports.access`, funcionário com perfil de
  acesso (para ver relatórios sumirem por permissão), salão com módulo
  desligado, e o teto de 20 favoritos. Há teste de regra para os três
  primeiros.

### 13.7 Fatia 9b — estado (19/nov/2026)

- Na branch `claude/fase-9-relatorios`, publicada (preview da Vercel).
  Typecheck (db, web e mcp-server), lint (nenhum erro novo nos arquivos
  alterados) e testes passando (web 1402, db 296, mcp-server 409).
- **Sem migration.** Só leitura: os relatórios consultam comandas, comissões,
  agendamentos e lançamentos que já existem.
- **Limites desta fatia:**
  - sem exportação (fatia 9f);
  - o custo do produto é o de hoje, não o do dia da venda;
  - o resultado líquido não desconta consumo de produto no atendimento,
    despesas do salão nem cashback;
  - o resultado líquido lê até 5.000 itens de comanda por período, e o extrato
    até 5.000 baixas; acima disso a tela avisa e pede um período menor;
  - a projeção não tem gráfico, e não separa por profissional;
  - o extrato é de uma conta por vez.
- **Teste em uso (19/nov/2026)**, no preview da branch, no salão de teste:
  - os quatro relatórios abrem sem dados, com tudo zerado — as consultas rodam;
  - com a comanda de teste #33 faturada (um serviço de R$ 170,00 e um produto
    de R$ 30,00, no crédito com taxa de 2,92% = R$ 5,84, recebendo em 30 dias),
    conferido contra o banco:
    - serviços — receita R$ 170,00, taxa R$ 4,96, comissão R$ 0,00, custo
      R$ 0,00, resultado R$ 165,04, margem 97,1%;
    - produtos — receita R$ 30,00, taxa R$ 0,88, custo R$ 20,00 (o custo de
      compra do cadastro), resultado R$ 9,12, margem 30,4%;
    - as duas taxas somam os R$ 5,84 da comanda;
    - projeção — R$ 194,16 a receber em 19/12/2026 (o líquido, no dia em que
      o cartão paga), previsto R$ 194,16;
  - dada a baixa do recebimento na conta de banco: o extrato mostra saldo
    anterior R$ 1.000,00, a entrada de R$ 194,16 e saldo final R$ 1.194,16 — o
    mesmo saldo que o financeiro mostra na conta;
  - extrato de 20 a 30/nov: saldo anterior já em R$ 1.194,16, sem baixas;
  - trocar de conta pelo seletor: a outra conta, zerada.
- **Achados do teste, corrigidos depois (sem novo teste em uso):**
  - "1 atendimentos" e "1 unidades" nos cartões;
  - conta desconhecida na URL mostrava "O salão ainda não tem conta
    cadastrada"; passa a dizer que a conta não foi encontrada.
- **Não testado em uso:**
  - **o "agendado" da projeção** com agendamento de verdade (a consulta rodou,
    sem linhas): preço de tabela, faixa pelo menor valor, "sob avaliação" e a
    exclusão do que já virou comanda faturada só têm teste de regra na soma;
  - comissão diferente de zero (o profissional do teste não tem regra de
    comissão) e serviço com custo fixo;
  - produto sem custo (o aviso), lançamento a pagar e vencidos na projeção;
  - comanda com mais de uma forma de pagamento, com desconto, cupom, pacote ou
    assinatura; transferência no extrato;
  - os tetos de 5.000 linhas e o período de um ano;
  - usuário sem `finance.access` e salão sem o módulo `finance`.
- Dados de teste limpos pela tela: a baixa foi desfeita ao reabrir a comanda
  #33, que foi excluída (fica como excluída, como as anteriores). Sem
  lançamentos, pagamentos nem movimento de estoque.

### 13.8 Fatia 9c — estado (19/nov/2026)

- Na branch `claude/fase-9-relatorios`, publicada (preview da Vercel).
  Typecheck (db, web e mcp-server), lint (nenhum erro novo nos arquivos
  alterados) e testes passando.
- **Sem migration.** Só leitura.
- **Limites desta fatia:**
  - sem exportação (fatia 9f);
  - sem filtro por profissional, serviço ou situação;
  - "origem" não sabe quem marcou (regra 15);
  - o relatório de agendamentos lê até 3.000 linhas por período, e as listas de
    clientes até 1.000; acima disso a tela avisa;
  - "atendimentos" do inativo conta agendamentos concluídos, não comandas;
  - sem botão para mandar mensagem aos aniversariantes ou aos inativos.
- **Teste em uso (19/nov/2026)**, no preview da branch, no salão de teste, com
  cada número conferido contra o banco (período de 01 a 19/nov/2026):
  - todos os agendamentos — total 4, os 4 cancelados, e a lista com dia e hora
    de Brasília, cliente, serviço, profissional e situação;
  - cancelados — 4, sendo 2 sem motivo; "cancelado em", "por quem" e o motivo
    de cada um;
  - origem — "Não se sabe" 4 (100%), comparecimento 0%; as outras três linhas
    zeradas, com "—";
  - criação — 13 criados (2 em 15/nov e 11 em 18/nov), antecedência média de
    5,2 dias, 8 na faixa de 1 a 2 dias e 5 em mais de 7 dias;
  - aniversariantes — com uma data de nascimento posta num cliente de teste
    (por SQL, pelo id, e tirada depois): aparece no mês certo, no dia 25, com
    "36 anos" e o telefone; outro mês: "Nenhum cliente com aniversário";
  - inativos — os 5 clientes com atendimento concluído, de 240 a 300 dias sem
    vir, quem sumiu há menos tempo primeiro; com o prazo de 365 dias, nenhum;
  - a central passou a "32 de 39 relatórios disponíveis", com 7 em "Em breve".
- **Não testado em uso:** situações que o salão de teste não tem (pendente,
  confirmado, concluído e falta no período; origem de anúncio, orgânica e do
  Google); cliente inativo com horário marcado (some da lista) e com comanda
  faturada mais recente que o último atendimento; usuário sem
  `schedule.view_all`, e sem `customers.view_phones` (o telefone some); os
  tetos de linhas; trocar de relatório e de filtro pelos seletores (o teste foi
  pela URL).
- Dados de teste: a data de nascimento do cliente de teste foi desfeita.
  Nenhum outro dado foi criado.

### 13.9 Fatia 9d — estado (19/nov/2026)

- Na branch `claude/fase-9-relatorios`, publicada (preview da Vercel).
  Typecheck (db, web e mcp-server), lint (nenhum erro novo nos arquivos
  alterados) e testes passando (web 1430).
- **Sem migration.** Só leitura.
- **Limites desta fatia:**
  - sem exportação (fatia 9f);
  - os três relatórios de venda leem até 5.000 itens de comanda por período;
    acima disso a tela avisa;
  - a lista de produtos e serviços não tem busca, filtro nem paginação;
  - indicação depende do que foi digitado no "como conheceu".
- **Teste em uso (19/nov/2026)**, no preview da branch, no salão de teste, com
  cada número conferido contra o banco:
  - vendidos sem dados — os cinco cartões zerados e "Nada vendido";
  - lista de produtos e serviços — os 12 serviços (duração, preço em valor ou
    em faixa, custo fixo) e os 2 produtos (código, preço, custo de compra,
    preço para profissional, "Controlado" ou "Sem controle");
  - indicação — com "como conheceu" posto em três clientes de teste
    ("Instagram", "instagram" e "Indicação"; por SQL, pelo id, e desfeito
    depois): 8 cadastrados no período, 3 informaram (37,5%), "instagram" com 2
    (66,7%) e "Indicação" com 1 (33,3%) — as duas grafias viraram uma linha;
  - com a comanda de teste #34 faturada (serviço de R$ 170,00 com
    profissional e produto de R$ 10,00 sem vendedor):
    - vendidos — total R$ 180,00, serviços R$ 170,00 (94,4%), produtos
      R$ 10,00 (5,6%);
    - ranking de clientes — 1 cliente, 1 comanda, total e ticket médio de
      R$ 180,00, última comanda em 19/11/2026;
    - ranking de vendas — o profissional com 1 serviço e R$ 170,00, e a linha
      "Sem profissional" com 1 produto e R$ 10,00, no fim.
- **Achado do teste:** com duas grafias empatadas ("Instagram" e "instagram",
  uma vez cada), o relatório de indicação mostra a que vem primeiro na ordem
  alfabética — saiu a minúscula. É só o rótulo; a contagem está certa.
- **Não testado em uso:** pacote e assinatura nos vendidos; mais de um cliente
  e mais de um profissional (a ordem dos rankings só tem teste de regra); a
  lista dos 100 primeiros; serviço "sob avaliação" e produto ou serviço
  inativo na lista; usuário sem `sales.view_all`, e com `products.access`
  sem `services.access`; salão sem o módulo `sales`; trocar de relatório
  pelo seletor (o teste foi pela URL).
- Dados de teste limpos: a comanda #34 reaberta e excluída pela tela (fica
  como excluída, como as anteriores), e o "como conheceu" dos três clientes
  desfeito.

### 13.10 Fatia 9e — estado (19/nov/2026)

- Na branch `claude/fase-9-relatorios`, publicada (preview da Vercel).
  Typecheck (db, web e mcp-server), lint (nenhum erro novo nos arquivos
  alterados) e testes passando (web 1439).
- **Sem migration.** Só leitura.
- Com esta fatia, o catálogo da central tem tela para tudo menos a nota fiscal
  (fase 10): a central mostra "38 de 39 relatórios disponíveis".
- **Limites desta fatia:**
  - sem exportação (fatia 9f) e sem gráfico;
  - a ocupação não desconta folga, feriado nem bloqueio, e usa o expediente
    de HOJE para o período inteiro (não guarda histórico de expediente);
  - plano SOLO: a tela do salão grava o agendamento no profissional do dono,
    então a ocupação dos outros só conta o que a IA ou a página online marcou;
  - lê até 5.000 itens de comanda e 10.000 agendamentos por período.
- **Teste em uso (19/nov/2026)**, no preview da branch, no salão de teste, com
  o expediente calculado à mão a partir do cadastro e os agendamentos lidos do
  banco:
  - de 01 a 19/nov — os dois profissionais ativos, sem venda e sem agendamento
    não cancelado: expediente de 164h (um trabalha os sete dias) e de 56h (o
    outro, de quinta a sábado), 220h no salão; ocupação 0% e "BAIXA OCUPAÇÃO"
    nos dois; ticket e frequência em branco;
  - de 01/jan a 31/mar — o profissional com os 5 atendimentos concluídos do
    período: 5 agendamentos, 5h de 312h, ocupação 1,6%; o outro, 0h de 771h; o
    salão, 5h de 1.083h, 0,5%;
  - a central passou a "38 de 39", com só "Todas as notas fiscais" em "Em
    breve".
- **Não testado em uso:**
  - **valor realizado, clientes únicos, ticket médio e frequência com comanda
    faturada** — o salão de teste não tem nenhuma. A leitura dos itens é a
    mesma do ranking de vendas, testada na 9d; a conta do painel tem teste de
    regra;
  - expediente com intervalo (o salão de teste não tem); profissional inativo
    com movimento; ocupação acima de 30% (sem o selo);
  - usuário sem `sales.view_all` ou sem `schedule.view_all`; os tetos de
    linhas.
- Nenhum dado de teste foi criado.

### 13.11 Fatia 9f — estado (19/nov/2026)

- Na branch `claude/fase-9-relatorios`, publicada (preview da Vercel).
  Typecheck (db, web e mcp-server), lint (nenhum erro nem aviso nos arquivos
  alterados) e testes passando (web 1447).
- **Sem migration e sem consulta nova.** O que muda é só no navegador.
- **Limites desta fatia:** só CSV (sem PDF, sem `.xlsx`, sem impressão); só
  os relatórios da fase 9; os totais dos cartões não vão no arquivo; o
  relatório de criação exporta os dias, não as faixas de antecedência; a lista
  de produtos e serviços sai numa planilha só, com o preço do serviço em texto
  ("R$ 150,00 a R$ 220,00") e o do produto em número.
- **Teste em uso (19/nov/2026)**, no preview da branch, no salão de teste. O
  arquivo foi capturado na página em vez de baixado para o computador (o
  clique no link de download foi interceptado), e o conteúdo lido:
  - agendamentos cancelados — clique no botão "Exportar": arquivo
    `agendamentos-cancelados_2026-11-01_2026-11-19.csv`, 538 bytes, começando
    pelos três bytes da marca BOM; título e as 4 linhas da tela, com ponto e
    vírgula, data em DD/MM/AAAA e o motivo vazio onde não há; aviso "4 linhas
    exportadas";
  - painel de profissionais (jan a mar) — `painel-de-profissionais_2026-01-01_2026-03-31.csv`,
    com "Sim" em Ativo, horas em número (5 e 312), ocupação "1,6" com vírgula
    e ticket vazio onde a tela mostra "—";
  - lista de produtos e serviços — `lista-de-produtos-e-servicos.csv`, 14
    linhas (12 serviços e 2 produtos), com o código do produto e o custo vazio
    onde não há;
  - relatório sem linhas (resultado líquido de serviços, sem comanda) — nenhum
    arquivo e o aviso "Não há linhas para exportar".
- **Não testado:**
  - **abrir o arquivo no Excel ou no Sheets** (acentos, colunas, valores como
    número, datas, e o apóstrofo das células que começam como fórmula) — fica
    para o dono, nas pendências;
  - o download de verdade para a pasta do computador;
  - os outros relatórios (financeiro com linhas, clientes com telefone,
    vendas, origem, criação): a função de cada um só tem o typecheck;
  - usuário sem `customers.view_phones` (a coluna de telefone some).
- Nenhum dado de teste foi criado.

### 13.12 Fatia 9g — levantamento da multiunidade (19/nov/2026)

Só levantamento: nenhuma linha de código nem de banco foi mexida.

**O que a auditoria mostra na Belasis**

- **Seletor de unidade** no menu: troca entre filiais (a conta auditada tinha
  "Matriz" e mais uma).
- **Organização** (`/organization`, só para a conta admin): lista de membros com
  Nome, E-mail, Papel e **Unidades**, e "Adicionar membro".
- **"Receita organizacional?" e "Despesa organizacional?"** nos lançamentos do
  financeiro: um lançamento pode ser da organização, e não de uma unidade.
- **Filtro por filial** no painel, e o painel de profissionais "por unidade".
- A auditoria não abriu nenhuma dessas telas por dentro: não se sabe o que é
  compartilhado entre unidades (clientes? catálogo? estoque?), nem o que os
  papéis da organização podem.

**O que o MinhaAgenda já tem**

- **"Unidade" já existe, com outro nome: é o salão.** Uma mesma pessoa pode ser
  dona de mais de um salão, e o menu já tem "Selecionar salão"
  (`components/dashboard/salon-selector.tsx`, alimentado por `getUserSalons`).
- **O plano mora no DONO** (`profiles.tier`), não no salão: na prática, o dono
  já é a "organização". SOLO só cria um salão (`createSalon`); PRO e
  ENTERPRISE não têm limite no código, embora as telas prometam "até 3".
- **A mesma pessoa em dois salões** já é reconhecida na agenda
  (`professionals.person_key`): horário ocupado num salão bloqueia no outro.
- **Tudo o mais é por salão, isolado**: clientes, catálogo, estoque, comandas,
  financeiro, comissões, permissões, perfis de acesso e módulos. Cada tabela
  tem `salon_id`, e toda consulta filtra por ele — é a regra de segurança do
  sistema.
- **Não existe**: tela de organização; membro adicionado a várias unidades de
  uma vez (hoje se cadastra o profissional salão a salão); relatório que some
  ou compare unidades; lançamento "da organização"; nada compartilhado entre
  salões.

**O tamanho real do problema hoje (produção, 19/nov/2026)**

- 16 salões de 15 donos. **Um único dono tem mais de um salão** (dois).
- Dos 15 donos, 12 são SOLO (não podem ter segundo salão), 2 PRO e 1 ENTERPRISE.
- **Nenhum login trabalha em mais de um salão**, e nenhum `person_key` aparece
  em dois salões.

**Três caminhos**

- **A — "A organização é o dono" (sem entidade nova).** Uma tela "Organização",
  só para quem é dono de mais de um salão: as unidades lado a lado com os
  números principais (faturamento, comandas, clientes, ocupação), e os membros
  de todas as unidades numa lista só, podendo pôr a mesma pessoa em mais de
  uma. Sem migration, ou com uma pequena. Cada salão continua isolado; a soma
  é feita só para o dono. Limites: só o dono enxerga o conjunto (gerente
  não); nada é compartilhado entre unidades; não há "lançamento da
  organização".
- **B — Entidade "organização" de verdade.** Tabelas `organizations` e
  `organization_members`, e `salons.organization_id`. Permite administrador
  da organização que não é o dono, papéis por unidade, lançamento
  organizacional e, mais adiante, cliente e catálogo compartilhados. Custo:
  migration em `salons` (tabela do caminho crítico), o plano e a cobrança
  passam a ser da organização, e a regra "toda consulta filtra por salão"
  ganha exceções — cada uma é um risco de um salão ver dado de outro.
- **C — Esperar.** Registrar o levantamento e não construir agora: hoje há um
  dono com dois salões, e a auditoria não mostrou o que a Belasis compartilha.

**Recomendação.** C agora, e A quando houver um cliente de verdade com mais de
uma unidade. O B só se justifica se a resposta às perguntas abaixo for "sim"
para administrador que não é o dono ou para dado compartilhado — e aí vale ser
uma fase própria, não uma fatia dos relatórios.

**Perguntas para o dono**

- Existe hoje, ou está para chegar, um cliente com mais de uma unidade? O que
  ele precisa primeiro: ver os números juntos, ou gerir a equipe em um lugar só?
- Alguém que não é o dono precisa enxergar todas as unidades (um gerente
  regional, um contador)?
- O cliente de uma unidade deve ser cliente da outra (mesma ficha, mesmo
  pacote, mesmo cashback)? E o catálogo de serviços e produtos?
- O que é uma "despesa organizacional" para o salão de vocês: um gasto que não
  é de nenhuma unidade (marca, contador), ou um gasto rateado entre elas?
- O plano deve ser cobrado por organização ou por unidade? Hoje é por dono, e
  PRO e ENTERPRISE não têm o limite de "até 3 salões" que as telas prometem.

### 13.13 Fatia 9g — estado (19/nov/2026)

- Na branch `claude/fase-9-relatorios`, **em commit local, sem publicar**.
  Typecheck (db, web e mcp-server), lint (nenhum erro novo nos arquivos
  alterados) e testes passando (web 1457).
- **Sem migration.** Só leitura.
- **As consultas não foram executadas contra o banco**, e esta é a primeira
  tela que lê mais de um salão: o teste em uso tem que conferir, antes de
  tudo, que só entram os salões do dono.
- **Limites desta fatia (o que o caminho A não faz):**
  - só o dono vê; não há administrador da organização que não seja o dono;
  - não inclui, move nem remove ninguém: a equipe é só leitura;
  - nada compartilhado entre unidades (cliente, catálogo, estoque, pacote);
  - sem "receita/despesa organizacional";
  - sem filtro de unidade nos outros relatórios: cada relatório continua sendo
    de um salão;
  - o atalho fica na central de relatórios, não no menu.
- **Sem teste em uso.** Roteiro: no salão de teste (dono de uma unidade só), o
  atalho na central e a tela com o aviso de unidade única, os números batendo
  com os relatórios do salão, e a equipe; conferir no banco que a lista de
  salões da tela é exatamente a do dono; se possível, ver a tela com o único
  dono de produção que tem dois salões (não é o usuário de teste).
