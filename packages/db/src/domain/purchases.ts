/**
 * Regra das compras, dos fornecedores e das marcas/categorias de produto — pura,
 * sem I/O (docs/ROADMAP.md, fase 4, fatia 4b).
 *
 * Mesmo desenho dos outros módulos: o serviço busca os dados, estas funções
 * decidem, o serviço grava. Dinheiro em centavos inteiros, quantidade em milésimos
 * inteiros.
 *
 * A compra é um documento: lançou, valeu. Ela dá entrada no estoque dos produtos
 * controlados, atualiza o custo de compra de cada produto (último preço pago) e,
 * se quem lança pedir, gera as parcelas a pagar no financeiro.
 */
import { addMonthsToDate, brazilToday, isCalendarDate, paidAtFromDate, type PlannedTransaction } from './finance'
import { milliToNumeric, toMilli } from './inventory'
import { centsToNumeric, toCents } from './sales'

function cleanText(value: unknown, max: number): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text.slice(0, max) : null
}

// ============================================================================
// Fornecedor
// ============================================================================

const MAX_SUPPLIER_NAME = 120

export type SupplierPlan =
  | {
      ok: true
      name: string
      /** CPF (11 dígitos) ou CNPJ (14 caracteres), sem pontuação. */
      document: string | null
      phone: string | null
      email: string | null
      notes: string | null
    }
  | { ok: false; error: string }

/**
 * Valida o cadastro de um fornecedor.
 *
 * O documento é guardado sem pontuação. Aceita CPF (11 dígitos) e CNPJ (14
 * caracteres, letras incluídas — o CNPJ alfanumérico vale a partir de jul/2026).
 * Não confere dígito verificador: o cadastro é do salão, não um documento fiscal.
 */
export function planSupplier(draft: {
  name: unknown
  document?: unknown
  phone?: unknown
  email?: unknown
  notes?: unknown
}): SupplierPlan {
  const name = typeof draft.name === 'string' ? draft.name.trim().replace(/\s+/g, ' ') : ''
  if (name.length < 2) return { ok: false, error: 'Informe o nome do fornecedor' }
  if (name.length > MAX_SUPPLIER_NAME) {
    return { ok: false, error: `O nome aceita no máximo ${MAX_SUPPLIER_NAME} caracteres` }
  }

  let document: string | null = null
  const rawDocument = typeof draft.document === 'string' ? draft.document.replace(/[\s./-]/g, '').toUpperCase() : ''
  if (rawDocument) {
    const isCpf = /^\d{11}$/.test(rawDocument)
    const isCnpj = /^[0-9A-Z]{12}\d{2}$/.test(rawDocument)
    if (!isCpf && !isCnpj) return { ok: false, error: 'Informe um CPF (11 dígitos) ou um CNPJ (14 caracteres)' }
    document = rawDocument
  }

  const email = cleanText(draft.email, 160)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'E-mail inválido' }

  return {
    ok: true,
    name,
    document,
    phone: cleanText(draft.phone, 30),
    email: email ? email.toLowerCase() : null,
    notes: cleanText(draft.notes, 500),
  }
}

// ============================================================================
// Marca e categoria de produto
// ============================================================================

const MAX_CATALOG_NAME = 60

export type CatalogNamePlan = { ok: true; name: string } | { ok: false; error: string }

/** Nome de marca ou de categoria: aparado, com espaços simples, de 1 a 60 caracteres. */
export function planCatalogName(value: unknown): CatalogNamePlan {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!name) return { ok: false, error: 'Informe o nome' }
  if (name.length > MAX_CATALOG_NAME) {
    return { ok: false, error: `O nome aceita no máximo ${MAX_CATALOG_NAME} caracteres` }
  }
  return { ok: true, name }
}

// ============================================================================
// Compra
// ============================================================================

export const MAX_PURCHASE_ITEMS = 100

const MAX_QUANTITY_MILLI = 1_000_000_000 // 1.000.000 unidades
const MAX_UNIT_COST_CENTS = 100_000_000 // R$ 1.000.000,00
const MAX_TOTAL_CENTS = 10_000_000_000 // R$ 100.000.000,00 — cabe em numeric(12,2)

export type PurchaseDraft = {
  supplierId?: unknown
  purchasedOn: unknown
  invoiceNumber?: unknown
  notes?: unknown
  /** Frete e outros custos da nota que não são produto. */
  freight?: unknown
  discount?: unknown
  items: unknown
}

export type PurchaseRefs = {
  /** Fornecedores do salão citados na compra. */
  suppliers: ReadonlyMap<string, { name: string; isActive: boolean }>
  /** Produtos do salão citados na compra. */
  products: ReadonlyMap<string, { name: string; trackStock: boolean; costPrice: string | null }>
}

