import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Converte valor de créditos do banco para exibição (divide por 100.000).
 * O banco mantém o valor original; use esta função apenas na camada de exibição.
 * Ex: 1.000.000 → 100 | 5.000 → 0,05
 */
export function creditsForDisplay(credits: number): number {
  return credits / 1_000
}

/**
 * Formata créditos para exibição (valor já dividido por 100.000).
 * Ex: 1.000.000 no banco → "100" | 5.000 → "0,1"
 */
export function formatCreditsForDisplay(credits: number): string {
  return creditsForDisplay(credits).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })
}

/**
 * Formata créditos em K — valor exibido já dividido por 100.000.
 * Exemplos (valor no banco → exibição):
 * - 10.000.000 → "100K"
 * - 1.000.000 → "10K"
 * - 50.000 → "0,5K"
 */
export function formatCreditsInK(credits: number): string {
  const val = creditsForDisplay(credits)
  if (val >= 1000) {
    return `${val.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
  }
  return `${val.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 })}`
}
