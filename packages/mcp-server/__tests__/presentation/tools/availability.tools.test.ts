import { beforeEach, describe, expect, it, vi } from "vitest"
import { TOKENS } from "../../../src/container"
import { createAvailabilityTools } from "../../../src/presentation/tools/availability.tools"
import { createContainerMock, type ContainerMockController } from "../../helpers/container.mock"
import { FIXED, IDS, makeAvailabilityDTO, makeRulesDTO } from "../../helpers/fixtures"
import { failResult, okResult } from "../../helpers/result"

describe("availability.tools", () => {
  let containerController: ContainerMockController

  const checkAvailabilityExecute = vi.fn()
  const getAvailableSlotsExecute = vi.fn()
  const rulesExecute = vi.fn()

  beforeEach(() => {
    checkAvailabilityExecute.mockReset()
    getAvailableSlotsExecute.mockReset()
    rulesExecute.mockReset()

    containerController = createContainerMock({
      [TOKENS.CheckAvailabilityUseCase]: { execute: checkAvailabilityExecute },
      [TOKENS.GetAvailableSlotsUseCase]: { execute: getAvailableSlotsExecute },
      [TOKENS.GetProfessionalAvailabilityRulesUseCase]: { execute: rulesExecute },
    })
  })

  it("checkAvailability normaliza data e retorna payload estruturado", async () => {
    checkAvailabilityExecute.mockResolvedValue(okResult(makeAvailabilityDTO()))
    const tools = createAvailabilityTools(
      containerController.container as any,
      IDS.salonId,
      FIXED.clientPhone
    )

    const result = await tools.checkAvailability.execute({
      date: FIXED.isoDateWithoutTimezone,
      professionalId: IDS.professionalId,
      serviceId: IDS.serviceId,
      serviceDuration: 45,
    })

    expect(checkAvailabilityExecute).toHaveBeenCalledWith({
      salonId: IDS.salonId,
      date: "2026-04-10T09:30:00-03:00",
      professionalId: IDS.professionalId,
      serviceId: IDS.serviceId,
      serviceDuration: 45,
    })
    expect(result).toMatchObject({
      date: "2026-04-10",
      professionalId: IDS.professionalId,
      totalAvailable: 2,
    })
  })

  it("checkAvailability cobre erro de negócio e exceção", async () => {
    const tools = createAvailabilityTools(
      containerController.container as any,
      IDS.salonId,
      FIXED.clientPhone
    )

    checkAvailabilityExecute.mockResolvedValueOnce(failResult(new Error("Dia sem agenda")))
    const failed = await tools.checkAvailability.execute({ date: FIXED.isoDateWithTimezone })
    expect(failed).toBe("Dia sem agenda")

    checkAvailabilityExecute.mockRejectedValueOnce(new Error("Falha externa"))
    const errored = await tools.checkAvailability.execute({ date: FIXED.isoDateWithTimezone })
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Falha externa",
      details: "Falha externa",
    })
  })

  it("getAvailableSlots normaliza data e cobre erro/exceção", async () => {
    const tools = createAvailabilityTools(
      containerController.container as any,
      IDS.salonId,
      FIXED.clientPhone
    )

    getAvailableSlotsExecute.mockResolvedValueOnce(okResult(makeAvailabilityDTO()))
    const success = await tools.getAvailableSlots.execute({
      date: FIXED.isoDateOnly,
      professionalId: IDS.professionalId,
    })
    expect(getAvailableSlotsExecute).toHaveBeenCalledWith({
      salonId: IDS.salonId,
      date: "2026-04-10T09:00:00-03:00",
      professionalId: IDS.professionalId,
      serviceId: undefined,
      serviceDuration: undefined,
    })
    expect(success).toMatchObject({
      slots: expect.arrayContaining([
        { time: "09:00", available: true },
        { time: "09:30", available: false },
      ]),
    })

    getAvailableSlotsExecute.mockResolvedValueOnce(failResult(new Error("Sem slots")))
    const failed = await tools.getAvailableSlots.execute({
      date: FIXED.isoDateWithTimezone,
    })
    expect(failed).toBe("Sem slots")

    getAvailableSlotsExecute.mockRejectedValueOnce(new Error("Erro de disponibilidade"))
    const errored = await tools.getAvailableSlots.execute({
      date: FIXED.isoDateWithTimezone,
    })
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Erro de disponibilidade",
      details: "Erro de disponibilidade",
    })
  })

  it("getProfessionalAvailabilityRules mapeia saída e cobre erro/exceção", async () => {
    const tools = createAvailabilityTools(
      containerController.container as any,
      IDS.salonId,
      FIXED.clientPhone
    )

    rulesExecute.mockResolvedValueOnce(okResult(makeRulesDTO()))
    const success = await tools.getProfessionalAvailabilityRules.execute({
      professionalName: "João",
    })
    expect(rulesExecute).toHaveBeenCalledWith({
      salonId: IDS.salonId,
      professionalName: "João",
    })
    expect(success).toEqual({
      professionalId: IDS.professionalId,
      professionalName: "João",
      rules: [
        {
          dayOfWeek: 2,
          dayName: "Terça-feira",
          startTime: "09:00",
          endTime: "18:00",
          isBreak: false,
        },
      ],
      message: "Regras carregadas",
    })

    rulesExecute.mockResolvedValueOnce(failResult(new Error("Profissional não encontrado")))
    const failed = await tools.getProfessionalAvailabilityRules.execute({
      professionalName: "Desconhecido",
    })
    expect(failed).toBe("Profissional não encontrado")

    rulesExecute.mockRejectedValueOnce(new Error("Erro ao consultar regras"))
    const errored = await tools.getProfessionalAvailabilityRules.execute({
      professionalName: "João",
    })
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Erro ao consultar regras",
      details: "Erro ao consultar regras",
    })
  })
})
