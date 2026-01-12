/**
 * Branded type for Salon ID
 * Prevents accidental mixing of different ID types
 */
export type SalonId = string & { readonly __brand: 'SalonId' }

export function createSalonId(id: string): SalonId {
  return id as SalonId
}
