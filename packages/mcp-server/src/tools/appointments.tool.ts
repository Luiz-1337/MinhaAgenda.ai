/**
 * Tools para gerenciamento de agendamentos
 */

import { and, eq, gt, asc } from "drizzle-orm"
import { db, appointments, services, professionals, profiles } from "@repo/db"
import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import {
  createAppointmentSchema,
  cancelAppointmentSchema,
  rescheduleAppointmentSchema,
  getCustomerUpcomingAppointmentsSchema,
  getMyFutureAppointmentsSchema,
  type CreateAppointmentInput,
  type CancelAppointmentInput,
  type RescheduleAppointmentInput,
  type GetCustomerUpcomingAppointmentsInput,
  type GetMyFutureAppointmentsInput,
} from "../schemas/tools.schema.js"
import { checkAvailabilityTool } from "./availability.tool.js"

/**
 * Cria um novo agendamento
 * TODO: Integrar com Google Calendar quando houver integração ativa
 */
export async function createAppointmentTool(
  server: Server,
  args: unknown
): Promise<{ appointmentId: string; message: string }> {
  const params = createAppointmentSchema.parse(args)

  // Validações
  const [service, professional, client] = await Promise.all([
    db.query.services.findFirst({
      where: eq(services.id, params.serviceId),
      columns: { id: true, duration: true, name: true },
    }),
    db.query.professionals.findFirst({
      where: eq(professionals.id, params.professionalId),
      columns: { id: true, name: true },
    }),
    db.query.profiles.findFirst({
      where: eq(profiles.id, params.clientId),
      columns: { id: true, fullName: true },
    }),
  ])

  if (!service) {
    throw new Error(`Serviço com ID ${params.serviceId} não encontrado`)
  }

  if (!professional) {
    throw new Error(`Profissional com ID ${params.professionalId} não encontrado`)
  }

  if (!client) {
    throw new Error(`Cliente com ID ${params.clientId} não encontrado`)
  }

  // Calcula horário de término
  const startDate = new Date(params.date)
  const endDate = new Date(startDate.getTime() + service.duration * 60 * 1000)

  // Cria agendamento
  const [appointment] = await db
    .insert(appointments)
    .values({
      salonId: params.salonId,
      professionalId: params.professionalId,
      clientId: params.clientId,
      serviceId: params.serviceId,
      date: startDate,
      endTime: endDate,
      status: "confirmed",
      notes: params.notes || null,
    })
    .returning({ id: appointments.id })

  // TODO: Criar evento no Google Calendar se houver integração

  return {
    appointmentId: appointment.id,
    message: `Agendamento criado com sucesso para ${client.fullName || "cliente"} com ${professional.name} às ${startDate.toLocaleString("pt-BR")}`,
  }
}

/**
 * Cancela um agendamento existente
 * TODO: Remover do Google Calendar se houver integração
 */
export async function cancelAppointmentTool(
  server: Server,
  args: unknown
): Promise<{ message: string }> {
  const params = cancelAppointmentSchema.parse(args)

  const appointment = await db.query.appointments.findFirst({
    where: eq(appointments.id, params.appointmentId),
    columns: { id: true, status: true, notes: true },
  })

  if (!appointment) {
    throw new Error(`Agendamento com ID ${params.appointmentId} não encontrado`)
  }

  if (appointment.status === "cancelled") {
    return { message: "Agendamento já estava cancelado" }
  }

  // Atualiza status
  await db
    .update(appointments)
    .set({
      status: "cancelled",
      notes: params.reason
        ? `${appointment.notes || ""}\n[Cancelado] ${params.reason}`.trim()
        : appointment.notes,
    })
    .where(eq(appointments.id, params.appointmentId))

  // TODO: Remover evento do Google Calendar se houver googleEventId

  return {
    message: `Agendamento ${params.appointmentId} cancelado com sucesso`,
  }
}

/**
 * Reagenda um agendamento existente
 * Operação atômica: verifica disponibilidade, cancela o antigo e cria novo
 */
export async function rescheduleAppointmentTool(
  server: Server,
  args: unknown
): Promise<{ appointmentId: string; message: string }> {
  const params = rescheduleAppointmentSchema.parse(args)

  // Busca agendamento existente
  const appointment = await db.query.appointments.findFirst({
    where: eq(appointments.id, params.appointmentId),
    columns: {
      id: true,
      salonId: true,
      serviceId: true,
      professionalId: true,
      clientId: true,
      date: true,
      status: true,
    },
  })

  if (!appointment) {
    throw new Error(`Agendamento com ID ${params.appointmentId} não encontrado`)
  }

  if (appointment.status === "cancelled") {
    throw new Error("Não é possível reagendar um agendamento cancelado")
  }

  // Busca duração do serviço
  const service = await db.query.services.findFirst({
    where: eq(services.id, appointment.serviceId),
    columns: { duration: true },
  })

  const serviceDuration = service?.duration || 60

  // Verifica disponibilidade no novo horário usando a tool de disponibilidade
  const availabilityResult = await checkAvailabilityTool(server, {
    salonId: appointment.salonId,
    date: params.newDate,
    professionalId: appointment.professionalId,
    serviceDuration,
  })

  const newDateObj = new Date(params.newDate)
  const isSlotAvailable = availabilityResult.slots.some(
    (slot) => Math.abs(new Date(slot).getTime() - newDateObj.getTime()) < 60000 // 1 minuto de tolerância
  )

  if (!isSlotAvailable) {
    throw new Error("Horário não disponível. Por favor, escolha outro horário.")
  }

  // Transação: cancela antigo e cria novo
  const endTime = new Date(newDateObj.getTime() + serviceDuration * 60 * 1000)

  // Cancela o agendamento antigo
  await db
    .update(appointments)
    .set({ status: "cancelled" })
    .where(eq(appointments.id, params.appointmentId))

  // Cria novo agendamento
  const [newAppointment] = await db
    .insert(appointments)
    .values({
      salonId: appointment.salonId,
      professionalId: appointment.professionalId,
      clientId: appointment.clientId,
      serviceId: appointment.serviceId,
      date: newDateObj,
      endTime,
      status: "confirmed",
      notes: `Reagendado do agendamento ${params.appointmentId}`,
    })
    .returning({ id: appointments.id })

  // TODO: Atualizar Google Calendar se houver integração

  return {
    appointmentId: newAppointment.id,
    message: `Agendamento reagendado com sucesso para ${newDateObj.toLocaleString("pt-BR")}`,
  }
}

