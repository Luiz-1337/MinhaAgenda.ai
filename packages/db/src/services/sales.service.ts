import { and, desc, eq, gt, gte, inArray, lte, ne, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import {
  db,
  appointments,
  customerPackageItems,
  customerPackages,
  customers,
  paymentMethods,
  products,
  professionals,
  saleCounters,
  saleItems,
  salePayments,
  sales,
  services,
} from "../index"
import type { SaleStatus } from "../schema"
import {
  centsToNumeric,
  planDebtPayment,
  planInvoice,
  planSaleItems,
  toCents,
  type InvoicePaymentDraft,
  type SaleCatalog,
  type SaleItemDraft,
} from "../domain/sales"
import { planPackageUsage, type PackageLine } from "../domain/packages"
import type { ActionResult } from "./appointments"
import { recordSaleTransactions } from "./finance.service"
import { recordSaleCashMovements } from "./cash.service"
import { saleHasPaidCommissions, syncSaleCommissions } from "./commissions.service"
import { recordSaleStock, revertSaleStock } from "./inventory.service"
import {
  loadPackageLines,
  loadSalePackageTemplates,
  recordSalePackages,
  revertSalePackages,
  salePackagesInUse,
} from "./packages.service"
import { brazilToday, isCalendarDate } from "../domain/finance"
import type { PlannedPayment } from "../domain/sales"

/** `professionals` uma segunda vez, para o nome de quem auxiliou no item. */
const assistants = alias(professionals, "assistants")

/**
 * Comandas (docs/ROADMAP.md, fase 1).
 *
 * Este arquivo só faz I/O: carrega o que a regra precisa, chama a regra pura
 * (domain/sales.ts) e grava o que ela decidiu. Quem autoriza é a Server Action —
 * aqui se assume que o chamador já conferiu sessão, módulo e permissão.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`. Os ids chegam do cliente;
 * uma referência que não aparece na consulta escopada é tratada como inexistente.
 *
 * Concorrência: salvar, faturar, reabrir e excluir travam a linha da comanda
 * (SELECT ... FOR UPDATE) antes de decidir pelo status. Sem a trava, dois cliques
 * em "Faturar" gravariam os pagamentos duas vezes.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Executor = typeof db | Tx

/** Erro de regra dentro da transação: aborta tudo e vira `{ success: false }`. */
class SaleRuleError extends Error {}

function fail(message: string): never {
  throw new SaleRuleError(message)
}

function pgErrorCode(error: unknown): { code?: string; constraint?: string } {
  if (typeof error !== "object" || error === null) return {}
  const direct = error as { code?: string; constraint_name?: string; constraint?: string; cause?: unknown }
  const cause = (typeof direct.cause === "object" && direct.cause !== null ? direct.cause : {}) as {
    code?: string
    constraint_name?: string
    constraint?: string
  }
  return {
    code: direct.code ?? cause.code,
    constraint: direct.constraint_name ?? direct.constraint ?? cause.constraint_name ?? cause.constraint,
  }
}

function toFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof SaleRuleError) return { success: false, error: error.message }

  const pg = pgErrorCode(error)
  if (pg.code === "23505" && pg.constraint === "sale_items_appointment_unique") {
    return { success: false, error: "Um dos agendamentos já está em outra comanda" }
  }

  console.error(fallback, error)
  return { success: false, error: fallback }
}

// ============================================================================
// Carga do que a regra precisa
// ============================================================================

function unique(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v)))
}

/** Catálogo SÓ com o que os itens referenciam, sempre escopado pelo salão. */
async function loadCatalog(
  executor: Executor,
  salonId: string,
  drafts: readonly SaleItemDraft[],
  /**
   * Módulo `packages` ligado: só então item de pacote (venda) e item do pacote
   * (uso) são aceitos (fase 5).
   */
  packagesEnabled = false,
  /** A comanda que está sendo salva: o uso dela não conta no saldo. */
  saleId?: string
): Promise<SaleCatalog & { packageLines: Map<string, PackageLine> }> {
  const serviceIds = unique(drafts.map((d) => d.serviceId))
  const productIds = unique(drafts.map((d) => d.productId))
  // Quem executou e quem auxiliou: os dois têm de ser profissionais deste salão.
  const professionalIds = unique(drafts.flatMap((d) => [d.professionalId, d.assistantId]))
  const appointmentIds = unique(drafts.map((d) => d.appointmentId))
  const packageTemplateIds = packagesEnabled ? unique(drafts.map((d) => d.packageTemplateId)) : []
  const packageLineIds = packagesEnabled ? unique(drafts.map((d) => d.customerPackageItemId)) : []

  const [serviceRows, productRows, professionalRows, appointmentRows, packageTemplates, packageLines] =
    await Promise.all([
    serviceIds.length
      ? executor
          .select({ id: services.id, name: services.name })
          .from(services)
          .where(
            and(
              eq(services.salonId, salonId),
              // Placeholder interno ("Bloqueio de Horário") não é vendável.
              eq(services.isSystem, false),
              inArray(services.id, serviceIds)
            )
          )
      : [],
    productIds.length
      ? executor
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(and(eq(products.salonId, salonId), inArray(products.id, productIds)))
      : [],
    professionalIds.length
      ? executor
          .select({ id: professionals.id })
          .from(professionals)
          .where(and(eq(professionals.salonId, salonId), inArray(professionals.id, professionalIds)))
      : [],
    appointmentIds.length
      ? executor
          .select({ id: appointments.id, customerId: appointments.clientId, status: appointments.status })
          .from(appointments)
          .where(and(eq(appointments.salonId, salonId), inArray(appointments.id, appointmentIds)))
      : [],
    loadSalePackageTemplates(executor, salonId, packageTemplateIds),
    loadPackageLines(executor, { salonId, lineIds: packageLineIds, excludeSaleId: saleId }),
  ])

  return {
    services: new Map(serviceRows.map((r) => [r.id, { name: r.name }])),
    products: new Map(productRows.map((r) => [r.id, { name: r.name }])),
    packageTemplates,
    packageLines,
    professionalIds: new Set(professionalRows.map((r) => r.id)),
    appointments: new Map(appointmentRows.map((r) => [r.id, { customerId: r.customerId, status: r.status }])),
  }
}

