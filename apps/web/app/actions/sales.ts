"use server"

import { revalidatePath } from "next/cache"
import {
  db,
  customers,
  appointments,
  paymentMethods,
  products,
  professionals,
  saleItems,
  sales,
  services,
  and,
  asc,
  eq,
  ilike,
  or,
  createSaleService,
  getSaleService,
  invoiceSaleService,
  listSalesService,
  reopenSaleService,
  updateSaleService,
  voidSaleService,
  type PermissionKey,
  type SaleDetail,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can, getSalonPermissions } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import { suggestedPriceFromService, toAmount } from "@/lib/utils/money.utils"
import {
  invoiceSaleSchema,
  saleListFiltersSchema,
  saveSaleSchema,
} from "@/lib/schemas/sales.schema"
import type { ActionResult } from "@/lib/types/common"
import type {
  InvoiceSaleInput,
  SaleCustomerOption,
  SaleDetailDTO,
  SaleDraftFromAppointment,
  SaleFormOptions,
  SaleListFilters,
  SaleListPage,
  SaveSaleInput,
} from "@/lib/types/sale"

/**
 * Comandas (docs/ROADMAP.md, fase 1).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `sales` ligado no salão
 * → permissão. O `salonId` chega do cliente, então estar logado não basta (ver
 * __tests__/lib/actions-authz.test.ts).
 *
 * A regra de comanda não mora aqui: `@repo/db` (domain/sales.ts decide,
 * services/sales.service.ts grava). Esta camada autoriza, valida o FORMATO da
 * entrada e traduz o resultado para a tela.
 */

