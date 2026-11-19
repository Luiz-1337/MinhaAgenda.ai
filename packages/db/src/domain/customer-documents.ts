/**
 * Documentos com assinatura — regra pura, sem I/O (docs/ROADMAP.md, fase 7,
 * fatia 7e).
 *
 * O salão escreve MODELOS de termo (nome e texto). Gerar um documento para um
 * cliente tira um RETRATO do modelo, com os campos preenchidos, e cria um link
 * sem login. O cliente lê, escreve o nome, desenha a assinatura e confirma. Uma
 * vez assinado, o documento não muda mais.
 */

export const DOCUMENT_LIMITS = {
  templates: 30,
  name: 80,
  body: 20000,
  /** O texto já com os campos preenchidos pode passar um pouco do modelo. */
  renderedBody: 21000,
  /** Documentos esperando assinatura, por cliente. */
  pendingPerCustomer: 10,
  signerName: { min: 3, max: 120 },
  /** Caracteres do data URL da assinatura (PNG em base64). */
  signatureImage: { min: 600, max: 200000 },
  /** Dias em que o link aceita assinatura. */
  linkDays: 30,
} as const

/** Os campos que o modelo aceita, preenchidos na hora de gerar o documento. */
export const DOCUMENT_FIELDS = [
  { key: 'cliente', label: 'Nome do cliente' },
  { key: 'salao', label: 'Nome do salão' },
  { key: 'data', label: 'Data em que o documento foi gerado' },
] as const

export type DocumentFieldKey = (typeof DOCUMENT_FIELDS)[number]['key']

export type DocumentStatus = 'pending' | 'signed' | 'expired'

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  pending: 'Aguardando assinatura',
  signed: 'Assinado',
  expired: 'Link vencido',
}

/** Nome: uma linha, espaços juntos. */
function cleanLine(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

/** Texto: mantém as quebras de linha; tira espaço do fim das linhas e das pontas. */
function cleanText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

export type DocumentTemplateDraft = { name: unknown; body: unknown }

export type DocumentTemplatePlan =
  | { ok: true; template: { name: string; body: string } }
  | { ok: false; error: string }

const FIELD_PATTERN = /\{\{\s*([^{}]*?)\s*\}\}/g

const FIELD_KEYS: ReadonlySet<string> = new Set(DOCUMENT_FIELDS.map((field) => field.key))

/** Valida e normaliza um modelo. Campo desconhecido ({{cpf}}) é recusado, com o nome dele. */
export function planDocumentTemplate(draft: DocumentTemplateDraft): DocumentTemplatePlan {
  const name = cleanLine(draft.name)
  if (!name) return { ok: false, error: 'Dê um nome ao modelo' }
  if (name.length > DOCUMENT_LIMITS.name) {
    return { ok: false, error: `O nome do modelo tem até ${DOCUMENT_LIMITS.name} caracteres` }
  }

  const body = cleanText(draft.body)
  if (!body) return { ok: false, error: 'Escreva o texto do documento' }
  if (body.length > DOCUMENT_LIMITS.body) {
    return { ok: false, error: `O texto do documento tem até ${DOCUMENT_LIMITS.body.toLocaleString('pt-BR')} caracteres` }
  }

  for (const match of body.matchAll(FIELD_PATTERN)) {
    const key = match[1].toLowerCase()
    if (!FIELD_KEYS.has(key)) {
      const known = DOCUMENT_FIELDS.map((field) => `{{${field.key}}}`).join(', ')
      return { ok: false, error: `O campo ${match[0]} não existe. Os campos são: ${known}` }
    }
  }

  return { ok: true, template: { name, body } }
}

export type RenderedDocumentPlan = { ok: true; title: string; body: string } | { ok: false; error: string }

/**
 * O retrato: o texto do modelo com os campos preenchidos. O valor de um campo
 * entra como texto puro e NÃO é lido de novo — um cliente chamado "{{salao}}"
 * fica escrito assim.
 */
export function renderDocument(
  template: { name: string; body: string },
  values: Record<DocumentFieldKey, string>
): RenderedDocumentPlan {
  const body = template.body.replace(FIELD_PATTERN, (whole, raw: string) => {
    const key = raw.toLowerCase()
    return FIELD_KEYS.has(key) ? cleanLine(values[key as DocumentFieldKey]) : whole
  })

  if (body.length > DOCUMENT_LIMITS.renderedBody) {
    return { ok: false, error: 'O documento ficou longo demais com os campos preenchidos. Encurte o modelo' }
  }
  return { ok: true, title: template.name, body }
}

/** O que entra no SHA-256 do documento: título e texto, sempre do mesmo jeito. */
export function documentHashInput(title: string, body: string): string {
  return `${title}\n\n${body}`
}

/** Até quando o link aceita assinatura. */
export function documentExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + DOCUMENT_LIMITS.linkDays * 24 * 60 * 60 * 1000)
}

export function documentStatus(row: { signedAt: Date | null; expiresAt: Date }, now: Date): DocumentStatus {
  if (row.signedAt) return 'signed'
  return row.expiresAt.getTime() <= now.getTime() ? 'expired' : 'pending'
}

/** Token com cara de token: evita mandar ao banco qualquer coisa que venha na URL. */
export function isDocumentToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(token)
}

const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/

/** "iVBORw0KGgo" = os 8 bytes de assinatura de um PNG, em base64. */
const PNG_MAGIC = 'iVBORw0KGgo'

export type DocumentSignaturePlan =
  | { ok: true; signerName: string; signatureImage: string }
  | { ok: false; error: string }

/**
 * Valida a assinatura que chega do formulário público.
 *
 * A imagem só entra se for um data URL de PNG, do tamanho esperado: é ela que vai
 * para um `<img src>` na tela do salão, então nada de SVG, de outro esquema ou de
 * texto solto.
 */
export function planDocumentSignature(input: {
  status: DocumentStatus
  signerName: unknown
  signatureImage: unknown
  accepted: unknown
}): DocumentSignaturePlan {
  if (input.status === 'signed') return { ok: false, error: 'Este documento já foi assinado' }
  if (input.status === 'expired') {
    return { ok: false, error: 'Este link venceu. Peça um novo link ao salão' }
  }

  if (input.accepted !== true) return { ok: false, error: 'Marque que você leu e concorda com o documento' }

  const signerName = cleanLine(input.signerName)
  const { min, max } = DOCUMENT_LIMITS.signerName
  if (signerName.length < min) return { ok: false, error: 'Escreva o seu nome completo' }
  if (signerName.length > max) return { ok: false, error: `O nome tem até ${max} caracteres` }

  const image = typeof input.signatureImage === 'string' ? input.signatureImage : ''
  const size = DOCUMENT_LIMITS.signatureImage
  if (image.length < size.min) return { ok: false, error: 'Desenhe a sua assinatura' }
  if (image.length > size.max) return { ok: false, error: 'A assinatura ficou grande demais. Limpe e assine de novo' }

  const match = PNG_DATA_URL.exec(image)
  if (!match || !match[1].startsWith(PNG_MAGIC)) return { ok: false, error: 'Assinatura inválida. Limpe e assine de novo' }

  return { ok: true, signerName, signatureImage: image }
}
