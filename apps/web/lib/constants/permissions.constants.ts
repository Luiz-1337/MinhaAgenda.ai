/**
 * Rótulos em português do catálogo de permissões.
 *
 * O catálogo em si (quais recursos e ações existem) é de `@repo/db`
 * (domain/permissions.ts). Aqui fica só o texto de tela. Os `Record` são tipados
 * pelo catálogo: adicionar um recurso ou uma ação lá sem rótulo aqui não compila.
 *
 * Import pelo caminho do arquivo (e não pelo barrel `@repo/db`) porque este módulo
 * é usado em componente client — o barrel arrasta o cliente Postgres.
 */
import { PERMISSION_CATALOG, type PermissionResource } from "@repo/db/src/domain/permissions"

type PermissionAction = (typeof PERMISSION_CATALOG)[PermissionResource][number]

export const PERMISSION_RESOURCE_LABELS: Record<PermissionResource, string> = {
  schedule: "Agenda",
  customers: "Clientes",
  services: "Serviços",
  products: "Produtos",
  team: "Equipe",
  chat: "Conversas",
  marketing: "Marketing",
  reports: "Relatórios",
  settings: "Configurações",
  access_profiles: "Perfis de acesso",
  sales: "Comandas",
  payment_methods: "Formas de pagamento",
  finance: "Financeiro",
  cash: "Caixa",
  commissions: "Comissões",
  inventory: "Estoque",
}

export const PERMISSION_ACTION_LABELS: Record<PermissionAction, string> = {
  access: "Acessar",
  create: "Criar",
  edit: "Editar",
  delete: "Excluir",
  view_all: "Ver de todos",
  view_phones: "Ver telefones",
  notes: "Anotações",
  manage: "Gerenciar",
  view_invoiced: "Ver faturadas",
  invoice: "Faturar",
  invoice_debt: "Faturar com valor em aberto",
  edit_invoiced: "Reabrir faturada",
  settle: "Dar baixa e estornar",
  settings: "Contas e categorias",
  operate: "Abrir, movimentar e fechar",
  configure: "Configurar regras",
  adjust: "Lançar vales e bonificações",
  pay: "Pagar comissões e estornar pagamentos",
  move: "Lançar entradas, saídas e acertos",
  purchase: "Lançar e excluir compras",
  request: "Solicitar produto para uso próprio",
}

/** Explicação curta ao lado do recurso, quando a ação sozinha não diz o bastante. */
export const PERMISSION_RESOURCE_HINTS: Partial<Record<PermissionResource, string>> = {
  schedule: "“Ver de todos” libera a agenda dos outros profissionais.",
  access_profiles: "Quem gerencia perfis define o que os outros podem.",
  sales: "Sem “Ver de todos”, a pessoa vê só as comandas com item dela.",
  cash: "Sem “Ver de todos”, a pessoa vê só o histórico dos caixas que abriu.",
  commissions: "Sem “Ver de todos”, a pessoa vê só o próprio extrato.",
  inventory: "“Gerenciar” liga o controle do produto, define mínimo e custo e cuida de fornecedores, marcas e categorias.",
}
