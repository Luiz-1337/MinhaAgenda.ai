/**
 * Regra de comanda — pura, sem I/O (docs/ROADMAP.md, fase 1).
 *
 * O serviço (services/sales.service.ts) busca os dados, chama estas funções para
 * decidir e só então grava. A separação existe porque não há banco de teste neste
 * projeto: o que decide dinheiro precisa ser testável sem ele.
 *
 * DINHEIRO EM CENTAVOS INTEIROS. As colunas são numeric e o driver devolve
 * string; em ponto flutuante 0.1 + 0.2 ≠ 0.3 e a comanda "não fecha" por um
 * centavo. Entra string/number, vira centavo, e só volta a string para gravar.
 */

// ============================================================================
// Conversões
// ============================================================================

/** Valor monetário (string do banco ou número do form) → centavos. NULL = sem valor. */
export function toCents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

/** Centavos → string para coluna numeric(12,2). */
export function centsToNumeric(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** Quantidade → milésimos inteiros (a coluna é numeric(10,3)). */
function toMilli(quantity: number): number {
  return Math.round(quantity * 1000)
}

function milliToNumeric(milli: number): string {
  return `${Math.floor(milli / 1000)}.${String(milli % 1000).padStart(3, '0')}`
}

// ============================================================================
// Itens e totais
// ============================================================================

export const MAX_SALE_ITEMS = 100
const MAX_QUANTITY = 9999
/** Teto por valor unitário: cabe em numeric(12,2) com folga e pega erro de digitação. */
const MAX_UNIT_PRICE_CENTS = 100_000_000 // R$ 1.000.000,00

export type SaleItemDraft = {
  /** 'package' = venda de pacote predefinido (fase 5, fatia 5a). */
  kind: 'service' | 'product' | 'package'
  serviceId?: string | null
  productId?: string | null
  packageTemplateId?: string | null
  professionalId?: string | null
  /** Quem auxiliou no serviço (fase 3, fatia 3b). Só em item de serviço. */
  assistantId?: string | null
  quantity: number
  /** NULL = preço ainda não informado. Aceito enquanto aberta; barra o faturamento. */
  unitPrice: number | null
  discountAmount: number
  appointmentId?: string | null
}

/** O que o serviço carregou do banco, JÁ filtrado pelo salão. */
export type SaleCatalog = {
  services: ReadonlyMap<string, { name: string }>
  products: ReadonlyMap<string, { name: string }>
  /**
   * Pacotes predefinidos ATIVOS do salão que os itens citam. Vazio quando o módulo
   * de pacotes está desligado — aí item de pacote é "não encontrado".
   */
  packageTemplates: ReadonlyMap<string, { name: string }>
  professionalIds: ReadonlySet<string>
  appointments: ReadonlyMap<string, { customerId: string; status: string }>
}

export type PlannedSaleItem = {
  position: number
  kind: 'service' | 'product' | 'package'
  serviceId: string | null
  productId: string | null
  packageTemplateId: string | null
  description: string
  professionalId: string | null
  assistantId: string | null
  quantity: string
  unitPrice: string | null
  discountAmount: string
  total: string
  appointmentId: string | null
}

export type SaleItemsPlan =
  | {
      ok: true
      items: PlannedSaleItem[]
      subtotalCents: number
      discountCents: number
      totalCents: number
    }
  | { ok: false; error: string }

/**
 * Valida os itens digitados contra o catálogo do salão e calcula os totais.
 *
 * Tudo que vem do cliente é entrada: descrição e total são recalculados aqui (a
 * descrição é copiada do cadastro; o total é quantidade × unitário − desconto).
 * Uma referência que não está no catálogo é de outro salão ou não existe — nos
 * dois casos é erro, nunca "ignora".
 */
export function planSaleItems(
  customerId: string,
  drafts: readonly SaleItemDraft[],
  catalog: SaleCatalog
): SaleItemsPlan {
  if (drafts.length > MAX_SALE_ITEMS) {
    return { ok: false, error: `A comanda aceita no máximo ${MAX_SALE_ITEMS} itens` }
  }

  const items: PlannedSaleItem[] = []
  const seenAppointments = new Set<string>()
  let subtotalCents = 0
  let discountCents = 0

  for (const [index, draft] of drafts.entries()) {
    const label = `Item ${index + 1}`

    let description: string
    let serviceId: string | null = null
    let productId: string | null = null
    let packageTemplateId: string | null = null

    if (draft.kind === 'service') {
      const service = draft.serviceId ? catalog.services.get(draft.serviceId) : undefined
      if (!service || !draft.serviceId) return { ok: false, error: `${label}: serviço não encontrado` }
      serviceId = draft.serviceId
      description = service.name
    } else if (draft.kind === 'product') {
      const product = draft.productId ? catalog.products.get(draft.productId) : undefined
      if (!product || !draft.productId) return { ok: false, error: `${label}: produto não encontrado` }
      productId = draft.productId
      description = product.name
    } else if (draft.kind === 'package') {
      const template = draft.packageTemplateId ? catalog.packageTemplates.get(draft.packageTemplateId) : undefined
      if (!template || !draft.packageTemplateId) return { ok: false, error: `${label}: pacote não encontrado` }
      packageTemplateId = draft.packageTemplateId
      description = template.name
    } else {
      return { ok: false, error: `${label}: tipo inválido` }
    }

    const professionalId = draft.professionalId || null
    if (professionalId && !catalog.professionalIds.has(professionalId)) {
      return { ok: false, error: `${label}: profissional não encontrado` }
    }
    // Serviço sempre tem quem executou — é a base da comissão.
    if (draft.kind === 'service' && !professionalId) {
      return { ok: false, error: `${label}: informe o profissional que executou o serviço` }
    }

    // Auxiliar: opcional, só em serviço, do salão e diferente de quem executou.
    const assistantId = draft.assistantId || null
    if (assistantId) {
      if (draft.kind !== 'service') {
        return { ok: false, error: `${label}: só serviço pode ter auxiliar` }
      }
      if (!catalog.professionalIds.has(assistantId)) {
        return { ok: false, error: `${label}: auxiliar não encontrado` }
      }
      if (assistantId === professionalId) {
        return { ok: false, error: `${label}: o auxiliar não pode ser o próprio profissional` }
      }
    }

    if (!Number.isFinite(draft.quantity) || draft.quantity <= 0 || draft.quantity > MAX_QUANTITY) {
      return { ok: false, error: `${label}: quantidade inválida` }
    }
    const quantityMilli = toMilli(draft.quantity)
    if (quantityMilli <= 0) return { ok: false, error: `${label}: quantidade inválida` }
    // Um item de pacote é UM pacote: para vender dois, dois itens.
    if (draft.kind === 'package' && quantityMilli !== 1000) {
      return { ok: false, error: `${label}: pacote vai com quantidade 1. Para vender mais de um, use um item para cada` }
    }

    const unitCents = draft.unitPrice === null ? null : toCents(draft.unitPrice)
    if (draft.unitPrice !== null && (unitCents === null || unitCents < 0 || unitCents > MAX_UNIT_PRICE_CENTS)) {
      return { ok: false, error: `${label}: valor unitário inválido` }
    }

    const itemDiscountCents = toCents(draft.discountAmount)
    if (itemDiscountCents === null || itemDiscountCents < 0) {
      return { ok: false, error: `${label}: desconto inválido` }
    }

    // Sem preço informado o item vale zero por enquanto — e não pode ter desconto,
    // que ficaria maior que o valor.
    const grossCents = unitCents === null ? 0 : Math.round((quantityMilli * unitCents) / 1000)
    if (itemDiscountCents > grossCents) {
      return { ok: false, error: `${label}: o desconto é maior que o valor do item` }
    }

    const appointmentId = draft.appointmentId || null
    if (appointmentId) {
      if (draft.kind !== 'service') {
        return { ok: false, error: `${label}: só serviço pode vir de um agendamento` }
      }
      const appointment = catalog.appointments.get(appointmentId)
      if (!appointment) return { ok: false, error: `${label}: agendamento não encontrado` }
      if (appointment.customerId !== customerId) {
        return { ok: false, error: `${label}: o agendamento é de outro cliente` }
      }
      if (appointment.status === 'cancelled') {
        return { ok: false, error: `${label}: o agendamento foi cancelado` }
      }
      if (seenAppointments.has(appointmentId)) {
        return { ok: false, error: `${label}: o mesmo agendamento aparece em dois itens` }
      }
      seenAppointments.add(appointmentId)
    }

    subtotalCents += grossCents
    discountCents += itemDiscountCents

    items.push({
      position: index,
      kind: draft.kind,
      serviceId,
      productId,
      packageTemplateId,
      description,
      professionalId,
      assistantId,
      quantity: milliToNumeric(quantityMilli),
      unitPrice: unitCents === null ? null : centsToNumeric(unitCents),
      discountAmount: centsToNumeric(itemDiscountCents),
      total: centsToNumeric(grossCents - itemDiscountCents),
      appointmentId,
    })
  }

  return {
    ok: true,
    items,
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
  }
}

// ============================================================================
// Faturamento
// ============================================================================

export type InvoicePaymentDraft = { paymentMethodId: string; amount: number }

export type InvoiceInput = {
  /** Itens GRAVADOS da comanda (strings do banco). */
  items: readonly { unitPrice: string | null; total: string; appointmentId: string | null }[]
  payments: readonly InvoicePaymentDraft[]
  /** Formas de pagamento do salão, já filtradas por salon_id. */
  methods: ReadonlyMap<string, { feePercent: string; settlementDays: number; isActive: boolean }>
  /** Agendamentos ligados aos itens, já filtrados por salon_id. */
  appointments: ReadonlyMap<string, { status: string; date: Date }>
  /**
   * Aceita faturar com os pagamentos somando MENOS que o total: a diferença vira
   * débito do cliente. Quem decide é o chamador (permissão + confirmação explícita
   * na tela). Sem isso, faltar um centavo é erro.
   */
  allowDebt?: boolean
  now: Date
}

export type PlannedPayment = {
  paymentMethodId: string
  amount: string
  feePercent: string
  feeAmount: string
  settlesOn: string
}

export type InvoicePlan =
  | {
      ok: true
      totalCents: number
      paidCents: number
      /** O que fica em aberto: total − pagamentos. Zero, a não ser com `allowDebt`. */
      dueCents: number
      payments: PlannedPayment[]
      /** Agendamentos a fechar, com o valor cobrado (soma dos itens de cada um). */
      appointmentOutcomes: { appointmentId: string; priceCharged: string }[]
    }
  | { ok: false; error: string }

const BRAZIL_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Dia do recebimento: a data de HOJE EM BRASÍLIA mais o prazo da forma de pagamento.
 *
 * Brasília e não UTC: uma comanda faturada às 22h de sexta é de sexta, e em UTC já
 * seria sábado — o prazo de recebimento sairia um dia adiantado toda noite.
 */
export function settlementDate(now: Date, settlementDays: number): string {
  const [year, month, day] = BRAZIL_DATE.format(now).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + settlementDays))
  return date.toISOString().slice(0, 10)
}

