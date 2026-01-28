/**
 * Handlers para Google Calendar Tools
 *
 * Export barrel para todos os handlers
 */

// Base Handler
export { BaseGoogleCalendarHandler } from "./BaseGoogleCalendarHandler"
export type { HandlerResult, HandlerContext } from "./BaseGoogleCalendarHandler"

// Validation utilities
export {
  isValidIsoDateTime,
  isValidIsoDateOrDateTime,
  hasTimezoneInDatetime,
} from "./BaseGoogleCalendarHandler"

// Check Availability Handler
export { CheckAvailabilityHandler } from "./CheckAvailabilityHandler"
export type {
  CheckAvailabilityInput,
  CheckAvailabilityOutput,
} from "./CheckAvailabilityHandler"

// Create Appointment Handler
export { CreateAppointmentHandler } from "./CreateAppointmentHandler"
export type {
  CreateAppointmentInput,
  CreateAppointmentOutput,
} from "./CreateAppointmentHandler"

// Update Appointment Handler
export { UpdateAppointmentHandler } from "./UpdateAppointmentHandler"
export type {
  UpdateAppointmentInput,
  UpdateAppointmentOutput,
} from "./UpdateAppointmentHandler"

// Delete Appointment Handler
export { DeleteAppointmentHandler } from "./DeleteAppointmentHandler"
export type {
  DeleteAppointmentInput,
  DeleteAppointmentOutput,
} from "./DeleteAppointmentHandler"
