import { db, appointments, salons, profiles, sql, and, eq, lte, gt, isNull } from "@repo/db"

export interface ReminderJobResult {
    queuedCount: number
    failedCount: number
}

export type SendReminderMessage = (
    to: string,
    body: string,
    salonId: string
) => Promise<void>

function normalizeToE164(phone: string): string | null {
    const cleaned = phone.trim().replace(/^whatsapp:/i, '')
    if (cleaned.startsWith('+')) {
        return cleaned
    }

    const digits = cleaned.replace(/\D/g, '')
    if (!digits) {
        return null
    }

    if (digits.length >= 12 && digits.startsWith('55')) {
        return `+${digits}`
    }

    if (digits.length >= 10 && digits.length <= 11) {
        return `+55${digits}`
    }

    return null
}

/**
 * Busca e envia lembretes para agendamentos que estão dentro da janela de 24 horas a 48 horas.
 */
export async function dispatchDailyReminders(
    sendMessage: SendReminderMessage
): Promise<ReminderJobResult> {
    let queuedCount = 0
    let failedCount = 0

    // 1. Calcular a janela de tempo (ex: Agendamentos que ocorrerão daqui a 24 horas até daqui a 48 horas)
    const now = new Date()

    // Limites da janela
    const startWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000) // daqui a 24h
    const endWindow = new Date(now.getTime() + 48 * 60 * 60 * 1000)   // daqui a 48h (pra não mandar vários dias antes)

    try {
        // 2. Buscar agendamentos que precisam de lembrete
        // - Status pendente (ainda não confirmado/cancelado/finalizado)
        // - reminderSentAt == null
        // - Date está dentro da janela de 24h a 48h
        const pendingAppointments = await db.query.appointments.findMany({
            where: and(
                eq(appointments.status, 'pending'),
                isNull(appointments.reminderSentAt),
                gt(appointments.date, startWindow),
                lte(appointments.date, endWindow)
            ),
            with: {
                salon: true,
                client: true,
                professional: true,
                service: true
            }
        })

        // 3. Processar cada agendamento
        for (const apt of pendingAppointments) {
            if (!apt.client || !apt.client.phone || !apt.salon) {
                continue
            }

            const clientPhone = normalizeToE164(apt.client.phone)
            if (!clientPhone) {
                continue
            }

            // Formatando data baseada na convenção brasileira
            const formatterOptions: Intl.DateTimeFormatOptions = {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'America/Sao_Paulo'
            }

            const aptDateFormatted = new Date(apt.date).toLocaleString('pt-BR', formatterOptions)

            const messageBody = `Olá ${apt.client.firstName || apt.client.fullName}, tudo bem?
Passando para lembrar do seu horário no salão *${apt.salon.name}* para *${apt.service.name}* com ${apt.professional.name}.

Será: ${aptDateFormatted}

Para confirmar sua presença, responda com *CONFIRMAR*. 
Caso Precise cancelar, responda *CANCELAR*.

Te esperamos lá! ✨`

            try {
                await sendMessage(clientPhone, messageBody, apt.salon.id)

                // Atualizar no banco como enviado
                await db.update(appointments)
                    .set({ reminderSentAt: new Date(), updatedAt: new Date() })
                    .where(eq(appointments.id, apt.id))

                queuedCount++
            } catch (sendError) {
                console.error(`Erro ao enviar lembrete para agendamento ${apt.id}:`, sendError)
                failedCount++
            }
        }
    } catch (err) {
        console.error("Erro geral no job de reminders:", err)
        throw err
    }

    return { queuedCount, failedCount }
}
