/**
 * Catálogo de relatórios — regra pura, sem I/O (docs/ROADMAP.md, fase 9, fatia 9a).
 *
 * A auditoria da Belasis lista 38 sub-relatórios em oito categorias, mais um
 * painel de profissionais. Este arquivo é a lista ÚNICA deles: o que já tem tela
 * no MinhaAgenda (e qual), e o que ainda vai ser feito (e em que fatia).
 *
 * A central de relatórios não calcula nada: ela aponta para a tela que responde.
 * Cada relatório continua guardado pelo módulo e pela permissão da tela de
 * destino — a central só deixa de MOSTRAR o que a pessoa não abriria.
 */
import type { PermissionKey, SalonModule } from './permissions'

export const REPORT_CATEGORIES = [
  { key: 'finance', label: 'Financeiro' },
  { key: 'appointments', label: 'Agendamentos' },
  { key: 'customers', label: 'Clientes' },
  { key: 'sales', label: 'Vendas' },
  { key: 'inventory', label: 'Estoque' },
  { key: 'tax', label: 'Notas fiscais' },
  { key: 'ranking', label: 'Ranking' },
  { key: 'messages', label: 'Mensagens' },
  { key: 'professionals', label: 'Profissionais' },
] as const

export type ReportCategoryKey = (typeof REPORT_CATEGORIES)[number]['key']

/** Onde o relatório está hoje: a tela, e o módulo e a permissão que ela pede. */
type ReportTarget = { path: string; module?: SalonModule; permission: PermissionKey }

export type ReportDefinition = {
  /** "categoria.nome" — é o que fica gravado nos favoritos. Não renomear. */
  key: string
  category: ReportCategoryKey
  name: string
  summary: string
  /** A tela que responde. NULL = ainda não existe. */
  target: ReportTarget | null
  /** Para o que ainda não existe: onde está previsto. */
  planned?: string
}

const finance = (path: string): ReportTarget => ({ path, module: 'finance', permission: 'finance.access' })
const inventory = (path: string): ReportTarget => ({ path, module: 'inventory', permission: 'inventory.access' })
const packages = (path: string): ReportTarget => ({ path, module: 'packages', permission: 'packages.access' })
const careMessages: ReportTarget = { path: 'care-messages', module: 'care_messages', permission: 'care_messages.access' }

