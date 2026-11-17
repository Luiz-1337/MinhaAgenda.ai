/**
 * Pacotes — regra pura, sem I/O (docs/ROADMAP.md, fase 5, fatia 5a).
 *
 * Um pacote predefinido é um modelo: o que inclui (sessões de um serviço, unidades
 * de um produto), quanto custa e por quantos dias vale. Vender é pôr o modelo como
 * item da comanda; quando a comanda é faturada, nasce o pacote do cliente, que
 * COPIA o modelo daquele momento.
 *
 * Mesmo desenho dos outros módulos: o serviço busca os dados, estas funções
 * decidem, o serviço grava. Dinheiro em centavos inteiros.
 */
import type { PackageItemKind } from '../schema'
import { addDaysToDate, brazilToday } from './finance'
import { centsToNumeric, toCents } from './sales'

// ============================================================================
// Modelo (pacote predefinido)
// ============================================================================

export const MAX_PACKAGE_ITEMS = 30
export const MAX_PACKAGE_ITEM_QUANTITY = 999
export const MAX_PACKAGE_VALIDITY_DAYS = 3650
const MAX_PACKAGE_PRICE_CENTS = 100_000_000 // R$ 1.000.000,00
const MAX_NAME_LENGTH = 120
const MAX_DESCRIPTION_LENGTH = 500

export type PackageTemplateItemDraft = {
  kind: PackageItemKind
  serviceId?: string | null
  productId?: string | null
  quantity: number
}

export type PackageTemplateDraft = {
  name: string
  description?: string | null
  price: number
  /** NULL = não vence. */
  validityDays: number | null
  isActive: boolean
  items: readonly PackageTemplateItemDraft[]
}

/** Serviços e produtos do salão que um modelo pode incluir, JÁ filtrados pelo salão. */
export type PackageCatalog = {
  services: ReadonlyMap<string, { name: string }>
  products: ReadonlyMap<string, { name: string }>
}

export type PlannedPackageTemplateItem = {
  position: number
  kind: PackageItemKind
  serviceId: string | null
  productId: string | null
  quantity: number
}

export type PackageTemplatePlan =
  | {
      ok: true
      template: {
        name: string
        description: string | null
        price: string
        validityDays: number | null
        isActive: boolean
      }
      items: PlannedPackageTemplateItem[]
    }
  | { ok: false; error: string }

/**
 * Valida um modelo de pacote. Item que não está no catálogo do salão é erro, nunca
 * "ignora": é de outro salão ou não existe.
 */
export function planPackageTemplate(draft: PackageTemplateDraft, catalog: PackageCatalog): PackageTemplatePlan {
  const name = (draft.name ?? '').trim()
  if (!name) return { ok: false, error: 'Informe o nome do pacote' }
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: 'Nome do pacote muito longo' }

  const description = (draft.description ?? '').trim() || null
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, error: 'Descrição muito longa' }
  }

  const priceCents = toCents(draft.price)
  if (priceCents === null || priceCents < 0 || priceCents > MAX_PACKAGE_PRICE_CENTS) {
    return { ok: false, error: 'Valor do pacote inválido' }
  }

  let validityDays: number | null = null
  if (draft.validityDays !== null && draft.validityDays !== undefined) {
    if (
      !Number.isInteger(draft.validityDays) ||
      draft.validityDays < 1 ||
      draft.validityDays > MAX_PACKAGE_VALIDITY_DAYS
    ) {
      return { ok: false, error: `A validade vai de 1 a ${MAX_PACKAGE_VALIDITY_DAYS} dias` }
    }
    validityDays = draft.validityDays
  }

  if (draft.items.length === 0) return { ok: false, error: 'O pacote precisa de pelo menos um item' }
  if (draft.items.length > MAX_PACKAGE_ITEMS) {
    return { ok: false, error: `O pacote aceita no máximo ${MAX_PACKAGE_ITEMS} itens` }
  }

  const items: PlannedPackageTemplateItem[] = []
  const seen = new Set<string>()

  for (const [index, item] of draft.items.entries()) {
    const label = `Item ${index + 1}`

    let serviceId: string | null = null
    let productId: string | null = null
    if (item.kind === 'service') {
      if (!item.serviceId || !catalog.services.has(item.serviceId)) {
        return { ok: false, error: `${label}: serviço não encontrado` }
      }
      serviceId = item.serviceId
    } else if (item.kind === 'product') {
      if (!item.productId || !catalog.products.has(item.productId)) {
        return { ok: false, error: `${label}: produto não encontrado` }
      }
      productId = item.productId
    } else {
      return { ok: false, error: `${label}: tipo inválido` }
    }

    const key = `${item.kind}:${serviceId ?? productId}`
    if (seen.has(key)) return { ok: false, error: `${label}: já está no pacote` }
    seen.add(key)

    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_PACKAGE_ITEM_QUANTITY) {
      return { ok: false, error: `${label}: a quantidade vai de 1 a ${MAX_PACKAGE_ITEM_QUANTITY}` }
    }

    items.push({ position: index, kind: item.kind, serviceId, productId, quantity: item.quantity })
  }

  return {
    ok: true,
    template: { name, description, price: centsToNumeric(priceCents), validityDays, isActive: draft.isActive },
    items,
  }
}

