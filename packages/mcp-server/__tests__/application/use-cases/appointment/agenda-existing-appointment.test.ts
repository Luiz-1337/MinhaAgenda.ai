/**
 * Com agenda oficial (Belasis), a recepção também marca horários — direto lá.
 * Antes de criar um agendamento, e antes de dizer que a cliente não tem nenhum,
 * a IA confere o que ela JÁ TEM marcado lá.
 *
 * Os dois casos reais (Spettacolo Salone, nov/2026), que terminaram com um
 * agendamento novo e o original ainda na agenda:
 *  - 12/nov, "vou precisar reagendar o corte para dia 19nov. O Fabiano tem
 *    disponibilidade? Poderia ser mais cedo..." — o corte de 17/11 às 17h tinha
 *    sido marcado por uma atendente; a IA respondeu "Não encontrei um agendamento
 *    futuro para remarcar" e criou outro em 19/11;
 *  - 10/nov, "Gostaria de marcar para outro dia" — o mesmo, com o horário de
 *    10/11 às 14h.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { domainServices } from "@repo/db"
import { CreateAppointmentUseCase } from "../../../../src/application/use-cases/appointment/CreateAppointmentUseCase"
import { GetUpcomingAppointmentsUseCase } from "../../../../src/application/use-cases/appointment/GetUpcomingAppointmentsUseCase"
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
import { AppointmentPresenter } from "../../../../src/presentation/presenters/AppointmentPresenter"
import { AI_GUIDED_ERROR_CODES, ErrorPresenter } from "../../../../src/presentation/presenters/ErrorPresenter"
import { formatDateTime } from "../../../../src/shared/utils/date.utils"
import {
  mockAppointmentRepo,
  mockCustomerRepo,
  mockProfessionalRepo,
  mockServiceRepo,
} from "../../../helpers/repository.mock"
import { IDS } from "../../../helpers/fixtures"

const refresh = vi.mocked(domainServices.refreshCustomerAppointmentsFromAgenda)
const needsName = vi.mocked(domainServices.customerNeedsNameForAgenda)
const createService = vi.mocked(domainServices.createAppointmentService)

/** O corte que a atendente marcou na agenda do salão: 17/11 às 17h (Brasília). */
const RECEPTION_START = new Date("2099-11-17T20:00:00.000Z")
const RECEPTION_END = new Date("2099-11-17T21:00:00.000Z")
const IMPORTED_ID = "99999999-9999-4999-8999-999999999999"

const imported = {
  appointmentId: IMPORTED_ID,
  externalId: "610",
  start: RECEPTION_START,
  end: RECEPTION_END,
  professionalId: IDS.professionalId,
  serviceId: IDS.serviceId,
}
const teamSlot = { externalId: "611", start: RECEPTION_START, end: RECEPTION_END }

const nothingThere = { status: "checked" as const, imported: [], unlinked: [], newUnlinked: [] }

let createUseCase: CreateAppointmentUseCase
let upcomingUseCase: GetUpcomingAppointmentsUseCase
let appointmentRepo: ReturnType<typeof mockAppointmentRepo>
let customerRepo: ReturnType<typeof mockCustomerRepo>

const fernanda = () =>
  Customer.create({
    id: IDS.customerId,
    salonId: IDS.salonId,
    phone: "5511988888551",
    name: "Fernanda Lima Duarte",
  })

beforeEach(() => {
  appointmentRepo = mockAppointmentRepo()
  customerRepo = mockCustomerRepo()
  const professionalRepo = mockProfessionalRepo()
  const serviceRepo = mockServiceRepo()

  customerRepo.findById.mockResolvedValue(fernanda())
  customerRepo.findByPhone.mockResolvedValue(fernanda())
  professionalRepo.findById.mockResolvedValue(
    Professional.create({ id: IDS.professionalId, salonId: IDS.salonId, name: "Fabiano Eber", isActive: true, services: [IDS.serviceId] })
  )
  serviceRepo.findById.mockResolvedValue(
    Service.create({ id: IDS.serviceId, salonId: IDS.salonId, name: "Corte feminino", duration: 60, price: 450, isActive: true })
  )

  refresh.mockResolvedValue(nothingThere)
  needsName.mockResolvedValue(false)
  createService.mockResolvedValue({ success: true, data: { appointmentId: IDS.appointmentId } })

  createUseCase = new CreateAppointmentUseCase(
    customerRepo as unknown as ICustomerRepository,
    professionalRepo as unknown as IProfessionalRepository,
    serviceRepo as unknown as IServiceRepository
  )
  upcomingUseCase = new GetUpcomingAppointmentsUseCase(
    appointmentRepo as unknown as IAppointmentRepository,
    customerRepo as unknown as ICustomerRepository,
    professionalRepo as unknown as IProfessionalRepository,
    serviceRepo as unknown as IServiceRepository
  )
})

