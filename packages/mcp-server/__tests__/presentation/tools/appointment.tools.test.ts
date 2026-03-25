import { beforeEach, describe, expect, it, vi } from "vitest"
import { TOKENS } from "../../../src/container"
import { createAppointmentTools } from "../../../src/presentation/tools/appointment.tools"
import { createContainerMock, type ContainerMockController } from "../../helpers/container.mock"
import { FIXED, IDS, makeAppointmentDTO, makeAppointmentListDTO, makeIdentifyResultDTO } from "../../helpers/fixtures"
import { failResult, okResult } from "../../helpers/result"

describe("appointment.tools", () => {
  let containerController: ContainerMockController

  const identifyExecute = vi.fn()
  const createExecute = vi.fn()
  const updateExecute = vi.fn()
  const deleteExecute = vi.fn()
  const upcomingExecute = vi.fn()

  const salonId = IDS.salonId
  const clientPhone = FIXED.clientPhone

  beforeEach(() => {
    identifyExecute.mockReset()
    createExecute.mockReset()
    updateExecute.mockReset()
    deleteExecute.mockReset()
    upcomingExecute.mockReset()

    containerController = createContainerMock({
      [TOKENS.IdentifyCustomerUseCase]: { execute: identifyExecute },
      [TOKENS.CreateAppointmentUseCase]: { execute: createExecute },
      [TOKENS.UpdateAppointmentUseCase]: { execute: updateExecute },
      [TOKENS.DeleteAppointmentUseCase]: { execute: deleteExecute },
      [TOKENS.GetUpcomingAppointmentsUseCase]: { execute: upcomingExecute },
    })
  })

  it("addAppointment executa fluxo completo identify -> create com normalização de data", async () => {
    identifyExecute.mockResolvedValue(okResult(makeIdentifyResultDTO()))
    createExecute.mockResolvedValue(okResult(makeAppointmentDTO()))

    const tools = createAppointmentTools(containerController.container as any, salonId, clientPhone)
    const result = await tools.addAppointment.execute({
      professionalId: IDS.professionalId,
      serviceId: IDS.serviceId,
      date: FIXED.isoDateWithoutTimezone,
      notes: "Sem máquina",
    })

    expect(identifyExecute).toHaveBeenCalledWith({
      phone: clientPhone,
      salonId,
    })
    expect(createExecute).toHaveBeenCalledWith({
      salonId,
      customerId: IDS.customerId,
      professionalId: IDS.professionalId,
      serviceId: IDS.serviceId,
      startsAt: "2026-04-10T09:30:00-03:00",
      notes: "Sem máquina",
    })
    expect(result).toMatchObject({
      id: IDS.appointmentId,
      service: "Corte",
      professional: "João",
      startsAt: "2026-04-10T09:30:00-03:00",
    })
  })

  it("addAppointment retorna erro amigável quando cliente não é identificado", async () => {
    identifyExecute.mockResolvedValue(okResult(makeIdentifyResultDTO({ id: "" })))

    const tools = createAppointmentTools(containerController.container as any, salonId, clientPhone)
    const result = await tools.addAppointment.execute({
      professionalId: IDS.professionalId,
      serviceId: IDS.serviceId,
      date: FIXED.isoDateWithoutTimezone,
    })

    expect(createExecute).not.toHaveBeenCalled()
    expect(result).toBe("Cliente não identificado. Forneça o nome primeiro.")
  })

  it("addAppointment retorna erro de negócio quando create falha", async () => {
    identifyExecute.mockResolvedValue(okResult(makeIdentifyResultDTO()))
    createExecute.mockResolvedValue(failResult(new Error("Conflito de horário")))

    const tools = createAppointmentTools(containerController.container as any, salonId, clientPhone)
    const result = await tools.addAppointment.execute({
      professionalId: IDS.professionalId,
      serviceId: IDS.serviceId,
      date: FIXED.isoDateWithoutTimezone,
    })

    expect(result).toBe("Conflito de horário")
  })

  it("addAppointment retorna payload de erro quando ocorre exceção", async () => {
    identifyExecute.mockResolvedValue(okResult(makeIdentifyResultDTO()))
    createExecute.mockRejectedValue(new Error("Falha inesperada"))

    const tools = createAppointmentTools(containerController.container as any, salonId, clientPhone)
    const result = await tools.addAppointment.execute({
      professionalId: IDS.professionalId,
      serviceId: IDS.serviceId,
      date: FIXED.isoDateWithoutTimezone,
    })

    expect(result).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Falha inesperada",
      details: "Falha inesperada",
    })
  })

  it("updateAppointment normaliza data quando informada", async () => {
    updateExecute.mockResolvedValue(okResult(makeAppointmentDTO()))

    const tools = createAppointmentTools(containerController.container as any, salonId, clientPhone)
    const result = await tools.updateAppointment.execute({
      appointmentId: IDS.appointmentId,
      date: FIXED.isoDateWithoutTimezone,
      notes: "Mudança de horário",
    })

    expect(updateExecute).toHaveBeenCalledWith({
      appointmentId: IDS.appointmentId,
      professionalId: undefined,
      serviceId: undefined,
      startsAt: "2026-04-10T09:30:00-03:00",
      notes: "Mudança de horário",
    })
    expect(result).toMatchObject({
      id: IDS.appointmentId,
      status: "pending",
    })
  })

  it("updateAppointment mantém startsAt undefined quando date não é enviada", async () => {
    updateExecute.mockResolvedValue(okResult(makeAppointmentDTO()))

    const tools = createAppointmentTools(containerController.container as any, salonId, clientPhone)
    await tools.updateAppointment.execute({
      appointmentId: IDS.appointmentId,
      notes: "Sem alteração de data",
    })

    expect(updateExecute).toHaveBeenCalledWith({
      appointmentId: IDS.appointmentId,
      professionalId: undefined,
      serviceId: undefined,
      startsAt: undefined,
      notes: "Sem alteração de data",
    })
  })

  it("updateAppointment cobre falha de negócio e exceção", async () => {
    const tools = createAppointmentTools(containerController.container as any, salonId, clientPhone)

    updateExecute.mockResolvedValueOnce(failResult(new Error("Agendamento inexistente")))
    const failed = await tools.updateAppointment.execute({
      appointmentId: IDS.appointmentId,
      date: FIXED.isoDateWithTimezone,
    })
    expect(failed).toBe("Agendamento inexistente")

    updateExecute.mockRejectedValueOnce(new Error("Erro ao atualizar"))
    const errored = await tools.updateAppointment.execute({
      appointmentId: IDS.appointmentId,
      date: FIXED.isoDateWithTimezone,
    })
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Erro ao atualizar",
      details: "Erro ao atualizar",
    })
  })

  it("removeAppointment cobre sucesso, falha e exceção", async () => {
    const tools = createAppointmentTools(containerController.container as any, salonId, clientPhone)

    deleteExecute.mockResolvedValueOnce(
      okResult({ appointmentId: IDS.appointmentId, message: "Agendamento cancelado" })
    )
    const success = await tools.removeAppointment.execute({ appointmentId: IDS.appointmentId })
    expect(success).toEqual({
      success: true,
      appointmentId: IDS.appointmentId,
      message: "Agendamento cancelado",
    })

    deleteExecute.mockResolvedValueOnce(failResult(new Error("Não foi possível cancelar")))
    const failed = await tools.removeAppointment.execute({ appointmentId: IDS.appointmentId })
    expect(failed).toBe("Não foi possível cancelar")

    deleteExecute.mockRejectedValueOnce(new Error("Erro interno"))
    const errored = await tools.removeAppointment.execute({ appointmentId: IDS.appointmentId })
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Erro interno",
      details: "Erro interno",
    })
  })

  it("getMyFutureAppointments usa fallback de phone e cobre erro/exceção", async () => {
    const tools = createAppointmentTools(containerController.container as any, salonId, clientPhone)

    upcomingExecute.mockResolvedValueOnce(okResult(makeAppointmentListDTO()))
    const success = await tools.getMyFutureAppointments.execute({
      clientId: IDS.customerId,
    })

    expect(upcomingExecute).toHaveBeenCalledWith({
      salonId,
      customerId: IDS.customerId,
      phone: clientPhone,
    })
    expect(success).toMatchObject({
      total: 1,
      appointments: [
        {
          id: IDS.appointmentId,
          service: "Corte",
        },
      ],
    })

    upcomingExecute.mockResolvedValueOnce(failResult(new Error("Cliente não encontrado")))
    const failed = await tools.getMyFutureAppointments.execute({ clientId: IDS.customerId })
    expect(failed).toBe("Cliente não encontrado")

    upcomingExecute.mockRejectedValueOnce(new Error("Erro ao listar"))
    const errored = await tools.getMyFutureAppointments.execute({ clientId: IDS.customerId })
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Erro ao listar",
      details: "Erro ao listar",
    })
  })

  it("simula fluxo real: listar futuros -> reagendar -> cancelar", async () => {
    const appointmentId = IDS.appointmentId2
    const tools = createAppointmentTools(containerController.container as any, salonId, clientPhone)

    upcomingExecute.mockResolvedValueOnce(
      okResult(
        makeAppointmentListDTO({
          appointments: [makeAppointmentDTO({ id: appointmentId })],
          total: 1,
        })
      )
    )
    updateExecute.mockResolvedValueOnce(okResult(makeAppointmentDTO({ id: appointmentId })))
    deleteExecute.mockResolvedValueOnce(
      okResult({ appointmentId, message: "Agendamento cancelado com sucesso" })
    )

    const listed = (await tools.getMyFutureAppointments.execute({
      clientId: IDS.customerId,
    })) as { appointments: Array<{ id: string }> }
    const listedId = listed.appointments[0].id

    const updated = await tools.updateAppointment.execute({
      appointmentId: listedId,
      date: FIXED.isoDateOnly,
    })
    const removed = await tools.removeAppointment.execute({ appointmentId: listedId })

    expect(listedId).toBe(appointmentId)
    expect(updateExecute).toHaveBeenCalledWith({
      appointmentId,
      professionalId: undefined,
      serviceId: undefined,
      startsAt: "2026-04-10T09:00:00-03:00",
      notes: undefined,
    })
    expect(updated).toMatchObject({ id: appointmentId })
    expect(removed).toEqual({
      success: true,
      appointmentId,
      message: "Agendamento cancelado com sucesso",
    })
  })
})