export type PlannedPurchaseItem = {
  position: number
  productId: string
  /** Nome do produto na hora da compra. */
  description: string
  quantity: string
  unitCost: string
  totalAmount: string
  /** O custo que o produto tinha antes desta compra. */
  previousCost: string | null
  /** Produto controlado: o item dá entrada no estoque. */
  movesStock: boolean
}

export type PurchasePlan =
  | {
      ok: true
      supplierId: string | null
      supplierName: string | null
      purchasedOn: string
      invoiceNumber: string | null
      notes: string | null
      itemsAmount: string
      freightAmount: string
      discountAmount: string
      totalAmount: string
      totalCents: number
      items: PlannedPurchaseItem[]
      /**
       * Custo novo de cada produto: o último preço pago. Com o mesmo produto em
       * dois itens, vale o último. Item a custo zero (bonificação) não entra — de
       * graça não é o preço do produto.
       */
      costUpdates: { productId: string; costPrice: string }[]
    }
  | { ok: false; error: string }

function optionalMoneyCents(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value !== 'number') return null
  const cents = toCents(value)
  return cents === null || cents < 0 || cents > MAX_TOTAL_CENTS ? null : cents
}

/**
 * Valida uma compra contra os cadastros do salão e devolve o que gravar.
 *
 *   - Pelo menos um item; cada item com produto do salão, quantidade maior que
 *     zero e custo unitário (zero é aceito: bonificação).
 *   - Total = itens + frete − desconto. O desconto não pode passar de itens + frete.
 *   - A data da compra não pode ser futura: a entrada no estoque acontece agora.
 *   - Produto sem controle de estoque entra na compra (e tem o custo atualizado),
 *     mas não gera entrada — o salão escolhe o que acompanha.
 *   - Fornecedor é opcional; se informado, tem que existir e estar ativo.
 */
export function planPurchase(draft: PurchaseDraft, refs: PurchaseRefs, now: Date): PurchasePlan {
  if (!isCalendarDate(draft.purchasedOn)) return { ok: false, error: 'Informe a data da compra' }
  if (draft.purchasedOn > brazilToday(now)) return { ok: false, error: 'A data da compra não pode ser futura' }

  let supplierId: string | null = null
  let supplierName: string | null = null
  if (draft.supplierId !== null && draft.supplierId !== undefined && draft.supplierId !== '') {
    const supplier = typeof draft.supplierId === 'string' ? refs.suppliers.get(draft.supplierId) : undefined
    if (!supplier) return { ok: false, error: 'Fornecedor não encontrado' }
    if (!supplier.isActive) return { ok: false, error: 'Fornecedor inativo' }
    supplierId = draft.supplierId as string
    supplierName = supplier.name
  }

  if (!Array.isArray(draft.items) || draft.items.length === 0) {
    return { ok: false, error: 'Adicione pelo menos um produto' }
  }
  if (draft.items.length > MAX_PURCHASE_ITEMS) {
    return { ok: false, error: `Uma compra aceita no máximo ${MAX_PURCHASE_ITEMS} itens` }
  }

  const items: PlannedPurchaseItem[] = []
  const lastCost = new Map<string, string>()
  let itemsCents = 0

  for (const [index, raw] of draft.items.entries()) {
    const line = index + 1
    const item = (raw ?? {}) as { productId?: unknown; quantity?: unknown; unitCost?: unknown }

    const product = typeof item.productId === 'string' ? refs.products.get(item.productId) : undefined
    if (!product) return { ok: false, error: `Item ${line}: escolha o produto` }

    const quantityMilli = typeof item.quantity === 'number' ? toMilli(item.quantity) : null
    if (quantityMilli === null || quantityMilli <= 0 || quantityMilli > MAX_QUANTITY_MILLI) {
      return { ok: false, error: `Item ${line}: informe uma quantidade maior que zero` }
    }

    const costCents = typeof item.unitCost === 'number' ? toCents(item.unitCost) : null
    if (costCents === null || costCents < 0 || costCents > MAX_UNIT_COST_CENTS) {
      return { ok: false, error: `Item ${line}: informe o custo unitário` }
    }

    const totalCents = Math.round((quantityMilli * costCents) / 1000)
    itemsCents += totalCents

    const productId = item.productId as string
    const unitCost = centsToNumeric(costCents)
    if (costCents > 0) lastCost.set(productId, unitCost)

    items.push({
      position: index,
      productId,
      description: product.name,
      quantity: milliToNumeric(quantityMilli),
      unitCost,
      totalAmount: centsToNumeric(totalCents),
      previousCost: product.costPrice === null ? null : centsToNumeric(toCents(product.costPrice) ?? 0),
      movesStock: product.trackStock,
    })
  }

  const freightCents = optionalMoneyCents(draft.freight)
  if (freightCents === null) return { ok: false, error: 'Frete inválido' }

  const discountCents = optionalMoneyCents(draft.discount)
  if (discountCents === null) return { ok: false, error: 'Desconto inválido' }
  if (discountCents > itemsCents + freightCents) {
    return { ok: false, error: 'O desconto não pode ser maior que o valor da compra' }
  }

  const totalCents = itemsCents + freightCents - discountCents
  if (totalCents > MAX_TOTAL_CENTS) return { ok: false, error: 'Valor da compra alto demais' }

  return {
    ok: true,
    supplierId,
    supplierName,
    purchasedOn: draft.purchasedOn,
    invoiceNumber: cleanText(draft.invoiceNumber, 60),
    notes: cleanText(draft.notes, 500),
    itemsAmount: centsToNumeric(itemsCents),
    freightAmount: centsToNumeric(freightCents),
    discountAmount: centsToNumeric(discountCents),
    totalAmount: centsToNumeric(totalCents),
    totalCents,
    items,
    costUpdates: Array.from(lastCost, ([productId, costPrice]) => ({ productId, costPrice })),
  }
}

