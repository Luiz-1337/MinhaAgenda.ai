import { and, eq, gt, lt, ne } from "drizzle-orm"

import { appointments, availability, db } from "../index"
import { MINUTE_IN_MS, parseTimeInDay } from "../utils/time.utils"
import { fromBrazilTime, getBrazilNow, toBrazilTime } from "../utils/timezone.utils"

/**
 * Parâmetros para busca de horários disponíveis.
 */
export interface GetAvailableSlotsInput {
  date: Date | string
  salonId: string
  serviceDuration: number
  professionalId: string
}

/**
 * Obtém os horários disponíveis para agendamento em uma data específica.
 * 
 * **Regras de Negócio:**
 * - Busca horários de trabalho do profissional na tabela `availability` (onde `isBreak = false`)
 * - Exclui períodos já ocupados por agendamentos existentes (exceto cancelados)
 * - Gera slots com base na duração do serviço solicitado
 * - Filtra slots no passado se a data for hoje
 * - Retorna slots no formato "HH:mm" (horário de Brasília)
 * 
 * @param input - Parâmetros para busca de disponibilidade
 * @param input.date - Data para verificar disponibilidade (Date ou string ISO)
 * @param input.salonId - ID do salão (UUID)
 * @param input.serviceDuration - Duração do serviço em minutos
 * @param input.professionalId - ID do profissional (obrigatório)
 * 
 * @returns Array de strings no formato "HH:mm" com os horários disponíveis
 * 
 * @throws Lança erro se salonId, professionalId forem inválidos ou serviceDuration for <= 0
 */
export async function getAvailableSlots({
  date,
  salonId,
  serviceDuration,
  professionalId,
}: GetAvailableSlotsInput): Promise<string[]> {
  validateInputs(salonId, serviceDuration, professionalId)

  // Normaliza a data e assume que está em horário de Brasília
  // IMPORTANTE: Precisamos calcular o dayOfWeek no timezone de Brasília, não no timezone do servidor
  const targetDate = normalizeDate(date)
  // Para calcular o dayOfWeek corretamente no timezone de Brasília, precisamos usar format do date-fns-tz
  // que retorna os componentes de data no timezone especificado
  const targetDateBrazil = fromBrazilTime(targetDate)
  // getDay() retorna o dia da semana baseado no timezone local do sistema
  // Como targetDateBrazil já está no timezone de Brasília (via toZonedTime), getDay() deve funcionar
  // Mas para garantir, vamos usar uma abordagem mais explícita
  const dayOfWeek = targetDateBrazil.getDay() // 0 = domingo, 6 = sábado

  // Busca horários de trabalho do profissional para este dia da semana
  const allAvailabilityForProfessional = await db
    .select({
      dayOfWeek: availability.dayOfWeek,
      startTime: availability.startTime,
      endTime: availability.endTime,
      isBreak: availability.isBreak,
    })
    .from(availability)
    .where(eq(availability.professionalId, professionalId!))
  
  const professionalAvailability = allAvailabilityForProfessional
    .filter((a) => a.dayOfWeek === dayOfWeek)
    .map(({ startTime, endTime, isBreak }) => ({ startTime, endTime, isBreak }))

  const workSpans = professionalAvailability.filter((r) => !r.isBreak)

  if (workSpans.length === 0) {
    return []
  }

  // Para cada intervalo de trabalho do profissional, gera slots disponíveis
  const allAvailableSlots: string[] = []
  const nowBrazil = getBrazilNow()
  const isToday = isSameDay(targetDateBrazil, nowBrazil)

  for (const workPeriod of workSpans) {
    const startTimeStr = String(workPeriod.startTime)
    const endTimeStr = String(workPeriod.endTime)

    // Calcula início e fim do período de trabalho no dia específico (em horário de Brasília)
    const periodStartBrazil = parseTimeInDay(targetDateBrazil, startTimeStr)
    const periodEndBrazil = parseTimeInDay(targetDateBrazil, endTimeStr)

    if (!periodStartBrazil || !periodEndBrazil || periodEndBrazil <= periodStartBrazil) {
      continue
    }

    // Converte para UTC para comparar com agendamentos (que estão em UTC)
    const periodStartUtc = toBrazilTime(periodStartBrazil)
    const periodEndUtc = toBrazilTime(periodEndBrazil)

    // Busca agendamentos existentes para este profissional neste dia (em UTC)
    const busySlots = await getBusyTimeSlots(
      salonId,
      professionalId!,
      periodStartUtc,
      periodEndUtc
    )

    // Gera slots disponíveis para este período
    // Trabalha em UTC internamente, mas retorna em horário de Brasília
    const slots = generateAvailableSlots(
      periodStartUtc,
      periodEndUtc,
      serviceDuration,
      busySlots,
      isToday ? toBrazilTime(nowBrazil) : null
    )

    allAvailableSlots.push(...slots)
  }

  // Remove duplicatas e ordena
  return [...new Set(allAvailableSlots)].sort()
}

