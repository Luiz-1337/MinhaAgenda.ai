import { and, eq, gt, lt, ne } from "drizzle-orm"
import { z } from "zod"

import { db, appointments, availability, professionals, professionalServices, services } from "../index"
import { formatZodError } from "../utils/validation.utils"
import { BRAZIL_TIMEZONE } from "../utils/timezone.utils"
import { fromZonedTime } from "date-fns-tz"

/**
 * Tipo de resultado padronizado para operações de serviço.
 * Usado para garantir consistência nas respostas de sucesso/erro.
 */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * Cria um novo agendamento no sistema.
 *
 * **Regras de Negócio:**
 * - Valida que o serviço existe, está ativo e pertence ao salão
 * - Valida que o profissional existe, está ativo e pertence ao salão
 * - Verifica se o profissional executa o serviço solicitado
 * - Verifica se o horário solicitado está dentro do expediente do profissional (considerando timezone do Brasil)
 * - Verifica conflitos com agendamentos existentes (exceto cancelados)
 * - Converte a data/hora do horário de Brasília para UTC antes de salvar
 *
 * @param input - Dados do agendamento a ser criado
 * @param input.salonId - ID do salão (UUID)
 * @param input.professionalId - ID do profissional (UUID)
 * @param input.clientId - ID do cliente (UUID)
 * @param input.serviceId - ID do serviço (UUID)
 * @param input.date - Data/hora do agendamento (string ISO ou Date) - interpretada como horário de Brasília
 * @param input.notes - Notas opcionais do agendamento (máx. 1000 caracteres)
 *
 * @returns Resultado da operação com o ID do agendamento criado em caso de sucesso
 *
 * @throws Não lança exceções, retorna erro via ActionResult
 */
