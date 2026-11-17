/**
 * Tipos das telas de comanda (docs/ROADMAP.md, fase 1).
 *
 * Tudo aqui atravessa a fronteira servidor → cliente, então é serializável: datas
 * vão como string ISO e dinheiro como string de coluna numeric ("120.50") — a
 * conta é feita no servidor, em centavos (`@repo/db` domain/sales.ts).
 */
import type { PaymentMethodKind, SaleStatus } from "@repo/db"

export interface PaymentMethodDTO {
  id: string
  name: string
  kind: PaymentMethodKind
  feePercent: string
  settlementDays: number
  isActive: boolean
  /** Conta de destino no financeiro. Sempre null no salão sem o módulo `finance`. */
  accountId: string | null
}

export interface SavePaymentMethodInput {
  salonId: string
  id?: string
  name: string
  kind: PaymentMethodKind
  feePercent: number
  settlementDays: number
  isActive: boolean
  /** Só é gravada no salão com o módulo `finance`. */
  accountId?: string | null
}

export interface SaleListItemDTO {
  id: string
  number: number
  status: SaleStatus
  saleDate: string
  total: string
  /** Quanto da comanda faturada ainda não foi pago. "0.00" = quitada. */
  amountDue: string
  debtDueDate: string | null
  customerId: string
  customerName: string
  paymentMethods: string[]
}

export interface SaleListPage {
  rows: SaleListItemDTO[]
  total: number
  page: number
  pageSize: number
}

export interface SaleListFilters {
  status?: SaleStatus
  /** Datas no formato YYYY-MM-DD, no dia de Brasília. */
  from?: string
  to?: string
  /** Só comandas faturadas com valor em aberto. */
  debt?: boolean
  page?: number
}

export interface SaleItemDTO {
  id: string
  /** "package" = venda de pacote predefinido (fase 5). */
  kind: "service" | "product" | "package"
  serviceId: string | null
  productId: string | null
  packageTemplateId: string | null
  description: string
  professionalId: string | null
  professionalName: string | null
  /** Quem auxiliou no serviço (fase 3, fatia 3b). */
  assistantId: string | null
  assistantName: string | null
  quantity: string
  unitPrice: string | null
  discountAmount: string
  total: string
  appointmentId: string | null
  /** Item "do pacote" (fase 5): a linha do pacote do cliente que ele usa. */
  customerPackageItemId: string | null
  /** Nome do pacote de onde o item sai. */
  packageName: string | null
}

export interface SalePaymentDTO {
  id: string
  paymentMethodId: string
  methodName: string
  amount: string
  feePercent: string
  feeAmount: string
  settlesOn: string
  /** Quando o pagamento foi lançado (ISO) — o de hoje e o de depois, no débito. */
  paidAt: string
}

export interface SaleDetailDTO {
  id: string
  number: number
  status: SaleStatus
  saleDate: string
  notes: string | null
  subtotal: string
  discountTotal: string
  total: string
  /** Quanto ainda não foi pago. "0.00" = quitada (ou comanda não faturada). */
  amountDue: string
  /** Quando a cliente combinou de pagar ("YYYY-MM-DD"), se combinou. */
  debtDueDate: string | null
  invoicedAt: string | null
  voidedAt: string | null
  voidReason: string | null
  customer: { id: string; name: string; phone: string }
  items: SaleItemDTO[]
  payments: SalePaymentDTO[]
}

/** O que a tela da comanda precisa para montar os seletores. */
export interface SaleFormOptions {
  services: { id: string; name: string; suggestedPrice: number | null }[]
  products: { id: string; name: string; price: number | null }[]
  /** Pacotes predefinidos ativos — vazio com o módulo `packages` desligado (fase 5). */
  packageTemplates: { id: string; name: string; price: number | null }[]
  professionals: { id: string; name: string }[]
  paymentMethods: PaymentMethodDTO[]
  /** O salão tem o módulo `commissions`: a comanda mostra o auxiliar do serviço. */
  commissionsEnabled: boolean
  /** O salão tem o módulo `inventory`: reabrir a comanda devolve o estoque baixado. */
  inventoryEnabled: boolean
  /** O salão tem o módulo `packages`: a comanda vende pacote (fase 5). */
  packagesEnabled: boolean
  /** O que o usuário atual pode fazer — a tela só esconde botão; a trava é no servidor. */
  can: {
    create: boolean
    edit: boolean
    delete: boolean
    invoice: boolean
    /** Faturar deixando valor em aberto (fiado). */
    invoiceDebt: boolean
    reopen: boolean
  }
}

