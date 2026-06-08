/**
 * Juiz IA (LLM-as-judge). Chamada ÚNICA e estruturada (sem tools) à Responses
 * API, por troca. Avalia a resposta do bot contra a rubrica (regras do bot) e a
 * referência humana. Uma falha do juiz nunca aborta o run.
 */

import { getOpenAIClient } from "@/lib/services/ai/openai-client"
import type {
  EpisodeReplayResult,
  ExchangeObservation,
  ExchangeVerdict,
  SalonSummary,
  ToolCallRecord,
} from "../types"
import { JUDGE_INSTRUCTIONS, VERDICT_JSON_SCHEMA } from "./rubric"
import { renderSalonSummary } from "./salon-summary"

const JUDGE_MODEL = process.env.REPLAY_JUDGE_MODEL || "gpt-5.4-mini-2026-03-17"

function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/.test(model)
}

export interface JudgeInput {
  salonSummary: SalonSummary
  conversationSoFar: Array<{ role: "client" | "bot"; text: string }>
  clientText: string
  humanReference: string
  botText: string
  toolCalls: ToolCallRecord[]
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n) + "…"
}

function renderToolCalls(calls: ToolCallRecord[]): string {
  if (calls.length === 0) return "(nenhuma tool chamada)"
  return calls
    .map((c) => {
      const input = truncate(JSON.stringify(c.input ?? null), 200)
      if (c.isError) return `${c.name}(${input}) -> ERRO: ${c.errorMessage ?? "erro"}`
      return `${c.name}(${input}) -> ${truncate(JSON.stringify(c.result ?? null), 300)}`
    })
    .join("\n")
}

function buildInput(input: JudgeInput): string {
  const history =
    input.conversationSoFar.length === 0
      ? "(início da conversa)"
      : input.conversationSoFar
          .map((t) => `${t.role === "client" ? "CLIENTE" : "BOT"}: ${truncate(t.text, 200)}`)
          .join("\n")

  return [
    `### SALÃO\n${renderSalonSummary(input.salonSummary)}`,
    `### CONVERSA ATÉ AQUI\n${history}`,
    `### MENSAGEM DO CLIENTE\n${input.clientText}`,
    `### RESPOSTA DO BOT\n${input.botText}`,
    `### TOOLS CHAMADAS PELO BOT\n${renderToolCalls(input.toolCalls)}`,
    `### REFERÊNCIA HUMANA (secretária)\n${input.humanReference || "(sem referência humana nesta troca)"}`,
  ].join("\n\n")
}

function neutralVerdict(judgeError: string): ExchangeVerdict {
  return {
    behaviorOk: true,
    calledRightTools: true,
    hallucinatedPriceOrSlot: false,
    matchedHumanIntent: "partial",
    toneOk: true,
    oneQuestionRule: true,
    notes: "(juiz indisponível)",
    judgeError,
  }
}

export async function judgeExchange(input: JudgeInput): Promise<ExchangeVerdict> {
  try {
    const client = getOpenAIClient()
    const params: Record<string, unknown> = {
      model: JUDGE_MODEL,
      instructions: JUDGE_INSTRUCTIONS,
      input: buildInput(input),
      text: {
        format: {
          type: "json_schema",
          name: "exchange_verdict",
          schema: VERDICT_JSON_SCHEMA,
          strict: true,
        },
      },
    }
    if (isReasoningModel(JUDGE_MODEL)) {
      params.reasoning = { effort: "low" }
    } else {
      params.temperature = 0
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await client.responses.create(params as any)
    const raw: string = response.output_text ?? ""
    if (!raw.trim()) return neutralVerdict("juiz retornou texto vazio")

    const parsed = JSON.parse(raw) as Omit<ExchangeVerdict, "judgeError">
    return parsed
  } catch (err) {
    return neutralVerdict(err instanceof Error ? err.message : String(err))
  }
}

/** Julga cada troca de um resultado, mutando observation.verdict. Sequencial. */
export async function judgeEpisode(
  result: EpisodeReplayResult,
  salonSummary: SalonSummary
): Promise<void> {
  const conversationSoFar: Array<{ role: "client" | "bot"; text: string }> = []

  for (const obs of result.observations) {
    if (obs.botText === null) {
      obs.verdict = {
        behaviorOk: false,
        calledRightTools: false,
        hallucinatedPriceOrSlot: false,
        matchedHumanIntent: "no",
        toneOk: false,
        oneQuestionRule: false,
        notes: "Bot não gerou resposta (erro de execução).",
      }
      conversationSoFar.push({ role: "client", text: obs.clientText })
      continue
    }

    obs.verdict = await judgeExchange({
      salonSummary,
      conversationSoFar: conversationSoFar.slice(-8),
      clientText: obs.clientText,
      humanReference: obs.humanReference,
      botText: obs.botText,
      toolCalls: obs.toolCalls,
    })

    conversationSoFar.push({ role: "client", text: obs.clientText })
    conversationSoFar.push({ role: "bot", text: obs.botText })
  }
}
