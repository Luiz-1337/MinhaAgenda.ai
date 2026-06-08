import { formatWeekdaysPtBr } from "@repo/db"
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
        ...(s.priceOnRequest ? { precoSobAvaliacao: true } : {}),
        ...(s.allowedWeekdays && s.allowedWeekdays.length > 0
          ? { diasAtendimento: formatWeekdaysPtBr(s.allowedWeekdays) }
          : {}),
        ...(s.allowedStartTimes && s.allowedStartTimes.length > 0
          ? { horariosDeInicio: s.allowedStartTimes }
          : {}),
      })),
      total: dto.total,
      message: dto.message,
      _instrucao:
        "Os IDs são para uso interno das tools (ex: addAppointment, checkAvailability). NUNCA mostre IDs ao cliente. " +
        "Informe nome, preço e duração. Se precoSobAvaliacao=true, diga que o valor é sob avaliação (não invente preço) e ainda assim ofereça agendar. " +
        "Se houver diasAtendimento/horariosDeInicio, o serviço só pode ser agendado nesses dias/horários — use checkAvailability, que já respeita isso.",
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
    const professionals = [...dto.professionals].sort(
      (a, b) => Number(b.isSpecialist ?? false) - Number(a.isSpecialist ?? false)
    )

    return {
      professionals: professionals.map((p) => ({
        id: p.id,
        name: p.name,
        services: p.services,
        ...(p.isSpecialist !== undefined ? { isSpecialist: p.isSpecialist } : {}),
      })),
      total: dto.total,
      message: dto.message,
      _instrucao:
        "Os IDs são para uso interno das tools. NUNCA mostre IDs ao cliente. " +
        "Quando isSpecialist=true, prefira esse profissional para o serviço (mas pode agendar com outro da lista se o cliente pedir).",
    }
  }
}
