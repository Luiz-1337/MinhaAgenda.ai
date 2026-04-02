import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { DeleteAppointmentUseCase } from "../../../../src/application/use-cases/appointment/DeleteAppointmentUseCase"
import { Appointment } from "../../../../src/domain/entities/Appointment"
import {
  mockAppointmentRepo,
  mockProfessionalRepo,
  mockIntegrationSyncService,
} from "../../../helpers/repository.mock"
import { IDS } from "../../../helpers/fixtures"
import { Professional } from "../../../../src/domain/entities/Professional"

function makeFutureAppointment(overrides: Partial<Parameters<typeof Appointment.create>[0]> = {}) {
  return Appointment.create({
    id: IDS.appointmentId,
    salonId: IDS.salonId,
    customerId: IDS.customerId,
    professionalId: IDS.professionalId,
    serviceId: IDS.serviceId,
    startsAt: new Date("2026-06-15T14:00:00Z"),
    endsAt: new Date("2026-06-15T15:00:00Z"),
    status: "pending",
    ...overrides,
  })
}

describe("DeleteAppointmentUseCase", () => {
  let appointmentRepo: ReturnType<typeof mockAppointmentRepo>
  let professionalRepo: ReturnType<typeof mockProfessionalRepo>
  let integrationSync: ReturnType<typeof mockIntegrationSyncService>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"))

    appointmentRepo = mockAppointmentRepo()
    professionalRepo = mockProfessionalRepo()
    integrationSync = mockIntegrationSyncService()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("cancela agendamento com sucesso (soft delete)", async () => {
    const appointment = makeFutureAppointment()
    appointmentRepo.findById.mockResolvedValue(appointment)

    const useCase = new DeleteAppointmentUseCase(
      appointmentRepo as any,
      professionalRepo as any
    )

    const result = await useCase.execute(IDS.appointmentId)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.appointmentId).toBe(IDS.appointmentId)
      expect(result.data.message).toContain("cancelado")
    }
    expect(appointmentRepo.save).toHaveBeenCalled()
    expect(appointment.status).toBe("cancelled")
  })

  it("retorna erro quando agendamento não encontrado", async () => {
    appointmentRepo.findById.mockResolvedValue(null)

    const useCase = new DeleteAppointmentUseCase(
      appointmentRepo as any,
      professionalRepo as any
    )

    const result = await useCase.execute("inexistente")

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("APPOINTMENT_NOT_FOUND")
    }
  })

  it("retorna erro quando agendamento é passado", async () => {
    const pastAppointment = Appointment.create({
      id: IDS.appointmentId,
      salonId: IDS.salonId,
      customerId: IDS.customerId,
      professionalId: IDS.professionalId,
      serviceId: IDS.serviceId,
      startsAt: new Date("2026-05-01T14:00:00Z"),
      endsAt: new Date("2026-05-01T15:00:00Z"),
      status: "pending",
    })
    appointmentRepo.findById.mockResolvedValue(pastAppointment)

    const useCase = new DeleteAppointmentUseCase(
      appointmentRepo as any,
      professionalRepo as any
    )

    const result = await useCase.execute(IDS.appointmentId)

    expect(result.success).toBe(false)
  })

  it("sincroniza cancelamento com integrações quando disponível", async () => {
    const appointment = makeFutureAppointment({
      googleEventId: "g-event-1",
      trinksEventId: "t-event-1",
    })
    appointmentRepo.findById.mockResolvedValue(appointment)
    professionalRepo.findById.mockResolvedValue(
      Professional.create({
        id: IDS.professionalId,
        salonId: IDS.salonId,
        name: "João",
        isActive: true,
        services: [],
        googleCalendarId: "cal-id",
      })
    )

    const useCase = new DeleteAppointmentUseCase(
      appointmentRepo as any,
      professionalRepo as any,
      integrationSync as any
    )

    const result = await useCase.execute(IDS.appointmentId)

    expect(result.success).toBe(true)
    expect(integrationSync.syncDelete).toHaveBeenCalled()
    // Deve limpar event IDs e salvar novamente
    expect(appointmentRepo.save).toHaveBeenCalledTimes(2) // 1 cancel + 1 clear IDs
  })

  it("não reverte DB quando integração falha", async () => {
    const appointment = makeFutureAppointment({ googleEventId: "g-1" })
    appointmentRepo.findById.mockResolvedValue(appointment)
    professionalRepo.findById.mockResolvedValue(
      Professional.create({
        id: IDS.professionalId,
        salonId: IDS.salonId,
        name: "João",
        isActive: true,
        services: [],
      })
    )
    integrationSync.syncDelete.mockRejectedValue(new Error("Integration error"))

    const useCase = new DeleteAppointmentUseCase(
      appointmentRepo as any,
      professionalRepo as any,
      integrationSync as any
    )

    const result = await useCase.execute(IDS.appointmentId)

    // Sucesso no DB mesmo com erro de integração
    expect(result.success).toBe(true)
    expect(appointment.status).toBe("cancelled")
  })

  it("funciona sem integrationSyncService (opcional)", async () => {
    appointmentRepo.findById.mockResolvedValue(makeFutureAppointment())

    const useCase = new DeleteAppointmentUseCase(
      appointmentRepo as any,
      professionalRepo as any
      // sem integrationSync
    )

    const result = await useCase.execute(IDS.appointmentId)

    expect(result.success).toBe(true)
    expect(integrationSync.syncDelete).not.toHaveBeenCalled()
  })
})
