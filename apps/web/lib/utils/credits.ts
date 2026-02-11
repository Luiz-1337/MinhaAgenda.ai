/**
 * Utilitários para cálculo de créditos com pesos por modelo de IA
 */

/**
 * Tabela de pesos por modelo
 * gpt-5-mini é a base (peso 1.0)
 */
const MODEL_WEIGHTS: Record<string, number> = {
  "gpt-5-mini": 0.5,
} as const

/**
 * Retorna o peso do modelo especificado
 * @param model Nome do modelo (ex: "gpt-5-mini")
 * @returns Peso do modelo (padrão: 1.0 se não encontrado)
 */
export function getModelWeight(model: string | null | undefined): number {
  if (!model) {
    return 1.0
  }

  // Normaliza o nome do modelo (remove espaços, converte para lowercase)
  const normalizedModel = model.trim().toLowerCase()

  return MODEL_WEIGHTS[normalizedModel] ?? 1.0
}

/**
 * Calcula créditos aplicando o peso do modelo aos tokens brutos
 * @param tokens Número de tokens brutos
 * @param model Nome do modelo de IA
 * @returns Créditos calculados (tokens * peso do modelo)
 */
export function calculateCredits(tokens: number, model: string | null | undefined): number {
  if (!tokens || tokens <= 0) {
    return 0
  }

  const weight = getModelWeight(model)
  const credits = tokens * weight

  // Arredonda para o inteiro mais próximo
  return Math.round(credits)
}