type PaymentMethodsMap = ReadonlyMap<string, { feePercent: string; settlementDays: number; isActive: boolean }>

type PaymentsPlan = { ok: true; payments: PlannedPayment[]; paidCents: number } | { ok: false; error: string }

/**
 * Valida os pagamentos contra as formas do salão e calcula taxa e dia do
 * recebimento de cada um. Compartilhado pelo faturamento e pelo recebimento de
 * débito — a regra de um pagamento é a mesma nos dois.
 */
function planPayments(payments: readonly InvoicePaymentDraft[], methods: PaymentMethodsMap, now: Date): PaymentsPlan {
  const planned: PlannedPayment[] = []
  let paidCents = 0

  for (const payment of payments) {
    const method = methods.get(payment.paymentMethodId)
    if (!method) return { ok: false, error: 'Forma de pagamento não encontrada' }
    if (!method.isActive) return { ok: false, error: 'Forma de pagamento inativa' }

    const amountCents = toCents(payment.amount)
    if (amountCents === null || amountCents <= 0) {
      return { ok: false, error: 'Valor de pagamento inválido' }
    }

    // Taxa em centésimos de ponto percentual, para não fazer conta com float.
    const feeBasisPoints = Math.round(Number(method.feePercent) * 100)
    if (!Number.isFinite(feeBasisPoints) || feeBasisPoints < 0 || feeBasisPoints > 10_000) {
      return { ok: false, error: 'A forma de pagamento tem taxa inválida' }
    }
    const feeCents = Math.round((amountCents * feeBasisPoints) / 10_000)

    paidCents += amountCents
    planned.push({
      paymentMethodId: payment.paymentMethodId,
      amount: centsToNumeric(amountCents),
      feePercent: (feeBasisPoints / 100).toFixed(2),
      feeAmount: centsToNumeric(feeCents),
      settlesOn: settlementDate(now, method.settlementDays),
    })
  }

  return { ok: true, payments: planned, paidCents }
}

