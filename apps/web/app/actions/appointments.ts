"use server"

import { and, eq, gte, lt, gt } from "drizzle-orm"
import { createClient } from "@/lib/supabase/server"
import { db, appointments, professionals, profiles, services, salons } from "@repo/db"
import {
  startOfDayBrazil,
  endOfDayBrazil,
  startOfWeekBrazil,
  endOfWeekBrazil,
  startOfMonthBrazil,
  endOfMonthBrazil,
  fromBrazilTime,
} from "@/lib/utils/timezone.utils"

export interface DailyAppointment {
  id: string
  professionalId: string
  professionalName: string
  clientId: string
  clientName: string | null
  serviceId: string
  serviceName: string
  serviceDuration: number
  startTime: Date
  endTime: Date
  status: "pending" | "confirmed" | "cancelled" | "completed"
  notes: string | null
}

export interface ProfessionalInfo {
  id: string
  name: string
  email: string
  phone: string | null
  isActive: boolean
}

export interface DailyAppointmentsResult {
  professionals: ProfessionalInfo[]
  appointments: DailyAppointment[]
}

export type WeeklyAppointmentsResult = DailyAppointmentsResult
export type MonthlyAppointmentsResult = DailyAppointmentsResult

/**
 * Obtém todos os profissionais e agendamentos de um salão para uma data específica
 */
export async function getDailyAppointments(
  salonId: string,
  date: Date | string
): Promise<DailyAppointmentsResult | { error: string }> {
  if (!salonId) {
    return { error: "salonId é obrigatório" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  // Verifica se o usuário tem acesso ao salão
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: {
      id: true,
      ownerId: true,
    },
  })

  if (!salon || salon.ownerId !== user.id) {
    return { error: "Acesso negado a este salão" }
  }

  // Normaliza a data (assumindo que vem no horário de Brasília)
  const targetDate = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(targetDate.getTime())) {
    return { error: "Data inválida" }
  }

  // Calcula início e fim do dia no horário de Brasília (converte para UTC para query)
  const dayStart = startOfDayBrazil(targetDate)
  const dayEnd = endOfDayBrazil(targetDate)

  try {
    // Busca todos os profissionais do salão
    const professionalsList = await db.query.professionals.findMany({
      where: eq(professionals.salonId, salonId),
      columns: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
      },
      orderBy: (professionals, { asc }) => [asc(professionals.name)],
    })

    const professionalsInfo: ProfessionalInfo[] = professionalsList.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      isActive: p.isActive,
    }))

    // Busca todos os agendamentos do dia
    const appointmentsList = await db
      .select({
        id: appointments.id,
        professionalId: appointments.professionalId,
        professionalName: professionals.name,
        clientId: appointments.clientId,
        clientName: profiles.fullName,
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
      .innerJoin(profiles, eq(appointments.clientId, profiles.id))
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .where(
        and(
          eq(appointments.salonId, salonId),
          lt(appointments.date, dayEnd),
          gt(appointments.endTime, dayStart)
        )
      )
      .orderBy(appointments.date)

    // Converte as datas de UTC (banco) para horário de Brasília
    const appointmentsInfo: DailyAppointment[] = appointmentsList.map((apt) => ({
      id: apt.id,
      professionalId: apt.professionalId,
      professionalName: apt.professionalName,
      clientId: apt.clientId,
      clientName: apt.clientName,
      serviceId: apt.serviceId,
      serviceName: apt.serviceName,
      serviceDuration: apt.serviceDuration,
      startTime: fromBrazilTime(apt.startTime),
      endTime: fromBrazilTime(apt.endTime),
      status: apt.status,
      notes: apt.notes,
    }))

    return {
      professionals: professionalsInfo,
      appointments: appointmentsInfo,
    }
  } catch (error) {
    console.error("Erro ao buscar agendamentos diários:", error)
    return { error: "Erro ao buscar agendamentos" }
  }
}

/**
 * Obtém todos os profissionais e agendamentos de um salão para uma semana específica
 */
