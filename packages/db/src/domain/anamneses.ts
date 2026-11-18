/**
 * Anamneses — regra pura, sem I/O (docs/ROADMAP.md, fase 7, fatia 7d).
 *
 * O salão monta MODELOS de ficha (uma lista de perguntas) e responde um modelo na
 * ficha do cliente. Cada resposta é um RETRATO: guarda o texto da pergunta como
 * estava no dia, para que alterar ou excluir o modelo não mude o histórico.
 */

export const ANAMNESIS_QUESTION_TYPES = ['text', 'long_text', 'yes_no', 'single_choice', 'multiple_choice'] as const

export type AnamnesisQuestionType = (typeof ANAMNESIS_QUESTION_TYPES)[number]

export const ANAMNESIS_QUESTION_TYPE_LABELS: Record<AnamnesisQuestionType, string> = {
  text: 'Resposta curta',
  long_text: 'Resposta longa',
  yes_no: 'Sim ou não',
  single_choice: 'Uma opção',
  multiple_choice: 'Várias opções',
}

export const ANAMNESIS_LIMITS = {
  templates: 30,
  name: 80,
  questions: 40,
  label: 200,
  options: { min: 2, max: 20 },
  option: 80,
  text: 200,
  longText: 2000,
} as const

export type AnamnesisQuestion = {
  id: string
  label: string
  type: AnamnesisQuestionType
  required: boolean
  /** Só nas perguntas de opção; vazio nas outras. */
  options: string[]
}

export type AnamnesisAnswerValue = string | string[] | boolean | null

/** Uma resposta gravada: a pergunta como estava no dia e o que foi respondido. */
export type AnamnesisAnswer = {
  questionId: string
  label: string
  type: AnamnesisQuestionType
  /** NULL = pergunta opcional deixada em branco. */
  value: AnamnesisAnswerValue
}

const QUESTION_ID = /^[a-z0-9_-]{1,40}$/

function isQuestionType(value: unknown): value is AnamnesisQuestionType {
  return typeof value === 'string' && (ANAMNESIS_QUESTION_TYPES as readonly string[]).includes(value)
}

function hasOptions(type: AnamnesisQuestionType): boolean {
  return type === 'single_choice' || type === 'multiple_choice'
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

export type AnamnesisTemplateDraft = { name: unknown; questions: unknown }

export type AnamnesisTemplatePlan =
  | { ok: true; template: { name: string; questions: AnamnesisQuestion[] } }
  | { ok: false; error: string }

/**
 * Valida e normaliza um modelo.
 *
 * O `id` de cada pergunta só serve para casar a resposta com a pergunta na hora
 * de responder. Pergunta que já tem id válido o mantém; a nova ganha o menor
 * "qN" livre — sem sorteio, para a função continuar pura.
 */
export function planAnamnesisTemplate(draft: AnamnesisTemplateDraft): AnamnesisTemplatePlan {
  const limits = ANAMNESIS_LIMITS

  const name = clean(draft.name)
  if (!name) return { ok: false, error: 'Dê um nome ao modelo' }
  if (name.length > limits.name) return { ok: false, error: `O nome do modelo tem até ${limits.name} caracteres` }

  if (!Array.isArray(draft.questions) || draft.questions.length === 0) {
    return { ok: false, error: 'O modelo precisa de ao menos uma pergunta' }
  }
  if (draft.questions.length > limits.questions) {
    return { ok: false, error: `O modelo tem até ${limits.questions} perguntas` }
  }

  const usedIds = new Set<string>()
  for (const raw of draft.questions) {
    const id = (raw as { id?: unknown } | null)?.id
    if (typeof id === 'string' && QUESTION_ID.test(id)) usedIds.add(id)
  }

  const takenIds = new Set<string>()
  let nextNumber = 1
  const questions: AnamnesisQuestion[] = []

  for (const [index, raw] of draft.questions.entries()) {
    const position = index + 1
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: `Pergunta ${position} inválida` }
    const input = raw as Record<string, unknown>

    const label = clean(input.label)
    if (!label) return { ok: false, error: `Escreva o texto da pergunta ${position}` }
    if (label.length > limits.label) {
      return { ok: false, error: `A pergunta ${position} tem até ${limits.label} caracteres` }
    }

    if (!isQuestionType(input.type)) return { ok: false, error: `Escolha o tipo da pergunta ${position}` }
    const type = input.type

    let options: string[] = []
    if (hasOptions(type)) {
      const rawOptions = Array.isArray(input.options) ? input.options : []
      const seen = new Set<string>()
      for (const rawOption of rawOptions) {
        const option = clean(rawOption)
        if (!option) continue
        if (option.length > limits.option) {
          return { ok: false, error: `Cada opção da pergunta ${position} tem até ${limits.option} caracteres` }
        }
        const key = option.toLowerCase()
        if (seen.has(key)) return { ok: false, error: `A pergunta ${position} tem a opção "${option}" repetida` }
        seen.add(key)
        options.push(option)
      }
      if (options.length < limits.options.min) {
        return { ok: false, error: `A pergunta ${position} precisa de ao menos ${limits.options.min} opções` }
      }
      if (options.length > limits.options.max) {
        return { ok: false, error: `A pergunta ${position} tem até ${limits.options.max} opções` }
      }
    } else {
      options = []
    }

    let id = typeof input.id === 'string' && QUESTION_ID.test(input.id) && !takenIds.has(input.id) ? input.id : ''
    if (!id) {
      while (usedIds.has(`q${nextNumber}`) || takenIds.has(`q${nextNumber}`)) nextNumber++
      id = `q${nextNumber}`
    }
    takenIds.add(id)

    questions.push({ id, label, type, required: input.required === true, options })
  }

  return { ok: true, template: { name, questions } }
}

