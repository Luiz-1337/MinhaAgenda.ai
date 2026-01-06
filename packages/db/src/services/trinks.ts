/**
 * Serviço compartilhado para integração com API Trinks
 * Centraliza a lógica de autenticação e operações com a API Trinks
 * Pode ser usado tanto pelo mcp-server quanto pelo apps/web
 */

import { db, salonIntegrations, appointments, services, professionals, profiles } from '../index'
import { eq, and } from 'drizzle-orm'

const TRINKS_API_BASE_URL = 'https://api.trinks.com/v1'

/**
 * Obtém o token da API Trinks para um salão
 */
async function getTrinksToken(salonId: string): Promise<string | null> {
  const integration = await db.query.salonIntegrations.findFirst({
    where: and(
      eq(salonIntegrations.salonId, salonId),
      eq(salonIntegrations.provider, 'trinks')
    ),
  })

  if (!integration || !integration.accessToken) {
    return null
  }

  // Para Trinks, o accessToken é o token da API (ApiKey)
  // Não há refresh token, é um token fixo
  return integration.accessToken
}

/**
 * Verifica se a integração Trinks está ativa para um salão
 */
export async function isTrinksIntegrationActive(salonId: string): Promise<boolean> {
  const token = await getTrinksToken(salonId)
  return token !== null
}

/**
 * Obtém o cliente HTTP configurado com autenticação Trinks
 */
async function getTrinksClient(salonId: string): Promise<{ token: string } | null> {
  const token = await getTrinksToken(salonId)
  
  if (!token) {
    return null
  }

  return { token }
}

/**
 * Faz uma requisição autenticada para a API Trinks
 */
async function trinksRequest<T>(
  salonId: string,
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    body?: unknown
  } = {}
): Promise<T> {
  const client = await getTrinksClient(salonId)
  
  if (!client) {
    throw new Error('Integração Trinks não configurada ou token inválido')
  }

  const url = `${TRINKS_API_BASE_URL}${endpoint}`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${client.token}`,
    'Content-Type': 'application/json',
  }

  const config: RequestInit = {
    method: options.method || 'GET',
    headers,
  }

  if (options.body && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH')) {
    config.body = JSON.stringify(options.body)
  }

  try {
    const response = await fetch(url, config)
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Erro na API Trinks (${response.status}): ${errorText}`)
    }

    // Se a resposta estiver vazia (204 No Content), retorna null
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return null as T
    }

    return await response.json()
  } catch (error) {
    console.error('Erro ao fazer requisição para API Trinks:', error)
    throw error
  }
}

/**
 * Cria um agendamento na Trinks
 */
