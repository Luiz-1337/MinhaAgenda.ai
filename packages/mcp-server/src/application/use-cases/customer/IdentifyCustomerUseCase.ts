import { v4 as uuidv4 } from "uuid"
import { Result, ok, fail, isOk } from "../../../shared/types"
import { formatPhone, normalizePhone } from "../../../shared/utils/phone.utils"
import { DomainError } from "../../../domain/errors"
import { InvalidPhoneError } from "../../../domain/errors"
import { Customer } from "../../../domain/entities"
import { Phone } from "../../../domain/value-objects"
import { ICustomerRepository } from "../../../domain/repositories"
import { IdentifyCustomerResultDTO, IdentifyCustomerDTO } from "../../dtos"

export class IdentifyCustomerUseCase {
  constructor(private customerRepo: ICustomerRepository) {}

  async execute(
    input: IdentifyCustomerDTO
  ): Promise<Result<IdentifyCustomerResultDTO, DomainError>> {
    // Validar telefone
    const phoneResult = Phone.create(input.phone)
    if (!isOk(phoneResult)) {
      return fail(phoneResult.error)
    }

    const normalizedPhone = phoneResult.data.normalize()

    // Buscar cliente existente
    const existing = await this.customerRepo.findByPhone(normalizedPhone, input.salonId)

    if (existing) {
      return ok({
        id: existing.id,
        name: existing.name,
        phone: existing.phone.format(),
        found: true,
        created: false,
        message: `Cliente encontrado: ${existing.name}`,
      })
    }

    // Se nome foi fornecido, criar novo cliente
    if (input.name && input.name.trim() !== "") {
      const newCustomer = Customer.create({
        id: uuidv4(),
        salonId: input.salonId,
        phone: normalizedPhone,
        name: input.name.trim(),
      })

      await this.customerRepo.save(newCustomer)

      return ok({
        id: newCustomer.id,
        name: newCustomer.name,
        phone: formatPhone(normalizedPhone),
        found: false,
        created: true,
        message: `Novo cliente criado: ${newCustomer.name}`,
      })
    }

    // Cliente não encontrado e nome não fornecido
    return ok({
      id: "",
      name: "",
      phone: formatPhone(normalizedPhone),
      found: false,
      created: false,
      message: "Cliente não encontrado. Forneça o nome para cadastrar.",
    })
  }
}
