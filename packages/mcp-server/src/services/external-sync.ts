/**
 * Serviço de sincronização externa para agendamentos
 * Responsável por sincronizar agendamentos com sistemas externos (Google Calendar, etc.)
 * 
 * As funções são não-bloqueantes: erros na sincronização não impedem a operação principal
 */

import { db, appointments } from "@repo/db"
import { eq } from "drizzle-orm"

/**
 * Verifica se a integração do Google Calendar está ativa para um salão
 */
async function checkGoogleCalendarIntegration(salonId: string): Promise<boolean> {
  try {
    const { getSalonGoogleClient } = await import("@repo/db")
    const client = await getSalonGoogleClient(salonId)
    return client !== null
  } catch (error) {
    console.warn("Erro ao verificar integração Google Calendar:", error)
    return false
  }
}

/**
 * Sincroniza criação de agendamento com sistemas externos (Google Calendar)
 * 
 * @param appointmentId - ID do agendamento criado
 */
export async function syncCreateAppointment(appointmentId: string): Promise<void> {
  try {
    // 1. Busca agendamento para obter salonId
    const appointment = await db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      columns: { salonId: true }
    })

    if (!appointment) {
      console.warn(`Agendamento ${appointmentId} não encontrado para sincronização`)
      return
    }

    // 2. Verifica se integração está ativa
    const hasIntegration = await checkGoogleCalendarIntegration(appointment.salonId)
    if (!hasIntegration) {
      return // Silenciosamente retorna se não há integração
    }

    // 3. Chama função do Google Calendar
    const { createGoogleEvent } = await import("@repo/db")
    const result = await createGoogleEvent(appointmentId)
    
    if (result) {
      console.log("✅ Agendamento sincronizado com Google Calendar:", {
        appointmentId,
        eventId: result.eventId,
        htmlLink: result.htmlLink,
      })
    } else {
      console.warn("⚠️ Sincronização com Google Calendar retornou null. Integração pode não estar configurada.")
    }
  } catch (error: any) {
    // Não lança erro - apenas loga
    console.error("❌ Erro ao sincronizar criação de agendamento:", {
      appointmentId,
      error: error?.message || error,
      stack: error?.stack,
    })
  }
}

/**
 * Sincroniza atualização de agendamento com sistemas externos (Google Calendar)
 * 
 * @param appointmentId - ID do agendamento atualizado
 */
export async function syncUpdateAppointment(appointmentId: string): Promise<void> {
  try {
    // 1. Busca agendamento para obter salonId
    const appointment = await db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      columns: { salonId: true }
    })

    if (!appointment) {
      console.warn(`Agendamento ${appointmentId} não encontrado para sincronização`)
      return
    }

    // 2. Verifica se integração está ativa
    const hasIntegration = await checkGoogleCalendarIntegration(appointment.salonId)
    if (!hasIntegration) {
      return // Silenciosamente retorna se não há integração
    }

    // 3. Chama função do Google Calendar
    const { updateGoogleEvent } = await import("@repo/db")
    const result = await updateGoogleEvent(appointmentId)
    
    if (result) {
      console.log("✅ Agendamento atualizado no Google Calendar:", {
        appointmentId,
        eventId: result.eventId,
        htmlLink: result.htmlLink,
      })
    } else {
      console.warn("⚠️ Atualização no Google Calendar retornou null. Integração pode não estar configurada.")
    }
  } catch (error: any) {
    // Não lança erro - apenas loga
    console.error("❌ Erro ao sincronizar atualização de agendamento:", {
      appointmentId,
      error: error?.message || error,
      stack: error?.stack,
    })
  }
}

/**
 * Sincroniza deleção de agendamento com sistemas externos (Google Calendar)
 * IMPORTANTE: Esta função deve ser chamada ANTES de deletar o agendamento do banco
 * 
 * @param appointmentId - ID do agendamento a ser deletado
 */
export async function syncDeleteAppointment(appointmentId: string): Promise<void> {
  try {
    // 1. Busca agendamento para obter salonId (deve existir ainda)
    const appointment = await db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      columns: { salonId: true }
    })

    if (!appointment) {
      console.warn(`Agendamento ${appointmentId} não encontrado para sincronização de deleção`)
      return
    }

    // 2. Verifica se integração está ativa
    const hasIntegration = await checkGoogleCalendarIntegration(appointment.salonId)
    if (!hasIntegration) {
      return // Silenciosamente retorna se não há integração
    }

    // 3. Chama função do Google Calendar
    const { deleteGoogleEvent } = await import("@repo/db")
    const result = await deleteGoogleEvent(appointmentId)
    
    if (result === true) {
      console.log("✅ Evento removido com sucesso do Google Calendar:", {
        appointmentId,
      })
    } else if (result === false) {
      console.log("ℹ️ Agendamento não tinha evento no Google Calendar")
    } else {
      console.warn("⚠️ Não foi possível remover evento do Google Calendar. Integração pode não estar configurada.")
    }
  } catch (error: any) {
    // Não lança erro - apenas loga
    console.error("❌ Erro ao sincronizar deleção de agendamento:", {
      appointmentId,
      error: error?.message || error,
      stack: error?.stack,
    })
  }
}
