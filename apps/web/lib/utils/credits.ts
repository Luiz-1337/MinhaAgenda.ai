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
 * Um token de entrada lido do cache de prompt da OpenAI vale 1/CACHED_TOKEN_DIVISOR
 * de um token normal no crédito — o mesmo desconto que a OpenAI dá no input
 * cacheado (gpt-6-sol: US$ 0,20 contra US$ 2 por 1M). Decisão do dono (23/09/2026):
 * o salão não paga pelo reenvio do system prompt a cada round de tool, que é
 * justamente o que o cache cobre.
 *
 * Divisor inteiro de propósito: a conta é feita em décimos de token, para o JS e o
 * SQL (credits-sql.ts) arredondarem igual, sem ruído de ponto flutuante.
 */
export const CACHED_TOKEN_DIVISOR = 10

/**
 * Calcula créditos aplicando o peso do modelo aos tokens, com os tokens de cache
 * valendo 1/CACHED_TOKEN_DIVISOR
 * @param tokens Total de tokens da resposta (entrada + saída, cache incluído)
 * @param model Nome do modelo de IA
 * @param cachedTokens Quantos dos tokens de entrada vieram do cache (ausente = 0)
 * @returns Créditos calculados
 */
export function calculateCredits(
  tokens: number,
  model: string | null | undefined,
  cachedTokens?: number | null
): number {
  if (!tokens || tokens <= 0) {
    return 0
  }

  // Cache fora de [0, tokens] só pode ser dado corrompido: não pode nem zerar nem
  // inflar a cobrança.
  const rawCached = typeof cachedTokens === "number" && Number.isFinite(cachedTokens) ? cachedTokens : 0
  const cached = Math.min(Math.max(rawCached, 0), tokens)
  const billableTenths = (tokens - cached) * CACHED_TOKEN_DIVISOR + cached
  const weight = getModelWeight(model)

  // Arredonda para o inteiro mais próximo
  return Math.round((billableTenths * weight) / CACHED_TOKEN_DIVISOR)
}

