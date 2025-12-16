"use server"

import { and, eq, gte, lte } from "drizzle-orm"

import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types/common"
import {
  endOfDayBrazil,
  endOfMonthBrazil,
  endOfWeekBrazil,
  fromBrazilTime,
  startOfDayBrazil,
  startOfMonthBrazil,
  startOfWeekBrazil,
} from "@/lib/utils/timezone.utils"

import { appointments, db, domainServices as sharedServices, professionals, profiles, salons, services } from "@repo/db"

/**
 * Informações de um agendamento formatado para exibição.
 */
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

/**
 * Informações básicas de um profissional.
 */
export interface ProfessionalInfo {
  id: string
  name: string
  email: string
  phone: string | null
  isActive: boolean
}

/**
 * Resultado da busca de agendamentos diários.
 */
export interface DailyAppointmentsResult {
  professionals: ProfessionalInfo[]
  appointments: DailyAppointment[]
}

/**
 * Resultado da busca de agendamentos semanais.
 */
export type WeeklyAppointmentsResult = DailyAppointmentsResult

/**
 * Resultado da busca de agendamentos mensais.
 */
export type MonthlyAppointmentsResult = DailyAppointmentsResult

/**
 * Busca agendamentos e profissionais de um salão em um intervalo de datas.
 * 
 * **Validações:**
 * - Verifica autenticação do usuário
 * - Verifica se o usuário é dono do salão
 * 
 * **Conversão de Timezone:**
 * - As datas são armazenadas em UTC no banco
 * - São convertidas para horário de Brasília antes de retornar
 * 
 * @param salonId - ID do salão (UUID)
 * @param rangeStart - Início do intervalo (Date em UTC)
 * @param rangeEnd - Fim do intervalo (Date em UTC)
 * 
 * @returns Objeto com profissionais e agendamentos, ou erro
 * 
 * @throws Não lança exceções, retorna erro via objeto de retorno
 */
async function fetchAppointments(
  salonId: string,
  rangeStart: Date,
  rangeEnd: Date
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

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { id: true, ownerId: true },
  })

  if (!salon || salon.ownerId !== user.id) {
    return { error: "Acesso negado a este salão" }
  }

  try {
    const professionalsList = await db.query.professionals.findMany({
      where: eq(professionals.salonId, salonId),
      columns: { id: true, name: true, email: true, phone: true, isActive: true },
      orderBy: (professionals, { asc }) => [asc(professionals.name)],
    })

    const professionalsInfo: ProfessionalInfo[] = professionalsList.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      isActive: p.isActive,
    }))

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
      .where(and(
        eq(appointments.salonId, salonId),
        lte(appointments.date, rangeEnd),
        gte(appointments.endTime, rangeStart)
      ))
      .orderBy(appointments.date)

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

    return { professionals: professionalsInfo, appointments: appointmentsInfo }
  } catch (error) {
    console.error("Erro ao buscar agendamentos:", error)
    return { error: "Erro ao buscar agendamentos" }
  }
}

/**
 * Obtém todos os profissionais e agendamentos de um salão para uma data específica.
 * 
 * **Timezone:**
 * - A data fornecida é interpretada como horário de Brasília
 * - Calcula início e fim do dia no timezone do Brasil
 * - Converte para UTC para buscar no banco de dados
 * - Retorna as datas convertidas de volta para horário de Brasília
 * 
 * @param salonId - ID do salão (UUID)
 * @param date - Data para buscar agendamentos (Date ou string ISO)
 * 
 * @returns Objeto com profissionais e agendamentos do dia, ou erro
 * 
 * @throws Não lança exceções, retorna erro via objeto de retorno
 */
export async function getDailyAppointments(
  salonId: string,
  date: Date | string
): Promise<DailyAppointmentsResult | { error: string }> {
  const targetDate = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(targetDate.getTime())) {
    return { error: "Data inválida" }
  }

  // Calcula início e fim do dia no horário de Brasília (converte para UTC para query)
  const dayStart = startOfDayBrazil(targetDate)
  const dayEnd = endOfDayBrazil(targetDate)
  return fetchAppointments(salonId, dayStart, dayEnd)
}

