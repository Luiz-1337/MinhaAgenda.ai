/**
 * Serviço de busca fuzzy para serviços e profissionais (DOMAIN LAYER)
 */

import { and, eq, ilike } from "drizzle-orm"
import { db, services, professionals } from "@repo/db"

export interface ServiceSearchResult {
  id: string
  name: string
  duration: number
  price: string
}

export interface ProfessionalSearchResult {
  id: string
  name: string
}

export class FuzzySearchService {
  /**
   * Busca um serviço por nome (fuzzy search)
   */
  static async findServiceByName(
    salonId: string,
    name: string
  ): Promise<ServiceSearchResult> {
    const searchPattern = `%${name}%`
    const results = await db
      .select({
        id: services.id,
        name: services.name,
        duration: services.duration,
        price: services.price,
      })
      .from(services)
      .where(
        and(
          eq(services.salonId, salonId),
          ilike(services.name, searchPattern),
          eq(services.isActive, true)
        )
      )
      .limit(5)

    if (results.length === 0) {
      throw new Error(
        `Não encontrei nenhum serviço com o nome "${name}". Por favor, verifique o nome e tente novamente.`
      )
    }

    if (results.length > 1) {
      const exact = results.find((s) => s.name.toLowerCase() === name.toLowerCase())
      if (exact) return exact

      const names = results.map((s) => s.name).join(", ")
      throw new Error(
        `Encontrei múltiplos serviços parecidos: ${names}. Por favor, seja mais específico.`
      )
    }

    return results[0]
  }

  /**
   * Busca um profissional por nome (fuzzy search)
   */
  static async findProfessionalByName(
    salonId: string,
    name: string
  ): Promise<ProfessionalSearchResult> {
    const searchPattern = `%${name}%`
    const results = await db
      .select({
        id: professionals.id,
        name: professionals.name,
      })
      .from(professionals)
      .where(
        and(
          eq(professionals.salonId, salonId),
          ilike(professionals.name, searchPattern),
          eq(professionals.isActive, true)
        )
      )
      .limit(5)

    if (results.length === 0) {
      throw new Error(`Não encontrei nenhum profissional com o nome "${name}".`)
    }

    if (results.length > 1) {
      const exact = results.find((p) => p.name.toLowerCase() === name.toLowerCase())
      if (exact) return exact

      const names = results.map((p) => p.name).join(", ")
      throw new Error(
        `Encontrei múltiplos profissionais parecidos: ${names}. Por favor, especifique o nome completo ou sobrenome.`
      )
    }

    return results[0]
  }
}