export async function createTrinksAppointment(appointmentId: string): Promise<{ eventId: string } | null> {
  console.log('📅 Iniciando criação de agendamento na Trinks para:', appointmentId)

  // Busca dados completos do agendamento
  const appointmentData = await db
    .select({
      id: appointments.id,
      salonId: appointments.salonId,
      professionalId: appointments.professionalId,
      clientId: appointments.clientId,
      serviceId: appointments.serviceId,
      date: appointments.date,
      endTime: appointments.endTime,
      status: appointments.status,
      notes: appointments.notes,
      professionalName: professionals.name,
      professionalEmail: professionals.email,
      serviceName: services.name,
      serviceDuration: services.duration,
      clientName: profiles.fullName,
      clientEmail: profiles.email,
      clientPhone: profiles.phone,
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

  // Verifica se a integração está ativa
  if (!(await isTrinksIntegrationActive(appointment.salonId))) {
    console.warn('⚠️ Integração Trinks não está ativa para este salão')
    return null
  }

  try {
    // Mapeia status do nosso sistema para o formato Trinks
    // Trinks usa: 'pendente', 'confirmado', 'cancelado', 'finalizado', 'cliente_faltou', 'em_atendimento'
    const statusMap: Record<string, string> = {
      'pending': 'pendente',
      'confirmed': 'confirmado',
      'cancelled': 'cancelado',
      'completed': 'finalizado',
    }

    // Prepara payload para criação na Trinks
    // Nota: A estrutura exata depende da API Trinks, ajustar conforme documentação
    const payload = {
      data: appointment.date.toISOString(),
      hora: appointment.date.toISOString().split('T')[1].substring(0, 5), // HH:mm
      profissional_id: appointment.professionalId, // Pode precisar do ID do profissional na Trinks
      servico_id: appointment.serviceId, // Pode precisar do ID do serviço na Trinks
      cliente_nome: appointment.clientName || 'Cliente',
      cliente_email: appointment.clientEmail || '',
      cliente_telefone: appointment.clientPhone || '',
      observacoes: appointment.notes || '',
      status: statusMap[appointment.status] || 'pendente',
    }

    console.log('📤 Criando agendamento na Trinks:', { appointmentId, payload })

    const response = await trinksRequest<{ id: string }>(
      appointment.salonId,
      '/agendamentos',
      {
        method: 'POST',
        body: payload,
      }
    )

    const trinksEventId = response?.id || response?.toString()

    if (!trinksEventId) {
      console.warn('⚠️ Trinks retornou agendamento sem ID')
      return null
    }

    // Atualiza o agendamento com o ID do evento Trinks
    await db
      .update(appointments)
      .set({
        trinksEventId: trinksEventId.toString(),
      })
      .where(eq(appointments.id, appointmentId))

    console.log('✅ Agendamento criado na Trinks:', trinksEventId)

    return { eventId: trinksEventId.toString() }
  } catch (error: any) {
    console.error('❌ Erro ao criar agendamento na Trinks:', {
      error: error.message,
      appointmentId,
    })
    // Não lança erro - apenas loga, pois o agendamento já foi criado no nosso banco
    throw new Error(`Falha ao sincronizar com Trinks: ${error.message}`)
  }
}

/**
 * Atualiza um agendamento na Trinks
 */
export async function updateTrinksAppointment(appointmentId: string): Promise<{ eventId: string } | null> {
  console.log('🔄 Iniciando atualização de agendamento na Trinks para:', appointmentId)

  // Busca dados completos do agendamento
  const appointmentData = await db
    .select({
      id: appointments.id,
      salonId: appointments.salonId,
      professionalId: appointments.professionalId,
      clientId: appointments.clientId,
      serviceId: appointments.serviceId,
      date: appointments.date,
      endTime: appointments.endTime,
      status: appointments.status,
      notes: appointments.notes,
      trinksEventId: appointments.trinksEventId,
      professionalName: professionals.name,
      professionalEmail: professionals.email,
      serviceName: services.name,
      serviceDuration: services.duration,
      clientName: profiles.fullName,
      clientEmail: profiles.email,
      clientPhone: profiles.phone,
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

  // Verifica se a integração está ativa
  if (!(await isTrinksIntegrationActive(appointment.salonId))) {
    console.warn('⚠️ Integração Trinks não está ativa para este salão')
    return null
  }

  // Se não tem trinksEventId, cria um novo agendamento
  if (!appointment.trinksEventId) {
    console.log('ℹ️ Agendamento não tem trinksEventId. Criando novo agendamento ao invés de atualizar.')
    return createTrinksAppointment(appointmentId)
  }

  try {
    const statusMap: Record<string, string> = {
      'pending': 'pendente',
      'confirmed': 'confirmado',
      'cancelled': 'cancelado',
      'completed': 'finalizado',
    }

    const payload = {
      data: appointment.date.toISOString(),
      hora: appointment.date.toISOString().split('T')[1].substring(0, 5),
      profissional_id: appointment.professionalId,
      servico_id: appointment.serviceId,
      cliente_nome: appointment.clientName || 'Cliente',
      cliente_email: appointment.clientEmail || '',
      cliente_telefone: appointment.clientPhone || '',
      observacoes: appointment.notes || '',
      status: statusMap[appointment.status] || 'pendente',
    }

    console.log('📤 Atualizando agendamento na Trinks:', {
      trinksEventId: appointment.trinksEventId,
      payload,
    })

    await trinksRequest(
      appointment.salonId,
      `/agendamentos/${appointment.trinksEventId}`,
      {
        method: 'PUT',
        body: payload,
      }
    )

    console.log('✅ Agendamento atualizado na Trinks:', appointment.trinksEventId)

    return { eventId: appointment.trinksEventId }
  } catch (error: any) {
    // Se o agendamento não existe mais na Trinks, tenta criar um novo
    if (error.message?.includes('404') || error.message?.includes('não encontrado')) {
      console.log('ℹ️ Agendamento não encontrado na Trinks. Criando novo agendamento.')
      await db
        .update(appointments)
        .set({ trinksEventId: null })
        .where(eq(appointments.id, appointmentId))
      return createTrinksAppointment(appointmentId)
    }

    console.error('❌ Erro ao atualizar agendamento na Trinks:', {
      error: error.message,
      appointmentId,
    })
    throw new Error(`Falha ao atualizar agendamento na Trinks: ${error.message}`)
  }
}

/**
 * Deleta um agendamento na Trinks
 */
export async function deleteTrinksAppointment(appointmentId: string): Promise<boolean | null> {
  console.log('🗑️ Iniciando deleção de agendamento na Trinks para:', appointmentId)

  const appointment = await db.query.appointments.findFirst({
    where: eq(appointments.id, appointmentId),
    columns: {
      id: true,
      salonId: true,
      trinksEventId: true,
    },
  })

  if (!appointment) {
    console.error('❌ Agendamento não encontrado:', appointmentId)
    throw new Error(`Agendamento ${appointmentId} não encontrado`)
  }

  // Se não tem trinksEventId, não há agendamento para deletar
  if (!appointment.trinksEventId) {
    console.log('ℹ️ Agendamento não tem trinksEventId. Nada a deletar na Trinks.')
    return false
  }

  // Verifica se a integração está ativa
  if (!(await isTrinksIntegrationActive(appointment.salonId))) {
    console.warn('⚠️ Integração Trinks não está ativa para este salão')
    return null
  }

  try {
    console.log('📤 Deletando agendamento na Trinks:', {
      trinksEventId: appointment.trinksEventId,
    })

    await trinksRequest(
      appointment.salonId,
      `/agendamentos/${appointment.trinksEventId}`,
      {
        method: 'DELETE',
      }
    )

    console.log('✅ Agendamento deletado na Trinks')

    // Remove o trinksEventId do agendamento
    await db
      .update(appointments)
      .set({ trinksEventId: null })
      .where(eq(appointments.id, appointmentId))

    console.log('💾 trinksEventId removido do agendamento')

    return true
  } catch (error: any) {
    // Se o agendamento já foi deletado ou não existe, não é um erro crítico
    if (error.message?.includes('404') || error.message?.includes('não encontrado')) {
      console.log('ℹ️ Agendamento não encontrado na Trinks (já foi deletado). Removendo referência do banco.')
      await db
        .update(appointments)
        .set({ trinksEventId: null })
        .where(eq(appointments.id, appointmentId))
      return true
    }

    console.error('❌ Erro ao deletar agendamento na Trinks:', {
      error: error.message,
      appointmentId,
    })
    // Não lança erro - apenas loga, pois o agendamento já foi deletado no nosso banco
    throw new Error(`Falha ao deletar agendamento na Trinks: ${error.message}`)
  }
}

/**
 * Busca profissionais da Trinks
 */
export async function getTrinksProfessionals(salonId: string): Promise<unknown[]> {
  if (!(await isTrinksIntegrationActive(salonId))) {
    throw new Error('Integração Trinks não está ativa')
  }

  try {
    const response = await trinksRequest<{ data?: unknown[] } | unknown[]>(
      salonId,
      '/profissionais'
    )

    // A API pode retornar array diretamente ou dentro de um objeto data
    if (Array.isArray(response)) {
      return response
    }
    if (response && typeof response === 'object' && 'data' in response && Array.isArray(response.data)) {
      return response.data
    }

    return []
  } catch (error: any) {
    console.error('❌ Erro ao buscar profissionais da Trinks:', error)
    throw new Error(`Falha ao buscar profissionais: ${error.message}`)
  }
}

/**
 * Busca serviços da Trinks
 */
export async function getTrinksServices(salonId: string): Promise<unknown[]> {
  if (!(await isTrinksIntegrationActive(salonId))) {
    throw new Error('Integração Trinks não está ativa')
  }

  try {
    const response = await trinksRequest<{ data?: unknown[] } | unknown[]>(
      salonId,
      '/servicos'
    )

    if (Array.isArray(response)) {
      return response
    }
    if (response && typeof response === 'object' && 'data' in response && Array.isArray(response.data)) {
      return response.data
    }

    return []
  } catch (error: any) {
    console.error('❌ Erro ao buscar serviços da Trinks:', error)
    throw new Error(`Falha ao buscar serviços: ${error.message}`)
  }
}

/**
 * Busca produtos da Trinks
 */
export async function getTrinksProducts(salonId: string): Promise<unknown[]> {
  if (!(await isTrinksIntegrationActive(salonId))) {
    throw new Error('Integração Trinks não está ativa')
  }

  try {
    const response = await trinksRequest<{ data?: unknown[] } | unknown[]>(
      salonId,
      '/produtos'
    )

    if (Array.isArray(response)) {
      return response
    }
    if (response && typeof response === 'object' && 'data' in response && Array.isArray(response.data)) {
      return response.data
    }

    return []
  } catch (error: any) {
    console.error('❌ Erro ao buscar produtos da Trinks:', error)
    throw new Error(`Falha ao buscar produtos: ${error.message}`)
  }
}

