import { Result, ok, fail } from "../../../shared/types"
import { DomainError } from "../../../domain/errors"
import { CustomerNotFoundError } from "../../../domain/errors"
import { ICustomerRepository } from "../../../domain/repositories"
import { CustomerPreferenceDTO } from "../../dtos"

export interface SaveCustomerPreferenceInput {
  salonId: string
  customerId: string
  key: string
  value: string | number | boolean
}

export class SaveCustomerPreferenceUseCase {
  constructor(private customerRepo: ICustomerRepository) {}

  async execute(
    input: SaveCustomerPreferenceInput
  ): Promise<Result<CustomerPreferenceDTO, DomainError>> {
    // Buscar cliente
    const customer = await this.customerRepo.findById(input.customerId)

    if (!customer) {
      // Tentar buscar por telefone (customerId pode ser telefone)
      const customerByPhone = await this.customerRepo.findByPhone(
        input.customerId,
        input.salonId
      )

      if (!customerByPhone) {
        return fail(new CustomerNotFoundError(input.customerId))
      }

      // Usar cliente encontrado por telefone
      customerByPhone.setPreference(input.key, input.value)
      await this.customerRepo.update(customerByPhone)

      return ok({
        customerId: customerByPhone.id,
        key: input.key,
        value: input.value,
        message: `Preferência "${input.key}" salva com sucesso`,
      })
    }

    // Salvar preferência
    customer.setPreference(input.key, input.value)
    await this.customerRepo.update(customer)

    return ok({
      customerId: customer.id,
      key: input.key,
      value: input.value,
      message: `Preferência "${input.key}" salva com sucesso`,
    })
  }
}
