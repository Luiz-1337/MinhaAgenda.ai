/**
 * Types for the golden-conversation eval suite.
 *
 * A conversation is a list of turns. Each turn sends a user message to
 * generateAIResponse and asserts both the text and the tool calls.
 */

import type { GenerateResponseResult } from "@/lib/services/ai/generate-response.service"
import type { ResponsesRunnerStep } from "@/lib/services/ai/openai-responses-runner.service"
import type { AdReferral } from "@/lib/services/messaging/cloud/content"

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
  /**
   * Origem do lead gravada no cliente ANTES da conversa (customers.lead_source).
   * Em produção quem grava é o webhook, a partir do `referral` da Meta; a eval
   * entra depois do webhook, então semeia direto.
   */
  leadSource?: "paid_traffic" | "organic"
  /**
   * Anúncio de origem, entregue ao bot só no PRIMEIRO turno — como o worker faz
   * com a mensagem que carrega o `referral`.
   */
  adReferral?: AdReferral
}

/** O que os ganchos `prepare`/`verify` de uma conversa recebem. */
export interface ConversationRunContext {
  salonId: string
  customerId: string
  chatId: string
  clientPhone: string
}

export interface Conversation {
  name: string
  description: string
  context: ConversationContext
  turns: ConversationTurn[]
  /**
   * Roda depois de o cliente e o chat de teste existirem e antes do primeiro
   * turno. Serve para montar estado externo (ex.: a agenda oficial simulada).
   */
  prepare?: (run: ConversationRunContext) => Promise<void> | void
  /**
   * Roda depois do último turno, antes da limpeza. Devolve as falhas (vazio =
   * passou). Serve para conferir o que ficou gravado fora da conversa.
   */
  verify?: (run: ConversationRunContext) => Promise<string[]> | string[]
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
  /** Falhas do gancho `verify` da conversa (estado conferido no fim). */
  verifyFailures: string[]
  passed: boolean
  durationMs: number
}
