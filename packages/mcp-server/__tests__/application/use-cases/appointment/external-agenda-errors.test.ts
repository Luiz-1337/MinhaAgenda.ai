/**
 * Erros da agenda OFICIAL do salão (ex.: Belasis) chegando à IA.
 *
 * Em 03/nov/2026 (Spettacolo Salone, teste pelo WhatsApp) a agenda oficial não
 * carregou: o serviço devolveu EXTERNAL_AGENDA_UNAVAILABLE, mas o use case de
 * criar transformava qualquer falha em APPOINTMENT_CREATION_FAILED, e a tool
 * devolveu "Não foi possível criar o agendamento. Verifique os dados e tente
 * novamente." A IA então pediu de novo data e horário, que estavam certos.
 *
 * Estes testes vão do retorno do serviço (@repo/db) até o JSON que a tool
 * entrega à IA (ErrorPresenter.toJSON), na criação e na remarcação.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { domainServices } from "@repo/db"
import { CreateAppointmentUseCase } from "../../../../src/application/use-cases/appointment/CreateAppointmentUseCase"
import { UpdateAppointmentUseCase } from "../../../../src/application/use-cases/appointment/UpdateAppointmentUseCase"
import { mapExternalAgendaError } from "../../../../src/application/use-cases/appointment/appointment-error.mapper"
import { Appointment } from "../../../../src/domain/entities/Appointment"
import { Customer } from "../../../../src/domain/entities/Customer"
import { Professional } from "../../../../src/domain/entities/Professional"
import { Service } from "../../../../src/domain/entities/Service"
import type { DomainError } from "../../../../src/domain/errors"
import type {
  IAppointmentRepository,
  ICustomerRepository,
  IProfessionalRepository,
  IServiceRepository,
} from "../../../../src/domain/repositories"
import { ErrorPresenter } from "../../../../src/presentation/presenters/ErrorPresenter"
import {
  mockAppointmentRepo,
  mockCustomerRepo,
  mockProfessionalRepo,
  mockServiceRepo,
} from "../../../helpers/repository.mock"
import { IDS } from "../../../helpers/fixtures"

/** Os textos que o agenda-sync.service.ts devolve hoje (AGENDA_SYNC_MESSAGES). */
const SERVICE_TEXT = {
  EXTERNAL_AGENDA_CONFLICT: "Horário indisponível (já ocupado na agenda do salão)",
  EXTERNAL_AGENDA_UNAVAILABLE: "Não foi possível confirmar na agenda do salão agora. Tente de novo em instantes",
  EXTERNAL_AGENDA_NOT_LINKED:
    "Este profissional ainda não está vinculado à agenda do salão, então não dá para agendar com ele por aqui",
  EXTERNAL_AGENDA_REJECTED: "A agenda do salão recusou este agendamento",
} as const

type AgendaCode = keyof typeof SERVICE_TEXT

const AGENDA_CODES = Object.keys(SERVICE_TEXT) as AgendaCode[]

/** A mensagem genérica que a IA recebia antes, para qualquer falha. */
const GENERIC_CREATION_MESSAGE = "Não foi possível criar o agendamento. Verifique os dados e tente novamente."

const createService = vi.mocked(domainServices.createAppointmentService)
const updateService = vi.mocked(domainServices.updateAppointmentService)

function makeCustomer() {
  return Customer.create({ id: IDS.customerId, salonId: IDS.salonId, phone: "5511999999999", name: "Cliente" })
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
  return Service.create({ id: IDS.serviceId, salonId: IDS.salonId, name: "Corte", duration: 60, price: 50, isActive: true })
}

function makeFutureAppointment() {
  return Appointment.create({
    id: IDS.appointmentId,
    salonId: IDS.salonId,
    customerId: IDS.customerId,
    professionalId: IDS.professionalId,
    serviceId: IDS.serviceId,
    startsAt: new Date("2099-06-15T14:00:00Z"),
    endsAt: new Date("2099-06-15T15:00:00Z"),
    status: "pending",
  })
}

function failWith(code: AgendaCode) {
  return { success: false as const, error: SERVICE_TEXT[code], code }
}

let createUseCase: CreateAppointmentUseCase
let updateUseCase: UpdateAppointmentUseCase

beforeEach(() => {
  const appointmentRepo = mockAppointmentRepo()
  const customerRepo = mockCustomerRepo()
  const professionalRepo = mockProfessionalRepo()
  const serviceRepo = mockServiceRepo()

  appointmentRepo.findById.mockResolvedValue(makeFutureAppointment())
  customerRepo.findById.mockResolvedValue(makeCustomer())
  professionalRepo.findById.mockResolvedValue(makeProfessional())
  serviceRepo.findById.mockResolvedValue(makeService())

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
})

