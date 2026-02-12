/**
 * Serviço para segmentação de leads/customers para campanhas
 */

import { db, customers, appointments, services, profiles, leads, and, eq, gte, sql, desc, inArray } from "@repo/db"

export interface SegmentationCriteria {
  distanceRadius?: string // "all" | "1km" | "5km" | "10km"
  lastVisit?: string // "any" | "30days" | "60days" | "never"
  gender?: string // "all" | "male" | "female"
  serviceIds?: string[] // IDs de serviços realizados
}

export interface SegmentedLead {
  id: string
  type: 'customer' | 'lead'
  name: string
  phone: string
  email: string | null
  customerId?: string
  leadId?: string
  profileId?: string
  lastVisitDate: Date | null
  lastServiceName: string | null
}

export class SegmentationService {
  /**
   * Busca leads/customers baseado em critérios de segmentação
   */
  static async getSegmentedLeads(
    criteria: SegmentationCriteria,
    salonId: string
  ): Promise<SegmentedLead[]> {
    // Para simplificar inicialmente, vamos buscar apenas customers do salão
    // Filtros avançados (última visita, serviços) serão adicionados depois

    const allCustomers = await db.query.customers.findMany({
      where: eq(customers.salonId, salonId),
      columns: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
    })

    const leadsList: SegmentedLead[] = []

    for (const customer of allCustomers) {
      // Busca último agendamento do customer (via telefone)
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.phone, customer.phone),
        columns: { id: true },
      })

      let lastAppointment = null
      let lastServiceName: string | null = null

      if (profile) {
        lastAppointment = await db.query.appointments.findFirst({
          where: and(
            eq(appointments.salonId, salonId),
            eq(appointments.clientId, profile.id)
          ),
          orderBy: desc(appointments.date),
          columns: {
            date: true,
            serviceId: true,
          },
        })

        if (lastAppointment?.serviceId) {
          const service = await db.query.services.findFirst({
            where: eq(services.id, lastAppointment.serviceId),
            columns: { name: true },
          })
          lastServiceName = service?.name || null
        }
      }

      // Aplica filtro de última visita
      if (criteria.lastVisit && criteria.lastVisit !== "any") {
        if (!lastAppointment) {
          if (criteria.lastVisit !== "never") {
            continue // Se nunca visitou mas filtro não é "never", pular
          }
        } else {
          const daysSinceLastVisit = Math.floor(
            (Date.now() - lastAppointment.date.getTime()) / (1000 * 60 * 60 * 24)
          )

          if (criteria.lastVisit === "30days" && daysSinceLastVisit < 30) {
            continue
          }
          if (criteria.lastVisit === "60days" && daysSinceLastVisit < 60) {
            continue
          }
          if (criteria.lastVisit === "never") {
            continue // Se visitou, não atende ao critério "never"
          }
        }
      }

      // Aplica filtro de serviços (se especificado)
      if (criteria.serviceIds && criteria.serviceIds.length > 0) {
        if (!profile || !lastAppointment) {
          continue // Se não tem histórico, não atende ao filtro de serviços
        }

        if (!criteria.serviceIds.includes(lastAppointment.serviceId)) {
          continue // Último serviço não está na lista
        }
      }

      // Filtro de gênero não será aplicado inicialmente (não temos esse campo ainda)
      // Filtro de distância também não será aplicado inicialmente

      leadsList.push({
        id: customer.id,
        type: 'customer',
        name: customer.name,
        phone: customer.phone,
        email: customer.email || null,
        customerId: customer.id,
        profileId: profile?.id,
        lastVisitDate: lastAppointment?.date || null,
        lastServiceName,
      })
    }

    return leadsList
  }

  /**
   * Retorna apenas a contagem de leads encontrados (para preview)
   */
  static async getSegmentedLeadsCount(
    criteria: SegmentationCriteria,
    salonId: string
  ): Promise<number> {
    const leads = await this.getSegmentedLeads(criteria, salonId)
    return leads.length
  }
}