const PAGE_SIZE = 30

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "sales"))) {
    return { error: "Comandas não estão disponíveis neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

/** Vínculos de profissional ATIVOS do usuário neste salão. */
async function ownProfessionalIds(salonId: string, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(
      and(
        eq(professionals.salonId, salonId),
        eq(professionals.userId, userId),
        eq(professionals.isActive, true)
      )
    )
  return rows.map((r) => r.id)
}

/**
 * O usuário pode ver ESTA comanda?
 *
 * Sem `sales.view_all`, só as próprias (criou, ou tem item de um vínculo dele); sem
 * `sales.view_invoiced`, nenhuma faturada. Devolve a mesma mensagem de "não
 * encontrada" nos dois casos — não confirma a existência de uma comanda que a
 * pessoa não pode ver.
 */
async function loadVisibleSale(
  salonId: string,
  userId: string,
  saleId: string
): Promise<SaleDetail | { error: string }> {
  const sale = await getSaleService(salonId, saleId)
  if (!sale) return { error: "Comanda não encontrada" }

  const permissions = await getSalonPermissions(salonId, userId)

  if (sale.status === "invoiced" && !permissions.has("sales.view_invoiced")) {
    return { error: "Comanda não encontrada" }
  }

  if (!permissions.has("sales.view_all") && sale.createdBy !== userId) {
    const mine = new Set(await ownProfessionalIds(salonId, userId))
    const hasOwnItem = sale.items.some((item) => item.professionalId && mine.has(item.professionalId))
    if (!hasOwnItem) return { error: "Comanda não encontrada" }
  }

  return sale
}

function toDetailDTO(sale: SaleDetail): SaleDetailDTO {
  return {
    id: sale.id,
    number: sale.number,
    status: sale.status,
    saleDate: sale.saleDate.toISOString(),
    notes: sale.notes,
    subtotal: sale.subtotal,
    discountTotal: sale.discountTotal,
    total: sale.total,
    invoicedAt: sale.invoicedAt ? sale.invoicedAt.toISOString() : null,
    voidedAt: sale.voidedAt ? sale.voidedAt.toISOString() : null,
    voidReason: sale.voidReason,
    customer: sale.customer,
    items: sale.items,
    payments: sale.payments,
  }
}

function revalidateSales(salonId: string, saleId?: string) {
  revalidatePath(`/${salonId}/sales`)
  if (saleId) revalidatePath(`/${salonId}/sales/${saleId}`)
  // Faturar e reabrir mudam o desfecho de agendamentos.
  revalidatePath(`/${salonId}/schedule`)
}

// ============================================================================
// Leitura
// ============================================================================

export async function listSales(
  salonId: string,
  filters: SaleListFilters = {}
): Promise<SaleListPage | { error: string }> {
  const auth = await authorizeSalon(salonId, "sales.access")
  if ("error" in auth) return auth

  const parsed = saleListFiltersSchema.safeParse(filters)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  try {
    const permissions = await getSalonPermissions(salonId, auth.userId)
    const page = parsed.data.page ?? 1

    const result = await listSalesService({
      salonId,
      status: parsed.data.status,
      includeVoid: parsed.data.status === "void",
      excludeInvoiced: !permissions.has("sales.view_invoiced"),
      // O filtro é pelo DIA DE BRASÍLIA (UTC−3, sem horário de verão desde 2019).
      from: parsed.data.from ? new Date(`${parsed.data.from}T00:00:00-03:00`) : undefined,
      to: parsed.data.to ? new Date(`${parsed.data.to}T23:59:59.999-03:00`) : undefined,
      visibleTo: permissions.has("sales.view_all")
        ? undefined
        : { userId: auth.userId, professionalIds: await ownProfessionalIds(salonId, auth.userId) },
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    })

    return {
      rows: result.rows.map((row) => ({ ...row, saleDate: row.saleDate.toISOString() })),
      total: result.total,
      page,
      pageSize: PAGE_SIZE,
    }
  } catch (error) {
    console.error("Erro ao listar comandas:", error)
    return { error: "Não foi possível carregar as comandas" }
  }
}

export async function getSale(salonId: string, saleId: string): Promise<SaleDetailDTO | { error: string }> {
  const auth = await authorizeSalon(salonId, "sales.access")
  if ("error" in auth) return auth

  try {
    const sale = await loadVisibleSale(salonId, auth.userId, saleId)
    if ("error" in sale) return sale
    return toDetailDTO(sale)
  } catch (error) {
    console.error("Erro ao carregar comanda:", error)
    return { error: "Não foi possível carregar a comanda" }
  }
}

/** Catálogos da tela da comanda: serviços, produtos, profissionais e formas de pagamento. */
export async function getSaleFormOptions(salonId: string): Promise<SaleFormOptions | { error: string }> {
  const auth = await authorizeSalon(salonId, "sales.access")
  if ("error" in auth) return auth

  try {
    const [serviceRows, productRows, professionalRows, methodRows, permissions] = await Promise.all([
      db
        .select({
          id: services.id,
          name: services.name,
          price: services.price,
          priceType: services.priceType,
          priceMin: services.priceMin,
          priceMax: services.priceMax,
          priceOnRequest: services.priceOnRequest,
        })
        .from(services)
        .where(and(eq(services.salonId, salonId), eq(services.isActive, true), eq(services.isSystem, false)))
        .orderBy(asc(services.name)),
      db
        .select({ id: products.id, name: products.name, price: products.price })
        .from(products)
        .where(and(eq(products.salonId, salonId), eq(products.isActive, true)))
        .orderBy(asc(products.name)),
      db
        .select({ id: professionals.id, name: professionals.name })
        .from(professionals)
        .where(and(eq(professionals.salonId, salonId), eq(professionals.isActive, true)))
        .orderBy(asc(professionals.name)),
      db
        .select({
          id: paymentMethods.id,
          name: paymentMethods.name,
          kind: paymentMethods.kind,
          feePercent: paymentMethods.feePercent,
          settlementDays: paymentMethods.settlementDays,
          isActive: paymentMethods.isActive,
        })
        .from(paymentMethods)
        .where(and(eq(paymentMethods.salonId, salonId), eq(paymentMethods.isActive, true)))
        .orderBy(asc(paymentMethods.name)),
      getSalonPermissions(salonId, auth.userId),
    ])

    return {
      // Faixa e "sob avaliação" abrem sem valor: quem está no balcão informa.
      services: serviceRows.map((s) => ({ id: s.id, name: s.name, suggestedPrice: suggestedPriceFromService(s) })),
      products: productRows.map((p) => ({ id: p.id, name: p.name, price: toAmount(p.price) })),
      professionals: professionalRows,
      paymentMethods: methodRows,
      can: {
        create: permissions.has("sales.create"),
        edit: permissions.has("sales.edit"),
        delete: permissions.has("sales.delete"),
        invoice: permissions.has("sales.invoice"),
        reopen: permissions.has("sales.edit_invoiced"),
      },
    }
  } catch (error) {
    console.error("Erro ao carregar opções da comanda:", error)
    return { error: "Não foi possível carregar os dados da comanda" }
  }
}

/** Busca de cliente para a comanda, por nome ou telefone. */
export async function searchSaleCustomers(
  salonId: string,
  term: string
): Promise<SaleCustomerOption[] | { error: string }> {
  const auth = await authorizeSalon(salonId, "sales.access")
  if ("error" in auth) return auth

  const cleaned = (term ?? "").trim().slice(0, 80)
  if (cleaned.length < 2) return []

  try {
    // % e _ são curingas do LIKE: escapados para a busca ser literal.
    const pattern = `%${cleaned.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const digits = cleaned.replace(/\D/g, "")

    return await db
      .select({ id: customers.id, name: customers.name, phone: customers.phone })
      .from(customers)
      .where(
        and(
          eq(customers.salonId, salonId),
          eq(customers.isSystem, false),
          digits.length >= 3
            ? or(ilike(customers.name, pattern), ilike(customers.phone, `%${digits}%`))
            : ilike(customers.name, pattern)
        )
      )
      .orderBy(asc(customers.name))
      .limit(20)
  } catch (error) {
    console.error("Erro ao buscar clientes para a comanda:", error)
    return { error: "Não foi possível buscar clientes" }
  }
}

/**
 * Ponto de partida de uma comanda criada a partir de um agendamento (botão "Criar
 * comanda" na agenda): cliente, serviço, profissional e o valor sugerido.
 *
 * Se o agendamento JÁ está numa comanda, devolve o id dela — a tela abre a comanda
 * existente em vez de criar outra (o banco recusaria: um agendamento entra em no
 * máximo uma comanda).
 */
export async function getSaleDraftFromAppointment(
  salonId: string,
  appointmentId: string
): Promise<SaleDraftFromAppointment | { error: string }> {
  const auth = await authorizeSalon(salonId, "sales.create")
  if ("error" in auth) return auth

  if (!/^[0-9a-f-]{36}$/i.test(appointmentId ?? "")) return { error: "Agendamento inválido" }

  try {
    const [row] = await db
      .select({
        id: appointments.id,
        status: appointments.status,
        professionalId: appointments.professionalId,
        serviceId: services.id,
        price: services.price,
        priceType: services.priceType,
        priceMin: services.priceMin,
        priceMax: services.priceMax,
        priceOnRequest: services.priceOnRequest,
        isSystem: services.isSystem,
        customerId: customers.id,
        customerName: customers.name,
        customerPhone: customers.phone,
      })
      .from(appointments)
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .innerJoin(customers, eq(customers.id, appointments.clientId))
      .where(and(eq(appointments.id, appointmentId), eq(appointments.salonId, salonId)))
      .limit(1)

    if (!row) return { error: "Agendamento não encontrado" }
    if (row.status === "cancelled") return { error: "Este agendamento foi cancelado" }
    // Bloqueio de horário (Google Calendar) não é atendimento.
    if (row.isSystem) return { error: "Este horário é um bloqueio, não um atendimento" }

    const [existing] = await db
      .select({ saleId: sales.id })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(and(eq(saleItems.appointmentId, appointmentId), eq(saleItems.salonId, salonId)))
      .limit(1)

    if (existing) return { existingSaleId: existing.saleId }

    return {
      customer: { id: row.customerId, name: row.customerName, phone: row.customerPhone },
      item: {
        appointmentId: row.id,
        serviceId: row.serviceId,
        professionalId: row.professionalId,
        suggestedPrice: suggestedPriceFromService(row),
      },
    }
  } catch (error) {
    console.error("Erro ao montar comanda a partir do agendamento:", error)
    return { error: "Não foi possível abrir a comanda deste agendamento" }
  }
}

// ============================================================================
// Mutações
// ============================================================================

/** Cria (sem `saleId`) ou salva (com `saleId`) uma comanda aberta. */
export async function saveSale(input: SaveSaleInput): Promise<ActionResult<{ saleId: string }>> {
  const auth = await authorizeSalon(input?.salonId, input?.saleId ? "sales.edit" : "sales.create")
  if ("error" in auth) return auth

  const parsed = saveSaleSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const data = parsed.data
  const payload = {
    salonId: data.salonId,
    customerId: data.customerId,
    saleDate: data.saleDate,
    notes: data.notes?.trim() || null,
    items: data.items,
    userId: auth.userId,
  }

  if (data.saleId) {
    const visible = await loadVisibleSale(data.salonId, auth.userId, data.saleId)
    if ("error" in visible) return visible

    const result = await updateSaleService({ ...payload, saleId: data.saleId })
    if (!result.success) return { error: result.error }

    revalidateSales(data.salonId, data.saleId)
    return { success: true, data: { saleId: data.saleId } }
  }

  const result = await createSaleService(payload)
  if (!result.success) return { error: result.error }

  revalidateSales(data.salonId)
  return { success: true, data: { saleId: result.data.saleId } }
}

/** Fatura: grava os pagamentos, finaliza a comanda e fecha os agendamentos ligados. */
export async function invoiceSale(input: InvoiceSaleInput): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId, "sales.invoice")
  if ("error" in auth) return auth

  const parsed = invoiceSaleSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const visible = await loadVisibleSale(parsed.data.salonId, auth.userId, parsed.data.saleId)
  if ("error" in visible) return visible

  const result = await invoiceSaleService({ ...parsed.data, userId: auth.userId })
  if (!result.success) return { error: result.error }

  revalidateSales(parsed.data.salonId, parsed.data.saleId)
  return { success: true }
}

/** Reabre uma comanda faturada (remove pagamentos e devolve os agendamentos). */
export async function reopenSale(salonId: string, saleId: string): Promise<ActionResult> {
  const auth = await authorizeSalon(salonId, "sales.edit_invoiced")
  if ("error" in auth) return auth

  const visible = await loadVisibleSale(salonId, auth.userId, saleId)
  if ("error" in visible) return visible

  const result = await reopenSaleService({ salonId, saleId })
  if (!result.success) return { error: result.error }

  revalidateSales(salonId, saleId)
  return { success: true }
}

/** Exclui (logicamente) uma comanda aberta. */
export async function voidSale(salonId: string, saleId: string, reason?: string): Promise<ActionResult> {
  const auth = await authorizeSalon(salonId, "sales.delete")
  if ("error" in auth) return auth

  const visible = await loadVisibleSale(salonId, auth.userId, saleId)
  if ("error" in visible) return visible

  const result = await voidSaleService({
    salonId,
    saleId,
    reason: (reason ?? "").trim().slice(0, 500) || null,
    userId: auth.userId,
  })
  if (!result.success) return { error: result.error }

  revalidateSales(salonId, saleId)
  return { success: true }
}