/**
 * Por que um modelo não pode ser apagado. Modelo que já entrou numa comanda (até
 * numa aberta) não se apaga — o item da comanda aponta para ele; desativa-se.
 */
export function packageTemplateDeleteBlocker(input: { saleItems: number }): string | null {
  if (input.saleItems > 0) {
    return 'Este pacote já foi usado em comanda. Desative-o em vez de excluir'
  }
  return null
}

// ============================================================================
// Pacote do cliente, nascido do faturamento
// ============================================================================

/** Até quando vale um pacote vendido em `soldOn`. NULL = não vence. */
export function packageExpiry(soldOn: string, validityDays: number | null): string | null {
  if (validityDays === null || validityDays === undefined) return null
  return addDaysToDate(soldOn, validityDays)
}

export type PackageSaleItem = {
  id: string
  packageTemplateId: string | null
  professionalId: string | null
  /** Coluna numeric(12,2). */
  total: string
}

export type TemplateForSale = {
  name: string
  validityDays: number | null
  items: readonly {
    kind: PackageItemKind
    serviceId: string | null
    productId: string | null
    /** Nome do serviço ou produto agora — vira a cópia do pacote do cliente. */
    description: string
    quantity: number
    /**
     * Preço de tabela do serviço ou produto agora (numeric do banco). É o peso do
     * rateio do preço do pacote entre as linhas. NULL ou zero = sem peso.
     */
    listPrice?: string | number | null
  }[]
}

/**
 * Reparte o preço pago pelo pacote entre as linhas (fatia 5b): é o "valor" de
 * cada linha, de onde sai o valor de cada sessão — a base da comissão de quem
 * executa.
 *
 * Proporcional ao preço de tabela × quantidade de cada linha: num pacote de 3
 * cortes (R$ 50) e 1 hidratação (R$ 150) por R$ 270, o corte vale 3×50/300 do
 * pacote. Sem nenhum preço de tabela, reparte pela quantidade. Em centavos, com o
 * resto distribuído pelas maiores frações: a soma das linhas é EXATAMENTE o preço.
 */
export function splitPackagePrice(
  priceCents: number,
  lines: readonly { quantity: number; listPrice?: string | number | null }[]
): number[] {
  if (lines.length === 0) return []
  const total = Math.max(0, Math.round(priceCents))

  const priced = lines.map((line) => Math.max(0, toCents(line.listPrice ?? null) ?? 0) * Math.max(0, line.quantity))
  const weights = priced.some((weight) => weight > 0) ? priced : lines.map((line) => Math.max(0, line.quantity))
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
  if (weightSum <= 0) return lines.map((_, index) => (index === 0 ? total : 0))

  const exact = weights.map((weight) => (total * weight) / weightSum)
  const shares = exact.map(Math.floor)
  let rest = total - shares.reduce((sum, share) => sum + share, 0)

  // Maior fração primeiro; empate fica com a linha de cima.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (const { index } of order) {
    if (rest <= 0) break
    shares[index] += 1
    rest -= 1
  }

  return shares
}

export type PlannedCustomerPackage = {
  saleItemId: string
  templateId: string
  name: string
  soldOn: string
  expiresOn: string | null
  sellerId: string | null
  price: string
  items: {
    position: number
    kind: PackageItemKind
    serviceId: string | null
    productId: string | null
    description: string
    quantity: number
    /** Parte do preço do pacote que cabe à linha (numeric(12,2)). */
    value: string
  }[]
}

/**
 * Os pacotes que uma comanda faturada cria: um por item de pacote.
 *
 * A data do pacote é o dia da comanda em Brasília — é o que a cliente vê no
 * comprovante. A validade conta a partir dela. Modelo que sumiu (não deveria: a
 * FK não deixa apagar) não gera pacote.
 */
export function planCustomerPackages(input: {
  saleDate: Date
  items: readonly PackageSaleItem[]
  templates: ReadonlyMap<string, TemplateForSale>
}): PlannedCustomerPackage[] {
  const soldOn = brazilToday(input.saleDate)
  const planned: PlannedCustomerPackage[] = []

  for (const item of input.items) {
    if (!item.packageTemplateId) continue
    const template = input.templates.get(item.packageTemplateId)
    if (!template) continue

    const priceCents = Math.max(0, toCents(item.total) ?? 0)
    const values = splitPackagePrice(priceCents, template.items)

    planned.push({
      saleItemId: item.id,
      templateId: item.packageTemplateId,
      name: template.name,
      soldOn,
      expiresOn: packageExpiry(soldOn, template.validityDays),
      sellerId: item.professionalId,
      price: centsToNumeric(priceCents),
      items: template.items.map((line, position) => ({
        position,
        kind: line.kind,
        serviceId: line.serviceId,
        productId: line.productId,
        description: line.description,
        quantity: line.quantity,
        value: centsToNumeric(values[position] ?? 0),
      })),
    })
  }

  return planned
}

