import { beforeEach, describe, expect, it, vi } from "vitest"
import { TOKENS } from "../../../src/container"
import { createCatalogTools } from "../../../src/presentation/tools/catalog.tools"
import { createContainerMock, type ContainerMockController } from "../../helpers/container.mock"
import {
  FIXED,
  IDS,
  makeProductListDTO,
  makeProfessionalListDTO,
  makeServiceListDTO,
} from "../../helpers/fixtures"
import { failResult, okResult } from "../../helpers/result"

describe("catalog.tools", () => {
  let containerController: ContainerMockController

  const getServicesExecute = vi.fn()
  const getProductsExecute = vi.fn()
  const getProfessionalsExecute = vi.fn()

  beforeEach(() => {
    getServicesExecute.mockReset()
    getProductsExecute.mockReset()
    getProfessionalsExecute.mockReset()

    containerController = createContainerMock({
      [TOKENS.GetServicesUseCase]: { execute: getServicesExecute },
      [TOKENS.GetProductsUseCase]: { execute: getProductsExecute },
      [TOKENS.GetProfessionalsUseCase]: { execute: getProfessionalsExecute },
    })
  })

  const makeTools = () =>
    createCatalogTools({
      container: containerController.container as any,
      salonId: IDS.salonId,
      clientPhone: FIXED.clientPhone,
    })

  it("getServices normaliza input undefined e cobre sucesso/falha/exceção", async () => {
    const tools = makeTools()

    getServicesExecute.mockResolvedValueOnce(okResult(makeServiceListDTO()))
    const success = await tools.getServices.execute(undefined as any)

    expect(getServicesExecute).toHaveBeenCalledWith({
      salonId: IDS.salonId,
      includeInactive: undefined,
    })
    expect(success).toMatchObject({
      total: 1,
      services: [
        {
          id: IDS.serviceId,
          name: "Corte",
        },
      ],
    })

    getServicesExecute.mockResolvedValueOnce(failResult(new Error("Erro ao buscar serviços")))
    const failed = await tools.getServices.execute({})
    expect(failed).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Erro ao buscar serviços",
      details: "Erro ao buscar serviços",
    })

    getServicesExecute.mockRejectedValueOnce(new Error("Falha de catálogo"))
    const errored = await tools.getServices.execute({})
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Falha de catálogo",
      details: "Falha de catálogo",
    })
  })

  it("getProducts normaliza input undefined e cobre sucesso/falha/exceção", async () => {
    const tools = makeTools()

    getProductsExecute.mockResolvedValueOnce(okResult(makeProductListDTO()))
    const success = await tools.getProducts.execute(undefined as any)
    expect(getProductsExecute).toHaveBeenCalledWith({
      salonId: IDS.salonId,
      includeInactive: undefined,
    })
    expect(success).toMatchObject({
      total: 1,
      products: [{ id: IDS.productId, name: "Pomada" }],
    })

    getProductsExecute.mockResolvedValueOnce(failResult(new Error("Erro ao buscar produtos")))
    const failed = await tools.getProducts.execute({})
    expect(failed).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Erro ao buscar produtos",
      details: "Erro ao buscar produtos",
    })

    getProductsExecute.mockRejectedValueOnce(new Error("Falha em produtos"))
    const errored = await tools.getProducts.execute({})
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Falha em produtos",
      details: "Falha em produtos",
    })
  })

  it("getProfessionals delega ao use case e cobre sucesso, falha e exceção", async () => {
    const tools = makeTools()

    getProfessionalsExecute.mockResolvedValueOnce(okResult(makeProfessionalListDTO()))
    const success = await tools.getProfessionals.execute(undefined as any)
    expect(getProfessionalsExecute).toHaveBeenCalledWith({
      salonId: IDS.salonId,
      includeInactive: undefined,
    })
    expect(success).toMatchObject({
      total: 1,
      professionals: [{ id: IDS.professionalId, name: "João" }],
    })

    getProfessionalsExecute.mockResolvedValueOnce(
      failResult(new Error("Erro ao buscar profissionais"))
    )
    const failed = await tools.getProfessionals.execute({})
    expect(failed).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Erro ao buscar profissionais",
      details: "Erro ao buscar profissionais",
    })

    getProfessionalsExecute.mockRejectedValueOnce(new Error("Erro ao consultar profissionais"))
    const errored = await tools.getProfessionals.execute({})
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Erro ao consultar profissionais",
      details: "Erro ao consultar profissionais",
    })
  })
})