// ============================================================================
// Compra → financeiro
// ============================================================================

export const MAX_PURCHASE_INSTALLMENTS = 24

export type PurchaseFinanceDraft = {
  /** true = já foi paga (sai da conta no dia da compra). false = fica a pagar. */
  paid: unknown
  /** Vencimento da primeira parcela. Só quando fica a pagar. */
  firstDueDate?: unknown
  /** Em quantas parcelas mensais. Só quando fica a pagar. */
  installments?: unknown
  /** Obrigatória quando já foi paga; opcional (a conta prevista) quando fica a pagar. */
  accountId?: unknown
  categoryId?: unknown
}

export type PurchaseFinanceRefs = {
  accounts: ReadonlyMap<string, { isActive: boolean }>
  categories: ReadonlyMap<string, { kind: 'income' | 'expense'; isActive: boolean }>
}

export type PurchasePayablesPlan = { ok: true; rows: PlannedTransaction[] } | { ok: false; error: string }

/** Divide um total em N parcelas iguais; os centavos que sobram vão para a última. */
export function splitInstallments(totalCents: number, installments: number): number[] {
  const base = Math.floor(totalCents / installments)
  const parts = Array.from({ length: installments }, () => base)
  parts[installments - 1] += totalCents - base * installments
  return parts
}

/**
 * As parcelas que uma compra gera no financeiro.
 *
 *   - Já paga: uma linha só, baixada no dia da compra, e a conta é obrigatória
 *     (dinheiro que saiu tem que ter saído de algum lugar).
 *   - A pagar: de 1 a 24 parcelas mensais a partir do primeiro vencimento, que não
 *     pode ser antes da compra. A soma das parcelas é exatamente o total.
 *   - A competência de todas é o dia da compra: a despesa é do mês em que se
 *     comprou, não do mês em que cada boleto vence.
 *   - Compra sem valor (só bonificação) não gera lançamento.
 */