/**
 * Decide o faturamento: confere se a comanda pode ser faturada com estes
 * pagamentos e devolve o que gravar.
 *
 * Por padrão a soma dos pagamentos tem que ser IGUAL ao total. Com `allowDebt`,
 * pode ser menor — inclusive zero — e a diferença fica em aberto como débito do
 * cliente. Passar do total nunca é aceito: não há troco nem crédito aqui.
 */
export function planInvoice(input: InvoiceInput): InvoicePlan {
  if (input.items.length === 0) {
    return { ok: false, error: 'A comanda não tem itens' }
  }

  if (input.items.some((item) => item.unitPrice === null)) {
    return { ok: false, error: 'Informe o valor de todos os itens antes de faturar' }
  }

  let totalCents = 0
  const chargedByAppointment = new Map<string, number>()

  for (const item of input.items) {
    const itemCents = toCents(item.total)
    if (itemCents === null || itemCents < 0) {
      return { ok: false, error: 'A comanda tem item com valor inválido' }
    }
    totalCents += itemCents

    if (item.appointmentId) {
      chargedByAppointment.set(
        item.appointmentId,
        (chargedByAppointment.get(item.appointmentId) ?? 0) + itemCents
      )
    }
  }

  for (const appointmentId of chargedByAppointment.keys()) {
    const appointment = input.appointments.get(appointmentId)
    if (!appointment) {
      return { ok: false, error: 'Um agendamento desta comanda não foi encontrado' }
    }
    if (appointment.status === 'cancelled') {
      return { ok: false, error: 'Um agendamento desta comanda foi cancelado. Remova o item para faturar' }
    }
    if (appointment.status === 'no_show') {
      return { ok: false, error: 'Um agendamento desta comanda está marcado como falta. Remova o item para faturar' }
    }
    // Mesma regra de "Concluir" na agenda: fechar o que ainda não começou é erro
    // de clique.
    if (appointment.date.getTime() > input.now.getTime()) {
      return { ok: false, error: 'Um agendamento desta comanda ainda não começou' }
    }
  }

  const planned = planPayments(input.payments, input.methods, input.now)
  if (!planned.ok) return planned

  const { payments, paidCents } = planned

  if (paidCents > totalCents) {
    const diff = centsToNumeric(paidCents - totalCents).replace('.', ',')
    return { ok: false, error: `Os pagamentos passam do total em R$ ${diff}` }
  }

  if (paidCents < totalCents && !input.allowDebt) {
    const diff = centsToNumeric(totalCents - paidCents).replace('.', ',')
    return { ok: false, error: `Faltam R$ ${diff} para fechar a comanda` }
  }

  return {
    ok: true,
    totalCents,
    paidCents,
    dueCents: totalCents - paidCents,
    payments,
    appointmentOutcomes: Array.from(chargedByAppointment, ([appointmentId, cents]) => ({
      appointmentId,
      priceCharged: centsToNumeric(cents),
    })),
  }
}

