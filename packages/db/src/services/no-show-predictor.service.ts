import { db, appointments, eq, and } from "@repo/db"

export interface NoShowRiskResult {
    isHighRisk: boolean
    cancellationRatio: number
    totalAppointments: number
    cancelledAppointments: number
}

/**
 * Avalia o risco de falta (no-show) de um cliente baseado no seu histórico de agendamentos.
 * Retorna alta chance de falta se a taxa de cancelamento for > 30% e tiver pelo menos 3 agendamentos no total.
 * 
 * @param clientId ID do cliente (tabela profiles/customers)
 * @param salonId ID do salão
 */
export async function evaluateNoShowRisk(
    clientId: string,
    salonId: string
): Promise<NoShowRiskResult> {
    try {
        // Busca todos os agendamentos do cliente no salão
        const clientAppointments = await db.query.appointments.findMany({
            where: and(
                eq(appointments.clientId, clientId),
                eq(appointments.salonId, salonId)
            ),
            columns: {
                id: true,
                status: true,
            },
        })

        const totalAppointments = clientAppointments.length

        // Se o cliente tem poucos agendamentos, não temos dados suficientes para considerar alto risco
        if (totalAppointments < 3) {
            return {
                isHighRisk: false,
                cancellationRatio: 0,
                totalAppointments,
                cancelledAppointments: 0,
            }
        }

        // Conta quantos agendamentos estão cancelados (no-show ou cancelamento em cima da hora)
        // Se "no-show" for um status separado no futuro, deve ser adicionado aqui
        const cancelledAppointments = clientAppointments.filter(
            (app) => app.status === 'cancelled'
        ).length

        const cancellationRatio = cancelledAppointments / totalAppointments

        // Define regra de risco: mais de 30% de taxa de cancelamento
        const isHighRisk = cancellationRatio >= 0.30

        return {
            isHighRisk,
            cancellationRatio,
            totalAppointments,
            cancelledAppointments,
        }
    } catch (error) {
        console.error(`Erro ao avaliar risco de falta para cliente ${clientId}:`, error)
        // Em caso de erro, assume baixo risco para não penalizar injustamente
        return {
            isHighRisk: false,
            cancellationRatio: 0,
            totalAppointments: 0,
            cancelledAppointments: 0,
        }
    }
}
