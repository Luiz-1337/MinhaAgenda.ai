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
  }[]
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

    planned.push({
      saleItemId: item.id,
      templateId: item.packageTemplateId,
      name: template.name,
      soldOn,
      expiresOn: packageExpiry(soldOn, template.validityDays),
      sellerId: item.professionalId,
      price: centsToNumeric(Math.max(0, toCents(item.total) ?? 0)),
      items: template.items.map((line, position) => ({
        position,
        kind: line.kind,
        serviceId: line.serviceId,
        productId: line.productId,
        description: line.description,
        quantity: line.quantity,
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
