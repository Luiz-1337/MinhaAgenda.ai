/**
 * Mensagens de cuidados e de retorno — regra pura, sem I/O (docs/ROADMAP.md,
 * fase 6, fatia 6d).
 *
 * O salão escreve, por serviço ou por produto, o que quer dizer ao cliente:
 *   - cuidados ANTES do atendimento (só serviço), N dias antes do agendamento;
 *   - cuidados DEPOIS, N dias depois da comanda faturada;
 *   - RETORNO, N dias depois da comanda, chamando o cliente de volta.
 * A mesma fila manda o pedido de avaliação (fatia 6c) pelo WhatsApp.
 *
 * Mesmo desenho dos outros módulos: o serviço busca os dados, estas funções
 * decidem, o serviço grava e quem envia é o app.
 */

// ============================================================================
// A mensagem do serviço ou do produto
// ============================================================================

export const CARE_MESSAGE_KINDS = ['pre_care', 'post_care', 'return'] as const
export type CareMessageKind = (typeof CARE_MESSAGE_KINDS)[number]

/** O que a fila manda: as três mensagens e o pedido de avaliação. */
export type CareDispatchKind = CareMessageKind | 'review'

export const MAX_CARE_MESSAGE_LENGTH = 1000

/** Limites de "quantos dias", por tipo. */
export const CARE_OFFSET_LIMITS: Record<CareMessageKind, { min: number; max: number }> = {
  // Dias antes do agendamento.
  pre_care: { min: 1, max: 30 },
  // Dias depois da comanda. 0 = no mesmo dia, assim que a comanda é faturada.
  post_care: { min: 0, max: 30 },
  // Dias depois da comanda.
  return: { min: 1, max: 365 },
}

export type CareMessageRuleDraft = {
  kind: unknown
  serviceId?: string | null
  productId?: string | null
  offsetDays: unknown
  message: unknown
  isActive?: boolean
}

export type CareMessageRulePlan =
  | {
      ok: true
      rule: {
        kind: CareMessageKind
        serviceId: string | null
        productId: string | null
        offsetDays: number
        message: string
        isActive: boolean
      }
    }
  | { ok: false; error: string }

function isCareMessageKind(value: unknown): value is CareMessageKind {
  return typeof value === 'string' && (CARE_MESSAGE_KINDS as readonly string[]).includes(value)
}

export function planCareMessageRule(draft: CareMessageRuleDraft): CareMessageRulePlan {
  if (!isCareMessageKind(draft.kind)) return { ok: false, error: 'Escolha o tipo da mensagem' }
  const kind = draft.kind

  const serviceId = draft.serviceId || null
  const productId = draft.productId || null
  if ((serviceId === null) === (productId === null)) {
    return { ok: false, error: 'Escolha um serviço ou um produto' }
  }
  if (kind === 'pre_care' && !serviceId) {
    return { ok: false, error: 'Cuidados antes do atendimento só valem para serviço' }
  }

  const limits = CARE_OFFSET_LIMITS[kind]
  const offsetDays = typeof draft.offsetDays === 'number' ? draft.offsetDays : Number.NaN
  if (!Number.isInteger(offsetDays) || offsetDays < limits.min || offsetDays > limits.max) {
    return { ok: false, error: `Informe de ${limits.min} a ${limits.max} dias` }
  }

  const message = typeof draft.message === 'string' ? draft.message.trim() : ''
  if (!message) return { ok: false, error: 'Escreva a mensagem' }
  if (message.length > MAX_CARE_MESSAGE_LENGTH) return { ok: false, error: 'Mensagem muito longa' }

  return {
    ok: true,
    rule: { kind, serviceId, productId, offsetDays, message, isActive: draft.isActive !== false },
  }
}

// ============================================================================
// O texto
// ============================================================================

/** As variáveis que o salão pode usar no texto. */
export const CARE_MESSAGE_VARIABLES = ['{cliente}', '{salao}', '{item}'] as const

/** O pedido de avaliação que sai pelo WhatsApp quando o salão não escreveu o seu. */
export const DEFAULT_REVIEW_WHATSAPP_TEXT =
  'Olá, {cliente}! Obrigado pela visita ao {salao}. Conte como foi o seu atendimento, leva menos de um minuto: {link}'

/** O primeiro nome, para o "Olá, Fulano". */
export function customerFirstName(name: string | null | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0]
  return first || 'cliente'
}

/**
 * Troca as variáveis do texto. Variável que não existe fica como está: é melhor o
 * salão ver `{nome}` na mensagem do que ela sumir sem aviso.
 */
export function renderCareMessage(
  template: string,
  vars: { customerName: string | null; salonName: string; itemName?: string | null; link?: string | null }
): string {
  const values: Record<string, string | null | undefined> = {
    cliente: customerFirstName(vars.customerName),
    salao: vars.salonName,
    item: vars.itemName,
    link: vars.link,
  }
  return template.replace(/\{(cliente|salao|item|link)\}/g, (whole, key: string) => values[key] ?? whole)
}

// ============================================================================
// Quando
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

/** Comanda lançada com mais atraso do que isto não manda mais a mensagem. */
const MAX_LATE_MS = DAY_MS
/** Envio que ficou parado mais do que isto é descartado em vez de sair velho. */
const MAX_STALE_MS = 3 * DAY_MS

