import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm"

import {
  db,
  customerPackageItems,
  customerPackages,
  customers,
  packageTemplateItems,
  packageTemplates,
  products,
  professionals,
  saleItems,
  sales,
  services,
} from "../index"
import type { PackageItemKind } from "../schema"
import { brazilToday } from "../domain/finance"
import {
  customerPackageStatus,
  packageTemplateDeleteBlocker,
  planCustomerPackages,
  planPackageTemplate,
  type CustomerPackageStatus,
  type PackageLine,
  type PackageTemplateDraft,
  type TemplateForSale,
} from "../domain/packages"
import type { ActionResult } from "./appointments"

/**
 * Pacotes (docs/ROADMAP.md, fase 5, fatias 5a e 5b).
 *
 * Só I/O: carrega o que a regra pura (domain/packages.ts) precisa, deixa ela
 * decidir e grava. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`. Os ids chegam do cliente;
 * uma referência que não aparece na consulta escopada é tratada como inexistente.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

class PackageRuleError extends Error {}

function fail(message: string): never {
  throw new PackageRuleError(message)
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
  if (error instanceof PackageRuleError) return { success: false, error: error.message }

  const pg = pgErrorCode(error)
  if (pg.code === "23505" && pg.constraint === "package_templates_salon_name_unique") {
    return { success: false, error: "Já existe um pacote com esse nome" }
  }
  // Corrida: o modelo entrou numa comanda entre a conferência e o DELETE.
  if (pg.code === "23503") {
    return { success: false, error: "Este pacote já foi usado em comanda. Desative-o em vez de excluir" }
  }

  console.error(fallback, error)
  return { success: false, error: fallback }
}

function unique(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => !!value)))
}

/** Nome do serviço ou do produto de uma linha de pacote. */
const itemDescription = sql<string>`coalesce(${services.name}, ${products.name}, '')`

/** Preço de tabela do serviço ou do produto — o peso do rateio do preço do pacote. */
const itemListPrice = sql<string | null>`coalesce(${services.price}, ${products.price})`

/**
 * Quanto cada linha de pacote já foi usada em comandas FATURADAS (fatia 5b). Não há
 * tabela de consumo: o item da comanda é o registro do uso. `excludeSaleId` tira a
 * comanda que está sendo conferida — o uso dela é o que se quer saber se cabe.
 */
