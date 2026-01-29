import { db, professionals, professionalServices, and, eq, ilike } from "@repo/db"
import { IProfessionalRepository } from "../../domain/repositories"
import { Professional } from "../../domain/entities"
import { ProfessionalMapper } from "../mappers"

/**
 * Implementação do repositório de profissionais usando Drizzle ORM
 */
export class DrizzleProfessionalRepository implements IProfessionalRepository {
  async findById(id: string): Promise<Professional | null> {
    const row = await db.query.professionals.findFirst({
      where: eq(professionals.id, id),
    })

    if (!row) return null

    // Busca os serviços do profissional
    const services = await db.query.professionalServices.findMany({
      where: eq(professionalServices.professionalId, id),
    })

    const serviceIds = services.map((s) => s.serviceId)

    return ProfessionalMapper.toDomain(
      {
        id: row.id,
        salonId: row.salonId,
        userId: row.userId,
        name: row.name,
        email: row.email,
        phone: row.phone,
        role: row.role,
        isActive: row.isActive,
        googleCalendarId: row.googleCalendarId,
        commissionRate: row.commissionRate ? parseFloat(row.commissionRate) : null,
        createdAt: row.createdAt,
      },
      serviceIds
    )
  }

  async findByName(name: string, salonId: string): Promise<Professional | null> {
    const row = await db.query.professionals.findFirst({
      where: and(
        eq(professionals.salonId, salonId),
        ilike(professionals.name, `%${name}%`)
      ),
    })

    if (!row) return null

    const services = await db.query.professionalServices.findMany({
      where: eq(professionalServices.professionalId, row.id),
    })

    const serviceIds = services.map((s) => s.serviceId)

    return ProfessionalMapper.toDomain(
      {
        id: row.id,
        salonId: row.salonId,
        userId: row.userId,
        name: row.name,
        email: row.email,
        phone: row.phone,
        role: row.role,
        isActive: row.isActive,
        googleCalendarId: row.googleCalendarId,
        commissionRate: row.commissionRate ? parseFloat(row.commissionRate) : null,
        createdAt: row.createdAt,
      },
      serviceIds
    )
  }

  async findBySalon(salonId: string, includeInactive = false): Promise<Professional[]> {
    const conditions = [eq(professionals.salonId, salonId)]
    if (!includeInactive) {
      conditions.push(eq(professionals.isActive, true))
    }

    const rows = await db.query.professionals.findMany({
      where: and(...conditions),
      orderBy: (professionals, { asc }) => [asc(professionals.name)],
    })

    // Para simplificar, retorna sem buscar serviços individualmente
    // Em produção, poderia usar uma query com join
    return rows.map((row) =>
      ProfessionalMapper.toDomain(
        {
          id: row.id,
          salonId: row.salonId,
          userId: row.userId,
          name: row.name,
          email: row.email,
          phone: row.phone,
          role: row.role,
          isActive: row.isActive,
          googleCalendarId: row.googleCalendarId,
          commissionRate: row.commissionRate ? parseFloat(row.commissionRate) : null,
          createdAt: row.createdAt,
        },
        [] // Sem serviços carregados para lista
      )
    )
  }

  async findAvailable(salonId: string, _date: Date): Promise<Professional[]> {
    // Por enquanto, retorna todos os profissionais ativos
    return this.findBySalon(salonId, false)
  }

  async findByService(serviceId: string, salonId: string): Promise<Professional[]> {
    // Busca profissionais que realizam o serviço
    const profServices = await db.query.professionalServices.findMany({
      where: eq(professionalServices.serviceId, serviceId),
    })

    const professionalIds = profServices.map((ps) => ps.professionalId)

    if (professionalIds.length === 0) {
      return []
    }

    const rows = await db.query.professionals.findMany({
      where: and(
        eq(professionals.salonId, salonId),
        eq(professionals.isActive, true)
      ),
    })

    // Filtra apenas os que realizam o serviço
    const filteredRows = rows.filter((r) => professionalIds.includes(r.id))

    return filteredRows.map((row) =>
      ProfessionalMapper.toDomain(
        {
          id: row.id,
          salonId: row.salonId,
          userId: row.userId,
          name: row.name,
          email: row.email,
          phone: row.phone,
          role: row.role,
          isActive: row.isActive,
          googleCalendarId: row.googleCalendarId,
          commissionRate: row.commissionRate ? parseFloat(row.commissionRate) : null,
          createdAt: row.createdAt,
        },
        [serviceId] // Sabemos que ele faz pelo menos este serviço
      )
    )
  }

  async save(professional: Professional): Promise<void> {
    const data = ProfessionalMapper.toPersistence(professional)

    await db.insert(professionals).values({
      salonId: data.salonId,
      userId: data.userId ?? null,
      name: data.name,
      email: data.email ?? "",
      phone: data.phone ?? null,
      role: (data.role ?? "STAFF") as "OWNER" | "MANAGER" | "STAFF",
      isActive: data.isActive,
      googleCalendarId: data.googleCalendarId ?? null,
      commissionRate: data.commissionRate?.toString() ?? "0",
    })

    // Salva os serviços
    const services = professional.services
    if (services.length > 0) {
      await db.insert(professionalServices).values(
        services.map((serviceId) => ({
          professionalId: data.id,
          serviceId,
        }))
      )
    }
  }

  async update(professional: Professional): Promise<void> {
    const data = ProfessionalMapper.toPersistence(professional)

    await db
      .update(professionals)
      .set({
        name: data.name,
        email: data.email ?? "",
        phone: data.phone ?? null,
        role: (data.role ?? "STAFF") as "OWNER" | "MANAGER" | "STAFF",
        isActive: data.isActive,
        googleCalendarId: data.googleCalendarId ?? null,
        commissionRate: data.commissionRate?.toString() ?? "0",
      })
      .where(eq(professionals.id, data.id))
  }
}
