/**
 * Recusas do createAppointmentService chegando à IA com o motivo certo.
 *
 * Antes, toda recusa ao criar virava APPOINTMENT_CREATION_FAILED, e a tool
 * devolvia "Não foi possível criar o agendamento. Verifique os dados e tente
 * novamente." — também para horário ocupado, fora do expediente ou já passado.
 * A IA (e o texto pronto do apps/web) pediam então data e horário de novo.
 *
 * Os textos e códigos abaixo são os que o @repo/db devolve hoje.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { domainServices } from "@repo/db"
import { CreateAppointmentUseCase } from "../../../../src/application/use-cases/appointment/CreateAppointmentUseCase"
import { Customer } from "../../../../src/domain/entities/Customer"
import { Professional } from "../../../../src/domain/entities/Professional"
import { Service } from "../../../../src/domain/entities/Service"
import type { DomainError } from "../../../../src/domain/errors"
import type {
  ICustomerRepository,
  IProfessionalRepository,
  IServiceRepository,
} from "../../../../src/domain/repositories"
import { AI_GUIDED_ERROR_CODES, ErrorPresenter } from "../../../../src/presentation/presenters/ErrorPresenter"
import { mockCustomerRepo, mockProfessionalRepo, mockServiceRepo } from "../../../helpers/repository.mock"
import { IDS } from "../../../helpers/fixtures"

const GENERIC_CREATION_MESSAGE = "Não foi possível criar o agendamento. Verifique os dados e tente novamente."

const createService = vi.mocked(domainServices.createAppointmentService)

let useCase: CreateAppointmentUseCase

beforeEach(() => {
  const customerRepo = mockCustomerRepo()
  const professionalRepo = mockProfessionalRepo()
  const serviceRepo = mockServiceRepo()

  customerRepo.findById.mockResolvedValue(
    Customer.create({ id: IDS.customerId, salonId: IDS.salonId, phone: "5511999999999", name: "Cliente" })
  )
  professionalRepo.findById.mockResolvedValue(
    Professional.create({ id: IDS.professionalId, salonId: IDS.salonId, name: "João", isActive: true, services: [IDS.serviceId] })
  )
  serviceRepo.findById.mockResolvedValue(
    Service.create({ id: IDS.serviceId, salonId: IDS.salonId, name: "Corte", duration: 60, price: 50, isActive: true })
  )

  useCase = new CreateAppointmentUseCase(
    customerRepo as unknown as ICustomerRepository,
    professionalRepo as unknown as IProfessionalRepository,
    serviceRepo as unknown as IServiceRepository
  )
})

async function createFailingWith(error: string, code?: string): Promise<DomainError> {
  createService.mockResolvedValue({ success: false, error, code })
  const result = await useCase.execute({
    salonId: IDS.salonId,
    customerId: IDS.customerId,
    professionalId: IDS.professionalId,
    serviceId: IDS.serviceId,
    startsAt: "2099-06-15T14:00:00-03:00",
  })
  if (result.success) throw new Error("esperava falha")
  return result.error
}

/** [texto do serviço, código do serviço, código que a IA recebe] */
const CODED_FAILURES = [
  ["Horário indisponível (conflito de agenda)", "APPOINTMENT_CONFLICT", "APPOINTMENT_CONFLICT"],
  ["Horário indisponível (conflito com Google Calendar)", "APPOINTMENT_CONFLICT", "APPOINTMENT_CONFLICT"],
  ["Horário fora do expediente do profissional", "PROFESSIONAL_NOT_AVAILABLE", "PROFESSIONAL_NOT_AVAILABLE"],
  ["Profissional não possui horários cadastrados neste dia", "PROFESSIONAL_NOT_AVAILABLE", "PROFESSIONAL_NOT_AVAILABLE"],
  ["Não é possível agendar em um horário que já passou", "PAST_APPOINTMENT", "PAST_APPOINTMENT"],
  ["Profissional não executa este serviço", "PROFESSIONAL_CANNOT_PERFORM_SERVICE", "PROFESSIONAL_CANNOT_PERFORM_SERVICE"],
  ["Este serviço só é realizado em: Ter, Qui.", "service_rule_violation", "SERVICE_RULE_VIOLATION"],
] as const

describe("criar agendamento / recusas com código", () => {
  it.each(CODED_FAILURES)("%s → %s vira %s", async (text, serviceCode, domainCode) => {
    const error = await createFailingWith(text, serviceCode)

    expect(error.code).toBe(domainCode)
    expect(ErrorPresenter.toJSON(error)).toMatchObject({ error: true, code: domainCode })
  })

  it.each(CODED_FAILURES)("%s não manda verificar os dados", async (text, serviceCode) => {
    expect(ErrorPresenter.format(await createFailingWith(text, serviceCode))).not.toBe(GENERIC_CREATION_MESSAGE)
  })

  it.each(CODED_FAILURES)("%s deixa a IA responder (código em AI_GUIDED_ERROR_CODES)", async (text, serviceCode) => {
    expect(AI_GUIDED_ERROR_CODES.has((await createFailingWith(text, serviceCode)).code)).toBe(true)
  })

  it("conflito local e com o Google: horário indisponível + checkAvailability", async () => {
    for (const text of ["Horário indisponível (conflito de agenda)", "Horário indisponível (conflito com Google Calendar)"]) {
      const message = ErrorPresenter.format(await createFailingWith(text, "APPOINTMENT_CONFLICT"))

      expect(message).toContain("esse horário não está mais disponível")
      expect(message).toContain("checkAvailability")
      // "Já existe um agendamento neste horário" podia ser lido como o do próprio cliente.
      expect(message).not.toContain("Já existe um agendamento")
    }
  })

  it("fora do expediente sugere checkAvailability", async () => {
    const message = ErrorPresenter.format(
      await createFailingWith("Horário fora do expediente do profissional", "PROFESSIONAL_NOT_AVAILABLE")
    )

    expect(message).toContain("não está disponível neste horário")
    expect(message).toContain("checkAvailability")
  })

  it("horário passado e regra do serviço chegam com o texto do próprio serviço", async () => {
    expect(
      ErrorPresenter.format(await createFailingWith("Não é possível agendar em um horário que já passou", "PAST_APPOINTMENT"))
    ).toBe("Não é possível agendar em um horário que já passou")
    expect(
      ErrorPresenter.format(await createFailingWith("Este serviço só é realizado em: Ter, Qui.", "service_rule_violation"))
    ).toBe("Este serviço só é realizado em: Ter, Qui.")
  })
})

describe("criar agendamento / recusas sem código (dado inválido)", () => {
  it.each(["Serviço inválido ou inativo", "Profissional inválido ou inativo"])(
    "%s continua como APPOINTMENT_CREATION_FAILED",
    async (text) => {
      const error = await createFailingWith(text)

      expect(error.code).toBe("APPOINTMENT_CREATION_FAILED")
      expect(error.message).toBe(text)
      expect(AI_GUIDED_ERROR_CODES.has(error.code)).toBe(false)
    }
  )
})
