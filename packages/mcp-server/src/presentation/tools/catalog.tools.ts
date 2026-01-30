import { tool } from "ai"
import { Container, TOKENS } from "../../container"
import { isOk } from "../../shared/types"
import {
  GetServicesUseCase,
  GetProductsUseCase,
  GetProfessionalsUseCase,
} from "../../application/use-cases/catalog"
import {
  getServicesSchema,
  getProductsSchema,
  getProfessionalsSchema,
} from "../schemas"
import { CatalogPresenter, ErrorPresenter } from "../presenters"

/**
 * Normaliza input que pode vir como undefined do Vercel AI SDK
 * quando a IA chama uma tool sem argumentos
 */
function normalizeInput<T>(input: T | undefined): T {
  return (input ?? {}) as T
}

/**
 * Cria as tools de catálogo
 */
export function createCatalogTools(
  container: Container,
  salonId: string,
  _clientPhone: string
) {
  return {
    getServices: tool({
      description:
        "Busca lista de serviços disponíveis no salão com preços e durações.",
      inputSchema: getServicesSchema,
      execute: async (input) => {
        try {
          const params = normalizeInput(input)
          const useCase = container.resolve<GetServicesUseCase>(
            TOKENS.GetServicesUseCase
          )

          const result = await useCase.execute({
            salonId,
            includeInactive: params.includeInactive,
          })

          if (!isOk(result)) {
            return ErrorPresenter.format(result.error)
          }

          return CatalogPresenter.servicesToJSON(result.data)
        } catch (error) {
          return ErrorPresenter.toJSON(error as Error)
        }
      },
    }),

    getProducts: tool({
      description: "Busca lista de produtos disponíveis no salão com preços.",
      inputSchema: getProductsSchema,
      execute: async (input) => {
        try {
          const params = normalizeInput(input)
          const useCase = container.resolve<GetProductsUseCase>(
            TOKENS.GetProductsUseCase
          )

          const result = await useCase.execute({
            salonId,
            includeInactive: params.includeInactive,
          })

          if (!isOk(result)) {
            return ErrorPresenter.format(result.error)
          }

          return CatalogPresenter.productsToJSON(result.data)
        } catch (error) {
          return ErrorPresenter.toJSON(error as Error)
        }
      },
    }),

    getProfessionals: tool({
      description:
        "Retorna lista de profissionais (barbeiros) do salão para mapear nomes a IDs.",
        inputSchema: getProfessionalsSchema,
      execute: async (input) => {
        try {
          const params = normalizeInput(input)
          const useCase = container.resolve<GetProfessionalsUseCase>(
            TOKENS.GetProfessionalsUseCase
          )

          const result = await useCase.execute({
            salonId,
            includeInactive: params.includeInactive,
          })

          if (!isOk(result)) {
            return ErrorPresenter.format(result.error)
          }

          return CatalogPresenter.professionalsToJSON(result.data)
        } catch (error) {
          return ErrorPresenter.toJSON(error as Error)
        }
      },
    }),
  }
}
