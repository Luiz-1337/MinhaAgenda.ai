/**
 * Adapter implementing the domain port `IAiResponsesRunner` for the
 * mcp-server use cases. Wraps the OpenAI SDK Chat Completions API with:
 *  - JSON-mode response_format
 *  - external validator (zod parser passed by caller)
 *  - structured logging with caller label and token usage
 *
 * Use cases in mcp-server import only the IAiResponsesRunner interface,
 * never the OpenAI SDK directly.
 */

import { getOpenAIClient } from './openai-client'
import { logger } from '@repo/db'
import type {
  IAiResponsesRunner,
  AiRunRequest,
  AiRunResult,
} from '@repo/mcp-server'

export class OpenAiResponsesRunnerAdapter implements IAiResponsesRunner {
  async runJson<TOutput>(
    request: AiRunRequest,
    validator: (raw: unknown) => TOutput
  ): Promise<AiRunResult<TOutput>> {
    const client = getOpenAIClient()
    const startedAt = Date.now()

    const completion = await client.chat.completions.create({
      model: request.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 200,
    })

    const choice = completion.choices?.[0]
    const rawText = choice?.message?.content ?? ''
    if (!rawText) {
      throw new Error('OpenAI returned empty content')
    }

    let parsedRaw: unknown
    try {
      parsedRaw = JSON.parse(rawText)
    } catch (err) {
      throw new Error(`OpenAI output not valid JSON: ${rawText.slice(0, 200)}`)
    }

    const validated = validator(parsedRaw)

    const usage = completion.usage
    const inputTokens = usage?.prompt_tokens ?? 0
    const outputTokens = usage?.completion_tokens ?? 0
    const tokensUsed = usage?.total_tokens ?? inputTokens + outputTokens
    const modelUsed = completion.model || request.model

    logger.info('AI runner completed', {
      caller: request.callerLabel,
      model: modelUsed,
      inputTokens,
      outputTokens,
      tokensUsed,
      latencyMs: Date.now() - startedAt,
    })

    return {
      output: validated,
      modelUsed,
      tokensUsed,
      inputTokens,
      outputTokens,
      rawText,
    }
  }
}
