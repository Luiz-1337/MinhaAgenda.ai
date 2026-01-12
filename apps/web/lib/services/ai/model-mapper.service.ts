/**
 * Mapeamento de modelos de IA (DOMAIN LAYER)
 */

import { AI_MODEL_CONSTANTS } from "@/lib/constants/ai.constants"

/**
 * Mapeia nomes de modelos do agente para nomes válidos do OpenAI SDK
 * Modelos GPT-5 ainda não existem, então mapeamos para modelos disponíveis
 */
export class ModelMapper {
  private static readonly MODEL_MAP: Record<string, string> = {
    "gpt-5.2": "gpt-4o",
    "gpt-5.1": "gpt-4o",
    "gpt-5-mini": "gpt-4o-mini",
    "gpt-5-nano": "gpt-4o-mini",
    "gpt-4.1": "gpt-4o",
    "gpt-4o-mini": "gpt-4o-mini",
  }

  /**
   * Mapeia um nome de modelo para um nome válido do OpenAI SDK
   */
  static mapToOpenAI(model: string): string {
    return this.MODEL_MAP[model] || AI_MODEL_CONSTANTS.DEFAULT_MODEL
  }
}

// Export function for backward compatibility
export function mapModelToOpenAI(model: string): string {
  return ModelMapper.mapToOpenAI(model)
}
