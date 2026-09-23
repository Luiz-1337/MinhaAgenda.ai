/**
 * Mapeamento de modelos de IA (DOMAIN LAYER)
 */

import { AI_MODEL_CONSTANTS } from "../../constants/ai.constants"

/**
 * Mapeia o `agents.model` gravado no banco para o modelo que a OpenAI recebe.
 *
 * Só o modelo atual está no mapa. Qualquer outro valor — inclusive os legados
 * `gpt-5-mini` e `gpt-5.4-mini-2026-03-17`, que ainda estão gravados em agentes
 * de produção — cai no DEFAULT_MODEL. Assim a troca de modelo vale para todos os
 * salões sem depender de migrar a coluna.
 */
export class ModelMapper {
  private static readonly MODEL_MAP: Record<string, string> = {
    "gpt-6-sol": "gpt-6-sol",
  }

  /**
   * Mapeia um nome de modelo para um nome válido do OpenAI SDK
   */
  static mapToOpenAI(model: string | null | undefined): string {
    return (model && this.MODEL_MAP[model]) || AI_MODEL_CONSTANTS.DEFAULT_MODEL
  }
}

// Export function for backward compatibility
export function mapModelToOpenAI(model: string | null | undefined): string {
  return ModelMapper.mapToOpenAI(model)
}
