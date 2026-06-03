import { TOKENS } from "../../container"
import { unwrap } from "../../shared/types"
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
import { CatalogPresenter } from "../presenters"
import { defineTool } from "./defineTool"
import type { ToolContext, ToolSet } from "./types"

/**
 * Cria as tools de catálogo
 */
export function createCatalogTools(ctx: ToolContext): ToolSet {
  return {
    getServices: defineTool(ctx, {
      description:
        "Lista todos os serviços do salão com nomes, preços e durações. Chame ANTES de informar preços ao cliente. Retorna serviceId necessário para checkAvailability e addAppointment. Não precisa de parâmetros.",
      inputSchema: getServicesSchema,
      handler: async (input, { container, salonId }) => {
        const result = await container
          .resolve<GetServicesUseCase>(TOKENS.GetServicesUseCase)
          .execute({
            salonId,
            includeInactive: input.includeInactive,
          })

        return CatalogPresenter.servicesToJSON(unwrap(result))
      },
    }),

    getProducts: defineTool(ctx, {
      description: "Busca lista de produtos disponíveis no salão com preços.",
      inputSchema: getProductsSchema,
      handler: async (input, { container, salonId }) => {
        const result = await container
          .resolve<GetProductsUseCase>(TOKENS.GetProductsUseCase)
          .execute({
            salonId,
            includeInactive: input.includeInactive,
          })

        return CatalogPresenter.productsToJSON(unwrap(result))
      },
    }),

    getProfessionals: defineTool(ctx, {
      description:
        "Lista profissionais do salão e seus serviços. Retorna professionalId necessário para checkAvailability e addAppointment. Informe serviceId para ver só quem REALIZA o serviço, com os especialistas marcados (isSpecialist) e listados primeiro. Use quando o cliente perguntar sobre profissionais ou para obter o ID de um profissional.",
      inputSchema: getProfessionalsSchema,
      handler: async (input, { container, salonId }) => {
        const result = await container
          .resolve<GetProfessionalsUseCase>(TOKENS.GetProfessionalsUseCase)
          .execute({
            salonId,
            includeInactive: input.includeInactive,
            serviceId: input.serviceId,
          })

        return CatalogPresenter.professionalsToJSON(unwrap(result))
      },
    }),
  }
}
