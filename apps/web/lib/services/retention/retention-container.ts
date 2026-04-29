/**
 * Bootstraps the mcp-server DI container for retention use cases consumed
 * outside of the marketing dispatcher (e.g., the WhatsApp worker).
 *
 * The AI runner is registered too — even though the worker's hot path
 * (opt-out detection) does not need LLM calls, registering it here keeps
 * resolution consistent across processes if any retention use case is
 * resolved later.
 *
 * Idempotent — safe to call from multiple modules during cold start.
 */

import {
  container,
  registerProviders,
  registerAiResponsesRunner,
  TOKENS,
  RecordCustomerOptOutUseCase,
  FlagSuspectedOptOutUseCase,
} from '@repo/mcp-server'
import { OpenAiResponsesRunnerAdapter } from '../ai/openai-responses-runner.adapter'

let bootstrapped = false

export function ensureRetentionContainer(): void {
  if (bootstrapped) return
  if (!container.has(TOKENS.AppointmentRepository)) {
    registerProviders(container)
  }
  if (!container.has(TOKENS.AiResponsesRunner)) {
    registerAiResponsesRunner(container, new OpenAiResponsesRunnerAdapter())
  }
  bootstrapped = true
}

export function getRecordCustomerOptOutUseCase(): RecordCustomerOptOutUseCase {
  ensureRetentionContainer()
  return container.resolve<RecordCustomerOptOutUseCase>(TOKENS.RecordCustomerOptOutUseCase)
}

export function getFlagSuspectedOptOutUseCase(): FlagSuspectedOptOutUseCase {
  ensureRetentionContainer()
  return container.resolve<FlagSuspectedOptOutUseCase>(TOKENS.FlagSuspectedOptOutUseCase)
}