/** O que a IA tentou fazer em 12/nov: criar o corte de 19/11 às 17h. */
const newBooking = {
  salonId: IDS.salonId,
  customerId: IDS.customerId,
  professionalId: IDS.professionalId,
  serviceId: IDS.serviceId,
  startsAt: "2099-11-19T17:00:00-03:00",
}

describe("addAppointment — a cliente já tem horário marcado pela recepção", () => {
  it("não cria: devolve o horário achado para a IA perguntar se é remarcação", async () => {
    refresh.mockResolvedValue({ status: "checked", imported: [imported], unlinked: [], newUnlinked: [] })

    const result = await createUseCase.execute(newBooking)

    expect(refresh).toHaveBeenCalledWith({ salonId: IDS.salonId, customerId: IDS.customerId })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("EXISTING_APPOINTMENT_FOUND")
    expect(createService).not.toHaveBeenCalled()
  })

  it("a IA recebe o serviço, o profissional, a data, o id para remarcar e as duas saídas", async () => {
    refresh.mockResolvedValue({ status: "checked", imported: [imported], unlinked: [], newUnlinked: [] })

    const result = await createUseCase.execute(newBooking)
    if (result.success) throw new Error("esperava falha")

    const json = ErrorPresenter.toJSON(result.error)
    expect(json).toMatchObject({ error: true, code: "EXISTING_APPOINTMENT_FOUND" })
    const message = String(json.message)
    expect(message).toContain("Nada foi agendado")
    expect(message).toContain(`Corte feminino com Fabiano Eber em ${formatDateTime(RECEPTION_START)}`)
    expect(message).toContain(`id interno: ${IMPORTED_ID}`)
    expect(message).toContain("REMARCAR")
    expect(message).toContain("use updateAppointment com o id interno")
    expect(message).toContain("chame addAppointment de novo com os mesmos dados")
    expect(message).toContain("Nunca mostre o id interno")
    // O texto pronto do apps/web ("pode me informar novamente a data e horário?")
    // não pode trocar a pergunta da IA.
    expect(AI_GUIDED_ERROR_CODES.has("EXISTING_APPOINTMENT_FOUND")).toBe(true)
  })

  it("horário a mais: a segunda chamada, com os mesmos dados, agenda", async () => {
    refresh
      .mockResolvedValueOnce({ status: "checked", imported: [imported], unlinked: [], newUnlinked: [] })
      // O que veio de lá já existe aqui: não é mais novidade.
      .mockResolvedValueOnce({ status: "recent", imported: [], unlinked: [], newUnlinked: [] })

    expect((await createUseCase.execute(newBooking)).success).toBe(false)
    const second = await createUseCase.execute(newBooking)

    expect(second.success).toBe(true)
    expect(createService).toHaveBeenCalledTimes(1)
    expect(createService).toHaveBeenCalledWith(expect.objectContaining({ clientId: IDS.customerId, date: newBooking.startsAt }))
  })

  it("horário de lá sem par aqui (não dá para mexer por aqui): avisa uma vez e manda falar com a equipe", async () => {
    refresh.mockResolvedValue({ status: "checked", imported: [], unlinked: [teamSlot], newUnlinked: [teamSlot] })

    const result = await createUseCase.execute(newBooking)
    if (result.success) throw new Error("esperava falha")

    expect(result.error.code).toBe("EXISTING_APPOINTMENT_FOUND")
    expect(result.error.message).toContain(`um horário em ${formatDateTime(RECEPTION_START)}, marcado pela equipe do salão`)
    expect(result.error.message).toContain("avise a equipe do salão")
    expect(result.error.message).toContain("NÃO crie outro horário no lugar")
    // Sem id para remarcar, não manda usar updateAppointment.
    expect(result.error.message).not.toContain("updateAppointment")
    expect(createService).not.toHaveBeenCalled()
  })

  it("horário sem par que já foi avisado não bloqueia de novo", async () => {
    refresh.mockResolvedValue({ status: "checked", imported: [], unlinked: [teamSlot], newUnlinked: [] })

    const result = await createUseCase.execute(newBooking)

    expect(result.success).toBe(true)
    expect(createService).toHaveBeenCalled()
  })

  it("vem antes do nome: quem tem cadastro e horário lá não é perguntada pelo nome primeiro", async () => {
    refresh.mockResolvedValue({ status: "checked", imported: [imported], unlinked: [], newUnlinked: [] })
    needsName.mockResolvedValue(true)

    const result = await createUseCase.execute(newBooking)
    if (result.success) throw new Error("esperava falha")

    expect(result.error.code).toBe("EXISTING_APPOINTMENT_FOUND")
    expect(needsName).not.toHaveBeenCalled()
  })

  it("nada marcado lá → agenda normalmente", async () => {
    const result = await createUseCase.execute(newBooking)

    expect(result.success).toBe(true)
    expect(createService).toHaveBeenCalledTimes(1)
  })

  it.each(["failed", "no_agenda"] as const)("consulta com status %s não impede o agendamento", async (status) => {
    refresh.mockResolvedValue({ status, imported: [], unlinked: [], newUnlinked: [] })

    const result = await createUseCase.execute(newBooking)

    expect(result.success).toBe(true)
    expect(createService).toHaveBeenCalled()
  })

  it("a consulta lança → o agendamento segue (a checagem de horário do serviço é que trava se precisar)", async () => {
    refresh.mockRejectedValue(new Error("inesperado"))

    const result = await createUseCase.execute(newBooking)

    expect(result.success).toBe(true)
    expect(createService).toHaveBeenCalled()
  })
})

