import { CustomerDTO, IdentifyCustomerResultDTO } from "../../application/dtos"

/**
 * Presenter para formatação de dados de cliente
 */
export class CustomerPresenter {
  /**
   * Formata resultado de identificação
   */
  static formatIdentification(dto: IdentifyCustomerResultDTO): string {
    if (dto.found) {
      return `Cliente encontrado: ${dto.name} (${dto.phone})`
    }

    if (dto.created) {
      return `Novo cliente cadastrado: ${dto.name} (${dto.phone})`
    }

    return `Cliente não encontrado. ${dto.message}`
  }

  /**
   * Formata dados do cliente
   */
  static format(dto: CustomerDTO): string {
    const status = dto.isNew ? "Novo cliente" : "Cliente existente"
    const identified = dto.isIdentified ? "" : " (nome não confirmado)"

    return `${status}: ${dto.name}${identified} - ${dto.phone}`
  }

  /**
   * Formata para JSON
   */
  static toJSON(dto: CustomerDTO): Record<string, unknown> {
    return {
      id: dto.id,
      name: dto.name,
      phone: dto.phone,
      email: dto.email,
      isNew: dto.isNew,
      isIdentified: dto.isIdentified,
    }
  }

  /**
   * Formata resultado de identificação para JSON
   */
  static identificationToJSON(dto: IdentifyCustomerResultDTO): Record<string, unknown> {
    return {
      id: dto.id,
      name: dto.name,
      phone: dto.phone,
      found: dto.found,
      created: dto.created,
      message: dto.message,
    }
  }
}
