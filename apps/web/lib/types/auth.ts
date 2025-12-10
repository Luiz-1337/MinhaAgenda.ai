/**
 * Tipos relacionados à autenticação
 */

export interface LoginCredentials {
  email: string
  password: string
}

export interface SignupData {
  full_name: string
  email: string
  password: string
}

export interface AuthError {
  message: string
  status?: number
}