describe("getMyFutureAppointments — conferir a agenda do salão antes de dizer que não há agendamento", () => {
  const receptionAppointment = () =>
    Appointment.create({
      id: IMPORTED_ID,
      salonId: IDS.salonId,
      customerId: IDS.customerId,
      professionalId: IDS.professionalId,
      serviceId: IDS.serviceId,
      startsAt: RECEPTION_START,
      endsAt: RECEPTION_END,
      status: "pending",
    })

  it("caso real (12/nov): o corte marcado pela atendente aparece na lista, com id para remarcar", async () => {
    refresh.mockImplementation(async () => {
      // A consulta traz o agendamento para cá; a busca logo depois já o enxerga.
      appointmentRepo.findUpcoming.mockResolvedValue([receptionAppointment()])
      return { status: "checked", imported: [imported], unlinked: [], newUnlinked: [] }
    })

    const result = await upcomingUseCase.execute({
      salonId: IDS.salonId,
      customerId: IDS.customerId,
      refreshFromAgenda: true,
    })
    if (!result.success) throw new Error("esperava sucesso")

    expect(refresh).toHaveBeenCalledWith({ salonId: IDS.salonId, customerId: IDS.customerId })
    expect(result.data.total).toBe(1)
    expect(result.data.appointments[0]).toMatchObject({
      id: IMPORTED_ID,
      serviceName: "Corte feminino",
      professionalName: "Fabiano Eber",
    })
    expect(result.data.officialAgenda).toEqual({ status: "checked", unlinked: [] })

    const json = AppointmentPresenter.listToJSON(result.data)
    expect(json.agendaDoSalao).toBe("conferida")
    expect(json).not.toHaveProperty("horariosMarcadosPelaEquipe")
  })

  it("pelo telefone da sessão (como a tool chama): acha a cliente e confere a agenda dela", async () => {
    await upcomingUseCase.execute({ salonId: IDS.salonId, phone: "5511988888551", refreshFromAgenda: true })

    expect(customerRepo.findByPhone).toHaveBeenCalledWith("5511988888551", IDS.salonId)
    expect(refresh).toHaveBeenCalledWith({ salonId: IDS.salonId, customerId: IDS.customerId })
    expect(appointmentRepo.findUpcomingByPhone).toHaveBeenCalledWith("5511988888551", IDS.salonId)
  })

  it("sem refreshFromAgenda (o bloco do prompt em mensagem comum) → não gasta chamada na agenda", async () => {
    const result = await upcomingUseCase.execute({ salonId: IDS.salonId, customerId: IDS.customerId })
    if (!result.success) throw new Error("esperava sucesso")

    expect(refresh).not.toHaveBeenCalled()
    expect(result.data.officialAgenda).toBeUndefined()
    expect(AppointmentPresenter.listToJSON(result.data)).not.toHaveProperty("agendaDoSalao")
  })

  it("salão sem agenda oficial → lista como sempre, sem falar de agenda do salão", async () => {
    refresh.mockResolvedValue({ status: "no_agenda", imported: [], unlinked: [], newUnlinked: [] })

    const result = await upcomingUseCase.execute({ salonId: IDS.salonId, customerId: IDS.customerId, refreshFromAgenda: true })
    if (!result.success) throw new Error("esperava sucesso")

    expect(result.data.officialAgenda).toBeUndefined()
  })

  it("a agenda do salão não respondeu → a IA é avisada para NÃO afirmar que não há agendamento", async () => {
    refresh.mockResolvedValue({ status: "failed", imported: [], unlinked: [], newUnlinked: [] })

    const result = await upcomingUseCase.execute({ salonId: IDS.salonId, customerId: IDS.customerId, refreshFromAgenda: true })
    if (!result.success) throw new Error("esperava sucesso")

    const json = AppointmentPresenter.listToJSON(result.data)
    expect(json.agendaDoSalao).toBe("não respondeu")
    expect(String(json._instrucao)).toContain("NÃO afirme que a cliente não tem agendamento")
  })

  it("horário de lá que não dá para mexer por aqui → vai na resposta, com a ordem de não criar outro no lugar", async () => {
    refresh.mockResolvedValue({ status: "checked", imported: [], unlinked: [teamSlot], newUnlinked: [] })

    const result = await upcomingUseCase.execute({ salonId: IDS.salonId, customerId: IDS.customerId, refreshFromAgenda: true })
    if (!result.success) throw new Error("esperava sucesso")

    const json = AppointmentPresenter.listToJSON(result.data)
    expect(json.horariosMarcadosPelaEquipe).toEqual([
      { startsAt: RECEPTION_START.toISOString(), quando: formatDateTime(RECEPTION_START) },
    ])
    expect(String(json._instrucao)).toContain("NUNCA crie outro horário no lugar deles")
    // A regra de sempre continua lá.
    expect(String(json._instrucao)).toContain("NUNCA mostre o campo 'id' ao cliente")
  })

  it("a agenda do salão demora mais que o prazo → segue com o que há aqui e avisa que não conferiu", async () => {
    // Nunca responde: uma agenda travada não pode segurar a resposta à cliente.
    refresh.mockReturnValue(new Promise(() => undefined))

    const result = await upcomingUseCase.execute({
      salonId: IDS.salonId,
      customerId: IDS.customerId,
      refreshFromAgenda: true,
      agendaTimeoutMs: 20,
    })
    if (!result.success) throw new Error("esperava sucesso")

    expect(result.data.officialAgenda).toEqual({ status: "failed", unlinked: [] })
    expect(appointmentRepo.findUpcoming).toHaveBeenCalled()
  })

  it("cliente ainda sem cadastro aqui → nada a conferir, lista vazia", async () => {
    customerRepo.findByPhone.mockResolvedValue(null)

    const result = await upcomingUseCase.execute({ salonId: IDS.salonId, phone: "5511900000000", refreshFromAgenda: true })
    if (!result.success) throw new Error("esperava sucesso")

    expect(refresh).not.toHaveBeenCalled()
    expect(result.data.total).toBe(0)
  })

  it("sem customerId nem telefone → erro, como antes", async () => {
    const result = await upcomingUseCase.execute({ salonId: IDS.salonId, refreshFromAgenda: true })

    expect(result.success).toBe(false)
    expect(refresh).not.toHaveBeenCalled()
  })
})
