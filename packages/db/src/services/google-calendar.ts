/**
 * Serviço compartilhado para integração com Google Calendar
 * Centraliza a lógica de autenticação OAuth e criação de eventos
 * Pode ser usado tanto pelo mcp-server quanto pelo apps/web
 * 
 * @deprecated This file is deprecated. Use the new Clean Architecture implementation:
 * - GoogleCalendarIntegration from infrastructure/integrations/google-calendar/google-calendar-integration
 * - Use cases from application/use-cases/google-calendar/
 * 
 * This file is kept for backward compatibility but will be removed in future versions.
 */

import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { db, salonIntegrations, appointments, services, professionals, profiles } from '../index'
import { eq } from 'drizzle-orm'

/**
 * Obtém o cliente OAuth2 configurado
 * 
 * @deprecated Use GoogleOAuth2Client from infrastructure/integrations/google-calendar/google-oauth2-client instead
 */
export function getOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/google/callback`

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET devem estar configurados')
  }

  // Log para debug (sem mostrar valores sensíveis completos)
  if (process.env.NODE_ENV === 'development') {
    console.log('🔑 OAuth2Client configurado:', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      redirectUri,
      clientIdPrefix: clientId?.substring(0, 20) + '...',
    })
  }

  return new OAuth2Client(clientId, clientSecret, redirectUri)
}

/**
 * Obtém o cliente Google Calendar autenticado para um salão
 * Busca tokens no banco, verifica validade e faz refresh se necessário
 */
export async function getSalonGoogleClient(salonId: string): Promise<{ client: OAuth2Client; email?: string } | null> {
  console.log('🔍 getSalonGoogleClient: Buscando integração para salão:', salonId)
  
  // Busca integração do salão
  const integration = await db.query.salonIntegrations.findFirst({
    where: eq(salonIntegrations.salonId, salonId),
  })

  console.log('📦 Resultado da busca de integração:', {
    found: !!integration,
    hasRefreshToken: !!integration?.refreshToken,
    hasAccessToken: !!integration?.accessToken,
    email: integration?.email,
    expiresAt: integration?.expiresAt ? new Date(integration.expiresAt * 1000).toISOString() : null,
    updatedAt: integration?.updatedAt?.toISOString(),
  })

  if (!integration || !integration.refreshToken) {
    console.warn('⚠️ Integração não encontrada ou sem refresh token para salão:', salonId)
    return null
  }

  // Verifica se a integração está ativa
  if (integration.isActive === false) {
    console.log('ℹ️ Integração está desativada (isActive=false) para salão:', salonId)
    return null
  }

  console.log('✅ Integração encontrada e ativa. Configurando OAuth2Client...')
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
      // Log para debug
      console.log('🔄 Tentando fazer refresh do token Google para salão:', {
        salonId,
        hasRefreshToken: !!integration.refreshToken,
        refreshTokenPrefix: integration.refreshToken?.substring(0, 10) + '...',
        accessTokenExpired: !integration.accessToken || (expiresAt && expiresAt - now < fiveMinutes),
        expiresAt: integration.expiresAt ? new Date(integration.expiresAt * 1000).toISOString() : null,
        now: new Date(now).toISOString(),
      })
      
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
    } catch (error: any) {
      console.error('Erro ao fazer refresh do token Google:', error)
      
      // Verifica se é erro de token inválido (invalid_grant)
      const isInvalidGrant = error?.response?.data?.error === 'invalid_grant' ||
                            error?.message?.includes('invalid_grant') ||
                            error?.code === 400 && error?.response?.data?.error === 'invalid_grant'
      
      if (isInvalidGrant) {
        // Token foi revogado ou expirou - remove a integração para permitir reautenticação
        console.warn(
          `⚠️ Refresh token inválido para salão ${salonId}. ` +
          `A integração do Google Calendar foi removida. ` +
          `O salão precisa reautenticar através da interface web. ` +
          `Agendamentos continuarão sendo criados, mas não serão sincronizados com o Google Calendar até reautenticação.`
        )
        await db
          .delete(salonIntegrations)
          .where(eq(salonIntegrations.id, integration.id))
        
        // Retorna null para indicar que não há integração válida
        // Isso permite que o sistema continue funcionando (agendamento será criado sem sincronização)
        return null
      }
      
      // Para outros erros, ainda lança exceção
      throw new Error('Falha ao renovar autenticação com Google Calendar')
    }
  }

  return {
    client: oauth2Client,
    email: integration.email || undefined,
  }
}

/**
 * Garante que um profissional tenha um calendário secundário no Google Calendar.
 * Função idempotente: se o profissional já tiver um googleCalendarId salvo, retorna o existente.
 * Caso contrário, cria um novo calendário secundário e salva o ID no banco.
 * 
 * @param professionalId - ID do profissional
 * @param salonId - ID do salão (para obter credenciais OAuth)
 * @returns ID do calendário secundário do profissional, ou null se não houver integração configurada
 */
export async function ensureProfessionalCalendar(
  professionalId: string,
  salonId: string
): Promise<string | null> {
  console.log('🔍 ensureProfessionalCalendar: Verificando profissional:', { professionalId, salonId })
  
  // Busca o profissional no banco
  const professional = await db.query.professionals.findFirst({
    where: eq(professionals.id, professionalId),
    columns: { id: true, name: true, googleCalendarId: true },
  })

  if (!professional) {
    console.error('❌ Profissional não encontrado:', professionalId)
    throw new Error(`Profissional ${professionalId} não encontrado`)
  }

  console.log('👤 Profissional encontrado:', {
    name: professional.name,
    hasGoogleCalendarId: !!professional.googleCalendarId,
    googleCalendarId: professional.googleCalendarId,
  })

  // Se já tem googleCalendarId salvo, retorna o existente (idempotência)
  if (professional.googleCalendarId) {
    console.log('✅ Calendário secundário já existe para o profissional:', professional.googleCalendarId)
    return professional.googleCalendarId
  }

  console.log('🆕 Profissional não tem calendário secundário. Criando novo...')

  // Obtém cliente Google Calendar autenticado
  const googleClient = await getSalonGoogleClient(salonId)
  
  if (!googleClient) {
    console.warn('⚠️ Não foi possível obter cliente Google Calendar. Integração pode não estar configurada.')
    // Salão não tem integração configurada - não é erro, apenas não sincroniza
    return null
  }

  console.log('✅ Cliente Google Calendar obtido. Criando calendário secundário...')

  const calendar = google.calendar({ version: 'v3', auth: googleClient.client })

  // Cria calendário secundário com nome "Agenda - [Nome do Profissional]"
  const calendarName = `Agenda - ${professional.name}`

  try {
    console.log('📤 Criando calendário secundário no Google Calendar:', {
      calendarName,
      professionalName: professional.name,
      timeZone: process.env.GOOGLE_TIMEZONE || 'America/Sao_Paulo',
    })

    const response = await calendar.calendars.insert({
      requestBody: {
        summary: calendarName,
        description: `Calendário de agendamentos do profissional ${professional.name}`,
        timeZone: process.env.GOOGLE_TIMEZONE || 'America/Sao_Paulo',
      },
    })

    const calendarId = response.data.id

    if (!calendarId) {
      console.error('❌ Calendário criado mas ID não retornado pela API')
      throw new Error('Calendário criado mas ID não retornado pela API')
    }

    console.log('✅ Calendário secundário criado com sucesso:', calendarId)

    // Salva o ID do calendário no banco
    await db
      .update(professionals)
      .set({ googleCalendarId: calendarId })
      .where(eq(professionals.id, professionalId))

    console.log('💾 ID do calendário salvo no banco para profissional:', professionalId)

    return calendarId
  } catch (error: any) {
    console.error('❌ Erro ao criar calendário secundário no Google Calendar:', {
      error: error.message,
      code: error.code,
      status: error.response?.status,
      data: error.response?.data,
    })
    throw new Error(`Falha ao criar calendário secundário: ${error.message}`)
  }
}

/**
 * Cria um evento no Google Calendar para um agendamento.
 * Usa o calendário secundário do profissional (não mais o 'primary').
 * Formato do título: "[Profissional] Serviço - Cliente"
 * Adiciona o email do profissional como attendee se disponível
 */
export async function createGoogleEvent(appointmentId: string): Promise<{ eventId: string; htmlLink?: string } | null> {
  console.log('📅 Iniciando criação de evento no Google Calendar para agendamento:', appointmentId)
  
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
    console.error('❌ Agendamento não encontrado:', appointmentId)
    throw new Error(`Agendamento ${appointmentId} não encontrado`)
  }

  console.log('📋 Dados do agendamento encontrado:', {
    salonId: appointment.salonId,
    professionalId: appointment.professionalId,
    professionalName: appointment.professionalName,
    serviceName: appointment.serviceName,
    clientName: appointment.clientName,
    date: appointment.date.toISOString(),
  })

  // Garante que o profissional tenha um calendário secundário (idempotente)
  console.log('🔍 Verificando/criando calendário secundário do profissional...')
  const calendarId = await ensureProfessionalCalendar(
    appointment.professionalId,
    appointment.salonId
  )

  if (!calendarId) {
    console.warn('⚠️ Não foi possível obter/criar calendário secundário. Integração pode não estar configurada.')
    // Salão não tem integração configurada - não é erro, apenas não sincroniza
    return null
  }

  console.log('✅ Calendário secundário encontrado/criado:', calendarId)

  // Obtém cliente Google Calendar autenticado
  console.log('🔐 Obtendo cliente Google Calendar autenticado para salão:', appointment.salonId)
  const googleClient = await getSalonGoogleClient(appointment.salonId)
  
  if (!googleClient) {
    console.warn('⚠️ Cliente Google Calendar não disponível. Integração pode não estar configurada ou tokens inválidos.')
    // Salão não tem integração configurada - não é erro, apenas não sincroniza
    return null
  }

  console.log('✅ Cliente Google Calendar autenticado obtido com sucesso')

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
    console.log('📤 Enviando evento para o Google Calendar:', {
      calendarId,
      summary,
      start: event.start.dateTime,
      end: event.end.dateTime,
      timeZone: event.start.timeZone,
    })

    const response = await calendar.events.insert({
      calendarId: calendarId, // Usa o calendário secundário do profissional
      requestBody: event,
    })

    const createdEvent = response.data

    console.log('✅ Evento criado com sucesso no Google Calendar:', {
      eventId: createdEvent.id,
      htmlLink: createdEvent.htmlLink,
    })

    // Atualiza o agendamento com o ID do evento do Google
    await db
      .update(appointments)
      .set({
        googleEventId: createdEvent.id || null,
      })
      .where(eq(appointments.id, appointmentId))

    console.log('💾 ID do evento salvo no agendamento:', appointmentId)

    return {
      eventId: createdEvent.id || '',
      htmlLink: createdEvent.htmlLink || undefined,
    }
  } catch (error: any) {
    console.error('❌ Erro ao criar evento no Google Calendar:', {
      error: error.message,
      code: error.code,
      status: error.response?.status,
      data: error.response?.data,
    })
    // Não lança erro - apenas loga, pois o agendamento já foi criado no nosso banco
    throw new Error(`Falha ao sincronizar com Google Calendar: ${error.message}`)
  }
}

/**
 * Deleta um evento do Google Calendar quando um agendamento é cancelado ou removido.
 * 
 * @param appointmentId - ID do agendamento
 * @returns true se o evento foi deletado, false se não havia evento, null se não há integração
 */
export async function deleteGoogleEvent(appointmentId: string): Promise<boolean | null> {
  console.log('🗑️ Iniciando deleção de evento no Google Calendar para agendamento:', appointmentId)
  
  // Busca o agendamento com googleEventId
  const appointment = await db.query.appointments.findFirst({
    where: eq(appointments.id, appointmentId),
    columns: {
      id: true,
      salonId: true,
      professionalId: true,
      googleEventId: true,
    },
  })

  if (!appointment) {
    console.error('❌ Agendamento não encontrado:', appointmentId)
    throw new Error(`Agendamento ${appointmentId} não encontrado`)
  }

  // Se não tem googleEventId, não há evento para deletar
  if (!appointment.googleEventId) {
    console.log('ℹ️ Agendamento não tem googleEventId. Nada a deletar no Google Calendar.')
    return false
  }

  // Busca o profissional para obter o calendarId
  const professional = await db.query.professionals.findFirst({
    where: eq(professionals.id, appointment.professionalId),
    columns: { id: true, googleCalendarId: true },
  })

  if (!professional || !professional.googleCalendarId) {
    console.warn('⚠️ Profissional não encontrado ou não tem calendário secundário. Não é possível deletar evento.')
    return null
  }

  // Obtém cliente Google Calendar autenticado
  const googleClient = await getSalonGoogleClient(appointment.salonId)
  
  if (!googleClient) {
    console.warn('⚠️ Cliente Google Calendar não disponível. Integração pode não estar configurada.')
    return null
  }

  const calendar = google.calendar({ version: 'v3', auth: googleClient.client })

  try {
    console.log('📤 Deletando evento do Google Calendar:', {
      calendarId: professional.googleCalendarId,
      eventId: appointment.googleEventId,
    })

    await calendar.events.delete({
      calendarId: professional.googleCalendarId,
      eventId: appointment.googleEventId,
    })

    console.log('✅ Evento deletado com sucesso do Google Calendar')

    // Remove o googleEventId do agendamento
    await db
      .update(appointments)
      .set({ googleEventId: null })
      .where(eq(appointments.id, appointmentId))

    console.log('💾 googleEventId removido do agendamento')

    return true
  } catch (error: any) {
    // Se o evento já foi deletado ou não existe, não é um erro crítico
    if (error.code === 404) {
      console.log('ℹ️ Evento não encontrado no Google Calendar (já foi deletado). Removendo referência do banco.')
      await db
        .update(appointments)
        .set({ googleEventId: null })
        .where(eq(appointments.id, appointmentId))
      return true
    }

    console.error('❌ Erro ao deletar evento do Google Calendar:', {
      error: error.message,
      code: error.code,
      status: error.response?.status,
      data: error.response?.data,
    })
    // Não lança erro - apenas loga, pois o agendamento já foi cancelado no nosso banco
    throw new Error(`Falha ao deletar evento do Google Calendar: ${error.message}`)
  }
}

/**
 * Atualiza um evento no Google Calendar quando um agendamento é editado.
 * 
 * @param appointmentId - ID do agendamento
 * @returns Dados do evento atualizado ou null se não há integração
 */
export async function updateGoogleEvent(appointmentId: string): Promise<{ eventId: string; htmlLink?: string } | null> {
  console.log('🔄 Iniciando atualização de evento no Google Calendar para agendamento:', appointmentId)
  
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
      googleEventId: appointments.googleEventId,
      professionalName: professionals.name,
      professionalEmail: professionals.email,
      professionalGoogleCalendarId: professionals.googleCalendarId,
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
    console.error('❌ Agendamento não encontrado:', appointmentId)
    throw new Error(`Agendamento ${appointmentId} não encontrado`)
  }

  // Se não tem googleEventId, cria um novo evento ao invés de atualizar
  if (!appointment.googleEventId) {
    console.log('ℹ️ Agendamento não tem googleEventId. Criando novo evento ao invés de atualizar.')
    return createGoogleEvent(appointmentId)
  }

  // Garante que o profissional tenha um calendário secundário
  const calendarId = appointment.professionalGoogleCalendarId || await ensureProfessionalCalendar(
    appointment.professionalId,
    appointment.salonId
  )

  if (!calendarId) {
    console.warn('⚠️ Não foi possível obter/criar calendário secundário. Integração pode não estar configurada.')
    return null
  }

  // Obtém cliente Google Calendar autenticado
  const googleClient = await getSalonGoogleClient(appointment.salonId)
  
  if (!googleClient) {
    console.warn('⚠️ Cliente Google Calendar não disponível. Integração pode não estar configurada ou tokens inválidos.')
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

  // Cria evento atualizado
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
    console.log('📤 Atualizando evento no Google Calendar:', {
      calendarId,
      eventId: appointment.googleEventId,
      summary,
      start: event.start.dateTime,
      end: event.end.dateTime,
    })

    const response = await calendar.events.update({
      calendarId: calendarId,
      eventId: appointment.googleEventId,
      requestBody: event,
    })

    const updatedEvent = response.data

    console.log('✅ Evento atualizado com sucesso no Google Calendar:', {
      eventId: updatedEvent.id,
      htmlLink: updatedEvent.htmlLink,
    })

    return {
      eventId: updatedEvent.id || '',
      htmlLink: updatedEvent.htmlLink || undefined,
    }
  } catch (error: any) {
    // Se o evento não existe mais, tenta criar um novo
    if (error.code === 404) {
      console.log('ℹ️ Evento não encontrado no Google Calendar. Criando novo evento.')
      await db
        .update(appointments)
        .set({ googleEventId: null })
        .where(eq(appointments.id, appointmentId))
      return createGoogleEvent(appointmentId)
    }

    console.error('❌ Erro ao atualizar evento no Google Calendar:', {
      error: error.message,
      code: error.code,
      status: error.response?.status,
      data: error.response?.data,
    })
    throw new Error(`Falha ao atualizar evento no Google Calendar: ${error.message}`)
  }
}

