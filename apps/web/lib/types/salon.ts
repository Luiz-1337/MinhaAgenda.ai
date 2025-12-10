/**
 * Tipos relacionados a salões
 */

export interface SalonOwnerContext {
  salonId: string
  userId: string
}

export interface SalonOwnerError {
  error: "Não autenticado" | "Salão não encontrado"
}

export type SalonOwnerResult = SalonOwnerContext | SalonOwnerError

