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

  it("cancela agendamento (soft) via @repo/db, registrando origem ai", async () => {
    appointmentRepo.findById.mockResolvedValue(makeFutureAppointment())
    ;(domainServices.cancelAppointmentService as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: undefined,
    })

    const result = await useCase.execute(IDS.appointmentId, IDS.salonId)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.appointmentId).toBe(IDS.appointmentId)
      expect(result.data.message).toContain("cancelado")
    }
    // Delega ao serviço centralizado, propagando o salonId do contexto para
    // isolamento multi-tenant. cancelledBy=null + source='ai' registram que foi o
    // CLIENTE pelo WhatsApp, não alguém do salão — é a distinção que o histórico do
    // CRM precisa fazer ("cancelado pela recepção" vs "o cliente desmarcou").
    expect(domainServices.cancelAppointmentService).toHaveBeenCalledWith({
      appointmentId: IDS.appointmentId,
      salonId: IDS.salonId,
      cancelledBy: null,
      source: "ai",
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
    expect(domainServices.cancelAppointmentService).not.toHaveBeenCalled()
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
    expect(domainServices.cancelAppointmentService).not.toHaveBeenCalled()
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
    expect(domainServices.cancelAppointmentService).not.toHaveBeenCalled()
  })

  it("retorna erro quando deleteAppointmentService falha", async () => {
    appointmentRepo.findById.mockResolvedValue(makeFutureAppointment())
    ;(domainServices.cancelAppointmentService as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "Agendamento não encontrado",
      code: "APPOINTMENT_NOT_FOUND",
    })

    const result = await useCase.execute(IDS.appointmentId, IDS.salonId)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("APPOINTMENT_NOT_FOUND")
    }
  })
})