export async function getWeeklyAppointments(
  salonId: string,
  date: Date | string
): Promise<WeeklyAppointmentsResult | { error: string }> {
  if (!salonId) {
    return { error: "salonId é obrigatório" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  // Verifica se o usuário tem acesso ao salão
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: {
      id: true,
      ownerId: true,
    },
  })

  if (!salon || salon.ownerId !== user.id) {
    return { error: "Acesso negado a este salão" }
  }

  // Normaliza a data (assumindo que vem no horário de Brasília)
  const targetDate = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(targetDate.getTime())) {
    return { error: "Data inválida" }
  }

  // Calcula início e fim da semana no horário de Brasília (converte para UTC para query)
  const weekStart = startOfWeekBrazil(targetDate, { weekStartsOn: 0 })
  const weekEnd = endOfWeekBrazil(targetDate, { weekStartsOn: 0 })

  try {
    // Busca todos os profissionais do salão
    const professionalsList = await db.query.professionals.findMany({
      where: eq(professionals.salonId, salonId),
      columns: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
      },
      orderBy: (professionals, { asc }) => [asc(professionals.name)],
    })

    const professionalsInfo: ProfessionalInfo[] = professionalsList.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      isActive: p.isActive,
    }))

    // Busca todos os agendamentos da semana
    const appointmentsList = await db
      .select({
        id: appointments.id,
        professionalId: appointments.professionalId,
        professionalName: professionals.name,
        clientId: appointments.clientId,
        clientName: profiles.fullName,
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
      .innerJoin(profiles, eq(appointments.clientId, profiles.id))
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .where(
        and(
          eq(appointments.salonId, salonId),
          lt(appointments.date, weekEnd),
          gt(appointments.endTime, weekStart)
        )
      )
      .orderBy(appointments.date)

    // Converte as datas de UTC (banco) para horário de Brasília
    const appointmentsInfo: DailyAppointment[] = appointmentsList.map((apt) => ({
      id: apt.id,
      professionalId: apt.professionalId,
      professionalName: apt.professionalName,
      clientId: apt.clientId,
      clientName: apt.clientName,
      serviceId: apt.serviceId,
      serviceName: apt.serviceName,
      serviceDuration: apt.serviceDuration,
      startTime: fromBrazilTime(apt.startTime),
      endTime: fromBrazilTime(apt.endTime),
      status: apt.status,
      notes: apt.notes,
    }))

    return {
      professionals: professionalsInfo,
      appointments: appointmentsInfo,
    }
  } catch (error) {
    console.error("Erro ao buscar agendamentos semanais:", error)
    return { error: "Erro ao buscar agendamentos" }
  }
}

/**
 * Obtém todos os profissionais e agendamentos de um salão para um mês específico
 */
export async function getMonthlyAppointments(
  salonId: string,
  date: Date | string
): Promise<MonthlyAppointmentsResult | { error: string }> {
  if (!salonId) {
    return { error: "salonId é obrigatório" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  // Verifica se o usuário tem acesso ao salão
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: {
      id: true,
      ownerId: true,
    },
  })

  if (!salon || salon.ownerId !== user.id) {
    return { error: "Acesso negado a este salão" }
  }

  // Normaliza a data (assumindo que vem no horário de Brasília)
  const targetDate = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(targetDate.getTime())) {
    return { error: "Data inválida" }
  }

  // Calcula início e fim do mês no horário de Brasília (converte para UTC para query)
  const monthStart = startOfMonthBrazil(targetDate)
  const monthEnd = endOfMonthBrazil(targetDate)

  try {
    // Busca todos os profissionais do salão
    const professionalsList = await db.query.professionals.findMany({
      where: eq(professionals.salonId, salonId),
      columns: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
      },
      orderBy: (professionals, { asc }) => [asc(professionals.name)],
    })

    const professionalsInfo: ProfessionalInfo[] = professionalsList.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      isActive: p.isActive,
    }))

    // Busca todos os agendamentos do mês
    const appointmentsList = await db
      .select({
        id: appointments.id,
        professionalId: appointments.professionalId,
        professionalName: professionals.name,
        clientId: appointments.clientId,
        clientName: profiles.fullName,
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
      .innerJoin(profiles, eq(appointments.clientId, profiles.id))
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .where(
        and(
          eq(appointments.salonId, salonId),
          lt(appointments.date, monthEnd),
          gt(appointments.endTime, monthStart)
        )
      )
      .orderBy(appointments.date)

    // Converte as datas de UTC (banco) para horário de Brasília
    const appointmentsInfo: DailyAppointment[] = appointmentsList.map((apt) => ({
      id: apt.id,
      professionalId: apt.professionalId,
      professionalName: apt.professionalName,
      clientId: apt.clientId,
      clientName: apt.clientName,
      serviceId: apt.serviceId,
      serviceName: apt.serviceName,
      serviceDuration: apt.serviceDuration,
      startTime: fromBrazilTime(apt.startTime),
      endTime: fromBrazilTime(apt.endTime),
      status: apt.status,
      notes: apt.notes,
    }))

    return {
      professionals: professionalsInfo,
      appointments: appointmentsInfo,
    }
  } catch (error) {
    console.error("Erro ao buscar agendamentos mensais:", error)
    return { error: "Erro ao buscar agendamentos" }
  }
}

