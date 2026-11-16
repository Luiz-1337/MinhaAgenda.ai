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
}

export interface SavePaymentMethodInput {
  salonId: string
  id?: string
  name: string
  kind: PaymentMethodKind
  feePercent: number
  settlementDays: number
  isActive: boolean
}

export interface SaleListItemDTO {
  id: string
  number: number
  status: SaleStatus
  saleDate: string
  total: string
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
  page?: number
}

export interface SaleItemDTO {
  id: string
  kind: "service" | "product"
  serviceId: string | null
  productId: string | null
  description: string
  professionalId: string | null
  professionalName: string | null
  quantity: string
  unitPrice: string | null
  discountAmount: string
  total: string
  appointmentId: string | null
}

export interface SalePaymentDTO {
  id: string
  paymentMethodId: string
  methodName: string
  amount: string
  feePercent: string
  feeAmount: string
  settlesOn: string
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
  professionals: { id: string; name: string }[]
  paymentMethods: PaymentMethodDTO[]
  /** O que o usuário atual pode fazer — a tela só esconde botão; a trava é no servidor. */
  can: {
    create: boolean
    edit: boolean
    delete: boolean
    invoice: boolean
    reopen: boolean
  }
}

/** Resultado de "Criar comanda" a partir de um agendamento. */
export type SaleDraftFromAppointment =
  | { existingSaleId: string }
  | {
      customer: SaleCustomerOption
      item: {
        appointmentId: string
        serviceId: string
        professionalId: string
        suggestedPrice: number | null
      }
    }

export interface SaleCustomerOption {
  id: string
  name: string
  phone: string
}

export interface SaleItemInput {
  kind: "service" | "product"
  serviceId?: string | null
  productId?: string | null
  professionalId?: string | null
  quantity: number
  unitPrice: number | null
  discountAmount: number
  appointmentId?: string | null
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
}
