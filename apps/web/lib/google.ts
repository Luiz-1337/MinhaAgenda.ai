/**
 * Serviço para integração com Google Calendar
 * Centraliza a lógica de autenticação OAuth e criação de eventos
 */

import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { db, salonIntegrations, appointments, services, professionals, profiles } from '@repo/db'
import { eq } from 'drizzle-orm'

/**
 * Obtém o cliente OAuth2 configurado
 */
export function getOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/google/callback`

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET devem estar configurados')
  }

  return new OAuth2Client(clientId, clientSecret, redirectUri)
}

/**
 * Obtém o cliente Google Calendar autenticado para um salão
 * Busca tokens no banco, verifica validade e faz refresh se necessário
 */
export async function getSalonGoogleClient(salonId: string): Promise<{ client: OAuth2Client; email?: string } | null> {
  // Busca integração do salão
  const integration = await db.query.salonIntegrations.findFirst({
    where: eq(salonIntegrations.salonId, salonId),
  })

  if (!integration || !integration.refreshToken) {
    return null
  }

  const oauth2Client = getOAuth2Client()
  
  // Configura tokens
  oauth2Client.setCredentials({
    refresh_token: integration.refreshToken,
    access_token: integration.accessToken || undefined,
    expiry_date: integration.expiresAt ? integration.expiresAt * 1000 : undefined,
  })

  // Verifica se o token expirou ou está próximo de expirar (5 minutos de margem)
  const now = Date.now()
  const expiresAt = integration.expiresAt ? integration.expiresAt * 1000 : 0
  const fiveMinutes = 5 * 60 * 1000

  if (!integration.accessToken || (expiresAt && expiresAt - now < fiveMinutes)) {
    try {
      // Faz refresh do token
      const { credentials } = await oauth2Client.refreshAccessToken()
      
      // Atualiza no banco
      await db
        .update(salonIntegrations)
        .set({
          accessToken: credentials.access_token || null,
          expiresAt: credentials.expiry_date ? Math.floor(credentials.expiry_date / 1000) : null,
          updatedAt: new Date(),
        })
        .where(eq(salonIntegrations.id, integration.id))

      // Atualiza as credenciais do cliente
      oauth2Client.setCredentials(credentials)
    } catch (error) {
      console.error('Erro ao fazer refresh do token Google:', error)
      throw new Error('Falha ao renovar autenticação com Google Calendar')
    }
  }

  return {
    client: oauth2Client,
    email: integration.email || undefined,
  }
}

/**
 * Cria um evento no Google Calendar para um agendamento
 * Formato do título: "[Profissional] Serviço - Cliente"
 * Adiciona o email do profissional como attendee se disponível
 */
export async function createGoogleEvent(appointmentId: string): Promise<{ eventId: string; htmlLink?: string } | null> {
  // Busca dados completos do agendamento usando joins
  const appointmentData = await db
    .select({
      id: appointments.id,
      salonId: appointments.salonId,
      professionalId: appointments.professionalId,
      clientId: appointments.clientId,
      serviceId: appointments.serviceId,
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

  const appointment = appointmentData[0]

  if (!appointment) {
    throw new Error(`Agendamento ${appointmentId} não encontrado`)
  }

  // Obtém cliente Google Calendar autenticado
  const googleClient = await getSalonGoogleClient(appointment.salonId)
  
  if (!googleClient) {
    // Salão não tem integração configurada - não é erro, apenas não sincroniza
    return null
  }

  const calendar = google.calendar({ version: 'v3', auth: googleClient.client })
  const timeZone = process.env.GOOGLE_TIMEZONE || 'America/Sao_Paulo'

  // Formata título: "[Profissional] Serviço - Cliente"
  const professionalName = appointment.professionalName || 'Profissional'
  const serviceName = appointment.serviceName || 'Serviço'
  const clientName = appointment.clientName || 'Cliente'
  const summary = `[${professionalName}] ${serviceName} - ${clientName}`

  // Monta descrição com informações adicionais
  let description = `Serviço: ${serviceName}\n`
  description += `Cliente: ${clientName}\n`
  if (appointment.notes) {
    description += `\nObservações: ${appointment.notes}`
  }

  // Prepara lista de attendees (adiciona profissional se tiver email)
  const attendees: string[] = []
  if (appointment.professionalEmail) {
    attendees.push(appointment.professionalEmail)
  }

  // Cria evento
  const event = {
    summary,
    description,
    start: {
      dateTime: appointment.date.toISOString(),
      timeZone,
    },
    end: {
      dateTime: appointment.endTime.toISOString(),
      timeZone,
    },
    attendees: attendees.length > 0 ? attendees.map(email => ({ email })) : undefined,
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 }, // 1 dia antes
        { method: 'popup', minutes: 30 }, // 30 minutos antes
      ],
    },
  }

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    })

    const createdEvent = response.data

    // Atualiza o agendamento com o ID do evento do Google
    await db
      .update(appointments)
      .set({
        googleEventId: createdEvent.id || null,
      })
      .where(eq(appointments.id, appointmentId))

    return {
      eventId: createdEvent.id || '',
      htmlLink: createdEvent.htmlLink || undefined,
    }
  } catch (error: any) {
    console.error('Erro ao criar evento no Google Calendar:', error)
    // Não lança erro - apenas loga, pois o agendamento já foi criado no nosso banco
    throw new Error(`Falha ao sincronizar com Google Calendar: ${error.message}`)
  }
}

