import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Converte valor de créditos do banco para exibição (divide por 10.000).
 * O banco mantém o valor original; use esta função apenas na camada de exibição.
 */
export function creditsForDisplay(credits: number): number {
  return credits / 10_000
}

/**
 * Formata créditos para exibição (valor já dividido por 10.000).
 * Ex: 50.000 no banco → "5" | 5.500 → "0,6"
 */
export function formatCreditsForDisplay(credits: number): string {
  return creditsForDisplay(credits).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })
}

/**
 * Formata créditos em K — valor exibido já dividido por 10.000.
 * Exemplos (valor no banco → exibição):
 * - 10.000.000 → "1.000K"
 * - 500.000 → "50K"
 * - 55.000 → "5,5K"
 */
export function formatCreditsInK(credits: number): string {
  const val = creditsForDisplay(credits)
  if (val >= 1000) {
    return `${val.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}K`
  }
  return `${val.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 })}K`
}
