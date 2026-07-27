/**
 * Texto do lembrete de agendamento.
 *
 * Módulo PROPOSITALMENTE sem dependências (nem @repo/db, nem logger): assim o
 * teste de colisão com o detector de opt-out importa só código puro, sem
 * arrastar o grafo de serviços. Ver reminder-optout-collision.test.ts.
 */

export interface ReminderMessageParts {
    firstName: string
    salonName: string
    serviceName: string
    professionalName: string
    when: string
}

/**
 * Monta o texto do lembrete.
 *
 * REGRA: NÃO peça ao cliente para responder uma palavra que o detector de
 * opt-out classifique como `hard_opt_out` (ver retention/opt-out-detector.ts).
 * Esse detector roda ANTES da IA e faz curto-circuito no worker (ETAPA 0): a
 * resposta nunca chega no agente.
 *
 * Era exatamente esse o bug do "responda CANCELAR" — o cliente achava que tinha
 * desmarcado o horário e só tinha se descadastrado do marketing, com o
 * agendamento intacto na agenda e ninguém avisado.
 *
 * "SIM" é seguro (não bate em nenhum dos três regexes) e tem handler de verdade:
 * a tool confirmAppointment. O cancelamento virou conversa livre com a IA, que
 * tem getMyFutureAppointments + removeAppointment.
 */
export function buildReminderMessage(parts: ReminderMessageParts): string {
    return `Olá ${parts.firstName}, tudo bem?
Passando para lembrar do seu horário no salão *${parts.salonName}* para *${parts.serviceName}* com ${parts.professionalName}.

Será: ${parts.when}

Para confirmar sua presença, responda *SIM*.
Se precisar remarcar ou cancelar, é só me escrever aqui que eu cuido disso.

Te esperamos lá! ✨`
}