/**
 * Os itens "do pacote" cabem no saldo, são do pacote deste cliente e a comanda
 * está no período do pacote (fatia 5b). Aborta a transação se não.
 */
function assertPackageUsage(input: {
  customerId: string
  saleDate: Date
  items: readonly { customerPackageItemId: string | null; quantity: string }[]
  lines: ReadonlyMap<string, PackageLine>
}): void {
  const uses = input.items.flatMap((item) =>
    item.customerPackageItemId ? [{ customerPackageItemId: item.customerPackageItemId, quantity: item.quantity }] : []
  )
  if (uses.length === 0) return

  const usage = planPackageUsage({
    customerId: input.customerId,
    saleDay: brazilToday(input.saleDate),
    uses,
    lines: input.lines,
  })
  if (!usage.ok) fail(usage.error)
}

async function assertCustomerInSalon(executor: Executor, salonId: string, customerId: string): Promise<void> {
  const [customer] = await executor
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.salonId, salonId), eq(customers.isSystem, false)))
    .limit(1)

  if (!customer) fail("Cliente não encontrado")
}

/** Trava a comanda e devolve o estado atual. NULL = não existe neste salão. */
async function lockSale(tx: Tx, salonId: string, saleId: string) {
  const [sale] = await tx
    .select({
      id: sales.id,
      status: sales.status,
      customerId: sales.customerId,
      number: sales.number,
      amountDue: sales.amountDue,
      saleDate: sales.saleDate,
    })
    .from(sales)
    .where(and(eq(sales.id, saleId), eq(sales.salonId, salonId)))
    .for("update")

  return sale ?? null
}

/**
 * Próximo número da comanda no salão.
 *
 * Upsert atômico: o ON CONFLICT trava a linha do contador, então duas comandas
 * abertas no mesmo instante recebem números diferentes. Roda DENTRO da transação
 * da comanda — se ela falhar, o número volta (não fica buraco por erro).
 */
