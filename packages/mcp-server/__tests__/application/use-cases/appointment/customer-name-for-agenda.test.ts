/**
 * Com agenda oficial ativa, a IA não agenda nem remarca cliente cujo nome não
 * tem nenhuma letra: pede o nome antes.
 *
 * Em 03/nov/2026 um cliente "💤" (profileName do WhatsApp) não conseguiu
 * agendar: a Belasis recusou o cadastro (422 "Nome possui carácter inválido").
 * Cadastrar como "Cliente WhatsApp" evita o erro, mas enche a agenda da recepção
 * de nomes iguais, e lá o nome não se corrige depois.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { domainServices } from "@repo/db"
import { CreateAppointmentUseCase } from "../../../../src/application/use-cases/appointment/CreateAppointmentUseCase"
import { UpdateAppointmentUseCase } from "../../../../src/application/use-cases/appointment/UpdateAppointmentUseCase"
import { hasLetter } from "../../../../src/application/use-cases/appointment/agenda-customer-name.service"
import { UpdateCustomerUseCase } from "../../../../src/application/use-cases/customer/UpdateCustomerUseCase"
import { Appointment } from "../../../../src/domain/entities/Appointment"
import { Customer } from "../../../../src/domain/entities/Customer"
import { Professional } from "../../../../src/domain/entities/Professional"
import { Service } from "../../../../src/domain/entities/Service"
import type {
  IAppointmentRepository,
  ICustomerRepository,
  IProfessionalRepository,
  IServiceRepository,
} from "../../../../src/domain/repositories"
import { AI_GUIDED_ERROR_CODES, ErrorPresenter } from "../../../../src/presentation/presenters/ErrorPresenter"
import {
  mockAppointmentRepo,
  mockCustomerRepo,
  mockProfessionalRepo,
  mockServiceRepo,
} from "../../../helpers/repository.mock"
import { IDS } from "../../../helpers/fixtures"

const hasActiveAgenda = vi.mocked(domainServices.hasActiveAgendaProvider)
const createService = vi.mocked(domainServices.createAppointmentService)
const updateService = vi.mocked(domainServices.updateAppointmentService)

/** O cliente "no banco": o repositório falso lê e grava aqui, como o de verdade. */
let storedCustomer: Customer

function customerNamed(name: string) {
  return Customer.create({ id: IDS.customerId, salonId: IDS.salonId, phone: "5511986049295", name })
}

let createUseCase: CreateAppointmentUseCase
let updateUseCase: UpdateAppointmentUseCase
let updateCustomerUseCase: UpdateCustomerUseCase

beforeEach(() => {
  const appointmentRepo = mockAppointmentRepo()
  const customerRepo = mockCustomerRepo()
  const professionalRepo = mockProfessionalRepo()
  const serviceRepo = mockServiceRepo()

  storedCustomer = customerNamed("💤")
  customerRepo.findById.mockImplementation(async () => storedCustomer)
  customerRepo.update.mockImplementation(async (customer: Customer) => {
    storedCustomer = customer
  })
  professionalRepo.findById.mockResolvedValue(
    Professional.create({ id: IDS.professionalId, salonId: IDS.salonId, name: "João", isActive: true, services: [IDS.serviceId] })
  )
  serviceRepo.findById.mockResolvedValue(
    Service.create({ id: IDS.serviceId, salonId: IDS.salonId, name: "Corte", duration: 60, price: 50, isActive: true })
  )
  appointmentRepo.findById.mockResolvedValue(
    Appointment.create({
      id: IDS.appointmentId,
      salonId: IDS.salonId,
      customerId: IDS.customerId,
      professionalId: IDS.professionalId,
      serviceId: IDS.serviceId,
      startsAt: new Date("2099-06-15T14:00:00Z"),
      endsAt: new Date("2099-06-15T15:00:00Z"),
      status: "pending",
    })
  )

  hasActiveAgenda.mockResolvedValue(true)
  createService.mockResolvedValue({ success: true, data: { appointmentId: IDS.appointmentId } })
  updateService.mockResolvedValue({ success: true, data: { appointmentId: IDS.appointmentId } })

  createUseCase = new CreateAppointmentUseCase(
    customerRepo as unknown as ICustomerRepository,
    professionalRepo as unknown as IProfessionalRepository,
    serviceRepo as unknown as IServiceRepository
  )
  updateUseCase = new UpdateAppointmentUseCase(
    appointmentRepo as unknown as IAppointmentRepository,
    customerRepo as unknown as ICustomerRepository,
    professionalRepo as unknown as IProfessionalRepository,
    serviceRepo as unknown as IServiceRepository
  )
  updateCustomerUseCase = new UpdateCustomerUseCase(customerRepo as unknown as ICustomerRepository)
})

const createInput = {
  salonId: IDS.salonId,
  customerId: IDS.customerId,
  professionalId: IDS.professionalId,
  serviceId: IDS.serviceId,
  startsAt: "2099-06-15T14:00:00-03:00",
}