export const REPORT_CATALOG: readonly ReportDefinition[] = [
  // --- Financeiro ---------------------------------------------------------
  { key: 'finance.results', category: 'finance', name: 'Resultados financeiros', summary: 'Receitas e despesas por categoria e recebimentos por forma de pagamento, no período.', target: finance('finance/summary') },
  { key: 'finance.net_services', category: 'finance', name: 'Resultado líquido de serviços', summary: 'O que cada serviço rendeu, descontados taxas, comissão e custo.', target: finance('reports/finance?view=services') },
  { key: 'finance.net_products', category: 'finance', name: 'Resultado líquido de produtos', summary: 'O que cada produto rendeu, descontados taxas, comissão e custo de compra.', target: finance('reports/finance?view=products') },
  { key: 'finance.projection', category: 'finance', name: 'Projeção de faturamento', summary: 'O que está agendado, a receber e a pagar, dia a dia, de hoje em diante.', target: finance('reports/finance?view=projection') },
  { key: 'finance.cash_flow', category: 'finance', name: 'Fluxo de caixa', summary: 'O que foi recebido e pago em cada dia do mês, pelo dia da baixa.', target: finance('finance/summary') },
  { key: 'finance.receipts', category: 'finance', name: 'Recebimentos', summary: 'Os lançamentos a receber e recebidos, com filtro de período e situação.', target: finance('finance') },
  { key: 'finance.expenses', category: 'finance', name: 'Despesas', summary: 'Os lançamentos a pagar e pagos, com filtro de período e situação.', target: finance('finance') },
  { key: 'finance.account_statement', category: 'finance', name: 'Extrato de contas', summary: 'O que entrou e saiu de uma conta no período, com o saldo corrido.', target: finance('reports/finance?view=statement') },
  { key: 'finance.movements', category: 'finance', name: 'Extrato de movimentações', summary: 'Todos os lançamentos do financeiro, incluindo transferências.', target: finance('finance') },
  { key: 'finance.cash_history', category: 'finance', name: 'Histórico de caixa', summary: 'Os caixas fechados, com abertura, movimentos e conferência.', target: { path: 'finance/cash', module: 'finance', permission: 'cash.access' } },

  // --- Agendamentos -------------------------------------------------------
  { key: 'appointments.all', category: 'appointments', name: 'Todos os agendamentos', summary: 'Os agendamentos do período, com a contagem por situação.', target: { path: 'reports/appointments?view=all', permission: 'schedule.view_all' } },
  { key: 'appointments.cancelled', category: 'appointments', name: 'Agendamentos cancelados', summary: 'O que foi cancelado, quando, por quem e por quê.', target: { path: 'reports/appointments?view=cancelled', permission: 'schedule.view_all' } },
  { key: 'appointments.origin', category: 'appointments', name: 'Origem dos agendamentos', summary: 'De onde vieram (anúncio, orgânico, Google Calendar) e quantos compareceram.', target: { path: 'reports/appointments?view=origin', permission: 'schedule.view_all' } },
  { key: 'appointments.creation', category: 'appointments', name: 'Criação de agendamento', summary: 'Quantos agendamentos foram criados por dia, e com que antecedência.', target: { path: 'reports/appointments?view=creation', permission: 'schedule.view_all' } },
  { key: 'appointments.care_today', category: 'appointments', name: 'Cuidados para hoje', summary: 'As mensagens de cuidados previstas e enviadas.', target: careMessages },

  // --- Clientes -----------------------------------------------------------
  { key: 'customers.list', category: 'customers', name: 'Lista completa', summary: 'Todos os contatos do salão, com busca, etiquetas e exportação.', target: { path: 'contacts', permission: 'customers.access' } },
  { key: 'customers.birthdays', category: 'customers', name: 'Aniversariantes', summary: 'Quem faz aniversário no mês, com a idade que completa.', target: { path: 'reports/customers?view=birthdays', permission: 'customers.access' } },
  { key: 'customers.inactive', category: 'customers', name: 'Inativos', summary: 'Quem já veio, não vem há um tempo e não tem horário marcado.', target: { path: 'reports/customers?view=inactive', permission: 'customers.access' } },
  { key: 'customers.debtors', category: 'customers', name: 'Pendentes e inadimplentes', summary: 'Clientes com valor em aberto (fiado).', target: finance('finance/summary') },
  { key: 'customers.ranking', category: 'customers', name: 'Ranking de clientes', summary: 'Quem mais gastou no período, com comandas e ticket médio.', target: { path: 'reports/sales?view=customers', module: 'sales', permission: 'sales.view_all' } },
  { key: 'customers.return', category: 'customers', name: 'Retorno', summary: 'As mensagens de retorno por serviço e os envios.', target: careMessages },
  { key: 'customers.return_today', category: 'customers', name: 'Retornos para hoje', summary: 'Os envios de retorno previstos, na fila de mensagens.', target: careMessages },

  // --- Vendas -------------------------------------------------------------
  { key: 'sales.orders', category: 'sales', name: 'Comandas e pacotes', summary: 'As comandas do período, com situação, cliente e valor.', target: { path: 'sales', module: 'sales', permission: 'sales.access' } },
  { key: 'sales.items', category: 'sales', name: 'Produtos e serviços vendidos', summary: 'O que foi vendido, item a item, com quantidade e valor.', target: { path: 'reports/sales?view=items', module: 'sales', permission: 'sales.view_all' } },
  { key: 'sales.package_statement', category: 'sales', name: 'Extrato de pacotes', summary: 'Pacotes vendidos e sessões usadas no período.', target: packages('packages/reports') },
  { key: 'sales.subscriptions', category: 'sales', name: 'Vendas por assinatura', summary: 'As cobranças de assinatura faturadas, por plano.', target: packages('packages/reports') },
  { key: 'sales.cashback', category: 'sales', name: 'Histórico de cashback', summary: 'O que os clientes ganharam, usaram e perderam de cashback.', target: { path: 'cashback/history', module: 'cashback', permission: 'cashback.access' } },
  { key: 'sales.pending_reviews', category: 'sales', name: 'Avaliações pendentes', summary: 'Os pedidos de avaliação ainda sem resposta.', target: { path: 'reviews', module: 'reviews', permission: 'reviews.access' } },

  // --- Estoque ------------------------------------------------------------
  { key: 'inventory.current', category: 'inventory', name: 'Estoque atual', summary: 'O saldo de cada produto e o que está abaixo do mínimo.', target: inventory('inventory') },
  { key: 'inventory.movements', category: 'inventory', name: 'Movimentação de estoque', summary: 'Entradas, saídas e acertos por produto, no período.', target: inventory('inventory/reports') },
  { key: 'inventory.purchases', category: 'inventory', name: 'Compras', summary: 'As compras lançadas, por fornecedor.', target: inventory('inventory/purchases') },
  { key: 'inventory.catalog', category: 'inventory', name: 'Lista de produtos e serviços', summary: 'O catálogo inteiro, com preço e custo.', target: { path: 'reports/sales?view=catalog', permission: 'products.access' } },
  { key: 'inventory.purchase_suggestion', category: 'inventory', name: 'Sugestão de compra', summary: 'O que comprar para voltar ao estoque mínimo.', target: inventory('inventory') },
  { key: 'inventory.consumed', category: 'inventory', name: 'Produtos consumidos', summary: 'O que os atendimentos consumiram de estoque, no período.', target: inventory('inventory/reports') },

  // --- Notas fiscais ------------------------------------------------------
  { key: 'tax.all', category: 'tax', name: 'Todas as notas fiscais', summary: 'As notas emitidas e recebidas.', target: null, planned: 'fase 10' },

  // --- Ranking ------------------------------------------------------------
  { key: 'ranking.sales', category: 'ranking', name: 'Ranking de vendas', summary: 'Quem mais realizou serviços e quem mais vendeu produtos.', target: { path: 'reports/sales?view=professionals', module: 'sales', permission: 'sales.view_all' } },
  { key: 'ranking.referrals', category: 'ranking', name: 'Indicação de clientes', summary: 'Como os clientes cadastrados no período conheceram o salão.', target: { path: 'reports/sales?view=referrals', permission: 'customers.access' } },

  // --- Mensagens ----------------------------------------------------------
  { key: 'messages.sent', category: 'messages', name: 'Mensagens enviadas', summary: 'Os envios de cuidados, retorno e pedido de avaliação.', target: careMessages },

  // --- Profissionais ------------------------------------------------------
  { key: 'professionals.panel', category: 'professionals', name: 'Painel de profissionais', summary: 'Clientes únicos, valor realizado, ticket médio, frequência e ocupação.', target: null, planned: 'fatia 9e' },
]

