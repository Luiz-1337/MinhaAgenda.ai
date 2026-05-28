import { beforeEach, describe, expect, it, vi } from "vitest"
import { TOKENS } from "../../../src/container"
import { createCustomerTools } from "../../../src/presentation/tools/customer.tools"
import { createContainerMock, type ContainerMockController } from "../../helpers/container.mock"
import { FIXED, IDS, makeCustomerDTO } from "../../helpers/fixtures"
import { failResult, okResult } from "../../helpers/result"

describe("customer.tools", () => {
  let containerController: ContainerMockController

  const updateExecute = vi.fn()

  beforeEach(() => {
    updateExecute.mockReset()

    containerController = createContainerMock({
      [TOKENS.UpdateCustomerUseCase]: { execute: updateExecute },
    })
  })

  it("updateCustomerName cobre sucesso, falha e exceção", async () => {
    const tools = createCustomerTools({
      container: containerController.container as any,
      salonId: IDS.salonId,
      clientPhone: FIXED.clientPhone,
    })

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
    expect(failed).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Cliente não encontrado",
      details: "Cliente não encontrado",
    })

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
