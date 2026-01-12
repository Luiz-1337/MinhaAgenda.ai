/**
 * Event formatting helpers for Google Calendar
 */

/**
 * Formats event title: "[Profissional] Serviço - Cliente"
 */
export function formatEventTitle(
  professionalName: string,
  serviceName: string,
  clientName: string
): string {
  const prof = professionalName || 'Profissional'
  const service = serviceName || 'Serviço'
  const client = clientName || 'Cliente'
  return `[${prof}] ${service} - ${client}`
}

/**
 * Formats event description with service and client info
 */
export function formatEventDescription(
  serviceName: string,
  clientName: string,
  notes?: string | null
): string {
  let description = `Serviço: ${serviceName}\n`
  description += `Cliente: ${clientName}\n`
  if (notes) {
    description += `\nObservações: ${notes}`
  }
  return description
}

/**
 * Builds event reminders configuration
 */
export function buildEventReminders(): Array<{ method: 'email' | 'popup'; minutes: number }> {
  return [
    { method: 'email', minutes: 24 * 60 }, // 1 day before
    { method: 'popup', minutes: 30 }, // 30 minutes before
  ]
}
