/**
 * DTO para serviço
 */
export interface ServiceDTO {
  id: string
  name: string
  description?: string | null
  duration: number // em minutos (duração de bloqueio / piso)
  durationFormatted: string // ex: "1h30min" ou faixa "6h a 7h"
  price: number
  priceFormatted: string // ex: "R$ 50,00", "R$ 600,00 - R$ 800,00" ou "Sob avaliação"
  priceOnRequest?: boolean // "Sob Avaliação"
  allowedWeekdays?: number[] | null // dias permitidos (0=Dom..6=Sáb); null = todos
  allowedStartTimes?: string[] | null // horários de início "HH:mm"; null = grade contínua
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
  isSpecialist?: boolean // preenchido quando filtrado por serviceId
}

/**
 * DTO para lista de profissionais
 */
export interface ProfessionalListDTO {
  professionals: ProfessionalDTO[]
  total: number
  message: string
}
