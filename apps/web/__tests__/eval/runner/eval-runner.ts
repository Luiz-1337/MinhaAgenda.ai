/**
 * Eval runner. Executes a conversation turn-by-turn against the real
 * generateAIResponse, persists user/assistant messages between turns so
 * getChatHistory works realistically, and applies the configured assertions.
 */

import { generateAIResponse } from "@/lib/services/ai/generate-response.service"
import { saveMessage } from "@/lib/services/chat.service"
import type {
  Conversation,
  ConversationResult,
  ConversationTurn,
  TurnResult,
} from "../types"
import { loadEvalEnv } from "./env"
import {
  cleanupConversationContext,
  prepareConversationContext,
  type EvalSeed,
} from "./seed"
import { checkText, checkTools, runCustomAssertion } from "./assertions"

const AI_TURN_TIMEOUT_MS = 90_000

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`))
    }, ms)
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

async function runTurn(
  turn: ConversationTurn,
  turnIndex: number,
  seed: EvalSeed,
  context: Conversation["context"]
): Promise<TurnResult> {
  const start = Date.now()
  const failures: string[] = []

  // Persist user message first (so the history reflects what the AI is replying to).
  await saveMessage(seed.chatId, "user", turn.user)

  // Inject path: skip AI for this turn (used to set up tool-context state).
  if (turn.injectAssistant) {
    await saveMessage(seed.chatId, "assistant", turn.injectAssistant)
    return {
      turnIndex,
      user: turn.user,
      generated: null,
      failures: [],
      durationMs: Date.now() - start,
    }
  }

  let generated
  try {
    generated = await withTimeout(
      generateAIResponse({
        chatId: seed.chatId,
        salonId: seed.env.salonId,
        clientPhone: seed.env.clientPhone,
        userMessage: turn.user,
        customerId: seed.customerId,
        customerName: context.customerName ?? undefined,
        isNewCustomer: context.isNewCustomer,
      }),
      AI_TURN_TIMEOUT_MS,
      `turn ${turnIndex + 1} generateAIResponse`
    )
  } catch (err) {
    failures.push(
      `generateAIResponse threw: ${err instanceof Error ? err.message : String(err)}`
    )
    return {
      turnIndex,
      user: turn.user,
      generated: null,
      failures,
      durationMs: Date.now() - start,
    }
  }

  // Persist assistant message + tool summary so subsequent turns see the
  // same TOOL_CONTEXT the worker would have written.
  await saveMessage(seed.chatId, "assistant", generated.text, {
    toolSummary: generated.toolSummary,
    inputTokens: generated.usage.inputTokens,
    outputTokens: generated.usage.outputTokens,
    totalTokens: generated.usage.totalTokens,
    model: generated.model,
  })

  // Assertions
  if (turn.expect.text) {
    failures.push(...checkText(generated.text, turn.expect.text))
  }
  if (turn.expect.tools) {
    failures.push(...checkTools(generated.steps, turn.expect.tools))
  }
  if (turn.expect.custom) {
    failures.push(...runCustomAssertion(generated, generated.steps, turn.expect.custom))
  }

  return {
    turnIndex,
    user: turn.user,
    generated,
    failures,
    durationMs: Date.now() - start,
  }
}

export async function runConversation(
  conversation: Conversation
): Promise<ConversationResult> {
  const env = loadEvalEnv()
  const start = Date.now()
  const seed = await prepareConversationContext(
    env,
    conversation.context.customerName,
    conversation.context.seedAppointments
  )

  const turnResults: TurnResult[] = []
  try {
    for (let i = 0; i < conversation.turns.length; i++) {
      const turn = conversation.turns[i]!
      const result = await runTurn(turn, i, seed, conversation.context)
      turnResults.push(result)
      // Stop on first turn that crashes (no point checking subsequent turns
      // when the conversation thread is broken). Assertion failures DO NOT
      // stop the run — we want full visibility.
      if (result.generated === null && turn.injectAssistant === undefined) {
        break
      }
    }
  } finally {
    await cleanupConversationContext(seed)
  }

  const passed = turnResults.every((t) => t.failures.length === 0)
  return {
    conversation,
    turnResults,
    passed,
    durationMs: Date.now() - start,
  }
}

/**
 * Pretty-prints a turn result. Called by the test wrapper on failure for
 * a useful console error.
 */
export function formatTurnFailure(
  conversation: Conversation,
  turn: TurnResult
): string {
  const header = `[${conversation.name}] turn ${turn.turnIndex + 1} — user: "${turn.user}"`
  const responseLine = turn.generated
    ? `  assistant: "${turn.generated.text.replace(/\n/g, " ")}"`
    : `  assistant: <no response>`
  const failureLines = turn.failures.map((f) => `  ✗ ${f}`).join("\n")
  const toolLine = turn.generated
    ? `  tools called: [${turn.generated.steps
        .flatMap((s) => s.toolCalls.map((c) => c.toolName))
        .join(", ") || "none"}]`
    : ""
  return [header, responseLine, toolLine, failureLines].filter(Boolean).join("\n")
}