async function nextSaleNumber(tx: Tx, salonId: string): Promise<number> {
  const [row] = await tx
    .insert(saleCounters)
    .values({ salonId, lastNumber: 1 })
    .onConflictDoUpdate({
      target: saleCounters.salonId,
      set: { lastNumber: sql`${saleCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: saleCounters.lastNumber })

  return row.lastNumber
}

// ============================================================================
// Criar e salvar
// ============================================================================

export type SaveSaleInput = {
  salonId: string
  customerId: string
  saleDate: Date
  notes: string | null
  items: SaleItemDraft[]
  userId: string
  /** Módulo `packages` ligado: aceita item de pacote (fase 5). Quem decide é a action. */
  packagesEnabled?: boolean
}

/** Cria uma comanda aberta (Pendente). */
export async function createSaleService(
  input: SaveSaleInput
): Promise<ActionResult<{ saleId: string; number: number }>> {
  try {
    const result = await db.transaction(async (tx) => {
      await assertCustomerInSalon(tx, input.salonId, input.customerId)

      const catalog = await loadCatalog(tx, input.salonId, input.items, input.packagesEnabled)
      const plan = planSaleItems(input.customerId, input.items, catalog)
      if (!plan.ok) fail(plan.error)
      assertPackageUsage({
        customerId: input.customerId,
        saleDate: input.saleDate,
        items: plan.items,
        lines: catalog.packageLines,
      })

      const number = await nextSaleNumber(tx, input.salonId)

      const [sale] = await tx
        .insert(sales)
        .values({
          salonId: input.salonId,
          number,
          customerId: input.customerId,
          status: "open",
          saleDate: input.saleDate,
          notes: input.notes,
          subtotal: centsToNumeric(plan.subtotalCents),
          discountTotal: centsToNumeric(plan.discountCents),
          total: centsToNumeric(plan.totalCents),
          createdBy: input.userId,
        })
        .returning({ id: sales.id })

      if (plan.items.length > 0) {
        await tx
          .insert(saleItems)
          .values(plan.items.map((item) => ({ ...item, saleId: sale.id, salonId: input.salonId })))
      }

      return { saleId: sale.id, number }
    })

    return { success: true, data: result }
  } catch (error) {
    return toFailure(error, "Não foi possível criar a comanda")
  }
}

/**
 * Salva uma comanda ABERTA: troca cliente, data, observações e a lista de itens
 * inteira (os itens são substituídos, não mesclados — a tela envia a lista toda).
 */
export async function updateSaleService(
  input: SaveSaleInput & { saleId: string }
): Promise<ActionResult<void>> {
  try {
    await db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.salonId, input.saleId)
      if (!sale) fail("Comanda não encontrada")
      if (sale.status === "invoiced") fail("Comanda faturada não pode ser alterada. Reabra para editar")
      if (sale.status === "void") fail("Comanda excluída não pode ser alterada")

      await assertCustomerInSalon(tx, input.salonId, input.customerId)

      const catalog = await loadCatalog(tx, input.salonId, input.items, input.packagesEnabled, sale.id)
      const plan = planSaleItems(input.customerId, input.items, catalog)
      if (!plan.ok) fail(plan.error)
      assertPackageUsage({
        customerId: input.customerId,
        saleDate: input.saleDate,
        items: plan.items,
        lines: catalog.packageLines,
      })

      await tx.delete(saleItems).where(and(eq(saleItems.saleId, sale.id), eq(saleItems.salonId, input.salonId)))

      if (plan.items.length > 0) {
        await tx
          .insert(saleItems)
          .values(plan.items.map((item) => ({ ...item, saleId: sale.id, salonId: input.salonId })))
      }

      await tx
        .update(sales)
        .set({
          customerId: input.customerId,
          saleDate: input.saleDate,
          notes: input.notes,
          subtotal: centsToNumeric(plan.subtotalCents),
          discountTotal: centsToNumeric(plan.discountCents),
          total: centsToNumeric(plan.totalCents),
          updatedAt: new Date(),
        })
        .where(and(eq(sales.id, sale.id), eq(sales.salonId, input.salonId)))
    })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar a comanda")
  }
}

// ============================================================================
// Faturar, reabrir, excluir
// ============================================================================

/**
 * Grava pagamentos de uma comanda e dispara o que cada pagamento gera: conta a
 * receber no financeiro e, se for dinheiro, entrada no caixa aberto (só com
 * `recordFinance`). Usado pelo faturamento e pelo recebimento de débito — o
 * pagamento de hoje e o da semana que vem têm que produzir exatamente o mesmo.
 */
async function insertSalePayments(
  tx: Tx,
  input: {
    salonId: string
    sale: { id: string; number: number; customerId: string }
    payments: PlannedPayment[]
    userId: string
    recordFinance?: boolean
    now: Date
  }
): Promise<void> {
  if (input.payments.length === 0) return

  const inserted = await tx
    .insert(salePayments)
    .values(
      input.payments.map((payment) => ({
        ...payment,
        saleId: input.sale.id,
        salonId: input.salonId,
        paidAt: input.now,
        createdBy: input.userId,
      }))
    )
    .returning({
      id: salePayments.id,
      paymentMethodId: salePayments.paymentMethodId,
      amount: salePayments.amount,
      feeAmount: salePayments.feeAmount,
      settlesOn: salePayments.settlesOn,
    })

  if (!input.recordFinance) return

  // Na MESMA transação: ou o pagamento entra e o financeiro registra, ou nada.
  await recordSaleTransactions(tx, {
    salonId: input.salonId,
    saleId: input.sale.id,
    saleNumber: input.sale.number,
    customerId: input.sale.customerId,
    userId: input.userId,
    payments: inserted,
    now: input.now,
  })

  // E o que foi pago em dinheiro entra no caixa aberto, se houver um.
  await recordSaleCashMovements(tx, {
    salonId: input.salonId,
    userId: input.userId,
    payments: inserted,
  })
}

/**
 * Fatura a comanda: grava os pagamentos, muda para Finalizado e FECHA os
 * agendamentos ligados aos itens.
 *
 * Fechar o agendamento aqui (status completed + price_charged) é o que mantém
 * dashboard, LTV e retenção corretos sem mexer neles: todos leem
 * appointments.price_charged, e a comanda passa a ser quem o preenche.
 */
export async function invoiceSaleService(input: {
  salonId: string
  saleId: string
  payments: InvoicePaymentDraft[]
  userId: string
  /**
   * Gera as contas a receber no financeiro e a entrada do dinheiro no caixa aberto
   * (fase 2). Quem decide é a action: só com o módulo `finance` ligado no salão.
   * Desligado, a comanda fatura como na fase 1 e nenhuma tabela do financeiro ou do
   * caixa é tocada.
   */
  recordFinance?: boolean
  /**
   * Aceita faturar com os pagamentos somando menos que o total; a diferença fica
   * em aberto como débito do cliente (fatia 2f). Quem decide é a action: permissão
   * `sales.invoice_debt` E confirmação explícita na tela.
   */
  allowDebt?: boolean
  /** Quando a cliente combinou de pagar o que ficou em aberto ("YYYY-MM-DD"). */
  debtDueDate?: string | null
  /**
   * Calcula e grava as comissões dos itens (fase 3). Quem decide é a action: só
   * com o módulo `commissions` ligado no salão. Desligado, nenhuma tabela de
   * comissão é tocada.
   */
  recordCommissions?: boolean
  /**
   * Baixa o estoque dos produtos controlados da comanda (fase 4). Quem decide é a
   * action: só com o módulo `inventory` ligado no salão. Desligado, nenhuma tabela
   * de estoque é tocada.
   */
  recordStock?: boolean
}): Promise<ActionResult<void>> {
  try {
    if (input.debtDueDate && !isCalendarDate(input.debtDueDate)) {
      return { success: false, error: "Data de vencimento do débito inválida" }
    }

    await db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.salonId, input.saleId)
      if (!sale) fail("Comanda não encontrada")
      if (sale.status === "invoiced") fail("Esta comanda já foi faturada")
      if (sale.status === "void") fail("Comanda excluída não pode ser faturada")

      const items = await tx
        .select({
          unitPrice: saleItems.unitPrice,
          total: saleItems.total,
          appointmentId: saleItems.appointmentId,
          customerPackageItemId: saleItems.customerPackageItemId,
          quantity: saleItems.quantity,
        })
        .from(saleItems)
        .where(and(eq(saleItems.saleId, sale.id), eq(saleItems.salonId, input.salonId)))

      // Itens do pacote: é aqui que o saldo baixa. As linhas ficam travadas até o
      // fim da transação — outra comanda que use a mesma linha espera, e já soma
      // este uso (fase 5). Com o módulo ligado ou não: a comanda já tem o item.
      assertPackageUsage({
        customerId: sale.customerId,
        saleDate: sale.saleDate,
        items,
        lines: await loadPackageLines(tx, {
          salonId: input.salonId,
          lineIds: unique(items.map((item) => item.customerPackageItemId)),
          excludeSaleId: sale.id,
          lock: true,
        }),
      })

      const methodIds = unique(input.payments.map((p) => p.paymentMethodId))
      const appointmentIds = unique(items.map((i) => i.appointmentId))

      const [methodRows, appointmentRows] = await Promise.all([
        methodIds.length
          ? tx
              .select({
                id: paymentMethods.id,
                feePercent: paymentMethods.feePercent,
                settlementDays: paymentMethods.settlementDays,
                isActive: paymentMethods.isActive,
              })
              .from(paymentMethods)
              .where(and(eq(paymentMethods.salonId, input.salonId), inArray(paymentMethods.id, methodIds)))
          : [],
        appointmentIds.length
          ? tx
              .select({
                id: appointments.id,
                status: appointments.status,
                date: appointments.date,
                completedAt: appointments.completedAt,
              })
              .from(appointments)
              .where(and(eq(appointments.salonId, input.salonId), inArray(appointments.id, appointmentIds)))
          : [],
      ])

      const now = new Date()
      const plan = planInvoice({
        items,
        payments: input.payments,
        methods: new Map(methodRows.map((m) => [m.id, m])),
        appointments: new Map(appointmentRows.map((a) => [a.id, { status: a.status, date: a.date }])),
        allowDebt: input.allowDebt,
        now,
      })
      if (!plan.ok) fail(plan.error)

      await insertSalePayments(tx, {
        salonId: input.salonId,
        sale,
        payments: plan.payments,
        userId: input.userId,
        recordFinance: input.recordFinance,
        now,
      })

      await tx
        .update(sales)
        .set({
          status: "invoiced",
          total: centsToNumeric(plan.totalCents),
          amountDue: centsToNumeric(plan.dueCents),
          // Vencimento só enquanto há valor em aberto (CHECK no banco).
          debtDueDate: plan.dueCents > 0 ? (input.debtDueDate ?? null) : null,
          invoicedAt: now,
          invoicedBy: input.userId,
          updatedAt: now,
        })
        .where(and(eq(sales.id, sale.id), eq(sales.salonId, input.salonId)))

      const completedAtById = new Map(appointmentRows.map((a) => [a.id, a.completedAt]))

      for (const outcome of plan.appointmentOutcomes) {
        await tx
          .update(appointments)
          .set({
            status: "completed",
            // Agendamento já concluído à mão mantém o instante do primeiro
            // fechamento — a comanda corrige o valor, não cria um atendimento novo.
            completedAt: completedAtById.get(outcome.appointmentId) ?? now,
            priceCharged: outcome.priceCharged,
            outcomeSource: "sale",
            updatedAt: now,
          })
          .where(and(eq(appointments.id, outcome.appointmentId), eq(appointments.salonId, input.salonId)))
      }

      // Por último: a comissão é calculada sobre a comanda já no estado final.
      if (input.recordCommissions) {
        await syncSaleCommissions(tx, { salonId: input.salonId, saleId: sale.id })
      }

      if (input.recordStock) {
        await recordSaleStock(tx, { salonId: input.salonId, saleId: sale.id, userId: input.userId })
      }

      // Item de pacote vira o pacote do cliente — com o módulo ligado ou não: o
      // cliente pagou por ele (fase 5).
      await recordSalePackages(tx, {
        salonId: input.salonId,
        saleId: sale.id,
        customerId: sale.customerId,
        saleDate: sale.saleDate,
      })
    })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível faturar a comanda")
  }
}

/**
 * Recebe (todo ou parte de) o valor em aberto de uma comanda já faturada: mais um
 * pagamento na mesma comanda, que baixa `amount_due`.
 *
 * É o mesmo caminho do pagamento feito no faturamento — gera conta a receber no
 * financeiro e entra no caixa aberto se for dinheiro. O agendamento não muda: ele
 * já foi fechado pelo valor cheio quando a comanda foi faturada.
 */
export async function receiveSaleDebtPaymentService(input: {
  salonId: string
  saleId: string
  payments: InvoicePaymentDraft[]
  userId: string
  recordFinance?: boolean
  /** Recalcula as comissões da comanda: a taxa e a data de disponibilidade mudam. */
  recordCommissions?: boolean
}): Promise<ActionResult<{ remaining: string }>> {
  try {
    const remaining = await db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.salonId, input.saleId)
      if (!sale) fail("Comanda não encontrada")
      if (sale.status !== "invoiced") fail("Só comanda faturada tem valor em aberto a receber")

      const methodIds = unique(input.payments.map((p) => p.paymentMethodId))
      const methodRows = methodIds.length
        ? await tx
            .select({
              id: paymentMethods.id,
              feePercent: paymentMethods.feePercent,
              settlementDays: paymentMethods.settlementDays,
              isActive: paymentMethods.isActive,
            })
            .from(paymentMethods)
            .where(and(eq(paymentMethods.salonId, input.salonId), inArray(paymentMethods.id, methodIds)))
        : []

      const now = new Date()
      const plan = planDebtPayment({
        amountDue: sale.amountDue,
        payments: input.payments,
        methods: new Map(methodRows.map((m) => [m.id, m])),
        now,
      })
      if (!plan.ok) fail(plan.error)

      await insertSalePayments(tx, {
        salonId: input.salonId,
        sale,
        payments: plan.payments,
        userId: input.userId,
        recordFinance: input.recordFinance,
        now,
      })

      const remainingAmount = centsToNumeric(plan.remainingCents)

      await tx
        .update(sales)
        .set({
          amountDue: remainingAmount,
          // Quitou: o vencimento deixa de fazer sentido (CHECK no banco).
          ...(plan.remainingCents === 0 ? { debtDueDate: null } : {}),
          updatedAt: now,
        })
        .where(and(eq(sales.id, sale.id), eq(sales.salonId, input.salonId)))

      if (input.recordCommissions) {
        await syncSaleCommissions(tx, { salonId: input.salonId, saleId: sale.id })
      }

      return remainingAmount
    })

    return { success: true, data: { remaining } }
  } catch (error) {
    return toFailure(error, "Não foi possível registrar o recebimento")
  }
}

/**
 * Reabre uma comanda faturada: volta para Pendente, remove os pagamentos e devolve
 * os agendamentos para "confirmado".
 *
 * Só desfaz o fechamento que a PRÓPRIA comanda fez (outcome_source = 'sale'). Um
 * agendamento que alguém voltou a concluir à mão depois fica como está.
 */
export async function reopenSaleService(input: {
  salonId: string
  saleId: string
  /** Apaga as comissões da comanda (fase 3). Só com o módulo `commissions` ligado. */
  recordCommissions?: boolean
}): Promise<ActionResult<void>> {
  try {
    await db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.salonId, input.saleId)
      if (!sale) fail("Comanda não encontrada")
      if (sale.status !== "invoiced") fail("Só uma comanda faturada pode ser reaberta")

      // Comissão paga trava a reabertura, com o módulo ligado ou não: reabrir
      // deixaria o profissional com um recibo de um item que não existe mais.
      if (await saleHasPaidCommissions(tx, { salonId: input.salonId, saleId: sale.id })) {
        fail("A comissão desta comanda já foi paga. Estorne o pagamento em Comissões antes de reabrir")
      }

      // Pacote vendido aqui e já usado em outra comanda: reabrir apagaria o pacote
      // e a sessão usada ficaria sem origem (fase 5).
      const usedIn = await salePackagesInUse(tx, { salonId: input.salonId, saleId: sale.id })
      if (usedIn.length > 0) {
        const numbers = usedIn.map((other) => `#${other.number}`).join(", ")
        fail(
          `Um pacote vendido nesta comanda já está em uso (comanda ${numbers}). Tire o item do pacote de lá antes de reabrir esta`
        )
      }

      const now = new Date()

      await tx
        .delete(salePayments)
        .where(and(eq(salePayments.saleId, sale.id), eq(salePayments.salonId, input.salonId)))

      await tx
        .update(sales)
        // O débito some junto: comanda aberta não deve nada (CHECK no banco).
        .set({
          status: "open",
          invoicedAt: null,
          invoicedBy: null,
          amountDue: "0.00",
          debtDueDate: null,
          updatedAt: now,
        })
        .where(and(eq(sales.id, sale.id), eq(sales.salonId, input.salonId)))

      const linked = await tx
        .select({ appointmentId: saleItems.appointmentId })
        .from(saleItems)
        .where(and(eq(saleItems.saleId, sale.id), eq(saleItems.salonId, input.salonId)))

      const appointmentIds = unique(linked.map((l) => l.appointmentId))
      if (appointmentIds.length > 0) {
        await tx
          .update(appointments)
          .set({
            status: "confirmed",
            completedAt: null,
            priceCharged: null,
            outcomeSource: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(appointments.salonId, input.salonId),
              inArray(appointments.id, appointmentIds),
              eq(appointments.status, "completed"),
              eq(appointments.outcomeSource, "sale")
            )
          )
      }

      // Comanda aberta não tem comissão: o sync só apaga.
      if (input.recordCommissions) {
        await syncSaleCommissions(tx, { salonId: input.salonId, saleId: sale.id })
      }

      // O que a comanda baixou volta para o estoque — com o módulo ligado ou não.
      await revertSaleStock(tx, { salonId: input.salonId, saleId: sale.id })

      // Os pacotes que a comanda vendeu deixam de existir (fase 5).
      await revertSalePackages(tx, { salonId: input.salonId, saleId: sale.id })
    })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível reabrir a comanda")
  }
}

