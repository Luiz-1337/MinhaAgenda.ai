/**
 * Branded type for Event ID (external system event ID)
 * Prevents accidental mixing of different ID types
 */
export type EventId = string & { readonly __brand: 'EventId' }

export function createEventId(id: string): EventId {
  return id as EventId
}
