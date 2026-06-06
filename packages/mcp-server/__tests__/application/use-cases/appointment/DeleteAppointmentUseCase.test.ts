import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { DeleteAppointmentUseCase } from "../../../../src/application/use-cases/appointment/DeleteAppointmentUseCase"
import { Appointment } from "../../../../src/domain/entities/Appointment"
import { domainServices } from "@repo/db"
import { mockAppointmentRepo } from "../../../helpers/repository.mock"
import { IDS } from "../../../helpers/fixtures"

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
  let useCase: DeleteAppointmentUseCase
  let appointmentRepo: ReturnType<typeof mockAppointmentRepo>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"))

    appointmentRepo = mockAppointmentRepo()
    useCase = new DeleteAppointmentUseCase(appointmentRepo as any)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("cancela agendamento com hard delete via @repo/db", async () => {
    appointmentRepo.findById.mockResolvedValue(makeFutureAppointment())
    ;(domainServices.deleteAppointmentService as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: undefined,
    })

    const result = await useCase.execute(IDS.appointmentId, IDS.salonId)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.appointmentId).toBe(IDS.appointmentId)
      expect(result.data.message).toContain("cancelado")
    }
    // Delega ao serviço centralizado (hard delete), sem soft delete local,
    // propagando o salonId do contexto para isolamento multi-tenant.
    expect(domainServices.deleteAppointmentService).toHaveBeenCalledWith({
      appointmentId: IDS.appointmentId,
      salonId: IDS.salonId,
    })
    expect(appointmentRepo.save).not.toHaveBeenCalled()
  })

  it("retorna erro quando agendamento não encontrado", async () => {
    appointmentRepo.findById.mockResolvedValue(null)

    const result = await useCase.execute("inexistente", IDS.salonId)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("APPOINTMENT_NOT_FOUND")
    }
    expect(domainServices.deleteAppointmentService).not.toHaveBeenCalled()
  })

  it("bloqueia cancelamento cross-salon (C1)", async () => {
    const OTHER_SALON = "99999999-9999-4999-8999-999999999999"
    appointmentRepo.findById.mockResolvedValue(
      makeFutureAppointment({ salonId: OTHER_SALON })
    )

    const result = await useCase.execute(IDS.appointmentId, IDS.salonId)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("APPOINTMENT_NOT_FOUND")
    }
    expect(domainServices.deleteAppointmentService).not.toHaveBeenCalled()
  })

  it("bloqueia cancelamento de agendamento passado", async () => {
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

    const result = await useCase.execute(IDS.appointmentId, IDS.salonId)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("PAST_APPOINTMENT")
    }
    expect(domainServices.deleteAppointmentService).not.toHaveBeenCalled()
  })

  it("retorna erro quando deleteAppointmentService falha", async () => {
    appointmentRepo.findById.mockResolvedValue(makeFutureAppointment())
    ;(domainServices.deleteAppointmentService as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "Agendamento não encontrado",
    })

    const result = await useCase.execute(IDS.appointmentId, IDS.salonId)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("APPOINTMENT_NOT_FOUND")
    }
  })
})