/**
 * Exclui (logicamente) uma comanda ABERTA. Os agendamentos ligados são liberados
 * para entrar em outra comanda. Comanda faturada precisa ser reaberta antes —
 * excluir direto apagaria pagamento sem deixar rastro do desfazimento.
 */
export async function voidSaleService(input: {
  salonId: string
  saleId: string
  reason: string | null
  userId: string
}): Promise<ActionResult<void>> {
  try {
    await db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.salonId, input.saleId)
      if (!sale) fail("Comanda não encontrada")
      if (sale.status === "void") fail("Esta comanda já foi excluída")
      if (sale.status === "invoiced") fail("Reabra a comanda antes de excluir")

      const now = new Date()

      // Solta o agendamento (pode entrar em outra comanda) e a linha do pacote (a
      // comanda excluída não segura o pacote — fase 5).
      await tx
        .update(saleItems)
        .set({ appointmentId: null, customerPackageItemId: null })
        .where(and(eq(saleItems.saleId, sale.id), eq(saleItems.salonId, input.salonId)))

      await tx
        .update(sales)
        .set({
          status: "void",
          voidedAt: now,
          voidedBy: input.userId,
          voidReason: input.reason,
          updatedAt: now,
        })
        .where(and(eq(sales.id, sale.id), eq(sales.salonId, input.salonId)))
    })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir a comanda")
  }
}

