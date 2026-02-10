import { tool } from "ai"
import { Container, TOKENS } from "../../container"
import { isOk } from "../../shared/types"
import {
  GetServicesUseCase,
  GetProductsUseCase,
  GetProfessionalsUseCase,
} from "../../application/use-cases/catalog"
import { ISalonRepository } from "../../domain/repositories"
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
          console.log("[MCP] getServices called with:", { salonId, params })

          const useCase = container.resolve<GetServicesUseCase>(
            TOKENS.GetServicesUseCase
          )

          const result = await useCase.execute({
            salonId,
            includeInactive: params.includeInactive,
          })

          console.log("[MCP] getServices result:", { isOk: isOk(result), data: isOk(result) ? result.data : result.error })

          if (!isOk(result)) {
            return ErrorPresenter.format(result.error)
          }

          const jsonResult = CatalogPresenter.servicesToJSON(result.data)
          console.log("[MCP] getServices returning:", JSON.stringify(jsonResult, null, 2).substring(0, 500))
          return jsonResult
        } catch (error) {
          console.error("[MCP] getServices error:", error)
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

          // Verificar plano do salão
          const salonRepo = container.resolve<ISalonRepository>(TOKENS.SalonRepository)
          const salon = await salonRepo.findById(salonId)

          if (salon && salon.isSoloPlan()) {
            return JSON.stringify({
              error: true,
              message: "Este recurso não está disponível para o plano SOLO (apenas 1 profissional). Utilize o único profissional que tenha conhecimento",
              code: "PLAN_RESTRICTION"
            })
          }

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