export function planPurchasePayables(
  input: {
    totalCents: number
    purchasedOn: string
    supplierName: string | null
    invoiceNumber: string | null
  },
  draft: PurchaseFinanceDraft,
  refs: PurchaseFinanceRefs,
  now: Date
): PurchasePayablesPlan {
  if (typeof draft.paid !== 'boolean') return { ok: false, error: 'Informe se a compra já foi paga' }
  if (input.totalCents <= 0) return { ok: false, error: 'Compra sem valor não gera lançamento no financeiro' }

  let accountId: string | null = null
  if (draft.accountId !== null && draft.accountId !== undefined && draft.accountId !== '') {
    const account = typeof draft.accountId === 'string' ? refs.accounts.get(draft.accountId) : undefined
    if (!account) return { ok: false, error: 'Conta não encontrada' }
    if (!account.isActive) return { ok: false, error: 'Conta inativa' }
    accountId = draft.accountId as string
  }

  let categoryId: string | null = null
  if (draft.categoryId !== null && draft.categoryId !== undefined && draft.categoryId !== '') {
    const category = typeof draft.categoryId === 'string' ? refs.categories.get(draft.categoryId) : undefined
    if (!category) return { ok: false, error: 'Categoria não encontrada' }
    if (!category.isActive) return { ok: false, error: 'Categoria inativa' }
    if (category.kind !== 'expense') return { ok: false, error: 'Escolha uma categoria de despesa' }
    categoryId = draft.categoryId as string
  }

  const base = ['Compra', input.invoiceNumber ? `NF ${input.invoiceNumber}` : null].filter(Boolean).join(' ')
  const description = input.supplierName ? `${base} — ${input.supplierName}` : base

  const common = {
    direction: 'out' as const,
    kind: 'purchase' as const,
    feeAmount: '0.00',
    competenceDate: input.purchasedOn,
    accountId,
    categoryId,
    paymentMethodId: null,
    customerId: null,
    professionalId: null,
    counterparty: input.supplierName ? input.supplierName.slice(0, 120) : null,
    notes: null,
  }

  if (draft.paid) {
    if (!accountId) return { ok: false, error: 'Informe a conta de onde o pagamento saiu' }
    // planPurchase já barrou data futura; a conferência aqui protege quem chamar só esta função.
    if (input.purchasedOn > brazilToday(now)) return { ok: false, error: 'A baixa não pode ter data futura' }

    const amount = centsToNumeric(input.totalCents)
    return {
      ok: true,
      rows: [
        {
          ...common,
          status: 'paid',
          description: description.slice(0, 200),
          amount,
          netAmount: amount,
          dueDate: input.purchasedOn,
          paidAt: paidAtFromDate(input.purchasedOn),
        },
      ],
    }
  }

  if (!isCalendarDate(draft.firstDueDate)) return { ok: false, error: 'Informe o vencimento' }
  if (draft.firstDueDate < input.purchasedOn) {
    return { ok: false, error: 'O vencimento não pode ser antes da data da compra' }
  }

  const installments = draft.installments === null || draft.installments === undefined ? 1 : draft.installments
  if (
    typeof installments !== 'number' ||
    !Number.isInteger(installments) ||
    installments < 1 ||
    installments > MAX_PURCHASE_INSTALLMENTS
  ) {
    return { ok: false, error: `Informe de 1 a ${MAX_PURCHASE_INSTALLMENTS} parcelas` }
  }
  // Parcela de zero centavo não existe (CHECK de valor no financeiro).
  if (installments > input.totalCents) return { ok: false, error: 'Parcelas demais para o valor da compra' }

  const firstDueDate = draft.firstDueDate
  const rows = splitInstallments(input.totalCents, installments).map((cents, index): PlannedTransaction => {
    const suffix = installments > 1 ? ` (${index + 1}/${installments})` : ''
    const amount = centsToNumeric(cents)
    return {
      ...common,
      status: 'open',
      description: `${description.slice(0, 200 - suffix.length)}${suffix}`,
      amount,
      netAmount: amount,
      dueDate: addMonthsToDate(firstDueDate, index),
      paidAt: null,
    }
  })

  return { ok: true, rows }
}

// ============================================================================
// Situação financeira e exclusão
// ============================================================================

/**
 * none    = a compra não gerou lançamento no financeiro
 * open    = nenhuma parcela paga
 * partial = parte das parcelas paga
 * paid    = todas pagas
 */
export type PurchasePaymentStatus = 'none' | 'open' | 'partial' | 'paid'

export function purchasePaymentStatus(input: { installments: number; paidInstallments: number }): PurchasePaymentStatus {
  if (input.installments <= 0) return 'none'
  if (input.paidInstallments <= 0) return 'open'
  return input.paidInstallments >= input.installments ? 'paid' : 'partial'
}

/**
 * Excluir a compra apaga as entradas no estoque e as parcelas no financeiro. Com
 * parcela paga, o dinheiro já saiu de uma conta: apagar a parcela mudaria o saldo
 * sem deixar rastro. Devolve o motivo se não pode.
 */
export function purchaseDeleteBlocker(input: { paidInstallments: number }): string | null {
  if (input.paidInstallments > 0) {
    return 'Esta compra tem parcela paga. Estorne a baixa no Financeiro antes de excluir'
  }
  return null
}

/**
 * Ao excluir a compra, o custo de quais produtos volta ao que era.
 *
 * Só volta quando o custo atual do produto ainda é o desta compra: se outra compra
 * (ou alguém, na tela) já mudou o custo depois, ele fica como está.
 */
export function planCostRestore(
  items: readonly { productId: string; unitCost: string; previousCost: string | null }[],
  currentCosts: ReadonlyMap<string, string | null>
): { productId: string; costPrice: string | null }[] {
  // Com o mesmo produto em dois itens, o custo gravado foi o do último; o custo
  // "de antes" é o mesmo nos dois (lido antes de gravar a compra).
  const lastByProduct = new Map<string, { unitCost: string; previousCost: string | null }>()
  for (const item of items) {
    if ((toCents(item.unitCost) ?? 0) > 0) lastByProduct.set(item.productId, item)
  }

  const restores: { productId: string; costPrice: string | null }[] = []
  for (const [productId, item] of lastByProduct) {
    const current = currentCosts.get(productId)
    if (current === undefined || current === null) continue
    if (toCents(current) !== toCents(item.unitCost)) continue
    if (toCents(item.previousCost) === toCents(current)) continue
    restores.push({ productId, costPrice: item.previousCost })
  }
  return restores
}
