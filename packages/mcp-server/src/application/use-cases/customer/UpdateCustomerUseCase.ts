import { Result, ok, fail } from "../../../shared/types"
import { DomainError } from "../../../domain/errors"
import { CustomerNotFoundError, RequiredFieldError } from "../../../domain/errors"
import { ICustomerRepository } from "../../../domain/repositories"
import { CustomerDTO, UpdateCustomerDTO } from "../../dtos"

export class UpdateCustomerUseCase {
  constructor(private customerRepo: ICustomerRepository) {}

  async execute(
    input: UpdateCustomerDTO
  ): Promise<Result<CustomerDTO, DomainError>> {
    // Buscar cliente
    const customer = await this.customerRepo.findById(input.customerId)
    if (!customer) {
      return fail(new CustomerNotFoundError(input.customerId))
    }

    // Atualizar nome se fornecido. Este caso de uso atende a tool
    // updateCustomerName, que a IA chama com o nome que a PRÓPRIA cliente informou
    // na conversa: por isso o nome fica marcado como confirmado, o que libera o
    // cadastro dela na agenda oficial do salão (ver agenda-customer-name.service).
    if (input.name !== undefined) {
      if (!input.name || input.name.trim() === "") {
        return fail(new RequiredFieldError("name"))
      }
      customer.confirmName(input.name.trim())
    }

    // Atualizar email se fornecido
    if (input.email !== undefined) {
      customer.updateEmail(input.email || null)
    }

    // Persistir
    await this.customerRepo.update(customer)

    return ok({
      id: customer.id,
      phone: customer.phone.format(),
      phoneNormalized: customer.phone.normalize(),
      name: customer.name,
      email: customer.email,
      isNew: false,
      isIdentified: customer.isIdentified(),
    })
  }
}
