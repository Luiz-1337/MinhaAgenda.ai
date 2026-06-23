/**
 * Tipos públicos do domínio de agendamentos consumidos pela UI do scheduler.
 *
 * Mora aqui (e não em "@/app/actions/appointments") de propósito: aquele arquivo
 * é "use server". No Next 16 / Turbopack um módulo "use server" só pode exportar
 * async functions — re-exportar tipos dele gera, no proxy de server action durante
 * o SSR, um "ReferenceError: AppointmentDTO is not defined".
 */
import type { AppointmentDTO, ProfessionalDTO } from "@/lib/repositories/appointment.repository"

export type { AppointmentDTO, ProfessionalDTO }

/** Alias histórico usado pelos componentes do scheduler. */
export type ProfessionalInfo = ProfessionalDTO

/** Um agendamento exibido na agenda (mesma forma de AppointmentDTO). */
export type DailyAppointment = AppointmentDTO
