import { vi } from "vitest"
import type { IAppointmentRepository } from "../../src/domain/repositories/IAppointmentRepository"
import type { IAvailabilityRepository } from "../../src/domain/repositories/IAvailabilityRepository"
import type { ICustomerRepository } from "../../src/domain/repositories/ICustomerRepository"
import type { IProfessionalRepository } from "../../src/domain/repositories/IProfessionalRepository"
import type { IServiceRepository } from "../../src/domain/repositories/IServiceRepository"
import type { ISalonRepository } from "../../src/domain/repositories/ISalonRepository"
import type { ICalendarService } from "../../src/application/ports/ICalendarService"
import type { IExternalScheduler } from "../../src/application/ports/IExternalScheduler"
import type { IntegrationSyncService } from "../../src/application/services/IntegrationSyncService"

export function mockAppointmentRepo(): Record<keyof IAppointmentRepository, ReturnType<typeof vi.fn>> {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByCustomer: vi.fn().mockResolvedValue([]),
    findByProfessionalAndDate: vi.fn().mockResolvedValue([]),
    findUpcoming: vi.fn().mockResolvedValue([]),
    findUpcomingByPhone: vi.fn().mockResolvedValue([]),
    findConflicting: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }
}

export function mockAvailabilityRepo(): Record<keyof IAvailabilityRepository, ReturnType<typeof vi.fn>> {
  return {
    findByProfessional: vi.fn().mockResolvedValue([]),
    findByProfessionalAndDay: vi.fn().mockResolvedValue([]),
    findOverrides: vi.fn().mockResolvedValue([]),
    findOverridesByProfessional: vi.fn().mockResolvedValue([]),
    generateSlots: vi.fn().mockResolvedValue([]),
    saveRule: vi.fn().mockResolvedValue(undefined),
    deleteRule: vi.fn().mockResolvedValue(undefined),
    saveOverride: vi.fn().mockResolvedValue(undefined),
    deleteOverride: vi.fn().mockResolvedValue(undefined),
  }
}

export function mockCustomerRepo(): Record<keyof ICustomerRepository, ReturnType<typeof vi.fn>> {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByPhone: vi.fn().mockResolvedValue(null),
    findBySalon: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }
}

export function mockProfessionalRepo(): Record<keyof IProfessionalRepository, ReturnType<typeof vi.fn>> {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByName: vi.fn().mockResolvedValue(null),
    findBySalon: vi.fn().mockResolvedValue([]),
    findAvailable: vi.fn().mockResolvedValue([]),
    findByService: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  }
}

export function mockServiceRepo(): Record<keyof IServiceRepository, ReturnType<typeof vi.fn>> {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findBySalon: vi.fn().mockResolvedValue([]),
    findActive: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  }
}

export function mockSalonRepo(): Record<keyof ISalonRepository, ReturnType<typeof vi.fn>> {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    findByOwner: vi.fn().mockResolvedValue(null),
    getIntegrations: vi.fn().mockResolvedValue([]),
    hasIntegration: vi.fn().mockResolvedValue(false),
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  }
}

export function mockCalendarService(): Record<keyof ICalendarService, ReturnType<typeof vi.fn>> {
  return {
    getEvents: vi.fn().mockResolvedValue([]),
    getFreeBusy: vi.fn().mockResolvedValue([]),
    createEvent: vi.fn().mockResolvedValue("event-id"),
    updateEvent: vi.fn().mockResolvedValue(undefined),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    isConfigured: vi.fn().mockResolvedValue(false),
  }
}

export function mockExternalScheduler(): Record<keyof IExternalScheduler, ReturnType<typeof vi.fn>> {
  return {
    checkAvailability: vi.fn().mockResolvedValue([]),
    getBusySlots: vi.fn().mockResolvedValue([]),
    createBooking: vi.fn().mockResolvedValue("booking-id"),
    updateBooking: vi.fn().mockResolvedValue(undefined),
    cancelBooking: vi.fn().mockResolvedValue(undefined),
    isConfigured: vi.fn().mockResolvedValue(false),
  }
}

export function mockIntegrationSyncService(): { syncDelete: ReturnType<typeof vi.fn>; syncCreate: ReturnType<typeof vi.fn>; syncUpdate: ReturnType<typeof vi.fn> } {
  return {
    syncDelete: vi.fn().mockResolvedValue({ success: true, errors: [] }),
    syncCreate: vi.fn().mockResolvedValue({ success: true, errors: [] }),
    syncUpdate: vi.fn().mockResolvedValue({ success: true, errors: [] }),
  }
}
