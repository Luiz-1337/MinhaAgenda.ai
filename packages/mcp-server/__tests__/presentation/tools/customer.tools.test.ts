import { beforeEach, describe, expect, it, vi } from "vitest"
import { domainServices } from "@repo/db"
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

  describe("nome completo, quando o salão cadastra a cliente na agenda oficial pelo nome", () => {
    const hasActiveAgenda = vi.mocked(domainServices.hasActiveAgendaProvider)
    const tools = () =>
      createCustomerTools({
        container: containerController.container as any,
        salonId: IDS.salonId,
        clientPhone: FIXED.clientPhone,
      })
    const rename = (name: string) => {
      updateExecute.mockResolvedValueOnce(okResult(makeCustomerDTO({ name })))
      return tools().updateCustomerName.execute({ customerId: IDS.customerId, name }) as Promise<Record<string, unknown>>
    }

    it('só o primeiro nome ("Silvana") → grava e pede o sobrenome uma vez, sem travar o agendamento', async () => {
      hasActiveAgenda.mockResolvedValue(true)

      const result = await rename("Silvana")

      expect(hasActiveAgenda).toHaveBeenCalledWith(IDS.salonId)
      expect(result).toMatchObject({ id: IDS.customerId, name: "Silvana" })
      expect(String(result._instrucao)).toContain("Peça o sobrenome UMA vez")
      expect(String(result._instrucao)).toContain("siga com o agendamento")
    })

    it('nome e sobrenome ("Silvana Prado Lima") → sem pedido a mais', async () => {
      hasActiveAgenda.mockResolvedValue(true)

      const result = await rename("Silvana Prado Lima")

      expect(result).not.toHaveProperty("_instrucao")
    })

    it("emoji não conta como sobrenome", async () => {
      hasActiveAgenda.mockResolvedValue(true)

      const result = await rename("Silvana 💇‍♀️")

      expect(result).toHaveProperty("_instrucao")
    })

    it("salão sem agenda oficial → o primeiro nome basta, como sempre", async () => {
      hasActiveAgenda.mockResolvedValue(false)

      const result = await rename("Silvana")

      expect(result).not.toHaveProperty("_instrucao")
    })

    it("se não der para saber da agenda → não insiste no sobrenome", async () => {
      hasActiveAgenda.mockRejectedValue(new Error("duas agendas oficiais ativas"))

      const result = await rename("Silvana")

      expect(result).toMatchObject({ name: "Silvana" })
      expect(result).not.toHaveProperty("_instrucao")
    })
  })
})
