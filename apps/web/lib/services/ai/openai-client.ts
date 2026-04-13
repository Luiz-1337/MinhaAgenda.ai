import OpenAI from "openai"

let openaiClient: OpenAI | null = null

// Timeout explicito para chamadas OpenAI (chat completions / responses / embeddings).
// SDK default sobe para ~10min em alguns endpoints; isso pode travar o worker.
const OPENAI_REQUEST_TIMEOUT_MS = 60_000
// Limita retries automaticos do SDK (default = 2). Cada retry pode somar 60s.
const OPENAI_MAX_RETRIES = 1

export function getOpenAIClient(): OpenAI {
  if (openaiClient) {
    return openaiClient
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required")
  }

  openaiClient = new OpenAI({
    apiKey,
    timeout: OPENAI_REQUEST_TIMEOUT_MS,
    maxRetries: OPENAI_MAX_RETRIES,
  })
  return openaiClient
}

