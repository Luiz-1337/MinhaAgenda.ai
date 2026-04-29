/**
 * Domain port for an LLM runner that:
 * - Accepts a system prompt, user prompt and a JSON output contract
 * - Returns parsed JSON with token usage metadata
 * - Is implemented in infrastructure (e.g., apps/web adapter wrapping OpenAI)
 *
 * Keeping this interface in the domain layer means use cases never
 * import the OpenAI SDK directly.
 */

export interface AiRunRequest {
  model: string
  systemPrompt: string
  userPrompt: string
  /** Maximum output tokens. */
  maxTokens?: number
  /** Temperature override (defaults to model default). */
  temperature?: number
  /** Caller identifier — used in logs for tracing. */
  callerLabel: string
}

export interface AiRunResult<TOutput> {
  output: TOutput
  modelUsed: string
  tokensUsed: number
  inputTokens: number
  outputTokens: number
  rawText: string
}

export interface IAiResponsesRunner {
  /**
   * Runs the model with structured JSON output validation.
   * The validator throws on invalid output; caller wraps with Result.fail.
   */
  runJson<TOutput>(
    request: AiRunRequest,
    validator: (raw: unknown) => TOutput
  ): Promise<AiRunResult<TOutput>>
}