/**
 * O agendamento foi CANCELADO: se ele está numa comanda aberta, o item sai e os
 * totais são refeitos. Chamado por cancelAppointmentService.
 *
 * Comanda faturada não chega aqui na prática — faturar conclui o agendamento, e
 * atendimento concluído não se cancela. Se chegar, fica como está: venda faturada
 * não muda por efeito colateral.
 *
 * Devolve o número da comanda alterada (para o log), ou null se não havia nada.
 */
export async function detachCancelledAppointmentFromSale(input: {
  salonId: string
  appointmentId: string
}): Promise<number | null> {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({ id: saleItems.id, saleId: saleItems.saleId })
      .from(saleItems)
      .where(and(eq(saleItems.appointmentId, input.appointmentId), eq(saleItems.salonId, input.salonId)))
      .limit(1)

    if (!item) return null

    const sale = await lockSale(tx, input.salonId, item.saleId)
    if (!sale || sale.status !== "open") return null

    await tx.delete(saleItems).where(and(eq(saleItems.id, item.id), eq(saleItems.salonId, input.salonId)))

    // Totais a partir do que ficou gravado: o total de cada item já é
    // quantidade × unitário − desconto, calculado pela regra ao salvar.
    const remaining = await tx
      .select({ total: saleItems.total, discountAmount: saleItems.discountAmount })
      .from(saleItems)
      .where(and(eq(saleItems.saleId, sale.id), eq(saleItems.salonId, input.salonId)))

    const totalCents = remaining.reduce((sum, r) => sum + (toCents(r.total) ?? 0), 0)
    const discountCents = remaining.reduce((sum, r) => sum + (toCents(r.discountAmount) ?? 0), 0)

    await tx
      .update(sales)
      .set({
        subtotal: centsToNumeric(totalCents + discountCents),
        discountTotal: centsToNumeric(discountCents),
        total: centsToNumeric(totalCents),
        updatedAt: new Date(),
      })
      .where(and(eq(sales.id, sale.id), eq(sales.salonId, input.salonId)))

    return sale.number
  })
}