/**
 * Lista agendamentos futuros de um cliente pelo telefone
 */
export async function getCustomerUpcomingAppointmentsTool(
  server: Server,
  args: unknown
): Promise<{
  appointments: Array<{
    id: string
    date: string
    endTime: string
    status: string
    serviceName: string
    professionalName: string
    notes: string | null
  }>
  message: string
}> {
  const params = getCustomerUpcomingAppointmentsSchema.parse(args)

  // Busca perfil pelo telefone
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.phone, params.customerPhone),
    columns: { id: true },
  })

  if (!profile) {
    return {
      appointments: [],
      message: "Cliente não encontrado",
    }
  }

  const now = new Date()

  // Busca agendamentos futuros
  const upcomingAppointments = await db
    .select({
      id: appointments.id,
      date: appointments.date,
      endTime: appointments.endTime,
      status: appointments.status,
      notes: appointments.notes,
      service: {
        name: services.name,
      },
      professional: {
        name: professionals.name,
      },
    })
    .from(appointments)
    .leftJoin(services, eq(appointments.serviceId, services.id))
    .leftJoin(professionals, eq(appointments.professionalId, professionals.id))
    .where(
      and(
        eq(appointments.salonId, params.salonId),
        eq(appointments.clientId, profile.id),
        gt(appointments.date, now),
        eq(appointments.status, "confirmed")
      )
    )

  return {
    appointments: upcomingAppointments.map((apt) => ({
      id: apt.id,
      date: apt.date.toISOString(),
      endTime: apt.endTime.toISOString(),
      status: apt.status,
      serviceName: apt.service?.name || "Serviço não encontrado",
      professionalName: apt.professional?.name || "Profissional não encontrado",
      notes: apt.notes,
    })),
    message: `Encontrados ${upcomingAppointments.length} agendamento(s) futuro(s)`,
  }
}

/**
 * Lista meus agendamentos futuros
 * Aceita clientId (injetado) ou phone (fornecido via contexto)
 * Retorna lista formatada para o usuário com IDs ocultos mas acessíveis pela IA
 */
export async function getMyFutureAppointmentsTool(
  server: Server,
  args: unknown
): Promise<{
  formattedList: string[]
  appointments: Array<{
    id: string
    date: string
    endTime: string
    status: string
    serviceName: string
    professionalName: string
    professionalId: string
    notes: string | null
  }>
  message: string
}> {
  const params = getMyFutureAppointmentsSchema.parse(args)

  // Valida que pelo menos um identificador foi fornecido
  if (!params.clientId && !params.phone) {
    throw new Error("É necessário fornecer clientId ou phone")
  }

  let clientId: string | undefined = params.clientId

  // Se não tiver clientId, busca pelo phone
  if (!clientId && params.phone) {
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.phone, params.phone),
      columns: { id: true },
    })

    if (!profile) {
      return {
        formattedList: [],
        appointments: [],
        message: "Cliente não encontrado com o telefone fornecido",
      }
    }

    clientId = profile.id
  }

  if (!clientId) {
    throw new Error("Não foi possível identificar o cliente")
  }

  const now = new Date()

  // Busca agendamentos futuros
  const upcomingAppointments = await db
    .select({
      id: appointments.id,
      date: appointments.date,
      endTime: appointments.endTime,
      status: appointments.status,
      notes: appointments.notes,
      service: {
        name: services.name,
      },
      professional: {
        id: professionals.id,
        name: professionals.name,
      },
    })
    .from(appointments)
    .leftJoin(services, eq(appointments.serviceId, services.id))
    .leftJoin(professionals, eq(appointments.professionalId, professionals.id))
    .where(
      and(
        eq(appointments.salonId, params.salonId),
        eq(appointments.clientId, clientId),
        gt(appointments.date, now),
        eq(appointments.status, "confirmed")
      )
    )
    .orderBy(asc(appointments.date))

  // Formata lista para exibição ao usuário
  const formattedList = upcomingAppointments.map((apt, index) => {
    const date = new Date(apt.date)
    const dateStr = date.toLocaleDateString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    const timeStr = date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })

    return `${dateStr} - ${timeStr} - ${apt.service?.name || "Serviço não encontrado"} - ${apt.professional?.name || "Profissional não encontrado"}`
  })

  // Retorna também os dados completos com IDs para uso da IA
  const appointmentsData = upcomingAppointments.map((apt) => ({
    id: apt.id,
    date: apt.date.toISOString(),
    endTime: apt.endTime.toISOString(),
    status: apt.status,
    serviceName: apt.service?.name || "Serviço não encontrado",
    professionalName: apt.professional?.name || "Profissional não encontrado",
    professionalId: apt.professional?.id || "",
    notes: apt.notes,
  }))

  return {
    formattedList,
    appointments: appointmentsData,
    message: `Encontrados ${upcomingAppointments.length} agendamento(s) futuro(s)`,
  }
}

