/**
 * Parser de export de conversa do WhatsApp (.txt) → Episódios → Trocas.
 *
 * O salão é sempre "Cris Ferreira"; o cliente é o outro contato. O parser:
 *  - tokeniza linhas `[dd/mm/aaaa, hh:mm:ss] Remetente: texto` (com continuações multilinha)
 *  - filtra ruído (mídia oculta, avisos de sistema, auto-resposta do salão, etc.)
 *  - colapsa mensagens consecutivas do mesmo lado em um turno (modela o debounce do bot)
 *  - quebra o histórico de meses em "episódios" (sessão de agendamento contígua)
 *  - pareia cada turno do cliente com o turno seguinte do salão (humanReference)
 */

import { readFile } from "node:fs/promises"
import path from "node:path"
import type {
  ParseResult,
  ReplayEpisode,
  ReplayExchange,
} from "../types"

export interface ParserOptions {
  salonSenderName?: string
  /** Novo episódio quando o intervalo desde o turno anterior excede isto (horas). */
  episodeGapHours?: number
  /** Default false: o template de confirmação nunca vira humanReference. */
  keepReminderTemplate?: boolean
}

interface RawMessage {
  timestamp: Date
  sender: string
  text: string
  side: "client" | "salon"
}

interface Turn {
  side: "client" | "salon"
  text: string
  startedAt: Date
}

const DEFAULTS: Required<ParserOptions> = {
  salonSenderName: "Cris Ferreira",
  episodeGapHours: 12,
  keepReminderTemplate: false,
}

// Linha que INICIA uma mensagem: [dd/mm/aaaa, hh:mm(:ss)] Remetente: texto
const MESSAGE_START =
  /^\[(\d{2})\/(\d{2})\/(\d{4}),\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s([^:]+?):\s?(.*)$/

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
}

function norm(s: string): string {
  return stripAccents(s).toLowerCase().trim()
}

/** Padrões de linhas-ruído (sistema/mídia/auto-resposta) — comparados em texto normalizado. */
const NOISE_PATTERNS: RegExp[] = [
  /protegidas com a criptografia/,
  /esta na sua lista de contatos/,
  /nao esta mais na sua lista de contatos/,
  /aguardando mensagem/,
  /imagem ocultada/,
  /imagem omitida/,
  /audio ocultado/,
  /audio omitido/,
  /video omitido/,
  /video ocultado/,
  /figurinha omitida/,
  /gif omitido/,
  /documento omitido/,
  /contato omitido/,
  /^localizacao:/,
  /mensagem apagada/,
  /voce apagou esta mensagem/,
  /esta mensagem foi apagada/,
  /seu codigo de seguranca com .* mudou/,
  // auto-resposta do salão (e todas as duplicatas)
  /agradecemos sua mensagem/,
]

export function isNoiseLine(text: string): boolean {
  const n = norm(text)
  if (!n) return true
  return NOISE_PATTERNS.some((re) => re.test(n))
}

/** Template de confirmação/lembrete (outbound) — fronteira de episódio, nunca referência. */
export function isConfirmationTemplate(text: string): boolean {
  return /passando para confirmar seu atendimento/.test(norm(text))
}

/** Acks triviais isolados (cliente). Episódios só com isto são descartados. */
function isTrivialAck(text: string): boolean {
  const n = norm(text)
  if (n.length > 28) return false
  return /^(ok|obrigad|confirmad|combinad|perfeit|otimo|sim|aguardo|magina|amem|deus abencoe)/.test(
    n
  )
}

function cleanText(raw: string): string {
  // remove o marcador de edição, mantendo o texto
  return raw.replace(/\s*<Mensagem editada>\s*/g, " ").trim()
}

/** Tokeniza o conteúdo em mensagens, tratando continuações multilinha. */
export function tokenize(content: string, opts: Required<ParserOptions>): RawMessage[] {
  const cleaned = content
    .replace(/^﻿/, "") // BOM
    .replace(/\r\n/g, "\n")
    .replace(/[‎‏]/g, "") // LRM/RLM que o WhatsApp prefixa em linhas de mídia/sistema

  const lines = cleaned.split("\n")
  const messages: RawMessage[] = []
  let current: RawMessage | null = null

  for (const line of lines) {
    const m = MESSAGE_START.exec(line)
    if (m) {
      if (current) messages.push(current)
      const [, dd, mm, yyyy, hh, mi, ss, senderRaw, text] = m
      const month = Number(mm)
      if (month > 12) {
        throw new Error(
          `Data com mês > 12 ("${dd}/${mm}/${yyyy}") — provável export iOS/MM-DD. ` +
            `O parser espera Android dd/mm/aaaa. Linha: ${line}`
        )
      }
      const sender = senderRaw!.replace(/^~\s?/, "").trim()
      const timestamp = new Date(
        Number(yyyy),
        month - 1,
        Number(dd),
        Number(hh),
        Number(mi),
        ss ? Number(ss) : 0
      )
      current = {
        timestamp,
        sender,
        text: text ?? "",
        side: sender === opts.salonSenderName ? "salon" : "client",
      }
    } else if (current) {
      // continuação da mensagem anterior
      current.text += "\n" + line
    }
  }
  if (current) messages.push(current)

  return messages
}