async function createFailingWith(code: AgendaCode): Promise<DomainError> {
  createService.mockResolvedValue(failWith(code))
  const result = await createUseCase.execute({
    salonId: IDS.salonId,
    customerId: IDS.customerId,
    professionalId: IDS.professionalId,
    serviceId: IDS.serviceId,
    startsAt: "2099-06-15T14:00:00-03:00",
  })
  if (result.success) throw new Error("esperava falha")
  return result.error
}

async function rescheduleFailingWith(code: AgendaCode): Promise<DomainError> {
  updateService.mockResolvedValue(failWith(code))
  const result = await updateUseCase.execute({
    appointmentId: IDS.appointmentId,
    salonId: IDS.salonId,
    startsAt: "2099-06-16T10:00:00-03:00",
  })
  if (result.success) throw new Error("esperava falha")
  return result.error
}

describe.each([
  ["criar", createFailingWith],
  ["remarcar", rescheduleFailingWith],
] as const)("agenda oficial ao %s", (_operation, failingWith) => {
  it.each(AGENDA_CODES)("%s vira um erro de domínio com o mesmo código", async (code) => {
    const error = await failingWith(code)

    expect(error.code).toBe(code)
    // O texto do serviço continua no erro (vai em `details` para a IA).
    expect(error.message).toBe(SERVICE_TEXT[code])
    expect(ErrorPresenter.toJSON(error)).toMatchObject({ error: true, code, details: SERVICE_TEXT[code] })
  })

  it("conflito lá é tratado como horário indisponível, com a sugestão de checkAvailability", async () => {
    const message = ErrorPresenter.format(await failingWith("EXTERNAL_AGENDA_CONFLICT"))

    expect(message).toContain("esse horário não está mais disponível")
    expect(message).toContain("checkAvailability")
  })

  it("agenda fora do ar não manda pedir os dados de novo", async () => {
    const message = ErrorPresenter.format(await failingWith("EXTERNAL_AGENDA_UNAVAILABLE"))

    expect(message).toContain("Não consegui confirmar na agenda do salão agora")
    expect(message).toContain("não peça data, horário ou serviço de novo")
    expect(message).not.toBe(GENERIC_CREATION_MESSAGE)
  })

  it("sem vínculo diz que não dá para agendar por aqui e que trocar o horário não resolve", async () => {
    const message = ErrorPresenter.format(await failingWith("EXTERNAL_AGENDA_NOT_LINKED"))

    expect(message).toContain("não pode ser agendado por aqui")
    expect(message).toContain("trocar o horário não resolve")
  })

  it("recusa lá orienta a falar com a equipe do salão", async () => {
    const message = ErrorPresenter.format(await failingWith("EXTERNAL_AGENDA_REJECTED"))

    expect(message).toContain("recusou este agendamento")
    expect(message).toContain("falar com a equipe do salão")
  })

  // O conflito fica de fora: a mensagem é a mesma de "horário indisponível".
  it.each(AGENDA_CODES.filter((code) => code !== "EXTERNAL_AGENDA_CONFLICT"))(
    "%s deixa claro que nada foi agendado nem alterado",
    async (code) => {
      expect(ErrorPresenter.format(await failingWith(code))).toMatch(/nada foi agendado nem alterado/i)
    }
  )
})

describe("falhas que não vêm da agenda oficial", () => {
  it("ao criar, as sem código (dado inválido) continuam como APPOINTMENT_CREATION_FAILED", async () => {
    createService.mockResolvedValue({ success: false, error: "Serviço inválido ou inativo" })

    const result = await createUseCase.execute({
      salonId: IDS.salonId,
      customerId: IDS.customerId,
      professionalId: IDS.professionalId,
      serviceId: IDS.serviceId,
      startsAt: "2099-06-15T14:00:00-03:00",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("APPOINTMENT_CREATION_FAILED")
      expect(result.error.message).toBe("Serviço inválido ou inativo")
    }
  })

  it("mapExternalAgendaError devolve null para códigos que não são da agenda oficial", () => {
    expect(mapExternalAgendaError(undefined, "x")).toBeNull()
    expect(mapExternalAgendaError("APPOINTMENT_CONFLICT", "x")).toBeNull()
    expect(mapExternalAgendaError("service_rule_violation", "x")).toBeNull()
  })
})
