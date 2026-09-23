/**
 * Utilitários para cálculo de créditos com pesos por modelo de IA
 */

/**
 * Tabela de pesos por modelo. Chaves em lowercase (getModelWeight normaliza
 * a entrada). Exportada para credits-sql.ts reproduzir o cálculo em SQL.
 */
export const MODEL_WEIGHTS: Record<string, number> = {
  // Modelo atual. Mesmo peso do mini de propósito: trocar de modelo não muda o
  // quanto o salão gasta por token. O gpt-6-sol custa ~2,2-2,7x mais na OpenAI
  // (US$ 2 / 10 por 1M, contra 0,75 / 4,5 do mini) e, por decisão do dono em
  // 23/09/2026, a plataforma absorve essa diferença por enquanto.
  "gpt-6-sol": 0.5,
  // Legado: fica para o recálculo do stats-sync pesar o histórico como foi cobrado.
  "gpt-5.4-mini-2026-03-17": 0.5,
} as const

/**
 * Retorna o peso do modelo especificado
 * @param model Nome do modelo (ex: "gpt-5.4-mini-2026-03-17")
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

