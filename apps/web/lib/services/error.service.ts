/**
 * Serviço para tratamento e formatação de erros
 */

import type { AuthError } from "@/lib/types/auth"

/**
 * Formata erro do Supabase Auth para mensagem legível em português
 */
export function formatAuthError(error: { message: string; status?: number }): string {
  const errorMessage = error.message.toLowerCase()
  
  // Mapear erros comuns do Supabase Auth para mensagens amigáveis em português
  if (errorMessage.includes('invalid login credentials') || 
      errorMessage.includes('invalid_credentials') ||
      errorMessage.includes('email not found') ||
      errorMessage.includes('wrong password') ||
      errorMessage.includes('incorrect password')) {
    // Por segurança, não revelamos se o email existe ou se a senha está incorreta
    return "Email ou senha incorretos. Verifique suas credenciais e tente novamente."
  }
  
  if (errorMessage.includes('email not confirmed') || 
      errorMessage.includes('email_not_confirmed')) {
    return "Por favor, confirme seu email antes de fazer login. Verifique sua caixa de entrada."
  }
  
  if (errorMessage.includes('too many requests') || 
      errorMessage.includes('rate limit')) {
    return "Muitas tentativas de login. Por favor, aguarde alguns minutos e tente novamente."
  }
  
  if (errorMessage.includes('user not found')) {
    // Por segurança, mesma mensagem genérica
    return "Email ou senha incorretos. Verifique suas credenciais e tente novamente."
  }
  
  if (errorMessage.includes('network') || errorMessage.includes('connection')) {
    return "Erro de conexão. Verifique sua internet e tente novamente."
  }
  
  // Para outros erros, retornar mensagem genérica traduzida
  return "Erro ao fazer login. Por favor, tente novamente."
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

