/**
 * Serviço para gerenciamento de usage/tokens da IA (APPLICATION LAYER)
 */

export interface UsageData {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

interface UsageResult {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  promptTokens?: number
  completionTokens?: number
}

type Usage = UsageResult | Promise<UsageResult> | undefined

export class ChatUsageService {
  /**
   * Extrai dados de usage do resultado do streamText
   */
  static async extractUsageData(usage: Usage): Promise<UsageData | null> {
    if (!usage) {
      return null
    }

    const usageData = await Promise.resolve(usage)
    return {
      inputTokens: usageData.inputTokens ?? usageData.promptTokens ?? undefined,
      outputTokens:
        usageData.outputTokens ?? usageData.completionTokens ?? undefined,
      totalTokens: usageData.totalTokens ?? undefined,
    }
  }
}
