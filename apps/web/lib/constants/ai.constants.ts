/**
 * Constantes relacionadas à IA e RAG
 */

export const RAG_CONSTANTS = {
  SIMILARITY_THRESHOLD: 0.7,
  DEFAULT_CONTEXT_LIMIT: 3,
} as const

/**
 * O modelo do bot é da PLATAFORMA, não do salão: o bot (worker), o chat de teste
 * e o formulário de agentes leem daqui. Trocar de modelo = mudar esta linha e dar
 * o peso dele em MODEL_WEIGHTS (lib/utils/credits.ts) — sem peso, o salão passa a
 * ser cobrado em 1,0 por token.
 */
export const AI_MODEL_CONSTANTS = {
  DEFAULT_MODEL: "gpt-6-sol",
  DEFAULT_FULL_MODEL: "gpt-6-sol",
} as const

export const SALON_CONSTANTS = {
  DEFAULT_SALON_NAME: "nosso salão",
} as const
