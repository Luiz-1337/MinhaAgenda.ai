/**
 * Avaliações pós-atendimento — regra pura, sem I/O (docs/ROADMAP.md, fase 6,
 * fatia 6c).
 *
 * Quando uma comanda com serviço é faturada, nasce um PEDIDO de avaliação, com um
 * link público. O cliente abre o link, dá uma nota de 1 a 5 e, se quiser, um
 * comentário — uma vez só. O painel soma as respostas.
 *
 * Mesmo desenho dos outros módulos: o serviço busca os dados, estas funções
 * decidem, o serviço grava.
 */

// ============================================================================
// Personalização do formulário
// ============================================================================

const MAX_TITLE_LENGTH = 80
const MAX_TEXT_LENGTH = 300
const MAX_WHATSAPP_TEXT_LENGTH = 500
/** Horas entre faturar a comanda e mandar o pedido pelo WhatsApp. */
export const REVIEW_WHATSAPP_DELAY = { min: 0, max: 72, default: 2 } as const
export const MAX_REVIEW_COMMENT_LENGTH = 1000

/** Os textos que o formulário usa quando o salão não escreveu os seus. */
export const DEFAULT_REVIEW_TEXTS = {
  title: 'Como foi o seu atendimento?',
  welcome: 'Sua opinião ajuda a gente a melhorar. Leva menos de um minuto.',
  thanks: 'Obrigado pela sua avaliação!',
} as const

export type ReviewSettingsDraft = {
  isEnabled: boolean
  title?: string | null
  welcomeText?: string | null
  thanksText?: string | null
  /** Mandar o pedido pelo WhatsApp (fatia 6d). */
  sendWhatsapp?: boolean
  whatsappDelayHours?: number
  whatsappText?: string | null
}

export type ReviewSettingsPlan =
  | {
      ok: true
      settings: {
        isEnabled: boolean
        title: string | null
        welcomeText: string | null
        thanksText: string | null
        sendWhatsapp: boolean
        whatsappDelayHours: number
        whatsappText: string | null
      }
    }
  | { ok: false; error: string }

function cleanText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Texto em branco vira NULL: o formulário usa o padrão. */
export function planReviewSettings(draft: ReviewSettingsDraft): ReviewSettingsPlan {
  const title = cleanText(draft.title)
  const welcomeText = cleanText(draft.welcomeText)
  const thanksText = cleanText(draft.thanksText)

  if (title && title.length > MAX_TITLE_LENGTH) return { ok: false, error: 'Título muito longo' }
  if (welcomeText && welcomeText.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: 'Texto de boas-vindas muito longo' }
  }
  if (thanksText && thanksText.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: 'Texto de agradecimento muito longo' }
  }

  const whatsappText = cleanText(draft.whatsappText)
  if (whatsappText && whatsappText.length > MAX_WHATSAPP_TEXT_LENGTH) {
    return { ok: false, error: 'Mensagem do WhatsApp muito longa' }
  }
  // Sem o link, a mensagem não leva o cliente a lugar nenhum.
  if (whatsappText && !whatsappText.includes('{link}')) {
    return { ok: false, error: 'A mensagem do WhatsApp precisa ter {link}, onde entra o link da avaliação' }
  }

  const whatsappDelayHours = draft.whatsappDelayHours ?? REVIEW_WHATSAPP_DELAY.default
  if (
    !Number.isInteger(whatsappDelayHours) ||
    whatsappDelayHours < REVIEW_WHATSAPP_DELAY.min ||
    whatsappDelayHours > REVIEW_WHATSAPP_DELAY.max
  ) {
    return { ok: false, error: `O envio pelo WhatsApp é de ${REVIEW_WHATSAPP_DELAY.min} a ${REVIEW_WHATSAPP_DELAY.max} horas depois` }
  }

  return {
    ok: true,
    settings: {
      isEnabled: draft.isEnabled === true,
      title,
      welcomeText,
      thanksText,
      sendWhatsapp: draft.sendWhatsapp === true,
      whatsappDelayHours,
      whatsappText,
    },
  }
}