// ============================================================================
// Receber débito
// ============================================================================

export type DebtPaymentPlan =
  | { ok: true; payments: PlannedPayment[]; paidCents: number; remainingCents: number }
  | { ok: false; error: string }

/**
 * Recebe (todo ou parte de) o valor em aberto de uma comanda já faturada.
 *
 * Pode ser parcial — a cliente paga em duas, três vezes. Não pode ser zero nem
 * passar do que está em aberto: o que sobraria seria crédito do cliente, que não
 * existe aqui.
 */
export function planDebtPayment(input: {
  /** `sales.amount_due`, string do banco. */
  amountDue: string
  payments: readonly InvoicePaymentDraft[]
  methods: PaymentMethodsMap
  now: Date
}): DebtPaymentPlan {
  const dueCents = toCents(input.amountDue) ?? 0
  if (dueCents <= 0) return { ok: false, error: 'Esta comanda não tem valor em aberto' }

  if (input.payments.length === 0) return { ok: false, error: 'Informe ao menos um pagamento' }

  const planned = planPayments(input.payments, input.methods, input.now)
  if (!planned.ok) return planned

  if (planned.paidCents > dueCents) {
    const diff = centsToNumeric(planned.paidCents - dueCents).replace('.', ',')
    return { ok: false, error: `Os pagamentos passam do valor em aberto em R$ ${diff}` }
  }

  return {
    ok: true,
    payments: planned.payments,
    paidCents: planned.paidCents,
    remainingCents: dueCents - planned.paidCents,
  }
}
