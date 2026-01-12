/**
 * Branded type for Appointment ID
 * Prevents accidental mixing of different ID types
 */
export type AppointmentId = string & { readonly __brand: 'AppointmentId' }

export function createAppointmentId(id: string): AppointmentId {
  return id as AppointmentId
}