/**
 * Resultado de "Criar comanda" a partir de um ou mais agendamentos do MESMO
 * cliente (um, pelo diálogo do agendamento; vários, por "Agrupar em comanda").
 */
export type SaleDraftFromAppointment =
  | { existingSaleId: string }
  | {
      customer: SaleCustomerOption
      items: {
        appointmentId: string
        serviceId: string
        professionalId: string
        suggestedPrice: number | null
      }[]
    }

/** Uma linha da aba Vendas da ficha do cliente. */
export interface CustomerSaleDTO {
  id: string
  number: number
  status: SaleStatus
  saleDate: string
  total: string
  amountDue: string
  debtDueDate: string | null
  items: { description: string; total: string; professionalName: string | null }[]
}

/** Totais de débito: do cliente (na ficha) ou do salão (no resumo financeiro). */
export interface DebtTotalsDTO {
  openCents: number
  overdueCents: number
  count: number
}

/** O cartão Vendas da ficha do cliente. */
export interface CustomerSalesOverview {
  sales: CustomerSaleDTO[]
  /**
   * Quanto o cliente deve, somando TODAS as comandas dele. NULL para quem não vê
   * todas as comandas — mostrar um total parcial seria pior que não mostrar.
   */
  debt: DebtTotalsDTO | null
  /** O dia de hoje em Brasília, para marcar o que está atrasado. */
  today: string
}

export interface SaleCustomerOption {
  id: string
  name: string
  phone: string
}

export interface SaleItemInput {
  kind: "service" | "product" | "package"
  serviceId?: string | null
  productId?: string | null
  packageTemplateId?: string | null
  professionalId?: string | null
  /** Só em serviço; nunca o mesmo que `professionalId`. */
  assistantId?: string | null
  quantity: number
  unitPrice: number | null
  discountAmount: number
  appointmentId?: string | null
  /** Item "do pacote" (fase 5): sem cobrança, quantidade inteira. */
  customerPackageItemId?: string | null
}

/**
 * O que o cliente ainda pode usar dos pacotes dele: uma linha com saldo de um
 * pacote dentro da validade (fase 5, fatia 5b).
 */
export interface SalePackageBalanceDTO {
  lineId: string
  customerPackageId: string
  packageName: string
  kind: "service" | "product"
  serviceId: string | null
  productId: string | null
  description: string
  quantity: number
  /** Saldo sem contar esta comanda. */
  remaining: number
  expiresOn: string | null
}

export interface SaveSaleInput {
  salonId: string
  /** Ausente = criar. */
  saleId?: string
  customerId: string
  /** ISO. */
  saleDate: string
  notes?: string | null
  items: SaleItemInput[]
}

export interface InvoiceSaleInput {
  salonId: string
  saleId: string
  payments: { paymentMethodId: string; amount: number }[]
  /**
   * Confirma que os pagamentos somam menos que o total DE PROPÓSITO: a diferença
   * fica em aberto como débito do cliente. Exige a permissão `sales.invoice_debt`.
   */
  acceptDebt?: boolean
  /** Quando a cliente combinou de pagar ("YYYY-MM-DD"). Só com `acceptDebt`. */
  debtDueDate?: string | null
}

/** Recebimento (todo ou parte) do valor em aberto de uma comanda faturada. */
export interface ReceiveSalePaymentInput {
  salonId: string
  saleId: string
  payments: { paymentMethodId: string; amount: number }[]
}