// ============================================================================
// Situação
// ============================================================================

/**
 * active  = tem saldo e está na validade
 * used    = saldo zero
 * expired = passou da validade com saldo
 */
export type CustomerPackageStatus = 'active' | 'used' | 'expired'

export function customerPackageStatus(input: {
  expiresOn: string | null
  /** Quanto resta, somando os itens. */
  remaining: number
  today: string
}): CustomerPackageStatus {
  if (input.remaining <= 0) return 'used'
  // Vale ATÉ o dia da validade, inclusive.
  if (input.expiresOn !== null && input.expiresOn < input.today) return 'expired'
  return 'active'
}

// ============================================================================
// Uso do pacote na comanda (fatia 5b)
// ============================================================================

/**
 * Uma linha do pacote do cliente, como o serviço a carrega para conferir um uso.
 *
 * Não há tabela de consumo: usar é ter um item de comanda FATURADA apontando para
 * a linha. `used` é o que as OUTRAS comandas faturadas já usaram — reabrir uma
 * comanda devolve o saldo sem que nada precise ser desfeito.
 */
export type PackageLine = {
  customerPackageId: string
  customerId: string
  packageName: string
  kind: PackageItemKind
  serviceId: string | null
  productId: string | null
  description: string
  quantity: number
  used: number
  soldOn: string
  expiresOn: string | null
}

export type PackageUse = {
  customerPackageItemId: string
  /** numeric(10,3) do banco, ou número do formulário. */
  quantity: string | number
}

function formatDay(day: string): string {
  const [year, month, date] = day.split('-')
  return `${date}/${month}/${year}`
}

/**
 * Confere se a comanda pode usar estas linhas de pacote. Roda ao salvar (para
 * avisar cedo) e de novo ao faturar, com as linhas travadas — é no faturamento que
 * o saldo baixa.
 *
 *   - a linha é do pacote DESTE cliente;
 *   - a comanda é do período do pacote: não antes da compra, não depois da
 *     validade (vale até o último dia, inclusive);
 *   - a soma dos itens da comanda que usam a mesma linha cabe no saldo.
 */
export function planPackageUsage(input: {
  customerId: string
  /** Dia da comanda em Brasília ("YYYY-MM-DD"). */
  saleDay: string
  uses: readonly PackageUse[]
  lines: ReadonlyMap<string, PackageLine>
}): { ok: true } | { ok: false; error: string } {
  const usedByLine = new Map<string, number>()

  for (const use of input.uses) {
    const quantity = Number(use.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      return { ok: false, error: 'A quantidade de um item do pacote tem de ser inteira' }
    }
    usedByLine.set(use.customerPackageItemId, (usedByLine.get(use.customerPackageItemId) ?? 0) + quantity)
  }

  for (const [lineId, quantity] of usedByLine) {
    const line = input.lines.get(lineId)
    if (!line) return { ok: false, error: 'Um item do pacote não foi encontrado' }

    const label = `Pacote "${line.packageName}"`
    if (line.customerId !== input.customerId) {
      return { ok: false, error: `${label}: é de outro cliente` }
    }
    if (input.saleDay < line.soldOn) {
      return { ok: false, error: `${label}: a comanda é de antes da compra do pacote` }
    }
    if (line.expiresOn !== null && input.saleDay > line.expiresOn) {
      return { ok: false, error: `${label}: venceu em ${formatDay(line.expiresOn)}` }
    }

    const remaining = Math.max(0, line.quantity - line.used)
    if (quantity > remaining) {
      return {
        ok: false,
        error:
          remaining === 0
            ? `${label}: ${line.description} não tem mais saldo`
            : `${label}: ${line.description} tem saldo de ${remaining}, e a comanda usa ${quantity}`,
      }
    }
  }

  return { ok: true }
}

/**
 * Quanto vale o que um item da comanda usou de uma linha: o valor da linha
 * dividido pelas sessões dela, vezes as usadas. É a base da comissão de quem
 * executou (o item em si não é cobrado). Arredonda por item, ao centavo.
 */
export function packageUseValue(input: {
  lineValue: string | number
  lineQuantity: number
  usedQuantity: string | number
}): string {
  const valueCents = Math.max(0, toCents(input.lineValue) ?? 0)
  const used = Number(input.usedQuantity)
  if (input.lineQuantity <= 0 || !Number.isFinite(used) || used <= 0) return centsToNumeric(0)
  return centsToNumeric(Math.round((valueCents * used) / input.lineQuantity))
}