export async function createAppointmentService(input: {
  salonId: string
  professionalId: string
  clientId: string
  serviceId: string
  date: string | Date
  notes?: string
}): Promise<ActionResult<{ appointmentId: string }>> {
  const schema = z.object({
    salonId: z.string().uuid(),
    professionalId: z.string().uuid(),
    clientId: z.string().uuid(),
    serviceId: z.string().uuid(),
    date: z.union([
      z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Data inválida"),
      z.date(),
    ]),
    notes: z.string().max(1000).optional(),
  })

  const parse = schema.safeParse(input)
  if (!parse.success) {
    return { success: false, error: formatZodError(parse.error) }
  }
  const { salonId, professionalId, clientId, serviceId } = parse.data

  const [service, professional] = await Promise.all([
    db.query.services.findFirst({
      where: eq(services.id, serviceId),
      columns: { id: true, salonId: true, duration: true, isActive: true },
    }),
    db.query.professionals.findFirst({
      where: eq(professionals.id, professionalId),
      columns: { id: true, salonId: true, isActive: true },
    }),
  ])

  if (!service || service.salonId !== salonId || !service.isActive) {
    return { success: false, error: "Serviço inválido ou inativo" }
  }
  if (!professional || professional.salonId !== salonId || !professional.isActive) {
    return { success: false, error: "Profissional inválido ou inativo" }
  }

  const proService = await db.query.professionalServices.findFirst({
    where: and(eq(professionalServices.professionalId, professionalId), eq(professionalServices.serviceId, serviceId)),
    columns: { id: true },
  })
  if (!proService) {
    return { success: false, error: "Profissional não executa este serviço" }
  }

  // TODAS as datas de entrada são tratadas como UTC-3 (horário do Brasil)
  // O aplicativo é nativo do Brasil, então sempre assumimos UTC-3
  let startUtc: Date
  let dateComponents: { year: number; month: number; day: number; hour: number; minute: number; second: number }
  
  if (typeof parse.data.date === "string") {
    const dateStr = parse.data.date.trim()
    // SEMPRE remove qualquer timezone existente e trata como UTC-3
    // Parse da string ISO para obter os componentes
    // Aceita formatos: YYYY-MM-DDTHH:mm, YYYY-MM-DDTHH:mm:ss, YYYY-MM-DDTHH:mm:ss.sss
    // Com ou sem timezone (Z, +HH:mm, -HH:mm) ou sem nada no final
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/)
    if (!match) {
      return { success: false, error: `Formato de data inválido: ${dateStr}. Esperado formato ISO (ex: 2024-01-15T14:00:00 ou 2024-01-15T14:00)` }
    }
    const [, year, month, day, hour, minute, second = "0"] = match
    dateComponents = {
      year: parseInt(year, 10),
      month: parseInt(month, 10) - 1, // meses são 0-indexed
      day: parseInt(day, 10),
      hour: parseInt(hour, 10),
      minute: parseInt(minute, 10),
      second: parseInt(second, 10)
    }
    
    // Valida os componentes
    if (dateComponents.month < 0 || dateComponents.month > 11) {
      return { success: false, error: `Mês inválido: ${parseInt(month, 10)}` }
    }
    if (dateComponents.day < 1 || dateComponents.day > 31) {
      return { success: false, error: `Dia inválido: ${dateComponents.day}` }
    }
    if (dateComponents.hour < 0 || dateComponents.hour > 23) {
      return { success: false, error: `Hora inválida: ${dateComponents.hour}` }
    }
    if (dateComponents.minute < 0 || dateComponents.minute > 59) {
      return { success: false, error: `Minuto inválido: ${dateComponents.minute}` }
    }
    if (dateComponents.second < 0 || dateComponents.second > 59) {
      return { success: false, error: `Segundo inválido: ${dateComponents.second}` }
    }
    
    // Constrói a string ISO a partir dos componentes extraídos e adiciona -03:00 (UTC-3)
    // Isso garante que sempre teremos o formato correto, independente do formato de entrada
    const yearStr = dateComponents.year.toString().padStart(4, '0')
    const monthStr = (dateComponents.month + 1).toString().padStart(2, '0')
    const dayStr = dateComponents.day.toString().padStart(2, '0')
    const hourStr = dateComponents.hour.toString().padStart(2, '0')
    const minuteStr = dateComponents.minute.toString().padStart(2, '0')
    const secondStr = dateComponents.second.toString().padStart(2, '0')
    
    const dateWithTimezone = `${yearStr}-${monthStr}-${dayStr}T${hourStr}:${minuteStr}:${secondStr}-03:00`
    // Cria o Date que já converte automaticamente para UTC
    startUtc = new Date(dateWithTimezone)
    
    // Valida se o Date foi criado corretamente
    if (Number.isNaN(startUtc.getTime())) {
      return { success: false, error: `Não foi possível criar a data a partir de: ${dateStr} (processado como: ${dateWithTimezone})` }
    }
  } else {
    // Se já é um Date, SEMPRE trata como UTC-3 e converte para UTC
    // Extrai componentes assumindo que o Date representa UTC-3
    dateComponents = {
      year: parse.data.date.getFullYear(),
      month: parse.data.date.getMonth(),
      day: parse.data.date.getDate(),
      hour: parse.data.date.getHours(),
      minute: parse.data.date.getMinutes(),
      second: parse.data.date.getSeconds()
    }
    // Trata como UTC-3 e converte para UTC usando fromZonedTime
    startUtc = fromZonedTime(parse.data.date, BRAZIL_TIMEZONE)
    
    if (Number.isNaN(startUtc.getTime())) {
      return { success: false, error: "Data inválida (objeto Date)" }
    }
  }
  
  // Cria um Date com os componentes para validações (getDay, etc)
  const requestedStartBrazil = new Date(
    dateComponents.year,
    dateComponents.month,
    dateComponents.day,
    dateComponents.hour,
    dateComponents.minute,
    dateComponents.second
  )
  const endUtc = new Date(startUtc.getTime() + service.duration * 60 * 1000)

  const dayOfWeek = requestedStartBrazil.getDay()

  const proDayRules = await db
    .select({ startTime: availability.startTime, endTime: availability.endTime, isBreak: availability.isBreak })
    .from(availability)
    .where(and(eq(availability.professionalId, professionalId), eq(availability.dayOfWeek, dayOfWeek)))

  const workSpans = proDayRules.filter((r) => !r.isBreak)

  if (workSpans.length === 0) {
    return { success: false, error: "Profissional não possui horários cadastrados neste dia" }
  }

  const withinWork = workSpans.some((span) => {
    const [sh, sm] = String(span.startTime).split(":").map(Number)
    const [eh, em] = String(span.endTime).split(":").map(Number)

    // Cria os spans de horário usando os componentes da data original (UTC-3)
    // Cria strings ISO com timezone -03:00 e converte para UTC
    const startSpanStr = `${dateComponents.year.toString().padStart(4, '0')}-${(dateComponents.month + 1).toString().padStart(2, '0')}-${dateComponents.day.toString().padStart(2, '0')}T${sh.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')}:00-03:00`
    const startSpanUtc = new Date(startSpanStr)

    const endSpanStr = `${dateComponents.year.toString().padStart(4, '0')}-${(dateComponents.month + 1).toString().padStart(2, '0')}-${dateComponents.day.toString().padStart(2, '0')}T${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}:00-03:00`
    const endSpanUtc = new Date(endSpanStr)

    return startUtc.getTime() >= startSpanUtc.getTime() && endUtc.getTime() <= endSpanUtc.getTime()
  })

  if (!withinWork) {
    return { success: false, error: "Horário fora do expediente do profissional" }
  }

  // Step B: Overlap Detection - Query appointments table for ANY confirmed appointment
  // that overlaps with the requested [startTime, endTime]
  // Overlap Logic: (existing_start < new_end) AND (existing_end > new_start)
  // Exclude cancelled appointments
  const overlappingAppointment = await db.query.appointments.findFirst({
    where: and(
      eq(appointments.professionalId, professionalId),
      ne(appointments.status, 'cancelled'),
      lt(appointments.date, endUtc), // existing_start < new_end
      gt(appointments.endTime, startUtc) // existing_end > new_start
    ),
  })

  if (overlappingAppointment) {
    return { success: false, error: "Horário indisponível (conflito de agenda)" }
  }

  const [newAppointment] = await db.insert(appointments).values({
    salonId,
    clientId,
    professionalId,
    serviceId: service.id,
    date: startUtc,
    endTime: endUtc,
    status: 'pending',
    notes: parse.data.notes
  }).returning({ id: appointments.id })

  return { success: true, data: { appointmentId: newAppointment.id } }
}
