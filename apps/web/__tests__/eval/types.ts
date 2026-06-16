/**
 * Types for the golden-conversation eval suite.
 *
 * A conversation is a list of turns. Each turn sends a user message to
 * generateAIResponse and asserts both the text and the tool calls.
 */

import type { GenerateResponseResult } from "@/lib/services/ai/generate-response.service"
import type { ResponsesRunnerStep } from "@/lib/services/ai/openai-responses-runner.service"

export interface ToolCallExpectation {
  /** Tool names that MUST be called at some point in this turn's steps. */
  required?: string[]
  /** Tool names that MUST NOT be called in this turn's steps. */
  forbidden?: string[]
  /** Per-tool inspection of input arguments. */
  args?: Record<
    string,
    {
      mustHaveKeys?: string[]
      mustNotHaveKeys?: string[]
      /** Regex per arg key, e.g. { date: /^2026-/ }. Only checked if key exists. */
      matches?: Record<string, RegExp>
    }
  >
}

export interface TextExpectation {
  /** Max sentences (split by ., !, ?). */
  maxSentences?: number
  /** Max total characters. */
  maxChars?: number
  /** Response must NOT match any of these patterns. */
  mustNotMatch?: RegExp[]
  /** Response MUST match at least one of these patterns. */
  mustMatchAny?: RegExp[]
  /** Response MUST match ALL of these patterns. */
  mustMatchAll?: RegExp[]
}

export interface TurnExpectation {
  tools?: ToolCallExpectation
  text?: TextExpectation
  /**
   * Custom predicate. Return null on pass, or a string describing the failure.
   * Used for cross-cutting checks the simpler builders can't express.
   */
  custom?: (
    result: GenerateResponseResult,
    steps: ResponsesRunnerStep[]
  ) => string | null
}

export interface ConversationTurn {
  /** Message the simulated customer sends. */
  user: string
  /**
   * Optional: instead of calling the AI for this turn, inject this assistant
   * message verbatim. Use for setting up TOOL_CONTEXT state in memory tests.
   */
  injectAssistant?: string
  expect: TurnExpectation
}

export interface ConversationContext {
  /** Display name for the customer in this conversation, or null for "no name yet". */
  customerName: string | null
  /** Marks the customer as new (affects greeting wording in the prompt). */
  isNewCustomer: boolean
  /**
   * Agendamentos futuros a semear no banco ANTES da conversa, para exercitar
   * remarcar/cancelar. Cada item vira 1 agendamento daqui a `inDays` dias usando
   * o professionalId/serviceId do ambiente de eval. Limpos no cleanup.
   */
  seedAppointments?: { inDays: number }[]
}

export interface Conversation {
  name: string
  description: string
  context: ConversationContext
  turns: ConversationTurn[]
}

export interface TurnResult {
  turnIndex: number
  user: string
  generated: GenerateResponseResult | null
  failures: string[]
  durationMs: number
}

export interface ConversationResult {
  conversation: Conversation
  turnResults: TurnResult[]
  passed: boolean
  durationMs: number
}