function survivingMessageCount(messages: RawMessage[]): number {
  let n = 0
  for (const m of messages) {
    const t = cleanText(m.text)
    if (t && !isNoiseLine(t)) n++
  }
  return n
}

/** Colapsa mensagens consecutivas do mesmo lado em um único turno. */
export function collapseTurns(messages: RawMessage[]): Turn[] {
  const turns: Turn[] = []
  for (const msg of messages) {
    const text = cleanText(msg.text)
    if (!text || isNoiseLine(text)) continue
    const prev = turns[turns.length - 1]
    if (prev && prev.side === msg.side) {
      prev.text += "\n" + text
    } else {
      turns.push({ side: msg.side, text, startedAt: msg.timestamp })
    }
  }
  return turns
}

/** Quebra os turnos em episódios por gap de tempo e pelo template de confirmação. */
export function splitEpisodes(turns: Turn[], opts: Required<ParserOptions>): Turn[][] {
  const gapMs = opts.episodeGapHours * 60 * 60 * 1000
  const episodes: Turn[][] = []
  let current: Turn[] = []

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]!
    const prev = turns[i - 1]
    const bigGap = prev ? turn.startedAt.getTime() - prev.startedAt.getTime() > gapMs : false
    const afterConfirmation = prev ? prev.side === "salon" && isConfirmationTemplate(prev.text) : false

    if (current.length > 0 && (bigGap || afterConfirmation)) {
      episodes.push(current)
      current = []
    }
    current.push(turn)
  }
  if (current.length > 0) episodes.push(current)
  return episodes
}

/** Pareia turnos em trocas {clientTurn → humanReference}. */
export function toExchanges(turns: Turn[], opts: Required<ParserOptions>): ReplayExchange[] {
  const exchanges: ReplayExchange[] = []
  // pula turnos de salão no início (o bot só age sobre input do cliente)
  let i = 0
  while (i < turns.length && turns[i]!.side === "salon") i++

  while (i < turns.length) {
    const turn = turns[i]!
    if (turn.side !== "client") {
      i++
      continue
    }
    // próximo turno do salão = referência humana (ignorando o template de confirmação)
    let humanReference = ""
    const next = turns[i + 1]
    if (next && next.side === "salon") {
      const isReminder = isConfirmationTemplate(next.text)
      if (!isReminder || opts.keepReminderTemplate) {
        humanReference = next.text
      }
    }
    exchanges.push({ clientText: turn.text, humanReference, startedAt: turn.startedAt })
    i++
  }
  return exchanges
}

function slugify(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
}

function inferClientName(messages: RawMessage[], salonSender: string): string {
  const counts = new Map<string, number>()
  for (const m of messages) {
    if (m.sender === salonSender) continue
    counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1)
  }
  let best = "cliente"
  let bestCount = -1
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name
      bestCount = count
    }
  }
  return best
}

export function parseWhatsAppExport(
  content: string,
  source: string,
  options?: ParserOptions
): ParseResult {
  const opts: Required<ParserOptions> = { ...DEFAULTS, ...options }
  const rawLines = content.split(/\r?\n/).length
  const messages = tokenize(content, opts)
  const clientName = inferClientName(messages, opts.salonSenderName)
  const turns = collapseTurns(messages)
  const turnGroups = splitEpisodes(turns, opts)

  const baseSlug = slugify(clientName) || slugify(path.basename(source, path.extname(source)))

  const episodes: ReplayEpisode[] = []
  let epIndex = 0
  for (const group of turnGroups) {
    const exchanges = toExchanges(group, opts)
    if (exchanges.length === 0) continue
    if (exchanges.every((e) => isTrivialAck(e.clientText))) continue

    epIndex++
    const startedAt = exchanges[0]!.startedAt
    const dateLabel = `${String(startedAt.getDate()).padStart(2, "0")}/${String(
      startedAt.getMonth() + 1
    ).padStart(2, "0")}/${startedAt.getFullYear()}`
    episodes.push({
      id: `${baseSlug}-${epIndex}`,
      title: `${clientName} #${epIndex} — ${dateLabel}`,
      source: `${path.basename(source)} (ep ${epIndex})`,
      clientName,
      startedAt,
      context: {
        customerName: clientName,
        isNewCustomer: false,
        clientPhone: undefined,
      },
      exchanges,
    })
  }

  return {
    source,
    clientName,
    episodes,
    stats: {
      rawLines,
      messages: messages.length,
      dropped: messages.length - survivingMessageCount(messages),
      turns: turns.length,
      episodes: episodes.length,
    },
  }
}

export async function readAndParseFile(
  filePath: string,
  options?: ParserOptions
): Promise<ParseResult> {
  const content = await readFile(filePath, "utf8")
  return parseWhatsAppExport(content, filePath, options)
}