async function usedByLine(
  executor: typeof db | Tx,
  salonId: string,
  lineIds: string[],
  excludeSaleId?: string
): Promise<Map<string, { used: number; sales: { saleId: string; number: number }[] }>> {
  const result = new Map<string, { used: number; sales: { saleId: string; number: number }[] }>()
  if (lineIds.length === 0) return result

  const rows = await executor
    .select({
      lineId: saleItems.customerPackageItemId,
      quantity: saleItems.quantity,
      saleId: sales.id,
      number: sales.number,
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(
      and(
        eq(saleItems.salonId, salonId),
        eq(sales.salonId, salonId),
        eq(sales.status, "invoiced"),
        inArray(saleItems.customerPackageItemId, lineIds),
        excludeSaleId ? ne(sales.id, excludeSaleId) : undefined
      )
    )
    .orderBy(asc(sales.number))

  for (const row of rows) {
    if (!row.lineId) continue
    const entry = result.get(row.lineId) ?? { used: 0, sales: [] }
    entry.used += Number(row.quantity)
    if (!entry.sales.some((sale) => sale.saleId === row.saleId)) {
      entry.sales.push({ saleId: row.saleId, number: row.number })
    }
    result.set(row.lineId, entry)
  }
  return result
}

// ============================================================================
// Modelos (pacotes predefinidos)
// ============================================================================

export type PackageTemplateItemRow = {
  kind: PackageItemKind
  serviceId: string | null
  productId: string | null
  description: string
  quantity: number
}

export type PackageTemplateRow = {
  id: string
  name: string
  description: string | null
  price: string
  validityDays: number | null
  isActive: boolean
  items: PackageTemplateItemRow[]
  /** Quantos pacotes deste modelo já foram vendidos (faturados). */
  sold: number
}

/** Os modelos do salão, com os itens e quantos foram vendidos. */
export async function listPackageTemplatesService(salonId: string): Promise<PackageTemplateRow[]> {
  const [templateRows, itemRows, soldRows] = await Promise.all([
    db
      .select({
        id: packageTemplates.id,
        name: packageTemplates.name,
        description: packageTemplates.description,
        price: packageTemplates.price,
        validityDays: packageTemplates.validityDays,
        isActive: packageTemplates.isActive,
      })
      .from(packageTemplates)
      .where(eq(packageTemplates.salonId, salonId))
      .orderBy(asc(packageTemplates.name)),
    db
      .select({
        templateId: packageTemplateItems.templateId,
        kind: packageTemplateItems.kind,
        serviceId: packageTemplateItems.serviceId,
        productId: packageTemplateItems.productId,
        description: itemDescription,
        quantity: packageTemplateItems.quantity,
      })
      .from(packageTemplateItems)
      .leftJoin(services, eq(services.id, packageTemplateItems.serviceId))
      .leftJoin(products, eq(products.id, packageTemplateItems.productId))
      .where(eq(packageTemplateItems.salonId, salonId))
      .orderBy(asc(packageTemplateItems.position)),
    db
      .select({ templateId: customerPackages.templateId, sold: count() })
      .from(customerPackages)
      .where(eq(customerPackages.salonId, salonId))
      .groupBy(customerPackages.templateId),
  ])

  const itemsByTemplate = new Map<string, PackageTemplateItemRow[]>()
  for (const { templateId, ...item } of itemRows) {
    const list = itemsByTemplate.get(templateId) ?? []
    list.push(item)
    itemsByTemplate.set(templateId, list)
  }
  const soldByTemplate = new Map(soldRows.map((row) => [row.templateId, row.sold]))

  return templateRows.map((template) => ({
    ...template,
    items: itemsByTemplate.get(template.id) ?? [],
    sold: soldByTemplate.get(template.id) ?? 0,
  }))
}

/** Serviços e produtos ativos que um modelo pode incluir. */
export async function listPackageCatalogService(salonId: string): Promise<{
  services: { id: string; name: string }[]
  products: { id: string; name: string }[]
}> {
  const [serviceRows, productRows] = await Promise.all([
    db
      .select({ id: services.id, name: services.name })
      .from(services)
      .where(and(eq(services.salonId, salonId), eq(services.isActive, true), eq(services.isSystem, false)))
      .orderBy(asc(services.name)),
    db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(and(eq(products.salonId, salonId), eq(products.isActive, true)))
      .orderBy(asc(products.name)),
  ])
  return { services: serviceRows, products: productRows }
}

/**
 * Cria (sem `templateId`) ou altera um modelo. Os itens são substituídos pela
 * lista enviada. Alterar não mexe nos pacotes já vendidos — eles têm a cópia.
 *
 * O catálogo aceita serviço e produto INATIVO que já estava no modelo: desativar o
 * serviço não pode impedir de salvar o modelo de novo.
 */
export async function savePackageTemplateService(input: {
  salonId: string
  templateId?: string | null
  draft: PackageTemplateDraft
}): Promise<ActionResult<{ templateId: string }>> {
  try {
    const templateId = await db.transaction(async (tx) => {
      const serviceIds = unique(input.draft.items.map((item) => (item.kind === "service" ? item.serviceId : null)))
      const productIds = unique(input.draft.items.map((item) => (item.kind === "product" ? item.productId : null)))

      const [serviceRows, productRows] = await Promise.all([
        serviceIds.length
          ? tx
              .select({ id: services.id, name: services.name })
              .from(services)
              .where(and(eq(services.salonId, input.salonId), eq(services.isSystem, false), inArray(services.id, serviceIds)))
          : [],
        productIds.length
          ? tx
              .select({ id: products.id, name: products.name })
              .from(products)
              .where(and(eq(products.salonId, input.salonId), inArray(products.id, productIds)))
          : [],
      ])

      const plan = planPackageTemplate(input.draft, {
        services: new Map(serviceRows.map((row) => [row.id, { name: row.name }])),
        products: new Map(productRows.map((row) => [row.id, { name: row.name }])),
      })
      if (!plan.ok) fail(plan.error)

      let id: string
      if (input.templateId) {
        const [updated] = await tx
          .update(packageTemplates)
          .set({ ...plan.template, updatedAt: new Date() })
          .where(and(eq(packageTemplates.id, input.templateId), eq(packageTemplates.salonId, input.salonId)))
          .returning({ id: packageTemplates.id })
        if (!updated) fail("Pacote não encontrado")
        id = updated.id

        await tx
          .delete(packageTemplateItems)
          .where(and(eq(packageTemplateItems.templateId, id), eq(packageTemplateItems.salonId, input.salonId)))
      } else {
        const [created] = await tx
          .insert(packageTemplates)
          .values({ ...plan.template, salonId: input.salonId })
          .returning({ id: packageTemplates.id })
        id = created.id
      }

      await tx
        .insert(packageTemplateItems)
        .values(plan.items.map((item) => ({ ...item, salonId: input.salonId, templateId: id })))

      return id
    })

    return { success: true, data: { templateId } }
  } catch (error) {
    return toFailure(error, "Não foi possível salvar o pacote")
  }
}

/** Apaga um modelo que nunca entrou em comanda. */
export async function deletePackageTemplateService(input: {
  salonId: string
  templateId: string
}): Promise<ActionResult<void>> {
  try {
    await db.transaction(async (tx) => {
      const [template] = await tx
        .select({ id: packageTemplates.id })
        .from(packageTemplates)
        .where(and(eq(packageTemplates.id, input.templateId), eq(packageTemplates.salonId, input.salonId)))
        .for("update")
      if (!template) fail("Pacote não encontrado")

      const [used] = await tx
        .select({ total: count() })
        .from(saleItems)
        .where(and(eq(saleItems.salonId, input.salonId), eq(saleItems.packageTemplateId, template.id)))

      const blocker = packageTemplateDeleteBlocker({ saleItems: used?.total ?? 0 })
      if (blocker) fail(blocker)

      await tx
        .delete(packageTemplates)
        .where(and(eq(packageTemplates.id, template.id), eq(packageTemplates.salonId, input.salonId)))
    })

    return { success: true, data: undefined }
  } catch (error) {
    return toFailure(error, "Não foi possível excluir o pacote")
  }
}

// ============================================================================
// Pacotes vendidos
// ============================================================================

export type CustomerPackageRow = {
  id: string
  name: string
  soldOn: string
  expiresOn: string | null
  price: string
  customerId: string
  customerName: string
  sellerName: string | null
  saleId: string
  saleNumber: number
  items: { kind: PackageItemKind; description: string; quantity: number; remaining: number }[]
  /** Somando os itens. */
  quantity: number
  remaining: number
  status: CustomerPackageStatus
  /** Comandas faturadas que usaram o pacote (fatia 5b). */
  uses: { saleId: string; number: number }[]
}

/**
 * Pacotes vendidos do salão, do mais recente para o mais antigo. `customerId`
 * filtra por cliente.
 *
 * O saldo de cada linha é a quantidade vendida menos o que as comandas faturadas
 * usaram (fatia 5b).
 */
export async function listCustomerPackagesService(input: {
  salonId: string
  customerId?: string
  limit: number
  now: Date
}): Promise<{ rows: CustomerPackageRow[]; truncated: boolean }> {
  const packageRows = await db
    .select({
      id: customerPackages.id,
      name: customerPackages.name,
      soldOn: customerPackages.soldOn,
      expiresOn: customerPackages.expiresOn,
      price: customerPackages.price,
      customerId: customerPackages.customerId,
      customerName: customers.name,
      sellerName: professionals.name,
      saleId: customerPackages.saleId,
      saleNumber: sales.number,
    })
    .from(customerPackages)
    .innerJoin(customers, eq(customers.id, customerPackages.customerId))
    .innerJoin(sales, eq(sales.id, customerPackages.saleId))
    .leftJoin(professionals, eq(professionals.id, customerPackages.sellerId))
    .where(
      and(
        eq(customerPackages.salonId, input.salonId),
        input.customerId ? eq(customerPackages.customerId, input.customerId) : undefined
      )
    )
    .orderBy(desc(customerPackages.soldOn), desc(customerPackages.createdAt))
    .limit(input.limit + 1)

  const visible = packageRows.slice(0, input.limit)
  const ids = visible.map((row) => row.id)

  const itemRows = ids.length
    ? await db
        .select({
          id: customerPackageItems.id,
          customerPackageId: customerPackageItems.customerPackageId,
          kind: customerPackageItems.kind,
          description: customerPackageItems.description,
          quantity: customerPackageItems.quantity,
        })
        .from(customerPackageItems)
        .where(
          and(
            eq(customerPackageItems.salonId, input.salonId),
            inArray(customerPackageItems.customerPackageId, ids)
          )
        )
        .orderBy(asc(customerPackageItems.position))
    : []

  const usage = await usedByLine(
    db,
    input.salonId,
    itemRows.map((item) => item.id)
  )

  const itemsByPackage = new Map<string, CustomerPackageRow["items"]>()
  const usesByPackage = new Map<string, CustomerPackageRow["uses"]>()
  for (const { id, customerPackageId, ...item } of itemRows) {
    const used = usage.get(id)
    const list = itemsByPackage.get(customerPackageId) ?? []
    list.push({ ...item, remaining: Math.max(0, item.quantity - (used?.used ?? 0)) })
    itemsByPackage.set(customerPackageId, list)

    const uses = usesByPackage.get(customerPackageId) ?? []
    for (const sale of used?.sales ?? []) {
      if (!uses.some((existing) => existing.saleId === sale.saleId)) uses.push(sale)
    }
    usesByPackage.set(customerPackageId, uses)
  }

  const today = brazilToday(input.now)

  return {
    rows: visible.map((row) => {
      const items = itemsByPackage.get(row.id) ?? []
      const quantity = items.reduce((sum, item) => sum + item.quantity, 0)
      const remaining = items.reduce((sum, item) => sum + item.remaining, 0)
      return {
        ...row,
        items,
        quantity,
        remaining,
        status: customerPackageStatus({ expiresOn: row.expiresOn, remaining, today }),
        uses: (usesByPackage.get(row.id) ?? []).sort((a, b) => a.number - b.number),
      }
    }),
    truncated: packageRows.length > input.limit,
  }
}

// ============================================================================
// Comanda → pacote
// ============================================================================

/**
 * Cria os pacotes do cliente para os itens de pacote de uma comanda que acabou de
 * ser faturada. Roda DENTRO da transação do faturamento.
 *
 * Sem olhar o módulo: se a comanda tem item de pacote, o cliente pagou por um
 * pacote, e ele tem que existir.
 */
export async function recordSalePackages(
  tx: Tx,
  input: { salonId: string; saleId: string; customerId: string; saleDate: Date }
): Promise<void> {
  const items = await tx
    .select({
      id: saleItems.id,
      packageTemplateId: saleItems.packageTemplateId,
      professionalId: saleItems.professionalId,
      total: saleItems.total,
    })
    .from(saleItems)
    .where(
      and(eq(saleItems.saleId, input.saleId), eq(saleItems.salonId, input.salonId), eq(saleItems.kind, "package"))
    )

  const templateIds = unique(items.map((item) => item.packageTemplateId))
  if (templateIds.length === 0) return

  const [templateRows, lineRows] = await Promise.all([
    tx
      .select({ id: packageTemplates.id, name: packageTemplates.name, validityDays: packageTemplates.validityDays })
      .from(packageTemplates)
      .where(and(eq(packageTemplates.salonId, input.salonId), inArray(packageTemplates.id, templateIds))),
    tx
      .select({
        templateId: packageTemplateItems.templateId,
        kind: packageTemplateItems.kind,
        serviceId: packageTemplateItems.serviceId,
        productId: packageTemplateItems.productId,
        description: itemDescription,
        quantity: packageTemplateItems.quantity,
        listPrice: itemListPrice,
      })
      .from(packageTemplateItems)
      .leftJoin(services, eq(services.id, packageTemplateItems.serviceId))
      .leftJoin(products, eq(products.id, packageTemplateItems.productId))
      .where(
        and(eq(packageTemplateItems.salonId, input.salonId), inArray(packageTemplateItems.templateId, templateIds))
      )
      .orderBy(asc(packageTemplateItems.position)),
  ])

  const templates = new Map<string, TemplateForSale & { items: TemplateForSale["items"][number][] }>()
  for (const row of templateRows) {
    templates.set(row.id, { name: row.name, validityDays: row.validityDays, items: [] })
  }
  for (const { templateId, ...line } of lineRows) {
    templates.get(templateId)?.items.push(line)
  }

  const planned = planCustomerPackages({ saleDate: input.saleDate, items, templates })

  for (const pkg of planned) {
    const { items: lines, ...header } = pkg
    const [created] = await tx
      .insert(customerPackages)
      .values({ ...header, salonId: input.salonId, customerId: input.customerId, saleId: input.saleId })
      .returning({ id: customerPackages.id })

    if (lines.length > 0) {
      await tx
        .insert(customerPackageItems)
        .values(lines.map((line) => ({ ...line, salonId: input.salonId, customerPackageId: created.id })))
    }
  }
}

/**
 * Comandas (abertas ou faturadas) que usam um pacote vendido por esta comanda.
 * Reabrir a comanda que vendeu apagaria o pacote — e a sessão já usada ficaria
 * apontando para nada; quem reabre pergunta antes.
 */
export async function salePackagesInUse(
  tx: Tx,
  input: { salonId: string; saleId: string }
): Promise<{ saleId: string; number: number }[]> {
  const rows = await tx
    .selectDistinct({ saleId: sales.id, number: sales.number })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(customerPackageItems, eq(customerPackageItems.id, saleItems.customerPackageItemId))
    .innerJoin(customerPackages, eq(customerPackages.id, customerPackageItems.customerPackageId))
    .where(
      and(
        eq(saleItems.salonId, input.salonId),
        eq(customerPackages.salonId, input.salonId),
        eq(customerPackages.saleId, input.saleId),
        ne(sales.status, "void")
      )
    )
    .orderBy(asc(sales.number))
  return rows
}

/**
 * Desfaz os pacotes de uma comanda que está sendo reaberta. Roda DENTRO da
 * transação da reabertura. Os itens do pacote vão junto (CASCADE).
 */
export async function revertSalePackages(tx: Tx, input: { salonId: string; saleId: string }): Promise<void> {
  await tx
    .delete(customerPackages)
    .where(and(eq(customerPackages.saleId, input.saleId), eq(customerPackages.salonId, input.salonId)))
}

/**
 * Modelos citados pelos itens de uma comanda — o catálogo da venda. Inativo entra:
 * desativar o modelo não pode travar uma comanda aberta que já o tinha (a tela só
 * oferece os ativos).
 */
export async function loadSalePackageTemplates(
  executor: typeof db | Tx,
  salonId: string,
  templateIds: string[]
): Promise<Map<string, { name: string }>> {
  if (templateIds.length === 0) return new Map()
  const rows = await executor
    .select({ id: packageTemplates.id, name: packageTemplates.name })
    .from(packageTemplates)
    .where(
and(eq(packageTemplates.salonId, salonId), inArray(packageTemplates.id, templateIds))
    )
  return new Map(rows.map((row) => [row.id, { name: row.name }]))
}

// ============================================================================
// Uso do pacote na comanda (fatia 5b)
// ============================================================================

/**
 * As linhas de pacote que uma comanda cita, com o que OUTRAS comandas faturadas já
 * usaram. Escopado pelo salão: linha de outro salão não aparece, e a regra trata
 * como inexistente.
 *
 * `lock`: trava as linhas (FOR UPDATE) antes de somar o uso — é o que o
 * faturamento faz, para que duas comandas faturadas ao mesmo tempo não usem a
 * mesma última sessão. A trava vem ANTES da soma: a segunda espera a primeira
 * terminar e já soma o uso dela.
 */
export async function loadPackageLines(
  executor: typeof db | Tx,
  input: { salonId: string; lineIds: string[]; excludeSaleId?: string; lock?: boolean }
): Promise<Map<string, PackageLine>> {
  const lineIds = unique(input.lineIds)
  if (lineIds.length === 0) return new Map()

  const query = executor
    .select({
      id: customerPackageItems.id,
      customerPackageId: customerPackages.id,
      customerId: customerPackages.customerId,
      packageName: customerPackages.name,
      kind: customerPackageItems.kind,
      serviceId: customerPackageItems.serviceId,
      productId: customerPackageItems.productId,
      description: customerPackageItems.description,
      quantity: customerPackageItems.quantity,
      soldOn: customerPackages.soldOn,
      expiresOn: customerPackages.expiresOn,
    })
    .from(customerPackageItems)
    .innerJoin(customerPackages, eq(customerPackages.id, customerPackageItems.customerPackageId))
    .where(
      and(
        eq(customerPackageItems.salonId, input.salonId),
        eq(customerPackages.salonId, input.salonId),
        inArray(customerPackageItems.id, lineIds)
      )
    )

  const rows = input.lock ? await query.for("update", { of: customerPackageItems }) : await query
  const usage = await usedByLine(executor, input.salonId, lineIds, input.excludeSaleId)

  return new Map(
    rows.map(({ id, ...row }) => [id, { ...row, used: usage.get(id)?.used ?? 0 }])
  )
}

export type CustomerPackageBalance = {
  /** A linha do pacote — o que o item "do pacote" da comanda cita. */
  lineId: string
  customerPackageId: string
  packageName: string
  kind: PackageItemKind
  serviceId: string | null
  productId: string | null
  description: string
  quantity: number
  remaining: number
  soldOn: string
  expiresOn: string | null
}

/**
 * O que o cliente ainda pode usar: as linhas com saldo dos pacotes dentro da
 * validade, para o botão "+ Do pacote" da comanda. `excludeSaleId` tira a própria
 * comanda da conta (se ela foi faturada e reaberta, o uso dela volta ao saldo).
 */
export async function listCustomerPackageBalancesService(input: {
  salonId: string
  customerId: string
  now: Date
  excludeSaleId?: string
}): Promise<CustomerPackageBalance[]> {
  const today = brazilToday(input.now)

  const rows = await db
    .select({
      lineId: customerPackageItems.id,
      customerPackageId: customerPackages.id,
      packageName: customerPackages.name,
      kind: customerPackageItems.kind,
      serviceId: customerPackageItems.serviceId,
      productId: customerPackageItems.productId,
      description: customerPackageItems.description,
      quantity: customerPackageItems.quantity,
      soldOn: customerPackages.soldOn,
      expiresOn: customerPackages.expiresOn,
    })
    .from(customerPackageItems)
    .innerJoin(customerPackages, eq(customerPackages.id, customerPackageItems.customerPackageId))
    .where(
      and(
        eq(customerPackageItems.salonId, input.salonId),
        eq(customerPackages.salonId, input.salonId),
        eq(customerPackages.customerId, input.customerId),
        sql`(${customerPackages.expiresOn} IS NULL OR ${customerPackages.expiresOn} >= ${today}::date)`
      )
    )
    .orderBy(asc(customerPackages.soldOn), asc(customerPackages.createdAt), asc(customerPackageItems.position))
    .limit(200)

  const usage = await usedByLine(
    db,
    input.salonId,
    rows.map((row) => row.lineId),
    input.excludeSaleId
  )

  return rows
    .map((row) => ({ ...row, remaining: Math.max(0, row.quantity - (usage.get(row.lineId)?.used ?? 0)) }))
    .filter((row) => row.remaining > 0)
}
