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
  const findSalonById = vi.fn()

  beforeEach(() => {
    getServicesExecute.mockReset()
    getProductsExecute.mockReset()
    getProfessionalsExecute.mockReset()
    findSalonById.mockReset()

    containerController = createContainerMock({
      [TOKENS.GetServicesUseCase]: { execute: getServicesExecute },
      [TOKENS.GetProductsUseCase]: { execute: getProductsExecute },
      [TOKENS.GetProfessionalsUseCase]: { execute: getProfessionalsExecute },
      [TOKENS.SalonRepository]: { findById: findSalonById },
    })
  })

  it("getServices normaliza input undefined e cobre sucesso/falha/exceção", async () => {
    const tools = createCatalogTools(containerController.container as any, IDS.salonId, FIXED.clientPhone)

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
    expect(failed).toBe("Erro ao buscar serviços")

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
    const tools = createCatalogTools(containerController.container as any, IDS.salonId, FIXED.clientPhone)

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
    expect(failed).toBe("Erro ao buscar produtos")

    getProductsExecute.mockRejectedValueOnce(new Error("Falha em produtos"))
    const errored = await tools.getProducts.execute({})
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Falha em produtos",
      details: "Falha em produtos",
    })
  })

  it("getProfessionals retorna restrição de plano SOLO sem chamar use case", async () => {
    findSalonById.mockResolvedValue({
      isSoloPlan: () => true,
    })

    const tools = createCatalogTools(containerController.container as any, IDS.salonId, FIXED.clientPhone)
    const result = await tools.getProfessionals.execute({})

    expect(findSalonById).toHaveBeenCalledWith(IDS.salonId)
    expect(getProfessionalsExecute).not.toHaveBeenCalled()
    expect(result).toBeTypeOf("string")
    expect(JSON.parse(result as string)).toEqual({
      error: true,
      message:
        "Este recurso não está disponível para o plano SOLO (apenas 1 profissional). Utilize o único profissional que tenha conhecimento",
      code: "PLAN_RESTRICTION",
    })
  })

  it("getProfessionals cobre sucesso fora do SOLO, falha e exceção", async () => {
    const tools = createCatalogTools(containerController.container as any, IDS.salonId, FIXED.clientPhone)

    findSalonById.mockResolvedValueOnce({
      isSoloPlan: () => false,
    })
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

    findSalonById.mockResolvedValueOnce({
      isSoloPlan: () => false,
    })
    getProfessionalsExecute.mockResolvedValueOnce(
      failResult(new Error("Erro ao buscar profissionais"))
    )
    const failed = await tools.getProfessionals.execute({})
    expect(failed).toBe("Erro ao buscar profissionais")

    findSalonById.mockRejectedValueOnce(new Error("Erro ao consultar salão"))
    const errored = await tools.getProfessionals.execute({})
    expect(errored).toEqual({
      error: true,
      code: "UNKNOWN_ERROR",
      message: "Erro ao consultar salão",
      details: "Erro ao consultar salão",
    })
  })
})