/**
 * Quando sai a mensagem de uma comanda faturada: N dias depois do dia da comanda.
 * NULL = não manda — a comanda foi lançada com data antiga e a hora da mensagem já
 * passou há mais de um dia (cuidado de ontem não serve mais).
 */
export function saleMessageSchedule(input: { saleDate: Date; offsetDays: number; now: Date }): Date | null {
  const due = input.saleDate.getTime() + input.offsetDays * DAY_MS
  if (due < input.now.getTime() - MAX_LATE_MS) return null
  return new Date(Math.max(due, input.now.getTime()))
}

/** Quando sai o pedido de avaliação: N horas depois de faturar. */
export function reviewMessageSchedule(input: { now: Date; delayHours: number }): Date {
  return new Date(input.now.getTime() + input.delayHours * HOUR_MS)
}

/** O agendamento já entrou na janela dos cuidados de antes (e ainda não aconteceu)? */
export function isPreCareDue(input: { appointmentAt: Date; offsetDays: number; now: Date }): boolean {
  const at = input.appointmentAt.getTime()
  const now = input.now.getTime()
  return now < at && now >= at - input.offsetDays * DAY_MS
}

/** Das 9h às 20h de Brasília: fora disso a fila espera. */
export const CARE_SEND_HOURS = { from: 9, until: 20 } as const

export function isWithinCareSendHours(now: Date): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(now)
  )
  return hour >= CARE_SEND_HOURS.from && hour < CARE_SEND_HOURS.until
}

// ============================================================================
// Na hora de enviar
// ============================================================================

export type CareDispatchContext = {
  kind: CareDispatchKind
  scheduledFor: Date
  now: Date
  /** O módulo que manda este tipo está ligado no salão (`care_messages` ou `reviews`). */
  moduleEnabled: boolean
  customerHasPhone: boolean
  customerOptedOut: boolean
  /** A mensagem do item. NULL = foi excluída. Não se aplica à avaliação. */
  rule: { isActive: boolean } | null
  /** A comanda de origem. NULL = o envio veio de um agendamento. */
  saleStatus: string | null
  /** O agendamento de origem (cuidados de antes). */
  appointment: { status: string; at: Date } | null
  /** O pedido de avaliação. */
  review: { answered: boolean; settingsEnabled: boolean } | null
  /** O cliente já tem agendamento futuro (o retorno perde o sentido). */
  customerHasUpcomingAppointment: boolean
}

export type CareDispatchDecision =
  | { action: 'send' }
  /** Não manda, e registra o motivo. */
  | { action: 'skip'; reason: string }
  /** Ainda não: fica na fila. */
  | { action: 'wait' }

const OPEN_APPOINTMENT_STATUSES = ['pending', 'confirmed']

/**
 * Confere de novo, na hora de enviar, se a mensagem ainda faz sentido. Entre o
 * agendamento do envio e a hora dele o cliente pode ter pedido para não receber
 * nada, a comanda pode ter sido reaberta, o agendamento cancelado.
 */
export function decideCareDispatch(ctx: CareDispatchContext): CareDispatchDecision {
  if (!ctx.moduleEnabled) return { action: 'skip', reason: 'O módulo foi desligado no salão' }
  if (ctx.customerOptedOut) return { action: 'skip', reason: 'O cliente pediu para não receber mensagens' }
  if (!ctx.customerHasPhone) return { action: 'skip', reason: 'O cliente não tem telefone válido' }

  if (ctx.kind === 'review') {
    if (!ctx.review) return { action: 'skip', reason: 'O pedido de avaliação foi excluído' }
    if (ctx.review.answered) return { action: 'skip', reason: 'O cliente já avaliou' }
    if (!ctx.review.settingsEnabled) return { action: 'skip', reason: 'O envio pelo WhatsApp foi desativado' }
  } else {
    if (!ctx.rule) return { action: 'skip', reason: 'A mensagem foi excluída' }
    if (!ctx.rule.isActive) return { action: 'skip', reason: 'A mensagem foi desativada' }
  }

  if (ctx.kind === 'pre_care') {
    if (!ctx.appointment) return { action: 'skip', reason: 'O agendamento não existe mais' }
    if (!OPEN_APPOINTMENT_STATUSES.includes(ctx.appointment.status)) {
      return { action: 'skip', reason: 'O agendamento foi cancelado ou já aconteceu' }
    }
    if (ctx.appointment.at.getTime() <= ctx.now.getTime()) {
      return { action: 'skip', reason: 'O horário do agendamento já passou' }
    }
    return { action: 'send' }
  }

  if (ctx.now.getTime() - ctx.scheduledFor.getTime() > MAX_STALE_MS) {
    return { action: 'skip', reason: 'Passou do prazo sem conseguir enviar' }
  }

  // Comanda reaberta: espera faturar de novo (ou vencer o prazo acima).
  if (ctx.saleStatus !== 'invoiced') return { action: 'wait' }

  if (ctx.kind === 'return' && ctx.customerHasUpcomingAppointment) {
    return { action: 'skip', reason: 'O cliente já tem um agendamento marcado' }
  }

  return { action: 'send' }
}

// ============================================================================
// Telefone
// ============================================================================

/**
 * O telefone do cadastro no formato que o WhatsApp recebe (+55…). NULL = não dá
 * para enviar. Número sem DDI é tratado como brasileiro.
 */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length >= 12 && digits.length <= 15) return `+${digits}`
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`
  return null
}
