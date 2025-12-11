/**
 * Tools para gerenciamento de agendamentos
 */

import { and, eq, gt, asc } from "drizzle-orm"
import { db, appointments, services, professionals, profiles, salonIntegrations } from "@repo/db"
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
 * Cria evento no Google Calendar para um agendamento
 * Função auxiliar para sincronização
 */
async function createGoogleEventForAppointment(
  appointmentId: string,
  salonId: string
): Promise<void> {
  // Verifica se há integração Google configurada
  const integration = await db.query.salonIntegrations.findFirst({
    where: eq(salonIntegrations.salonId, salonId),
  })

  if (!integration || !integration.refreshToken) {
    // Salão não tem integração - não é erro, apenas não sincroniza
    return
  }

  // Importa dinamicamente para evitar dependência obrigatória
  try {
    const { google } = await import("googleapis")
    const { OAuth2Client } = await import("google-auth-library")

    // Configura cliente OAuth
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const redirectUri = process.env.GOOGLE_REDIRECT_URI

    if (!clientId || !clientSecret) {
      return // Configuração não disponível
    }

    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri)
    oauth2Client.setCredentials({
      refresh_token: integration.refreshToken,
      access_token: integration.accessToken || undefined,
      expiry_date: integration.expiresAt ? integration.expiresAt * 1000 : undefined,
    })

    // Verifica se precisa fazer refresh do token
    const now = Date.now()
    const expiresAt = integration.expiresAt ? integration.expiresAt * 1000 : 0
    const fiveMinutes = 5 * 60 * 1000

    if (!integration.accessToken || (expiresAt && expiresAt - now < fiveMinutes)) {
      const { credentials } = await oauth2Client.refreshAccessToken()
      await db
        .update(salonIntegrations)
        .set({
          accessToken: credentials.access_token || null,
          expiresAt: credentials.expiry_date ? Math.floor(credentials.expiry_date / 1000) : null,
          updatedAt: new Date(),
        })
        .where(eq(salonIntegrations.id, integration.id))
      oauth2Client.setCredentials(credentials)
    }

    // Busca dados do agendamento
    const appointmentData = await db
      .select({
        id: appointments.id,
        date: appointments.date,
        endTime: appointments.endTime,
        notes: appointments.notes,
        professionalName: professionals.name,
        professionalEmail: professionals.email,
        serviceName: services.name,
        clientName: profiles.fullName,
      })
      .from(appointments)
      .innerJoin(professionals, eq(appointments.professionalId, professionals.id))
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .innerJoin(profiles, eq(appointments.clientId, profiles.id))
      .where(eq(appointments.id, appointmentId))
      .limit(1)

    const apt = appointmentData[0]
    if (!apt) {
      return
    }

    const calendar = google.calendar({ version: "v3", auth: oauth2Client })
    const timeZone = process.env.GOOGLE_TIMEZONE || "America/Sao_Paulo"

    // Formata título: "[Profissional] Serviço - Cliente"
    const summary = `[${apt.professionalName}] ${apt.serviceName} - ${apt.clientName || "Cliente"}`

    let description = `Serviço: ${apt.serviceName}\n`
    description += `Cliente: ${apt.clientName || "Cliente"}\n`
    if (apt.notes) {
      description += `\nObservações: ${apt.notes}`
    }

    const attendees = apt.professionalEmail ? [{ email: apt.professionalEmail }] : undefined

    const event = {
      summary,
      description,
      start: {
        dateTime: apt.date.toISOString(),
        timeZone,
      },
      end: {
        dateTime: apt.endTime.toISOString(),
        timeZone,
      },
      attendees,
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 },
          { method: "popup", minutes: 30 },
        ],
      },
    }

    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    })

    // Atualiza agendamento com ID do evento Google
    if (response.data.id) {
      await db
        .update(appointments)
        .set({ googleEventId: response.data.id })
        .where(eq(appointments.id, appointmentId))
    }
  } catch (error) {
    // Se googleapis não estiver instalado ou houver erro, apenas loga
    console.error("Erro ao criar evento Google Calendar:", error)
    throw error
  }
}

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

  // Sincroniza com Google Calendar (não bloqueia se falhar)
  try {
    await createGoogleEventForAppointment(appointment.id, params.salonId)
  } catch (error) {
    // Loga erro mas não falha o agendamento - nosso banco é a fonte da verdade
    console.error('Erro ao sincronizar agendamento com Google Calendar:', error)
  }

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

  // Sincroniza com Google Calendar (não bloqueia se falhar)
  try {
    await createGoogleEventForAppointment(newAppointment.id, appointment.salonId)
  } catch (error) {
    console.error('Erro ao sincronizar reagendamento com Google Calendar:', error)
  }

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

