import {
  ServiceListDTO,
  ProductListDTO,
  ProfessionalListDTO,
} from "../../application/dtos"

/**
 * Presenter para formatação de dados do catálogo
 */
export class CatalogPresenter {
  /**
   * Formata lista de serviços
   */
  static formatServices(dto: ServiceListDTO): string {
    if (dto.services.length === 0) {
      return "Nenhum serviço disponível no momento."
    }

    const lines = [
      `📋 Serviços disponíveis (${dto.total}):`,
      "",
    ]

    for (const service of dto.services) {
      lines.push(
        `• ${service.name}`,
        `  💰 ${service.priceFormatted} | ⏱️ ${service.durationFormatted}`,
        service.description ? `  📝 ${service.description}` : "",
      )
    }

    return lines.filter(Boolean).join("\n")
  }

  /**
   * Formata lista de produtos
   */
  static formatProducts(dto: ProductListDTO): string {
    if (dto.products.length === 0) {
      return "Nenhum produto disponível no momento."
    }

    const lines = [
      `🛍️ Produtos disponíveis (${dto.total}):`,
      "",
    ]

    for (const product of dto.products) {
      lines.push(
        `• ${product.name} - ${product.priceFormatted}`,
        product.description ? `  📝 ${product.description}` : "",
      )
    }

    return lines.filter(Boolean).join("\n")
  }

  /**
   * Formata lista de profissionais
   */
  static formatProfessionals(dto: ProfessionalListDTO): string {
    if (dto.professionals.length === 0) {
      return "Nenhum profissional disponível no momento."
    }

    const lines = [
      `👥 Profissionais disponíveis (${dto.total}):`,
      "",
    ]

    for (const professional of dto.professionals) {
      const services =
        professional.services.length > 0
          ? professional.services.join(", ")
          : "Todos os serviços"

      lines.push(
        `• ${professional.name}`,
        `  📋 Serviços: ${services}`,
      )
    }

    return lines.join("\n")
  }

  /**
   * Formata serviços para JSON
   */
  static servicesToJSON(dto: ServiceListDTO): Record<string, unknown> {
    return {
      services: dto.services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        duration: s.duration,
        durationFormatted: s.durationFormatted,
        price: s.price,
        priceFormatted: s.priceFormatted,
      })),
      total: dto.total,
      message: dto.message,
    }
  }

  /**
   * Formata produtos para JSON
   */
  static productsToJSON(dto: ProductListDTO): Record<string, unknown> {
    return {
      products: dto.products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        priceFormatted: p.priceFormatted,
      })),
      total: dto.total,
      message: dto.message,
    }
  }

  /**
   * Formata profissionais para JSON
   */
  static professionalsToJSON(dto: ProfessionalListDTO): Record<string, unknown> {
    return {
      professionals: dto.professionals.map((p) => ({
        id: p.id,
        name: p.name,
        services: p.services,
        serviceIds: p.serviceIds,
      })),
      total: dto.total,
      message: dto.message,
    }
  }
}