const REPORT_KEYS: ReadonlySet<string> = new Set(REPORT_CATALOG.map((report) => report.key))

export function isReportKey(value: unknown): value is string {
  return typeof value === 'string' && REPORT_KEYS.has(value)
}

export const REPORT_FAVORITES_LIMIT = 20

export type ResolvedReport = {
  key: string
  name: string
  summary: string
  /** Caminho dentro do salão ("finance/summary"). NULL = ainda não existe. */
  path: string | null
  /** "fatia 9b", "fase 10"… só quando ainda não existe. */
  planned: string | null
}

export type ResolvedReportCategory = { key: ReportCategoryKey; label: string; reports: ResolvedReport[] }

/**
 * O catálogo como UMA pessoa o vê num salão.
 *
 * Relatório que já tem tela só aparece se o salão tem o módulo da tela ligado e a
 * pessoa tem a permissão dela. O que ainda não existe aparece para todos, como
 * "em breve". Categoria sem nada para mostrar some.
 */
export function resolveReportCatalog(access: {
  modules: readonly string[]
  permissions: readonly string[]
}): ResolvedReportCategory[] {
  const modules = new Set(access.modules)
  const permissions = new Set(access.permissions)

  return REPORT_CATEGORIES.map((category) => ({
    key: category.key,
    label: category.label,
    reports: REPORT_CATALOG.filter((report) => {
      if (report.category !== category.key) return false
      if (!report.target) return true
      if (report.target.module && !modules.has(report.target.module)) return false
      return permissions.has(report.target.permission)
    }).map((report) => ({
      key: report.key,
      name: report.name,
      summary: report.summary,
      path: report.target?.path ?? null,
      planned: report.target ? null : (report.planned ?? null),
    })),
  })).filter((category) => category.reports.length > 0)
}

/** Lê os favoritos gravados: só chaves do catálogo, sem repetição, na ordem gravada. */
export function sanitizeReportFavorites(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter(isReportKey)))
}
