import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formata créditos em K (milhares)
 * Exemplos:
 * - 10.000.000 → "10.000K"
 * - 9.900.000 → "9.900K"
 * - 1.000.000 → "1.000K"
 * - 500.000 → "500K"
 */
export function formatCreditsInK(credits: number): string {
  const creditsInK = credits / 1000
  // Formata com separador de milhar e mantém 1 casa decimal se necessário
  if (creditsInK >= 1000) {
    return `${creditsInK.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}K`
  }
  // Para valores menores que 1000K, mostra 1 casa decimal se necessário
  return `${creditsInK.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 })}K`
}
