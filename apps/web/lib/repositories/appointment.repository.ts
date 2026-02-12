import { appointments, db, professionals, profiles, services, customers, and, asc, eq, gte, lte, desc } from "@repo/db"
import { ProfessionalService } from "@/lib/services/professional.service"

// ============================================================================
// DTOs (Data Transfer Objects)
// ============================================================================

export interface AppointmentDTO {
  id: string
  professionalId: string
  professionalName: string
  clientId: string
  clientName: string | null
  serviceId: string
  serviceName: string
  serviceDuration: number
  startTime: Date // UTC do banco
  endTime: Date   // UTC do banco
  status: "pending" | "confirmed" | "cancelled" | "completed"
  notes: string | null
}

export interface ProfessionalDTO {
  id: string
  name: string
  email: string
  phone: string | null
  isActive: boolean
  userId?: string | null // Para vincular com usuário logado
  role?: string // OWNER, MANAGER, STAFF
}

export interface AppointmentsResultDTO {
  professionals: ProfessionalDTO[]
  appointments: AppointmentDTO[]
}

// ============================================================================
// Repository Implementation
// ============================================================================

/**
 * Busca os profissionais ativos de um salão.
 * @param salonId ID do salão
 */
export async function getSalonProfessionals(salonId: string): Promise<ProfessionalDTO[]> {
  try {
    // Garante que salões SOLO tenham profissional criado automaticamente
    await ProfessionalService.ensureSoloProfessional(salonId)

    const professionalsList = await db.query.professionals.findMany({
      where: eq(professionals.salonId, salonId),
      columns: { id: true, name: true, email: true, phone: true, isActive: true, userId: true, role: true },
      orderBy: (professionals, { asc }) => [asc(professionals.name)],
    })

    return professionalsList.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      isActive: p.isActive,
      userId: p.userId,
      role: p.role,
    }))
  } catch (error) {
    console.error("Erro ao buscar profissionais no repositório:", error)
    throw new Error("Falha ao buscar profissionais do salão")
  }
}

/**
 * Busca agendamentos de um salão em um intervalo de datas.
 * @param params Objeto contendo salonId, startDate e endDate
 */
export async function getAppointmentsByRange({
  salonId,
  startDate,
  endDate,
}: {
  salonId: string
  startDate: Date
  endDate: Date
}): Promise<AppointmentDTO[]> {
  try {
    const result = await db
      .select({
        id: appointments.id,
        professionalId: appointments.professionalId,
        professionalName: professionals.name,
        clientId: appointments.clientId,
        clientName: customers.name,
        serviceId: appointments.serviceId,
        serviceName: services.name,
        serviceDuration: services.duration,
        startTime: appointments.date,
        endTime: appointments.endTime,
        status: appointments.status,
        notes: appointments.notes,
      })
      .from(appointments)
      .innerJoin(professionals, eq(appointments.professionalId, professionals.id))
      .innerJoin(customers, eq(appointments.clientId, customers.id))
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .where(
        and(
          eq(appointments.salonId, salonId),
          // A lógica original usava: lte(date, rangeEnd) E gte(endTime, rangeStart)
          // Isso captura qualquer agendamento que tenha intersecção com o intervalo.
          lte(appointments.date, endDate),
          gte(appointments.endTime, startDate)
        )
      )
      .orderBy(asc(appointments.date))

    return result
  } catch (error) {
    console.error("Erro ao buscar agendamentos no repositório:", error)
    throw new Error("Falha ao buscar agendamentos")
  }
}
