/**
 * Serviço para tratamento e formatação de erros
 */

import type { AuthError } from "@/lib/types/auth"

/**
 * Formata erro do Supabase Auth para mensagem legível
 */
export function formatAuthError(error: { message: string; status?: number }): string {
  const statusSuffix = error.status ? ` (status ${error.status})` : ""
  return `${error.message}${statusSuffix}`
}

/**
 * Extrai mensagem de erro de qualquer tipo de erro
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  return "Erro desconhecido"
}

