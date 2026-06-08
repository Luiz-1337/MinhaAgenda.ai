/**
 * Tipos do harness de REPLAY (simulação de conversas reais).
 *
 * Diferente da suíte de eval (que é pass/fail com asserções), o replay é
 * OBSERVACIONAL: alimenta o bot com as mensagens reais do cliente, captura o que
 * o bot responderia, e compara com o que a secretária humana de fato respondeu
 * (humanReference). Um juiz IA opcional pontua cada troca.
 */

import type { ConversationContext } from "../eval/types"
import type { GenerateResponseResult } from "@/lib/services/ai/generate-response.service"
import type { ResponsesRunnerStep } from "@/lib/services/ai/openai-responses-runner.service"

// ---------------------------------------------------------------------------
// Parser → Episódios
// ---------------------------------------------------------------------------

/** Um par cliente→humano extraído do transcript real. */
export interface ReplayExchange {
  /** O que o cliente realmente enviou (dispara o turno do bot). */
  clientText: string
  /** O que a secretária humana respondeu. Referência (gabarito de INTENÇÃO). */
  humanReference: string
  /** Timestamp do primeiro turno do cliente (pós date-shift). */
  startedAt: Date
}

/** Estende o contexto da eval com metadados só do replay. */
export interface ReplayEpisodeContext extends ConversationContext {
  /** Sobrescreve o clientPhone do env por episódio (segurança multi-tenant). */
  clientPhone?: string
}

/** Uma conversa de agendamento contígua e autossuficiente. */
export interface ReplayEpisode {
  /** Slug estável; usado no nome do arquivo de relatório. */
  id: string
  /** Rótulo legível, ex: "alina #1 — corte sábado". */
  title: string
  /** Origem (arquivo / faixa de linhas) para rastreabilidade. */
  source: string
  /** Nome do contato cliente no transcript. */
  clientName: string
  /** Início do episódio (primeiro turno do cliente, pós date-shift). */
  startedAt: Date
  context: ReplayEpisodeContext
  exchanges: ReplayExchange[]
}

export interface ParseStats {
  rawLines: number
  messages: number
  dropped: number
  turns: number
  episodes: number
}

export interface ParseResult {
  source: string
  clientName: string
  episodes: ReplayEpisode[]
  stats: ParseStats
}

// ---------------------------------------------------------------------------
// Runner → Observações
// ---------------------------------------------------------------------------

export interface ToolCallRecord {
  name: string
  input: unknown
  /** Payload retornado pela tool (result.result ?? result), clonado para JSON. */
  result: unknown
  isError: boolean
  /** Mensagem de erro quando isError. */
  errorMessage?: string
}

export interface ExchangeObservation {
  index: number
  clientText: string
  humanReference: string
  /** null se generateAIResponse lançou erro. */
  botText: string | null
  toolCalls: ToolCallRecord[]
  anyToolErrors: boolean
  usage: GenerateResponseResult["usage"] | null
  model: string | null
  durationMs: number
  /** Setado se a geração lançou (timeout / erro). */
  error?: string
  /** Preenchido pelo juiz (opcional). */
  verdict?: ExchangeVerdict
}

export interface EpisodeReplayResult {
  episode: ReplayEpisode
  observations: ExchangeObservation[]
  durationMs: number
  totals: {
    exchanges: number
    toolErrorExchanges: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

// ---------------------------------------------------------------------------
// Juiz IA → Veredito
// ---------------------------------------------------------------------------

export interface ExchangeVerdict {
  /** Geral: o bot se comportou de forma aceitável nesta troca? */
  behaviorOk: boolean
  /** Chamou as tools certas, na ordem certa, para este turno? */
  calledRightTools: boolean
  /** Inventou preço/horário/serviço/profissional que não veio de tool? */
  hallucinatedPriceOrSlot: boolean
  /** O bot atingiu o mesmo objetivo conversacional do humano? */
  matchedHumanIntent: "yes" | "partial" | "no"
  toneOk: boolean
  /** ≤1 pergunta, ≤2 frases, sem "vou verificar/um momento". */
  oneQuestionRule: boolean
  /** Justificativa curta (1-2 frases), em português. */
  notes: string
  /** Setado quando a própria chamada do juiz falhou. */
  judgeError?: string
}

/** Resumo do salão fornecido ao juiz para aferir invenção de preço/serviço. */
export interface SalonSummary {
  salonName: string
  agentName: string
  tone: string
  professionalCount: number
  services: Array<{ name: string; price: string; durationMin: number }>
}

export type { ResponsesRunnerStep }
