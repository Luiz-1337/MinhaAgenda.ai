import { beforeEach, describe, expect, it, vi } from "vitest"
import { TOKENS } from "../../../src/container"
import { createAvailabilityTools } from "../../../src/presentation/tools/availability.tools"
import { createContainerMock, type ContainerMockController } from "../../helpers/container.mock"
import { FIXED, IDS, makeAvailabilityDTO, makeRulesDTO } from "../../helpers/fixtures"
import { failResult, okResult } from "../../helpers/result"

describe("availability.tools", () => {
  let containerController: ContainerMockController

  const checkAvailabilityExecute = vi.fn()
  const rulesExecute = vi.fn()

  beforeEach(() => {
    checkAvailabilityExecute.mockReset()
    rulesExecute.mockReset()

    containerController = createContainerMock({
      [TOKENS.CheckAvailabilityUseCase]: { execute: checkAvailabilityExecute },
      [TOKENS.GetProfessionalAvailabilityRulesUseCase]: { execute: rulesExecute },
    })
  })

  it("checkAvailability normaliza data e retorna payload estruturado", async () => {
    checkAvailabilityExecute.mockResolvedValue(okResult(makeAvailabilityDTO()))
    const tools = createAvailabilityTools({
      container: containerController.container as any,
      salonId: IDS.salonId,
      clientPhone: FIXED.clientPhone,
    })

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
      totalAvailable: 2,
    })
  })

  it("checkAvailability cobre erro de negócio e exceção", async () => {
    const tools = createAvailabilityTools({
      container: containerController.container as any,
      salonId: IDS.salonId,
      clientPhone: FIXED.clientPhone,
    })

    checkAvailabilityExecute.mockResolvedValueOnce(failResult(new Error("Dia sem agenda")))
    const failed = await tools.checkAvailability.execute({ date: FIXED.isoDateWithTimezone })
    expect(failed).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Dia sem agenda",
      details: "Dia sem agenda",
    })

    checkAvailabilityExecute.mockRejectedValueOnce(new Error("Falha externa"))
    const errored = await tools.checkAvailability.execute({ date: FIXED.isoDateWithTimezone })
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Falha externa",
      details: "Falha externa",
    })
  })

  it("getProfessionalAvailabilityRules mapeia saída e cobre erro/exceção", async () => {
    const tools = createAvailabilityTools({
      container: containerController.container as any,
      salonId: IDS.salonId,
      clientPhone: FIXED.clientPhone,
    })

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
    expect(failed).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Profissional não encontrado",
      details: "Profissional não encontrado",
    })

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
