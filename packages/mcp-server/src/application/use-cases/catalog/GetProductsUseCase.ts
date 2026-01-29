import { Result, ok } from "../../../shared/types"
import { DomainError } from "../../../domain/errors"
import { IProductRepository } from "../../../domain/repositories"
import { ProductDTO, ProductListDTO } from "../../dtos"

export interface GetProductsInput {
  salonId: string
  includeInactive?: boolean
}

export class GetProductsUseCase {
  constructor(private productRepo: IProductRepository) {}

  async execute(
    input: GetProductsInput
  ): Promise<Result<ProductListDTO, DomainError>> {
    const products = await this.productRepo.findBySalon(
      input.salonId,
      input.includeInactive
    )

    const productDTOs: ProductDTO[] = products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.priceAmount,
      priceFormatted: product.formatPrice(),
      isActive: product.isActive,
    }))

    return ok({
      products: productDTOs,
      total: productDTOs.length,
      message: `${productDTOs.length} produto(s) encontrado(s)`,
    })
  }
}
