/**
 * Runner OBSERVACIONAL do replay. Espelha a sequência da eval (saveMessage(user)
 * → generateAIResponse → saveMessage(assistant)) reaproveitando o módulo de seed
 * da eval (customer+chat fresco por episódio + cleanup), mas SEM asserções e SEM
 * parar no primeiro erro — registra tudo para inspeção.
 *
 * Contrato crítico (getChatHistory): só retorna mensagens com createdAt >= início
 * do dia (America/Sao_Paulo). As mensagens são persistidas com timestamp AGORA
 * (datas históricas vivem só no texto, via date-shifter). Rode os episódios
 * sequencialmente e evite atravessar a meia-noite de Brasília.
 */

import { generateAIResponse } from "@/lib/services/ai/generate-response.service"
import { saveMessage } from "@/lib/services/chat.service"
import type { EvalEnv } from "../../eval/runner/env"
import {
  cleanupConversationContext,
  prepareConversationContext,
} from "../../eval/runner/seed"
import type {
  EpisodeReplayResult,
  ExchangeObservation,
  ReplayEpisode,
  ResponsesRunnerStep,
  ToolCallRecord,
} from "../types"

const DEFAULT_AI_TURN_TIMEOUT_MS = 90_000

export interface RunEpisodeOptions {
  aiTurnTimeoutMs?: number
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

function jsonClone(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return String(value)
  }
}

function errorMessageOf(result: { error?: unknown }, toolOutput: unknown): string | undefined {
  const err = result.error
  if (typeof err === "string" && err) return err
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message?: unknown }).message ?? "tool error")
  }
  if (toolOutput && typeof toolOutput === "object") {
    const o = toolOutput as Record<string, unknown>
    if (o.error === true) return String(o.message ?? o.details ?? "tool error")
  }
  return "tool error"
}

/**
 * Achata steps → ToolCallRecord[], alinhando toolCalls e toolResults por índice.
 * Replica a precedência de erro de generate-response.service (extractToolErrors).
 */
export function collectToolCalls(steps: ResponsesRunnerStep[]): ToolCallRecord[] {
  const records: ToolCallRecord[] = []
  for (const step of steps ?? []) {
    const calls = step.toolCalls ?? []
    const results = step.toolResults ?? []
    const n = Math.max(calls.length, results.length)
    for (let i = 0; i < n; i++) {
      const call = calls[i]
      const result = results[i]
      const toolOutput =
        result && typeof result === "object" && "result" in result
          ? (result as { result?: unknown }).result ?? result
          : result
      const isError = Boolean(
        result &&
          ((result as { error?: unknown }).error ||
            (result as { isError?: unknown }).isError ||
            (toolOutput &&
              typeof toolOutput === "object" &&
              "error" in toolOutput &&
              (toolOutput as { error?: unknown }).error === true))
      )
      records.push({
        name: call?.toolName ?? result?.toolName ?? "(desconhecida)",
        input: call?.input ?? null,
        result: jsonClone(toolOutput),
        isError,
        errorMessage: isError ? errorMessageOf(result ?? {}, toolOutput) : undefined,
      })
    }
  }
  return records
}

export async function runEpisode(
  episode: ReplayEpisode,
  env: EvalEnv,
  options?: RunEpisodeOptions
): Promise<EpisodeReplayResult> {
  const timeout = options?.aiTurnTimeoutMs ?? DEFAULT_AI_TURN_TIMEOUT_MS
  const start = Date.now()
  const clientPhone = episode.context.clientPhone ?? env.clientPhone

  const seed = await prepareConversationContext(
    { ...env, clientPhone },
    episode.context.customerName
  )

  const observations: ExchangeObservation[] = []
  try {
    for (let i = 0; i < episode.exchanges.length; i++) {
      const exchange = episode.exchanges[i]!
      const turnStart = Date.now()

      await saveMessage(seed.chatId, "user", exchange.clientText)

      try {
        const gen = await withTimeout(
          generateAIResponse({
            chatId: seed.chatId,
            salonId: env.salonId,
            clientPhone,
            userMessage: exchange.clientText,
            customerId: seed.customerId,
            customerName: episode.context.customerName ?? undefined,
            isNewCustomer: episode.context.isNewCustomer,
          }),
          timeout,
          `episódio ${episode.id} troca ${i + 1}`
        )

        await saveMessage(seed.chatId, "assistant", gen.text, {
          toolSummary: gen.toolSummary,
          inputTokens: gen.usage.inputTokens,
          outputTokens: gen.usage.outputTokens,
          totalTokens: gen.usage.totalTokens,
          model: gen.model,
        })

        observations.push({
          index: i,
          clientText: exchange.clientText,
          humanReference: exchange.humanReference,
          botText: gen.text,
          toolCalls: collectToolCalls(gen.steps),
          anyToolErrors: gen.hasToolErrors,
          usage: gen.usage,
          model: gen.model,
          durationMs: Date.now() - turnStart,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // NÃO para no erro: persiste placeholder para manter o fio e segue.
        await saveMessage(seed.chatId, "assistant", "[erro do bot — sem resposta]")
        observations.push({
          index: i,
          clientText: exchange.clientText,
          humanReference: exchange.humanReference,
          botText: null,
          toolCalls: [],
          anyToolErrors: false,
          usage: null,
          model: null,
          durationMs: Date.now() - turnStart,
          error: message,
        })
      }
    }
  } finally {
    await cleanupConversationContext(seed)
  }

  const totals = observations.reduce(
    (acc, o) => {
      acc.exchanges += 1
      if (o.anyToolErrors) acc.toolErrorExchanges += 1
      acc.inputTokens += o.usage?.inputTokens ?? 0
      acc.outputTokens += o.usage?.outputTokens ?? 0
      acc.totalTokens += o.usage?.totalTokens ?? 0
      return acc
    },
    { exchanges: 0, toolErrorExchanges: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  )

  return {
    episode,
    observations,
    durationMs: Date.now() - start,
    totals,
  }
}
