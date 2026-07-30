import { db, sql } from "@repo/db"

/** Horas antes do horário em que um cancelamento passa a contar como falta. */
export const LATE_CANCEL_HOURS = 24
/** Mínimo de compromissos avaliáveis para arriscar um julgamento. */
export const MIN_HISTORY = 3
/** A partir daqui o cliente é sinalizado como risco alto. */
export const HIGH_RISK_RATIO = 0.3

export interface NoShowRiskResult {
    isHighRisk: boolean
    /** Faltas ÷ compromissos avaliáveis. 0 quando não há histórico suficiente. */
    cancellationRatio: number
    /** Compromissos que dá para julgar: concluídos + faltas + cancelamentos tardios. */
    totalAppointments: number
    /** Faltas: no_show + cancelamento em cima da hora. */
    cancelledAppointments: number
}

/** Resultado neutro. Na dúvida o cliente NUNCA é acusado. */
const NO_RISK: NoShowRiskResult = {
    isHighRisk: false,
    cancellationRatio: 0,
    totalAppointments: 0,
    cancelledAppointments: 0,
}

/**
 * Avalia o risco de o cliente não aparecer.
 *
 * ## O que mudou, e por quê
 *
 * A versão anterior contava `status='cancelled'` sobre TODOS os agendamentos do
 * cliente. Isso estava errado nas duas pontas:
 *
 * - **Falso-negativo por construção:** cancelar era `db.delete`, então o
 *   cancelamento feito pelo salão ou pela IA apagava a linha. O numerador só
 *   pegava cancelamento vindo do Google Calendar. O sinal era praticamente sempre
 *   zero — o preditor existia sem funcionar.
 * - **Falso-positivo a partir de agora:** com o cancelamento virando soft delete,
 *   contar todo `cancelled` como falta transformaria "avisei com uma semana de
 *   antecedência" em "não apareceu". Esse número vira aviso no prompt da IA e
 *   aparece no painel: acusaria cliente educado.
 *
 * ## A regra
 *
 * Falta = `no_show` **ou** cancelamento em cima da hora (menos de
 * {@link LATE_CANCEL_HOURS}h do horário) — nos dois casos a cadeira ficou vazia
 * sem tempo de reocupar.
 *
 * O denominador são só os compromissos **avaliáveis**: concluído, falta, ou
 * cancelamento tardio. Ficam FORA:
 * - cancelamento com antecedência (o cliente fez o certo — não entra em nenhum
 *   dos dois lados, em vez de "diluir" o índice como bom comportamento);
 * - agendamento futuro e o que ainda não terminou (nada aconteceu ainda);
 * - `pending`/`confirmed` no passado sem desfecho — ninguém fechou no balcão, e
 *   não saber não é sinal contra o cliente.
 *
 * Uma SQL só: antes materializava todas as linhas do cliente para filtrar em JS,
 * e isto roda a cada mensagem recebida no WhatsApp.
 *
 * @param clientId `customers.id` (não `profiles.id` — FK de appointments.client_id)
 * @param salonId ID do salão
 */
export async function evaluateNoShowRisk(
    clientId: string,
    salonId: string
): Promise<NoShowRiskResult> {
    try {
        // Cancelamento tardio: cancelled_at existe (migration 027) mas é null nas
        // linhas canceladas ANTES dela — nesses casos não dá para saber a
        // antecedência, e a linha fica fora do cálculo em vez de virar acusação.
        const rows = await db.execute(sql`
            with avaliaveis as (
                select
                    a.status,
                    (
                        a.status = 'no_show'
                        or (
                            a.status = 'cancelled'
                            and a.cancelled_at is not null
                            and a.cancelled_at > a.date - make_interval(hours => ${LATE_CANCEL_HOURS}::int)
                        )
                    ) as e_falta
                from appointments a
                where a.client_id = ${clientId}
                  and a.salon_id = ${salonId}
                  and a.end_time < now()
                  and (
                    a.status in ('completed', 'no_show')
                    or (a.status = 'cancelled' and a.cancelled_at is not null)
                  )
            )
            select
                count(*) filter (where status <> 'cancelled' or e_falta)::int as total,
                count(*) filter (where e_falta)::int as faltas
            from avaliaveis
        `)

        const total = Number(rows[0]?.total ?? 0)
        const faltas = Number(rows[0]?.faltas ?? 0)

        // Pouco histórico: sem base para julgar. Devolve neutro em vez de um ratio
        // volátil (1 falta em 1 compromisso não é 100% de risco).
        if (total < MIN_HISTORY) {
            return { ...NO_RISK, totalAppointments: total }
        }

        const cancellationRatio = faltas / total

        return {
            isHighRisk: cancellationRatio >= HIGH_RISK_RATIO,
            cancellationRatio,
            totalAppointments: total,
            cancelledAppointments: faltas,
        }
    } catch (error) {
        console.error(`Erro ao avaliar risco de falta para cliente ${clientId}:`, error)
        // Falha vira baixo risco de propósito: um erro de query não pode fazer a IA
        // tratar um cliente como caloteiro.
        return NO_RISK
    }
}
