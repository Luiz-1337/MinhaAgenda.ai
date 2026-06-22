/**
 * Regras de negócio PURAS de agendamento — sem nenhum I/O (banco, rede, relógio
 * externo). Extraídas de `appointments.ts` para permitir teste determinístico,
 * independente de banco de dados, e para deixar as decisões explícitas.
 */

/**
 * Decide se a verificação de conflito de agenda (e o advisory lock por pessoa)
 * precisa rodar numa ATUALIZAÇÃO de agendamento.
 *
 * Deve rodar sempre que o intervalo ocupado puder mudar:
 * - a data/hora mudou; OU
 * - o profissional mudou; OU
 * - o serviço mudou (a duração muda → o horário de término muda).
 *
 * O último caso é essencial: trocar apenas o serviço por um mais longo estende
 * o agendamento e pode invadir o horário seguinte. Sem ele, ocorre
 * double-booking silencioso (bug C2).
 */
export function needsConflictCheck(input: {
  dateChanged: boolean
  professionalChanged: boolean
  serviceChanged: boolean
}): boolean {
  return input.dateChanged || input.professionalChanged || input.serviceChanged
}

/**
 * Indica se um instante de início está no passado em relação a `now`.
 * Usado para impedir a criação/reagendamento de agendamentos no passado (bug C3).
 */
export function isPastBooking(startUtc: Date, now: Date = new Date()): boolean {
  return startUtc.getTime() < now.getTime()
}
