import { APPOINTMENT_STATUS_MAP } from '../../../../domain/constants'

/**
 * Maps internal appointment status to Trinks status format
 */
export function mapStatusToTrinks(status: string): string {
  return APPOINTMENT_STATUS_MAP[status as keyof typeof APPOINTMENT_STATUS_MAP] || 'pendente'
}
