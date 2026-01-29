export interface Lead {
  id: string
  salonId: string
  phoneNumber: string
  status: "new" | "contacted" | "recently_scheduled" | "cold"
  notes?: string | null
  lastContactAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Interface para persistência de leads
 */
export interface ILeadRepository {
  /**
   * Busca um lead por telefone em um salão
   */
  findByPhone(phoneNumber: string, salonId: string): Promise<Lead | null>

  /**
   * Busca leads de um salão
   */
  findBySalon(salonId: string): Promise<Lead[]>

  /**
   * Salva ou atualiza um lead (upsert)
   */
  upsert(lead: Omit<Lead, "id" | "createdAt" | "updatedAt">): Promise<Lead>

  /**
   * Atualiza o status de um lead
   */
  updateStatus(id: string, status: Lead["status"], notes?: string): Promise<void>
}
