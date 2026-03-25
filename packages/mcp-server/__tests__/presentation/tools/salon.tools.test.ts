import { beforeEach, describe, expect, it, vi } from "vitest"
import { TOKENS } from "../../../src/container"
import { createSalonTools } from "../../../src/presentation/tools/salon.tools"
import { createContainerMock, type ContainerMockController } from "../../helpers/container.mock"
import {
  FIXED,
  IDS,
  makeIdentifyResultDTO,
  makeQualifyLeadResultDTO,
  makeSalonDTO,
} from "../../helpers/fixtures"
import { failResult, okResult } from "../../helpers/result"

describe("salon.tools", () => {
  let containerController: ContainerMockController

  const getSalonDetailsExecute = vi.fn()
  const identifyExecute = vi.fn()
  const savePreferenceExecute = vi.fn()
  const qualifyLeadExecute = vi.fn()

  beforeEach(() => {
    getSalonDetailsExecute.mockReset()
    identifyExecute.mockReset()
    savePreferenceExecute.mockReset()
    qualifyLeadExecute.mockReset()

    containerController = createContainerMock({
      [TOKENS.GetSalonDetailsUseCase]: { execute: getSalonDetailsExecute },
      [TOKENS.IdentifyCustomerUseCase]: { execute: identifyExecute },
      [TOKENS.SaveCustomerPreferenceUseCase]: { execute: savePreferenceExecute },
      [TOKENS.QualifyLeadUseCase]: { execute: qualifyLeadExecute },
    })
  })

  it("getSalonInfo cobre sucesso, falha e exceção", async () => {
    const tools = createSalonTools(containerController.container as any, IDS.salonId, FIXED.clientPhone)

    getSalonDetailsExecute.mockResolvedValueOnce(okResult(makeSalonDTO()))
    const success = await tools.getSalonInfo.execute({})
    expect(getSalonDetailsExecute).toHaveBeenCalledWith(IDS.salonId)
    expect(success).toEqual({
      id: IDS.salonId,
      name: "Barbearia Teste",
      address: "Rua Teste, 123",
      phone: "1133334444",
      description: "Descrição",
      cancellationPolicy: "Cancelar com 2h de antecedência",
      businessHours: {
        1: { start: "09:00", end: "18:00" },
      },
      message: "Informações carregadas",
    })

    getSalonDetailsExecute.mockResolvedValueOnce(failResult(new Error("Salão não encontrado")))
    const failed = await tools.getSalonInfo.execute({})
    expect(failed).toBe("Salão não encontrado")

    getSalonDetailsExecute.mockRejectedValueOnce(new Error("Erro ao buscar salão"))
    const errored = await tools.getSalonInfo.execute({})
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Erro ao buscar salão",
      details: "Erro ao buscar salão",
    })
  })

  it("saveCustomerPreference com customerId informado", async () => {
    const tools = createSalonTools(containerController.container as any, IDS.salonId, FIXED.clientPhone)

    savePreferenceExecute.mockResolvedValueOnce(
      okResult({
        customerId: IDS.customerId,
        key: "allergy",
        value: "lâmina",
        message: "Preferência salva",
      })
    )

    const result = await tools.saveCustomerPreference.execute({
      customerId: IDS.customerId,
      key: "allergy",
      value: "lâmina",
    })

    expect(identifyExecute).not.toHaveBeenCalled()
    expect(savePreferenceExecute).toHaveBeenCalledWith({
      salonId: IDS.salonId,
      customerId: IDS.customerId,
      key: "allergy",
      value: "lâmina",
    })
    expect(result).toEqual({
      customerId: IDS.customerId,
      key: "allergy",
      value: "lâmina",
      message: "Preferência salva",
    })
  })

  it("saveCustomerPreference sem customerId faz identificação automática", async () => {
    identifyExecute.mockResolvedValue(okResult(makeIdentifyResultDTO()))
    savePreferenceExecute.mockResolvedValue(
      okResult({
        customerId: IDS.customerId,
        key: "service_preference",
        value: "degradê",
        message: "Preferência salva",
      })
    )

    const tools = createSalonTools(containerController.container as any, IDS.salonId, FIXED.clientPhone)
    const result = await tools.saveCustomerPreference.execute({
      key: "service_preference",
      value: "degradê",
    })

    expect(identifyExecute).toHaveBeenCalledWith({
      phone: FIXED.clientPhone,
      salonId: IDS.salonId,
    })
    expect(savePreferenceExecute).toHaveBeenCalledWith({
      salonId: IDS.salonId,
      customerId: IDS.customerId,
      key: "service_preference",
      value: "degradê",
    })
    expect(result).toEqual({
      customerId: IDS.customerId,
      key: "service_preference",
      value: "degradê",
      message: "Preferência salva",
    })
  })

  it("saveCustomerPreference cobre falha de identificação, falha de save e exceção", async () => {
    const tools = createSalonTools(containerController.container as any, IDS.salonId, FIXED.clientPhone)

    identifyExecute.mockResolvedValueOnce(okResult(makeIdentifyResultDTO({ id: "" })))
    const identifyFailed = await tools.saveCustomerPreference.execute({
      key: "allergy",
      value: "lâmina",
    })
    expect(identifyFailed).toBe("Não foi possível identificar o cliente")

    savePreferenceExecute.mockResolvedValueOnce(failResult(new Error("Erro ao salvar preferência")))
    const saveFailed = await tools.saveCustomerPreference.execute({
      customerId: IDS.customerId,
      key: "allergy",
      value: "lâmina",
    })
    expect(saveFailed).toBe("Erro ao salvar preferência")

    savePreferenceExecute.mockRejectedValueOnce(new Error("Falha inesperada em preferência"))
    const errored = await tools.saveCustomerPreference.execute({
      customerId: IDS.customerId,
      key: "allergy",
      value: "lâmina",
    })
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Falha inesperada em preferência",
      details: "Falha inesperada em preferência",
    })
  })

  it("qualifyLead usa fallback de phoneNumber e cobre falha/exceção", async () => {
    const tools = createSalonTools(containerController.container as any, IDS.salonId, FIXED.clientPhone)

    qualifyLeadExecute.mockResolvedValueOnce(okResult(makeQualifyLeadResultDTO()))
    const success = await tools.qualifyLead.execute({
      interest: "high",
      notes: "Quase fechando",
    })

    expect(qualifyLeadExecute).toHaveBeenCalledWith({
      salonId: IDS.salonId,
      phoneNumber: FIXED.clientPhone,
      interest: "high",
      notes: "Quase fechando",
    })
    expect(success).toEqual({
      leadId: IDS.leadId,
      status: "qualified",
      message: "Lead qualificado",
    })

    qualifyLeadExecute.mockResolvedValueOnce(failResult(new Error("Lead inválido")))
    const failed = await tools.qualifyLead.execute({
      interest: "medium",
    })
    expect(failed).toBe("Lead inválido")

    qualifyLeadExecute.mockRejectedValueOnce(new Error("Erro ao qualificar lead"))
    const errored = await tools.qualifyLead.execute({
      interest: "none",
    })
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Erro ao qualificar lead",
      details: "Erro ao qualificar lead",
    })
  })
})
