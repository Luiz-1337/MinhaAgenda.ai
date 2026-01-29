/**
 * DTO para transferência de dados de cliente
 */
export interface CustomerDTO {
  id: string
  phone: string // formatado para exibição
  phoneNormalized: string // apenas dígitos
  name: string
  email?: string | null
  isNew: boolean
  isIdentified: boolean
}

/**
 * DTO para criação de cliente
 */
export interface CreateCustomerDTO {
  salonId: string
  phone: string
  name: string
  email?: string
}

/**
 * DTO para atualização de cliente
 */
export interface UpdateCustomerDTO {
  customerId: string
  name?: string
  email?: string
}

/**
 * DTO para identificação de cliente
 */
export interface IdentifyCustomerDTO {
  phone: string
  name?: string
  salonId: string
}

/**
 * DTO de resultado de identificação
 */
export interface IdentifyCustomerResultDTO {
  id: string
  name: string
  phone: string
  found: boolean
  created: boolean
  message: string
}
