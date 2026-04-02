import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { UpdateAppointmentUseCase } from "../../../../src/application/use-cases/appointment/UpdateAppointmentUseCase"
import { Appointment } from "../../../../src/domain/entities/Appointment"
import { Customer } from "../../../../src/domain/entities/Customer"
import { Professional } from "../../../../src/domain/entities/Professional"
import { Service } from "../../../../src/domain/entities/Service"
import { domainServices } from "@repo/db"
import {
  mockAppointmentRepo,
  mockCustomerRepo,
  mockProfessionalRepo,
  mockServiceRepo,
} from "../../../helpers/repository.mock"
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
    notes: "Nota original",
    ...overrides,
  })
}

describe("UpdateAppointmentUseCase", () => {
  let useCase: UpdateAppointmentUseCase
  let appointmentRepo: ReturnType<typeof mockAppointmentRepo>
  let customerRepo: ReturnType<typeof mockCustomerRepo>
  let professionalRepo: ReturnType<typeof mockProfessionalRepo>
  let serviceRepo: ReturnType<typeof mockServiceRepo>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"))

    appointmentRepo = mockAppointmentRepo()
    customerRepo = mockCustomerRepo()
    professionalRepo = mockProfessionalRepo()
    serviceRepo = mockServiceRepo()

    useCase = new UpdateAppointmentUseCase(
      appointmentRepo as any,
      customerRepo as any,
      professionalRepo as any,
      serviceRepo as any
    )
  })

  function setupSuccess() {
    appointmentRepo.findById.mockResolvedValue(makeFutureAppointment())
    customerRepo.findById.mockResolvedValue(
      Customer.create({ id: IDS.customerId, salonId: IDS.salonId, phone: "5511999999999", name: "Cliente" })
    )
    professionalRepo.findById.mockResolvedValue(
      Professional.create({ id: IDS.professionalId, salonId: IDS.salonId, name: "João", isActive: true, services: [IDS.serviceId] })
    )
    serviceRepo.findById.mockResolvedValue(
      Service.create({ id: IDS.serviceId, salonId: IDS.salonId, name: "Corte", duration: 60, price: 50, isActive: true })
    )
    ;(domainServices.updateAppointmentService as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { appointmentId: IDS.appointmentId },
    })
  }

  it("atualiza agendamento com sucesso", async () => {
    setupSuccess()

    const result = await useCase.execute({
      appointmentId: IDS.appointmentId,
      notes: "Nova nota",
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe(IDS.appointmentId)
      expect(result.data.notes).toBe("Nova nota")
    }
  })

  it("retorna erro quando agendamento não encontrado", async () => {
    appointmentRepo.findById.mockResolvedValue(null)

    const result = await useCase.execute({
      appointmentId: "inexistente",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("APPOINTMENT_NOT_FOUND")
    }
  })

  it("retorna erro quando agendamento não pode ser modificado (passado)", async () => {
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

    const result = await useCase.execute({
      appointmentId: IDS.appointmentId,
      notes: "tentar atualizar",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("PAST_APPOINTMENT")
    }
  })

  it("retorna erro quando agendamento está cancelado", async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeFutureAppointment({ status: "cancelled" })
    )

    const result = await useCase.execute({
      appointmentId: IDS.appointmentId,
    })

    expect(result.success).toBe(false)
  })

  it("preserva notas originais quando input.notes é undefined", async () => {
    setupSuccess()

    const result = await useCase.execute({
      appointmentId: IDS.appointmentId,
      // notes não fornecido
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.notes).toBe("Nota original")
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("retorna erro quando domainServices falha", async () => {
    appointmentRepo.findById.mockResolvedValue(makeFutureAppointment())
    customerRepo.findById.mockResolvedValue(
      Customer.create({ id: IDS.customerId, salonId: IDS.salonId, phone: "5511999999999", name: "Cliente" })
    )
    professionalRepo.findById.mockResolvedValue(
      Professional.create({ id: IDS.professionalId, salonId: IDS.salonId, name: "João", isActive: true, services: [] })
    )
    serviceRepo.findById.mockResolvedValue(
      Service.create({ id: IDS.serviceId, salonId: IDS.salonId, name: "Corte", duration: 60, price: 50, isActive: true })
    )
    ;(domainServices.updateAppointmentService as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "Conflito de horário",
    })

    const result = await useCase.execute({
      appointmentId: IDS.appointmentId,
      startsAt: "2026-06-20T10:00:00-03:00",
    })

    expect(result.success).toBe(false)
  })

})
