/**
 * Tipos das telas de pacotes (docs/ROADMAP.md, fase 5, fatia 5a).
 *
 * Atravessam a fronteira servidor → cliente: dinheiro como string de coluna
 * numeric, datas de calendário como "YYYY-MM-DD".
 */
import type { CustomerPackageRow, PackageTemplateRow } from "@repo/db"

export type PackageTemplateDTO = PackageTemplateRow

export interface PackageTemplatesDTO {
  templates: PackageTemplateDTO[]
  /** Serviços e produtos ativos que um pacote pode incluir. */
  catalog: {
    services: { id: string; name: string }[]
    products: { id: string; name: string }[]
  }
  /** Cortesia de tela — a trava é no servidor. */
  can: { manage: boolean }
}

export interface SavePackageTemplateInput {
  salonId: string
  /** Ausente = criar. */
  templateId?: string
  name: string
  description?: string | null
  price: number
  /** NULL = não vence. */
  validityDays: number | null
  isActive: boolean
  items: { kind: "service" | "product"; serviceId?: string | null; productId?: string | null; quantity: number }[]
}

export type CustomerPackageDTO = CustomerPackageRow

export interface CustomerPackagesDTO {
  packages: CustomerPackageDTO[]
  truncated: boolean
  totals: { active: number; expired: number; used: number }
  /** O salão vende pacote pela comanda (tem o módulo de comandas e a permissão de criar). */
  canSell: boolean
}