/**
 * Valida os parâmetros de entrada da função getAvailableSlots.
 * 
 * @param salonId - ID do salão a validar
 * @param serviceDuration - Duração do serviço em minutos a validar
 * @param professionalId - ID do profissional a validar
 * 
 * @throws Erro se salonId, professionalId estiverem vazios ou serviceDuration for <= 0
 */
function validateInputs(salonId: string, serviceDuration: number, professionalId?: string): void {
  if (!salonId) {
    throw new Error("salonId é obrigatório")
  }
  if (!professionalId) {
    throw new Error("professionalId é obrigatório")
  }
  if (serviceDuration <= 0) {
    throw new Error("serviceDuration deve ser maior que zero")
  }
}

/**
 * Normaliza uma data (string ou Date) para objeto Date válido.
 * 
 * @param date - Data a normalizar (Date ou string ISO)
 * 
 * @returns Objeto Date válido
 * 
 * @throws Erro se a data for inválida (NaN)
 */
function normalizeDate(date: Date | string): Date {
  const targetDate = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(targetDate.getTime())) {
    throw new Error("Data inválida")
  }
  return targetDate
}

/**
 * Obtém os períodos ocupados por agendamentos existentes no intervalo especificado.
 * 
 * @param salonId - ID do salão
 * @param professionalId - ID do profissional
 * @param dayStart - Início do período a verificar (Date)
 * @param dayEnd - Fim do período a verificar (Date)
 * 
 * @returns Array de objetos com start e end representando períodos ocupados, ordenados por data
 */
async function getBusyTimeSlots(
  salonId: string,
  professionalId: string,
  dayStart: Date,
  dayEnd: Date
): Promise<Array<{ start: Date; end: Date }>> {
  const existingAppointments = await db
    .select({
      start: appointments.date,
      end: appointments.endTime,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.salonId, salonId),
        eq(appointments.professionalId, professionalId),
        ne(appointments.status, 'cancelled'),
        lt(appointments.date, dayEnd),
        gt(appointments.endTime, dayStart)
      )
    )

  return existingAppointments
    .map(({ start, end }) => ({
      start: new Date(start),
      end: new Date(end),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

/**
 * Gera os slots disponíveis baseado nos períodos ocupados.
 * 
 * **Algoritmo:**
 * - Itera do início ao fim do período em intervalos de serviceDuration
 * - Para cada slot potencial, verifica se há sobreposição com períodos ocupados
 * - Filtra slots no passado se a data for hoje
 * - Retorna apenas slots sem conflitos, no formato "HH:mm" (horário de Brasília)
 * 
 * @param periodStart - Início do período (Date)
 * @param periodEnd - Fim do período (Date)
 * @param serviceDuration - Duração do serviço em minutos
 * @param busySlots - Array de períodos ocupados (ordenados por data)
 * @param now - Data/hora atual (opcional, usado para filtrar slots no passado)
 * 
 * @returns Array de strings no formato "HH:mm" com os horários disponíveis
 */
function generateAvailableSlots(
  periodStart: Date,
  periodEnd: Date,
  serviceDuration: number,
  busySlots: Array<{ start: Date; end: Date }>,
  now: Date | null = null
): string[] {
  const durationMs = serviceDuration * MINUTE_IN_MS
  const periodStartMs = periodStart.getTime()
  const periodEndMs = periodEnd.getTime()
  const availableSlots: string[] = []
  const nowMs = now ? now.getTime() : null

  // Gera slots em intervalos de 15 minutos (ou pode ser configurável)
  const slotInterval = 15 * MINUTE_IN_MS

  for (let current = periodStartMs; current + durationMs <= periodEndMs; current += slotInterval) {
    const slotStart = current
    const slotEnd = current + durationMs

    // Filtra slots no passado se for hoje
    if (nowMs !== null && slotEnd <= nowMs) {
      continue
    }

    // Verifica sobreposição com agendamentos existentes
    const hasOverlap = busySlots.some(
      ({ start, end }) => slotStart < end.getTime() && slotEnd > start.getTime()
    )

    if (!hasOverlap) {
      // Converte de UTC para horário de Brasília e formata como "HH:mm"
      const slotDateUtc = new Date(slotStart)
      const brazilTime = fromBrazilTime(slotDateUtc)
      const timeString = formatTime(brazilTime)
      availableSlots.push(timeString)
    }
  }

  return availableSlots
}

/**
 * Verifica se duas datas são do mesmo dia (ignorando hora).
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

/**
 * Formata uma data como string "HH:mm".
 */
function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}