/**
 * Lê as perguntas gravadas (jsonb cru). Nunca lança: o que não tiver o formato
 * esperado é descartado.
 */
export function parseAnamnesisQuestions(value: unknown): AnamnesisQuestion[] {
  if (!Array.isArray(value)) return []
  const questions: AnamnesisQuestion[] = []
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue
    const input = raw as Record<string, unknown>
    if (typeof input.id !== 'string' || typeof input.label !== 'string' || !isQuestionType(input.type)) continue
    questions.push({
      id: input.id,
      label: input.label,
      type: input.type,
      required: input.required === true,
      options: Array.isArray(input.options) ? input.options.filter((o): o is string => typeof o === 'string') : [],
    })
  }
  return questions
}

/** Lê as respostas gravadas (jsonb cru). Nunca lança. */
export function parseAnamnesisAnswers(value: unknown): AnamnesisAnswer[] {
  if (!Array.isArray(value)) return []
  const answers: AnamnesisAnswer[] = []
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue
    const input = raw as Record<string, unknown>
    if (typeof input.label !== 'string' || !isQuestionType(input.type)) continue

    let answer: AnamnesisAnswerValue = null
    if (typeof input.value === 'string' || typeof input.value === 'boolean') answer = input.value
    else if (Array.isArray(input.value)) answer = input.value.filter((v): v is string => typeof v === 'string')

    answers.push({
      questionId: typeof input.questionId === 'string' ? input.questionId : '',
      label: input.label,
      type: input.type,
      value: answer,
    })
  }
  return answers
}

export type AnamnesisAnswersPlan = { ok: true; answers: AnamnesisAnswer[] } | { ok: false; error: string }

/**
 * Confere as respostas contra as perguntas do modelo e monta o retrato a gravar.
 *
 * `raw` é um objeto { idDaPergunta: resposta }. Resposta a pergunta que não está
 * no modelo é ignorada. Pergunta opcional sem resposta entra com `value: null`,
 * para o histórico mostrar que ela foi feita e ficou em branco.
 */
export function planAnamnesisAnswers(questions: readonly AnamnesisQuestion[], raw: unknown): AnamnesisAnswersPlan {
  const limits = ANAMNESIS_LIMITS
  const given = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}

  const answers: AnamnesisAnswer[] = []
  let answered = 0

  for (const question of questions) {
    const input = given[question.id]
    let value: AnamnesisAnswerValue = null

    if (question.type === 'text' || question.type === 'long_text') {
      const max = question.type === 'text' ? limits.text : limits.longText
      const text = typeof input === 'string' ? input.trim() : ''
      if (text.length > max) {
        return { ok: false, error: `A resposta de "${question.label}" tem até ${max} caracteres` }
      }
      value = text || null
    } else if (question.type === 'yes_no') {
      value = typeof input === 'boolean' ? input : null
    } else if (question.type === 'single_choice') {
      if (typeof input === 'string' && input !== '') {
        if (!question.options.includes(input)) {
          return { ok: false, error: `Escolha uma das opções de "${question.label}"` }
        }
        value = input
      }
    } else {
      const chosen = Array.isArray(input) ? input : []
      if (chosen.some((option) => typeof option !== 'string' || !question.options.includes(option))) {
        return { ok: false, error: `Escolha entre as opções de "${question.label}"` }
      }
      // Na ordem do modelo, sem repetição.
      const picked = question.options.filter((option) => chosen.includes(option))
      value = picked.length > 0 ? picked : null
    }

    if (value === null && question.required) {
      return { ok: false, error: `Responda: "${question.label}"` }
    }
    if (value !== null) answered++

    answers.push({ questionId: question.id, label: question.label, type: question.type, value })
  }

  if (answered === 0) return { ok: false, error: 'Responda ao menos uma pergunta' }

  return { ok: true, answers }
}

/** A resposta em texto, para a tela: "Sim", "Não", opções separadas por vírgula, "—" em branco. */
export function formatAnamnesisAnswer(value: AnamnesisAnswerValue): string {
  if (value === null) return '—'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—'
  return value
}