// ============================================================================
// Leitura
// ============================================================================

export type SaleDetail = {
  id: string
  number: number
  status: SaleStatus
  saleDate: Date
  notes: string | null
  subtotal: string
  discountTotal: string
  total: string
  /** Quanto da comanda faturada ainda não foi pago. "0.00" = quitada. */
  amountDue: string
  debtDueDate: string | null
  invoicedAt: Date | null
  voidedAt: Date | null
  voidReason: string | null
  createdBy: string | null
  customer: { id: string; name: string; phone: string }
  items: {
    id: string
    kind: "service" | "product" | "package"
    serviceId: string | null
    productId: string | null
    packageTemplateId: string | null
    description: string
    professionalId: string | null
    professionalName: string | null
    assistantId: string | null
    assistantName: string | null
    quantity: string
    unitPrice: string | null
    discountAmount: string
    total: string
    appointmentId: string | null
    /** Item "do pacote" (fase 5): a linha usada e o nome do pacote. */
    customerPackageItemId: string | null
    packageName: string | null
  }[]
  payments: {
    id: string
    paymentMethodId: string
    methodName: string
    amount: string
    feePercent: string
    feeAmount: string
    settlesOn: string
    paidAt: Date
  }[]
}

export async function getSaleService(salonId: string, saleId: string): Promise<SaleDetail | null> {
  const [sale] = await db
    .select({
      id: sales.id,
      number: sales.number,
      status: sales.status,
      saleDate: sales.saleDate,
      notes: sales.notes,
      subtotal: sales.subtotal,
      discountTotal: sales.discountTotal,
      total: sales.total,
      amountDue: sales.amountDue,
      debtDueDate: sales.debtDueDate,
      invoicedAt: sales.invoicedAt,
      voidedAt: sales.voidedAt,
      voidReason: sales.voidReason,
      createdBy: sales.createdBy,
      customerId: customers.id,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(sales)
    .innerJoin(customers, eq(customers.id, sales.customerId))
    .where(and(eq(sales.id, saleId), eq(sales.salonId, salonId)))
    .limit(1)

  if (!sale) return null

  const [items, payments] = await Promise.all([
    db
      .select({
        id: saleItems.id,
        kind: saleItems.kind,
        serviceId: saleItems.serviceId,
        productId: saleItems.productId,
        packageTemplateId: saleItems.packageTemplateId,
        description: saleItems.description,
        professionalId: saleItems.professionalId,
        professionalName: professionals.name,
        assistantId: saleItems.assistantId,
        assistantName: assistants.name,
        quantity: saleItems.quantity,
        unitPrice: saleItems.unitPrice,
        discountAmount: saleItems.discountAmount,
        total: saleItems.total,
        appointmentId: saleItems.appointmentId,
        customerPackageItemId: saleItems.customerPackageItemId,
        packageName: customerPackages.name,
      })
      .from(saleItems)
      .leftJoin(professionals, eq(professionals.id, saleItems.professionalId))
      .leftJoin(assistants, eq(assistants.id, saleItems.assistantId))
      .leftJoin(customerPackageItems, eq(customerPackageItems.id, saleItems.customerPackageItemId))
      .leftJoin(customerPackages, eq(customerPackages.id, customerPackageItems.customerPackageId))
      .where(and(eq(saleItems.saleId, saleId), eq(saleItems.salonId, salonId)))
      .orderBy(saleItems.position),
    db
      .select({
        id: salePayments.id,
        paymentMethodId: salePayments.paymentMethodId,
        methodName: paymentMethods.name,
        amount: salePayments.amount,
        feePercent: salePayments.feePercent,
        feeAmount: salePayments.feeAmount,
        settlesOn: salePayments.settlesOn,
        paidAt: salePayments.paidAt,
      })
      .from(salePayments)
      .innerJoin(paymentMethods, eq(paymentMethods.id, salePayments.paymentMethodId))
      .where(and(eq(salePayments.saleId, saleId), eq(salePayments.salonId, salonId)))
      .orderBy(salePayments.createdAt),
  ])

  return {
    id: sale.id,
    number: sale.number,
    status: sale.status,
    saleDate: sale.saleDate,
    notes: sale.notes,
    subtotal: sale.subtotal,
    discountTotal: sale.discountTotal,
    total: sale.total,
    amountDue: sale.amountDue,
    debtDueDate: sale.debtDueDate,
    invoicedAt: sale.invoicedAt,
    voidedAt: sale.voidedAt,
    voidReason: sale.voidReason,
    createdBy: sale.createdBy,
    customer: { id: sale.customerId, name: sale.customerName, phone: sale.customerPhone },
    items,
    payments,
  }
}

/** Itens de várias comandas de uma vez — a aba Vendas da ficha do cliente. */
export async function listSaleItemSummariesService(
  salonId: string,
  saleIds: string[]
): Promise<{ saleId: string; description: string; total: string; professionalName: string | null }[]> {
  if (saleIds.length === 0) return []

  return db
    .select({
      saleId: saleItems.saleId,
      description: saleItems.description,
      total: saleItems.total,
      professionalName: professionals.name,
    })
    .from(saleItems)
    .leftJoin(professionals, eq(professionals.id, saleItems.professionalId))
    .where(and(eq(saleItems.salonId, salonId), inArray(saleItems.saleId, saleIds)))
    .orderBy(saleItems.saleId, saleItems.position)
}

export type SaleListRow = {
  id: string
  number: number
  status: SaleStatus
  saleDate: Date
  total: string
  amountDue: string
  debtDueDate: string | null
  customerId: string
  customerName: string
  /** Nomes das formas de pagamento, na ordem em que foram lançadas. */
  paymentMethods: string[]
}

export type ListSalesFilters = {
  salonId: string
  status?: SaleStatus
  /** Excluídas só aparecem quando pedidas. */
  includeVoid?: boolean
  /** Quem não pode ver faturadas (permissão `sales.view_invoiced`). */
  excludeInvoiced?: boolean
  from?: Date
  to?: Date
  customerId?: string
  /** Só comandas faturadas com valor em aberto (débito do cliente). */
  onlyWithDebt?: boolean
  /**
   * Quem não tem `sales.view_all` vê só as próprias: as que criou e as que têm
   * item de um vínculo de profissional dele neste salão — como quem executou ou
   * como auxiliar.
   */
  visibleTo?: { userId: string; professionalIds: string[] }
  limit: number
  offset: number
}

export async function listSalesService(
  filters: ListSalesFilters
): Promise<{ rows: SaleListRow[]; total: number }> {
  const conditions = [eq(sales.salonId, filters.salonId)]

  if (filters.status) conditions.push(eq(sales.status, filters.status))
  if (!filters.includeVoid && filters.status !== "void") conditions.push(ne(sales.status, "void"))
  if (filters.excludeInvoiced) conditions.push(ne(sales.status, "invoiced"))
  if (filters.from) conditions.push(gte(sales.saleDate, filters.from))
  if (filters.to) conditions.push(lte(sales.saleDate, filters.to))
  if (filters.customerId) conditions.push(eq(sales.customerId, filters.customerId))
  if (filters.onlyWithDebt) {
    conditions.push(eq(sales.status, "invoiced"), gt(sales.amountDue, "0"))
  }

  if (filters.visibleTo) {
    const { userId, professionalIds } = filters.visibleTo
    const createdByUser = eq(sales.createdBy, userId)

    conditions.push(
      professionalIds.length === 0
        ? createdByUser
        : or(
            createdByUser,
            inArray(
              sales.id,
              db
                .select({ saleId: saleItems.saleId })
                .from(saleItems)
                .where(
                  and(
                    eq(saleItems.salonId, filters.salonId),
                    // Quem auxiliou também vê a comanda: a comissão dele sai dela.
                    or(
                      inArray(saleItems.professionalId, professionalIds),
                      inArray(saleItems.assistantId, professionalIds)
                    )
                  )
                )
            )
          )!
    )
  }

  const where = and(...conditions)

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: sales.id,
        number: sales.number,
        status: sales.status,
        saleDate: sales.saleDate,
        total: sales.total,
        amountDue: sales.amountDue,
        debtDueDate: sales.debtDueDate,
        customerId: customers.id,
        customerName: customers.name,
      })
      .from(sales)
      .innerJoin(customers, eq(customers.id, sales.customerId))
      .where(where)
      .orderBy(desc(sales.saleDate), desc(sales.number))
      .limit(filters.limit)
      .offset(filters.offset),
    db.select({ total: sql<number>`count(*)::int` }).from(sales).where(where),
  ])

  const methodsBySale = new Map<string, string[]>()
  if (rows.length > 0) {
    const paymentRows = await db
      .select({ saleId: salePayments.saleId, name: paymentMethods.name })
      .from(salePayments)
      .innerJoin(paymentMethods, eq(paymentMethods.id, salePayments.paymentMethodId))
      .where(
        and(
          eq(salePayments.salonId, filters.salonId),
          inArray(
            salePayments.saleId,
            rows.map((r) => r.id)
          )
        )
      )
      .orderBy(salePayments.createdAt)

    for (const payment of paymentRows) {
      const names = methodsBySale.get(payment.saleId) ?? []
      if (!names.includes(payment.name)) names.push(payment.name)
      methodsBySale.set(payment.saleId, names)
    }
  }

  return {
    rows: rows.map((row) => ({ ...row, paymentMethods: methodsBySale.get(row.id) ?? [] })),
    total,
  }
}