/** Os textos que o formulário mostra: os do salão, ou o padrão. */
export function reviewFormTexts(settings: {
  title: string | null
  welcomeText: string | null
  thanksText: string | null
}): { title: string; welcome: string; thanks: string } {
  return {
    title: settings.title || DEFAULT_REVIEW_TEXTS.title,
    welcome: settings.welcomeText || DEFAULT_REVIEW_TEXTS.welcome,
    thanks: settings.thanksText || DEFAULT_REVIEW_TEXTS.thanks,
  }
}

// ============================================================================
// Pedido e resposta
// ============================================================================

/**
 * A comanda faturada pede avaliação? Só com o módulo ligado, as avaliações
 * ativadas no salão e pelo menos um SERVIÇO na comanda — venda de produto, de
 * pacote ou cobrança de assinatura não é atendimento.
 */
export function shouldRequestReview(input: {
  moduleEnabled: boolean
  settingsEnabled: boolean
  itemKinds: readonly string[]
}): boolean {
  return input.moduleEnabled && input.settingsEnabled && input.itemKinds.includes('service')
}

/** A resposta do cliente: nota inteira de 1 a 5 e comentário opcional. Uma vez só. */
export function planReviewResponse(input: {
  rating: unknown
  comment: unknown
  alreadyResponded: boolean
}): { ok: true; rating: number; comment: string | null } | { ok: false; error: string } {
  if (input.alreadyResponded) return { ok: false, error: 'Esta avaliação já foi respondida' }

  const rating = typeof input.rating === 'number' ? input.rating : Number.NaN
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: 'Escolha uma nota de 1 a 5' }
  }

  const comment = cleanText(input.comment)
  if (comment && comment.length > MAX_REVIEW_COMMENT_LENGTH) {
    return { ok: false, error: 'Comentário muito longo' }
  }

  return { ok: true, rating, comment }
}

// ============================================================================
// Painel
// ============================================================================

export type ReviewForDashboard = {
  /** NULL = pendente. */
  rating: number | null
  requestedAt: Date
  respondedAt: Date | null
  /** Quem executou serviço na comanda, sem repetição. */
  professionals: readonly { id: string; name: string }[]
}

export type ReviewDashboard = {
  requested: number
  answered: number
  /** Média das notas, com uma casa. NULL = nenhuma resposta. */
  average: number | null
  /** Respondidas ÷ pedidas, de 0 a 100, inteiro. */
  responseRate: number
  /** Tempo médio entre o pedido e a resposta, em horas, com uma casa. NULL = nenhuma. */
  averageResponseHours: number | null
  /** Quantas respostas de cada nota: índice 0 = nota 1 … índice 4 = nota 5. */
  distribution: [number, number, number, number, number]
  professionals: { id: string; name: string; answered: number; average: number }[]
}

function oneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Soma as avaliações do período. A nota de uma comanda conta para CADA
 * profissional que executou serviço nela: o cliente avaliou o atendimento, e o
 * atendimento foi dos dois.
 */
export function buildReviewDashboard(reviews: readonly ReviewForDashboard[]): ReviewDashboard {
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  const byProfessional = new Map<string, { id: string; name: string; answered: number; sum: number }>()
  let answered = 0
  let ratingSum = 0
  let responseMs = 0

  for (const review of reviews) {
    if (review.rating === null || review.respondedAt === null) continue
    if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) continue

    answered += 1
    ratingSum += review.rating
    distribution[review.rating - 1] += 1
    responseMs += Math.max(0, review.respondedAt.getTime() - review.requestedAt.getTime())

    for (const professional of review.professionals) {
      const entry = byProfessional.get(professional.id) ?? { ...professional, answered: 0, sum: 0 }
      entry.answered += 1
      entry.sum += review.rating
      byProfessional.set(professional.id, entry)
    }
  }

  return {
    requested: reviews.length,
    answered,
    average: answered > 0 ? oneDecimal(ratingSum / answered) : null,
    responseRate: reviews.length > 0 ? Math.round((answered * 100) / reviews.length) : 0,
    averageResponseHours: answered > 0 ? oneDecimal(responseMs / answered / 3_600_000) : null,
    distribution,
    professionals: Array.from(byProfessional.values())
      .map(({ sum, ...professional }) => ({ ...professional, average: oneDecimal(sum / professional.answered) }))
      // A melhor média primeiro; no empate, quem tem mais avaliações, depois o nome.
      .sort(
        (a, b) => b.average - a.average || b.answered - a.answered || a.name.localeCompare(b.name, 'pt-BR')
      ),
  }
}