const rescheduleInput = {
  appointmentId: IDS.appointmentId,
  salonId: IDS.salonId,
  startsAt: "2099-06-16T10:00:00-03:00",
}

describe("hasLetter", () => {
  it.each(["Ana", "Ana 💇‍♀️", "José", "Ñandú", "李"])("%s tem letra", (name) => {
    expect(hasLetter(name)).toBe(true)
  })

  it.each(["💤", "(11) 98604-9295", "...", "❤️🔥", "", "123"])("%s não tem letra", (name) => {
    expect(hasLetter(name)).toBe(false)
  })
})

describe("agendar com agenda oficial ativa", () => {
  it.each(["💤", "(11) 98604-9295"])("nome %s → CUSTOMER_NAME_REQUIRED, sem chamar o serviço", async (name) => {
    storedCustomer = customerNamed(name)

    const result = await createUseCase.execute(createInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("CUSTOMER_NAME_REQUIRED")
    }
    expect(createService).not.toHaveBeenCalled()
    expect(hasActiveAgenda).toHaveBeenCalledWith(IDS.salonId)
  })

  it("a IA recebe o pedido do nome com o customerId, sem pedir data e horário de novo", async () => {
    const result = await createUseCase.execute(createInput)
    if (result.success) throw new Error("esperava falha")

    const json = ErrorPresenter.toJSON(result.error)
    expect(json).toMatchObject({ error: true, code: "CUSTOMER_NAME_REQUIRED" })
    expect(json.message).toContain("Nada foi agendado")
    expect(json.message).toContain("pergunte o nome do cliente")
    expect(json.message).toContain(`updateCustomerName (customerId: ${IDS.customerId})`)
    expect(json.message).toContain("Não peça data nem horário de novo")
    // O texto pronto do apps/web não pode trocar a pergunta da IA.
    expect(AI_GUIDED_ERROR_CODES.has("CUSTOMER_NAME_REQUIRED")).toBe(true)
  })

  it("nome com letra e emoji segue, sem nem consultar a agenda", async () => {
    storedCustomer = customerNamed("Ana 💇‍♀️")

    const result = await createUseCase.execute(createInput)

    expect(result.success).toBe(true)
    expect(createService).toHaveBeenCalled()
    expect(hasActiveAgenda).not.toHaveBeenCalled()
  })

  it("updateCustomerName e nova tentativa com os mesmos dados agenda", async () => {
    const first = await createUseCase.execute(createInput)
    expect(first.success).toBe(false)

    const renamed = await updateCustomerUseCase.execute({ customerId: IDS.customerId, name: "Ana" })
    expect(renamed.success).toBe(true)

    const second = await createUseCase.execute(createInput)
    expect(second.success).toBe(true)
    expect(createService).toHaveBeenCalledTimes(1)
    expect(createService).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: IDS.customerId, date: createInput.startsAt })
    )
  })
})

describe("agendar sem agenda oficial", () => {
  it("nome sem letra segue como antes", async () => {
    hasActiveAgenda.mockResolvedValue(false)

    const result = await createUseCase.execute(createInput)

    expect(result.success).toBe(true)
    expect(createService).toHaveBeenCalled()
  })

  it("se não der para saber da agenda, segue (o serviço trava sozinho se precisar)", async () => {
    hasActiveAgenda.mockRejectedValue(new Error("duas agendas oficiais ativas"))

    const result = await createUseCase.execute(createInput)

    expect(result.success).toBe(true)
    expect(createService).toHaveBeenCalled()
  })
})

describe("remarcar", () => {
  it("nome sem letra + agenda ativa + horário novo → CUSTOMER_NAME_REQUIRED, sem chamar o serviço", async () => {
    const result = await updateUseCase.execute(rescheduleInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("CUSTOMER_NAME_REQUIRED")
      expect(result.error.message).toContain("Nada foi alterado")
      expect(result.error.message).toContain("tente remarcar de novo")
    }
    expect(updateService).not.toHaveBeenCalled()
  })

  it("trocar só a observação não vai para a agenda oficial e segue", async () => {
    const result = await updateUseCase.execute({ appointmentId: IDS.appointmentId, salonId: IDS.salonId, notes: "sem máquina" })

    expect(result.success).toBe(true)
    expect(updateService).toHaveBeenCalled()
    expect(hasActiveAgenda).not.toHaveBeenCalled()
  })

  it("sem agenda oficial segue", async () => {
    hasActiveAgenda.mockResolvedValue(false)

    const result = await updateUseCase.execute(rescheduleInput)

    expect(result.success).toBe(true)
    expect(updateService).toHaveBeenCalled()
  })

  it("updateCustomerName e nova tentativa remarca", async () => {
    expect((await updateUseCase.execute(rescheduleInput)).success).toBe(false)

    await updateCustomerUseCase.execute({ customerId: IDS.customerId, name: "Ana" })

    expect((await updateUseCase.execute(rescheduleInput)).success).toBe(true)
    expect(updateService).toHaveBeenCalledTimes(1)
  })
})