export type DebtTotals = {
  /** Soma do que está em aberto, em centavos. */
  openCents: number
  /** Parte do que está em aberto com vencimento anterior a hoje. */
  overdueCents: number
  /** Quantas comandas têm valor em aberto. */
  count: number
}

/**
 * Quanto está em aberto em comandas faturadas — do salão inteiro ou de um cliente.
 * `today` é o dia de hoje em Brasília ("YYYY-MM-DD"), para separar o que já venceu.
 * Débito sem vencimento combinado nunca conta como atrasado.
 */
export async function getDebtTotalsService(input: {
  salonId: string
  customerId?: string
  today: string
}): Promise<DebtTotals> {
  const [row] = await db
    .select({
      open: sql<string>`coalesce(sum(${sales.amountDue}), 0)::text`,
      overdue: sql<string>`coalesce(sum(${sales.amountDue}) filter (where ${sales.debtDueDate} < ${input.today}::date), 0)::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(sales)
    .where(
      and(
        eq(sales.salonId, input.salonId),
        eq(sales.status, "invoiced"),
        gt(sales.amountDue, "0"),
        input.customerId ? eq(sales.customerId, input.customerId) : undefined
      )
    )

  return {
    openCents: toCents(row?.open ?? "0") ?? 0,
    overdueCents: toCents(row?.overdue ?? "0") ?? 0,
    count: row?.count ?? 0,
  }
}
