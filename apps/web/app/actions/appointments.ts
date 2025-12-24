"use server"

import { and, eq } from "drizzle-orm"

import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types/common"
import { fromBrazilTime } from "@/lib/utils/timezone.utils"

import { db, domainServices as sharedServices, professionals, salons } from "@repo/db"
import { 
  getAppointmentsByRange, 
  getSalonProfessionals, 
  type AppointmentDTO, 
  type ProfessionalDTO 
} from "@/lib/repositories/appointment.repository"

// Re-exportando tipos para compatibilidade com componentes existentes que possam importá-los
export type { AppointmentDTO, ProfessionalDTO as ProfessionalInfo }
export type DailyAppointment = AppointmentDTO

/**
 * Resultado da busca de agendamentos.
 */
export interface AppointmentsResult {
  professionals: ProfessionalDTO[]
  appointments: AppointmentDTO[]
}

/**
 * Busca agendamentos e profissionais de um salão em um intervalo de datas.
 * 
 * **Validações:**
 * - Verifica autenticação do usuário
 * - Verifica se o usuário é dono do salão OU profissional vinculado
 * 
 * **Conversão de Timezone:**
 * - As datas são armazenadas em UTC no banco
 * - São convertidas para horário de Brasília antes de retornar no formato esperado pelo frontend
 */
export async function getAppointments(
  salonId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<AppointmentsResult | { error: string }> {
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

  // Verifica permissão (Dono do salão ou Profissional)
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { id: true, ownerId: true },
  })

  if (!salon) {
    return { error: "Salão não encontrado" }
  }

  const isOwner = salon.ownerId === user.id
  let isProfessional = false

  if (!isOwner) {
    const pro = await db.query.professionals.findFirst({
      where: and(eq(professionals.salonId, salonId), eq(professionals.userId, user.id))
    })
    if (pro) isProfessional = true
  }

  if (!isOwner && !isProfessional) {
    return { error: "Acesso negado a este salão" }
  }

  try {
    // Busca paralela de profissionais e agendamentos
    const [professionalsList, appointmentsList] = await Promise.all([
      getSalonProfessionals(salonId),
      getAppointmentsByRange({ salonId, startDate: rangeStart, endDate: rangeEnd })
    ])

    // Se for STAFF, filtrar agendamentos? O prompt diz "filtrar e mostrar apenas a coluna dele".
    // Mas a Action retorna TUDO e o Frontend filtra, ou a Action já filtra?
    // Se eu filtrar aqui, é mais seguro.
    // Prompt: "Se o usuário for STAFF, a agenda deve, por padrão, filtrar e mostrar apenas a coluna dele. (Opcional) Bloquear o dropdown..."
    // Se bloquear o dropdown, ele não consegue ver outros. Se eu retornar todos, ele pode "hackear" se eu só esconder no front.
    // Mas talvez STAFF precise ver agenda dos outros para encaixar? Geralmente não.
    // Vou retornar tudo se for Owner/Manager, e filtrar se for Staff.

    // Descobrir role atual
    let role = isOwner ? 'MANAGER' : 'STAFF'
    if (!isOwner) {
       const me = professionalsList.find(p => p.userId === user.id)
       // Se o profissional tem role OWNER (banco antigo), tratamos como MANAGER
       if (me?.role === 'OWNER' || me?.role === 'MANAGER') role = 'MANAGER'
       else if (me?.role) role = me.role
    }

    let filteredAppointments = appointmentsList
    let filteredProfessionals = professionalsList

    if (role === 'STAFF') {
      // Staff vê apenas seus agendamentos e seu perfil profissional
      const myProId = professionalsList.find(p => p.userId === user.id)?.id
      if (myProId) {
        filteredAppointments = appointmentsList.filter(a => a.professionalId === myProId)
        // Opcional: filtrar profissionais também para o dropdown só mostrar ele
        filteredProfessionals = professionalsList.filter(p => p.id === myProId)
      }
    }

    // Converte as datas UTC do banco para Timezone do Brasil para exibição
    const appointmentsWithLocalTime = filteredAppointments.map(apt => ({
      ...apt,
      startTime: fromBrazilTime(apt.startTime),
      endTime: fromBrazilTime(apt.endTime)
    }))

    return { 
      professionals: filteredProfessionals, 
      appointments: appointmentsWithLocalTime 
    }
  } catch (error) {
    console.error("Erro na action getAppointments:", error)
    return { error: "Erro ao buscar agendamentos" }
  }
}

/**
 * Cria um novo agendamento no sistema.
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