/**
 * Obtém todos os profissionais e agendamentos de um salão para uma semana específica.
 * 
 * **Timezone:**
 * - A data fornecida é interpretada como horário de Brasília
 * - Calcula início e fim da semana (domingo a sábado) no timezone do Brasil
 * - Converte para UTC para buscar no banco de dados
 * - Retorna as datas convertidas de volta para horário de Brasília
 * 
 * @param salonId - ID do salão (UUID)
 * @param date - Data dentro da semana para buscar agendamentos (Date ou string ISO)
 * 
 * @returns Objeto com profissionais e agendamentos da semana, ou erro
 * 
 * @throws Não lança exceções, retorna erro via objeto de retorno
 */
export async function getWeeklyAppointments(
  salonId: string,
  date: Date | string
): Promise<WeeklyAppointmentsResult | { error: string }> {
  const targetDate = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(targetDate.getTime())) {
    return { error: "Data inválida" }
  }

  // Calcula início e fim da semana no horário de Brasília (converte para UTC para query)
  const weekStart = startOfWeekBrazil(targetDate, { weekStartsOn: 0 })
  const weekEnd = endOfWeekBrazil(targetDate, { weekStartsOn: 0 })
  return fetchAppointments(salonId, weekStart, weekEnd)
}

/**
 * Obtém todos os profissionais e agendamentos de um salão para um mês específico.
 * 
 * **Timezone:**
 * - A data fornecida é interpretada como horário de Brasília
 * - Calcula início e fim do mês no timezone do Brasil
 * - Converte para UTC para buscar no banco de dados
 * - Retorna as datas convertidas de volta para horário de Brasília
 * 
 * @param salonId - ID do salão (UUID)
 * @param date - Data dentro do mês para buscar agendamentos (Date ou string ISO)
 * 
 * @returns Objeto com profissionais e agendamentos do mês, ou erro
 * 
 * @throws Não lança exceções, retorna erro via objeto de retorno
 */
export async function getMonthlyAppointments(
  salonId: string,
  date: Date | string
): Promise<MonthlyAppointmentsResult | { error: string }> {
  const targetDate = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(targetDate.getTime())) {
    return { error: "Data inválida" }
  }

  // Calcula início e fim do mês no horário de Brasília (converte para UTC para query)
  const monthStart = startOfMonthBrazil(targetDate)
  const monthEnd = endOfMonthBrazil(targetDate)
  return fetchAppointments(salonId, monthStart, monthEnd)
}

/**
 * Cria um novo agendamento no sistema.
 * 
 * **Autorização:**
 * - Apenas donos do salão ou profissionais ativos do salão podem criar agendamentos
 * 
 * **Fluxo:**
 * 1. Valida autenticação do usuário
 * 2. Verifica se o usuário é dono do salão ou profissional ativo
 * 3. Delega a criação para o serviço centralizado (`createAppointmentService`)
 * 4. Retorna resultado padronizado
 * 
 * **Nota:** A lógica de negócio (validações, verificações de conflito, etc.)
 * está centralizada no serviço `createAppointmentService`.
 * 
 * @param input - Dados do agendamento a ser criado
 * @param input.salonId - ID do salão (UUID)
 * @param input.professionalId - ID do profissional (UUID)
 * @param input.clientId - ID do cliente (UUID)
 * @param input.serviceId - ID do serviço (UUID)
 * @param input.date - Data/hora do agendamento (string ISO ou Date)
 * @param input.notes - Notas opcionais do agendamento
 * 
 * @returns Resultado da operação com ID do agendamento criado em caso de sucesso
 * 
 * @throws Não lança exceções, retorna erro via ActionResult
 */
export async function createAppointment(input: {
  salonId: string
  professionalId: string
  clientId: string
  serviceId: string
  date: string | Date
  notes?: string
}): Promise<ActionResult<{ appointmentId: string }>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  // Verifica se o salão existe
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, input.salonId),
    columns: { id: true, ownerId: true },
  })
  if (!salon) {
    return { error: "Salão inválido" }
  }

  // Verifica autorização: dono do salão ou profissional ativo
  const isOwner = salon.ownerId === user.id
  let isProfessional = false

  if (!isOwner) {
    const pro = await db.query.professionals.findFirst({
      where: and(
        eq(professionals.salonId, input.salonId),
        eq(professionals.userId, user.id),
        eq(professionals.isActive, true)
      ),
      columns: { id: true },
    })
    isProfessional = !!pro
  }

  if (!isOwner && !isProfessional) {
    return { error: "Acesso negado" }
  }

  // Delega para o serviço centralizado (lógica de negócio)
  const result = await sharedServices.createAppointmentService(input)

  if (!result.success) {
    return { error: result.error }
  }

  return { success: true, data: result.data }
}
