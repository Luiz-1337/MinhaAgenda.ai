/**
 * Tipos das telas de compras, fornecedores e marcas/categorias de produto
 * (docs/ROADMAP.md, fase 4, fatia 4b).
 *
 * Atravessam a fronteira servidor → cliente: quantidade e dinheiro como string de
 * coluna numeric, ou em centavos inteiros quando o servidor já somou.
 */
import type {
  ProductCatalogKind,
  ProductCatalogRow,
  PurchaseFormOptions,
  PurchaseRow,
  SupplierRow,
} from "@repo/db"

// ---------------------------------------------------------------------------
// Fornecedores
// ---------------------------------------------------------------------------

export type SupplierDTO = SupplierRow

export interface SuppliersDTO {
  suppliers: SupplierDTO[]
  /** Cortesia de tela — a trava é no servidor. */
  can: { manage: boolean }
}

export interface SaveSupplierInput {
  salonId: string
  /** Ausente = fornecedor novo. */
  supplierId?: string | null
  name: string
  document?: string | null
  phone?: string | null
  email?: string | null
  notes?: string | null
}

// ---------------------------------------------------------------------------
// Marcas e categorias
// ---------------------------------------------------------------------------

export type ProductCatalogEntryDTO = ProductCatalogRow

export interface ProductCatalogDTO {
  brands: ProductCatalogEntryDTO[]
  categories: ProductCatalogEntryDTO[]
  can: { manage: boolean }
}

export interface SaveCatalogEntryInput {
  salonId: string
  kind: ProductCatalogKind
  /** Ausente = nova. */
  id?: string | null
  name: string
}

// ---------------------------------------------------------------------------
// Compras
// ---------------------------------------------------------------------------

export type PurchaseDTO = PurchaseRow

export interface PurchasesFilters {
  /** "YYYY-MM-DD". Ausentes = sem corte por data. */
  from?: string
  to?: string
}

export interface PurchasesDTO {
  purchases: PurchaseDTO[]
  truncated: boolean
  from: string | null
  to: string | null
  /** Soma das compras listadas, em centavos. */
  totalCents: number
  can: { purchase: boolean }
}

/** Contas e categorias de despesa: onde a compra pode ser lançada no financeiro. */
export interface PurchaseFinanceOptions {
  accounts: { id: string; name: string }[]
  categories: { id: string; name: string }[]
}

export interface PurchaseFormDTO extends PurchaseFormOptions {
  /**
   * NULL = o salão não usa o financeiro ou a pessoa não pode lançar nele: a compra
   * só mexe no estoque.
   */
  finance: PurchaseFinanceOptions | null
  /** Hoje em Brasília, "YYYY-MM-DD". */
  today: string
}

export interface CreatePurchaseInput {
  salonId: string
  supplierId?: string | null
  purchasedOn: string
  invoiceNumber?: string | null
  notes?: string | null
  freight?: number | null
  discount?: number | null
  items: {
    productId: string
    quantity: number
    unitCost: number
    /** Lote e validade do item (fatia 4c). Só em produto com controle de estoque. */
    batchCode?: string | null
    expiresOn?: string | null
  }[]
  /** Ausente ou NULL = não lança no financeiro. */
  finance?: {
    paid: boolean
    firstDueDate?: string | null
    installments?: number | null
    accountId?: string | null
    categoryId?: string | null
  } | null
}
