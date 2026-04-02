import { describe, it, expect, vi, beforeEach } from "vitest"
import { CreateAppointmentUseCase } from "../../../../src/application/use-cases/appointment/CreateAppointmentUseCase"
import { Customer } from "../../../../src/domain/entities/Customer"
import { Professional } from "../../../../src/domain/entities/Professional"
import { Service } from "../../../../src/domain/entities/Service"
import { domainServices } from "@repo/db"
import {
  mockCustomerRepo,
  mockProfessionalRepo,
  mockServiceRepo,
} from "../../../helpers/repository.mock"
import { IDS } from "../../../helpers/fixtures"

function makeCustomer() {
  return Customer.create({
    id: IDS.customerId,
    salonId: IDS.salonId,
    phone: "5511999999999",
    name: "Cliente Teste",
  })
}

function makeProfessional() {
  return Professional.create({
    id: IDS.professionalId,
    salonId: IDS.salonId,
    name: "João",
    isActive: true,
    services: [IDS.serviceId],
  })
}

function makeService() {
  return Service.create({
    id: IDS.serviceId,
    salonId: IDS.salonId,
    name: "Corte",
    duration: 60,
    price: 50,
    isActive: true,
  })
}

describe("CreateAppointmentUseCase", () => {
  let useCase: CreateAppointmentUseCase
  let customerRepo: ReturnType<typeof mockCustomerRepo>
  let professionalRepo: ReturnType<typeof mockProfessionalRepo>
  let serviceRepo: ReturnType<typeof mockServiceRepo>

  beforeEach(() => {
    customerRepo = mockCustomerRepo()
    professionalRepo = mockProfessionalRepo()
    serviceRepo = mockServiceRepo()

    useCase = new CreateAppointmentUseCase(
      customerRepo as any,
      professionalRepo as any,
      serviceRepo as any
    )
  })

  const baseInput = {
    salonId: IDS.salonId,
    customerId: IDS.customerId,
    professionalId: IDS.professionalId,
    serviceId: IDS.serviceId,
    startsAt: "2026-06-15T14:00:00-03:00",
  }

  it("cria agendamento com sucesso e retorna DTO formatado", async () => {
    customerRepo.findById.mockResolvedValue(makeCustomer())
    professionalRepo.findById.mockResolvedValue(makeProfessional())
    serviceRepo.findById.mockResolvedValue(makeService())
    ;(domainServices.createAppointmentService as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { appointmentId: IDS.appointmentId },
    })

    const result = await useCase.execute(baseInput)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe(IDS.appointmentId)
      expect(result.data.customerName).toBe("Cliente Teste")
      expect(result.data.professionalName).toBe("João")
      expect(result.data.serviceName).toBe("Corte")
      expect(result.data.status).toBe("pending")
      expect(result.data.startsAtISO).toContain("2026-06-15")
    }
  })

  it("busca customer, professional e service em paralelo", async () => {
    customerRepo.findById.mockResolvedValue(makeCustomer())
    professionalRepo.findById.mockResolvedValue(makeProfessional())
    serviceRepo.findById.mockResolvedValue(makeService())
    ;(domainServices.createAppointmentService as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { appointmentId: IDS.appointmentId },
    })

    await useCase.execute(baseInput)

    expect(customerRepo.findById).toHaveBeenCalledWith(IDS.customerId)
    expect(professionalRepo.findById).toHaveBeenCalledWith(IDS.professionalId)
    expect(serviceRepo.findById).toHaveBeenCalledWith(IDS.serviceId)
  })

  it("retorna erro quando cliente não encontrado", async () => {
    customerRepo.findById.mockResolvedValue(null)
    professionalRepo.findById.mockResolvedValue(makeProfessional())
    serviceRepo.findById.mockResolvedValue(makeService())

    const result = await useCase.execute(baseInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("CUSTOMER_NOT_FOUND")
    }
  })

  it("retorna erro quando profissional não encontrado", async () => {
    customerRepo.findById.mockResolvedValue(makeCustomer())
    professionalRepo.findById.mockResolvedValue(null)
    serviceRepo.findById.mockResolvedValue(makeService())

    const result = await useCase.execute(baseInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("APPOINTMENT_CREATION_FAILED")
    }
  })

  it("retorna erro quando serviço não encontrado", async () => {
    customerRepo.findById.mockResolvedValue(makeCustomer())
    professionalRepo.findById.mockResolvedValue(makeProfessional())
    serviceRepo.findById.mockResolvedValue(null)

    const result = await useCase.execute(baseInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("APPOINTMENT_CREATION_FAILED")
    }
  })

  it("retorna erro quando domainServices falha", async () => {
    customerRepo.findById.mockResolvedValue(makeCustomer())
    professionalRepo.findById.mockResolvedValue(makeProfessional())
    serviceRepo.findById.mockResolvedValue(makeService())
    ;(domainServices.createAppointmentService as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "Conflito de horário",
    })

    const result = await useCase.execute(baseInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.message).toContain("Conflito de horário")
    }
  })

  it("calcula endsAt baseado na duração do serviço", async () => {
    customerRepo.findById.mockResolvedValue(makeCustomer())
    professionalRepo.findById.mockResolvedValue(makeProfessional())
    serviceRepo.findById.mockResolvedValue(makeService()) // 60 min
    ;(domainServices.createAppointmentService as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { appointmentId: IDS.appointmentId },
    })

    const result = await useCase.execute(baseInput)

    expect(result.success).toBe(true)
    if (result.success) {
      // startsAt 14:00, service 60min → endsAt 15:00
      const starts = new Date(result.data.startsAtISO)
      const ends = new Date(result.data.endsAtISO)
      const diffMinutes = (ends.getTime() - starts.getTime()) / (60 * 1000)
      expect(diffMinutes).toBe(60)
    }
  })
})
