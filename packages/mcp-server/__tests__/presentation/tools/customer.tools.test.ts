import { beforeEach, describe, expect, it, vi } from "vitest"
import { TOKENS } from "../../../src/container"
import { createCustomerTools } from "../../../src/presentation/tools/customer.tools"
import { createContainerMock, type ContainerMockController } from "../../helpers/container.mock"
import { FIXED, IDS, makeCustomerDTO, makeIdentifyResultDTO } from "../../helpers/fixtures"
import { failResult, okResult } from "../../helpers/result"

describe("customer.tools", () => {
  let containerController: ContainerMockController

  const identifyExecute = vi.fn()
  const createExecute = vi.fn()
  const updateExecute = vi.fn()

  beforeEach(() => {
    identifyExecute.mockReset()
    createExecute.mockReset()
    updateExecute.mockReset()

    containerController = createContainerMock({
      [TOKENS.IdentifyCustomerUseCase]: { execute: identifyExecute },
      [TOKENS.CreateCustomerUseCase]: { execute: createExecute },
      [TOKENS.UpdateCustomerUseCase]: { execute: updateExecute },
    })
  })

  it("identifyCustomer aplica fallback para clientPhone e retorna payload", async () => {
    identifyExecute.mockResolvedValue(okResult(makeIdentifyResultDTO()))

    const tools = createCustomerTools(containerController.container as any, IDS.salonId, FIXED.clientPhone)
    const result = await tools.identifyCustomer.execute({ name: "Cliente Teste" })

    expect(identifyExecute).toHaveBeenCalledWith({
      phone: FIXED.clientPhone,
      name: "Cliente Teste",
      salonId: IDS.salonId,
    })
    expect(result).toEqual({
      id: IDS.customerId,
      name: "Cliente Teste",
      phone: FIXED.clientPhone,
      found: true,
      created: false,
      message: "Cliente encontrado",
    })
  })

  it("identifyCustomer cobre falha de negócio e exceção", async () => {
    const tools = createCustomerTools(containerController.container as any, IDS.salonId, FIXED.clientPhone)

    identifyExecute.mockResolvedValueOnce(failResult(new Error("Telefone inválido")))
    const failed = await tools.identifyCustomer.execute({})
    expect(failed).toBe("Telefone inválido")

    identifyExecute.mockRejectedValueOnce(new Error("Erro no cadastro"))
    const errored = await tools.identifyCustomer.execute({})
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Erro no cadastro",
      details: "Erro no cadastro",
    })
  })

  it("createCustomer usa fallback de phone e cobre falha/exceção", async () => {
    const tools = createCustomerTools(containerController.container as any, IDS.salonId, FIXED.clientPhone)

    createExecute.mockResolvedValueOnce(okResult(makeCustomerDTO()))
    const success = await tools.createCustomer.execute({ name: "Cliente Teste" })
    expect(createExecute).toHaveBeenCalledWith({
      salonId: IDS.salonId,
      phone: FIXED.clientPhone,
      name: "Cliente Teste",
    })
    expect(success).toEqual({
      id: IDS.customerId,
      name: "Cliente Teste",
      phone: "(11) 99999-9999",
      email: "cliente@teste.com",
      isNew: false,
      isIdentified: true,
    })

    createExecute.mockResolvedValueOnce(failResult(new Error("Cliente duplicado")))
    const failed = await tools.createCustomer.execute({ name: "Cliente Teste" })
    expect(failed).toBe("Cliente duplicado")

    createExecute.mockRejectedValueOnce(new Error("Erro ao criar cliente"))
    const errored = await tools.createCustomer.execute({ name: "Cliente Teste" })
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Erro ao criar cliente",
      details: "Erro ao criar cliente",
    })
  })

  it("updateCustomerName cobre sucesso, falha e exceção", async () => {
    const tools = createCustomerTools(containerController.container as any, IDS.salonId, FIXED.clientPhone)

    updateExecute.mockResolvedValueOnce(okResult(makeCustomerDTO({ name: "Nome Atualizado" })))
    const success = await tools.updateCustomerName.execute({
      customerId: IDS.customerId,
      name: "Nome Atualizado",
    })
    expect(updateExecute).toHaveBeenCalledWith({
      customerId: IDS.customerId,
      name: "Nome Atualizado",
    })
    expect(success).toEqual({
      id: IDS.customerId,
      name: "Nome Atualizado",
      phone: "(11) 99999-9999",
      email: "cliente@teste.com",
      isNew: false,
      isIdentified: true,
    })

    updateExecute.mockResolvedValueOnce(failResult(new Error("Cliente não encontrado")))
    const failed = await tools.updateCustomerName.execute({
      customerId: IDS.customerId,
      name: "Outro Nome",
    })
    expect(failed).toBe("Cliente não encontrado")

    updateExecute.mockRejectedValueOnce(new Error("Erro ao atualizar cliente"))
    const errored = await tools.updateCustomerName.execute({
      customerId: IDS.customerId,
      name: "Outro Nome",
    })
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Erro ao atualizar cliente",
      details: "Erro ao atualizar cliente",
    })
  })
})
