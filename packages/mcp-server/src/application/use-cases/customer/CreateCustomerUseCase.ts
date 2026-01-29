import { v4 as uuidv4 } from "uuid"
import { Result, ok, fail, isOk } from "../../../shared/types"
import { formatPhone } from "../../../shared/utils/phone.utils"
import { DomainError } from "../../../domain/errors"
import { DuplicatePhoneError, RequiredFieldError } from "../../../domain/errors"
import { Customer } from "../../../domain/entities"
import { Phone } from "../../../domain/value-objects"
import { ICustomerRepository } from "../../../domain/repositories"
import { CustomerDTO, CreateCustomerDTO } from "../../dtos"

export class CreateCustomerUseCase {
  constructor(private customerRepo: ICustomerRepository) {}

  async execute(
    input: CreateCustomerDTO
  ): Promise<Result<CustomerDTO, DomainError>> {
    // Validar campos obrigatórios
    if (!input.name || input.name.trim() === "") {
      return fail(new RequiredFieldError("name"))
    }

    // Validar telefone
    const phoneResult = Phone.create(input.phone)
    if (!isOk(phoneResult)) {
      return fail(phoneResult.error)
    }

    const normalizedPhone = phoneResult.data.normalize()

    // Verificar se já existe
    const existing = await this.customerRepo.findByPhone(normalizedPhone, input.salonId)

    if (existing) {
      // Retorna o cliente existente sem erro
      return ok({
        id: existing.id,
        phone: existing.phone.format(),
        phoneNormalized: existing.phone.normalize(),
        name: existing.name,
        email: existing.email,
        isNew: false,
        isIdentified: existing.isIdentified(),
      })
    }

    // Criar novo cliente
    const customer = Customer.create({
      id: uuidv4(),
      salonId: input.salonId,
      phone: normalizedPhone,
      name: input.name.trim(),
      email: input.email,
    })

    await this.customerRepo.save(customer)

    return ok({
      id: customer.id,
      phone: customer.phone.format(),
      phoneNormalized: customer.phone.normalize(),
      name: customer.name,
      email: customer.email,
      isNew: true,
      isIdentified: customer.isIdentified(),
    })
  }
}
