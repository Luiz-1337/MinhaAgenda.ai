/**
 * DTO para serviço
 */
export interface ServiceDTO {
  id: string
  name: string
  description?: string | null
  duration: number // em minutos
  durationFormatted: string // ex: "1h30min"
  price: number
  priceFormatted: string // ex: "R$ 50,00"
  isActive: boolean
}

/**
 * DTO para lista de serviços
 */
export interface ServiceListDTO {
  services: ServiceDTO[]
  total: number
  message: string
}

/**
 * DTO para produto
 */
export interface ProductDTO {
  id: string
  name: string
  description?: string | null
  price: number
  priceFormatted: string
  isActive: boolean
}

/**
 * DTO para lista de produtos
 */
export interface ProductListDTO {
  products: ProductDTO[]
  total: number
  message: string
}

/**
 * DTO para profissional
 */
export interface ProfessionalDTO {
  id: string
  name: string
  isActive: boolean
  services: string[] // nomes dos serviços
  serviceIds: string[] // IDs dos serviços
}

/**
 * DTO para lista de profissionais
 */
export interface ProfessionalListDTO {
  professionals: ProfessionalDTO[]
  total: number
  message: string
}
