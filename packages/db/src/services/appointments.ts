import { and, eq, gt, inArray, lt, ne, sql } from "drizzle-orm"
import { z } from "zod"

import { db, appointments, availability, professionals, professionalServices, services, customers } from "../index"
import { formatZodError } from "../utils/validation.utils"
import { parseBrazilianDateTime, createBrazilDateTimeFromComponents, type DateComponents } from "../utils/date-parsing.utils"
import {
  getBlockingDuration,
  parseAllowedWeekdays,
  parseAllowedStartTimes,
  isWeekdayAllowed,
  isStartTimeAllowed,
  formatWeekdaysPtBr,
} from "../utils/service-schedule.utils"
import { getPersonProfessionalIdsByKey } from "./person"
import { fireAndForgetCreate, fireAndForgetUpdate, fireAndForgetDelete } from "./integration-sync"
import { processVacantSlot } from "./slot-filler.service"
import { getGoogleFreeBusyForProfessional } from "./google-calendar"
import { GOOGLE_BLOCKED_TIME_SERVICE_NAME, GOOGLE_CALENDAR_PLACEHOLDER_PHONE } from "../domain/constants"

/**
 * Tipo de resultado padronizado para operações de serviço.
 * Usado para garantir consistência nas respostas de sucesso/erro.
 */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string }

/**
 * Cria um novo agendamento no sistema.
 *
 * **Regras de Negócio:**
 * - Valida que o serviço existe, está ativo e pertence ao salão
 * - Valida que o profissional existe, está ativo e pertence ao salão
 * - Verifica se o profissional executa o serviço solicitado
 * - Verifica se o horário solicitado está dentro do expediente do profissional (considerando timezone do Brasil)
 * - Verifica conflitos com agendamentos existentes (exceto cancelados) usando transação
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
  skipExternalSync?: boolean
  /**
   * Permite furar as regras de DIA/HORÁRIO específico do serviço (apenas a reserva
   * manual da equipe usa isso, após confirmação). A IA NUNCA passa este flag.
   * Não afeta as travas de conflito de agenda / expediente, que seguem valendo.
   */
  allowServiceRuleOverride?: boolean
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

  // Valida serviço e profissional em paralelo
  const [service, professional] = await Promise.all([
    db.query.services.findFirst({
      where: eq(services.id, serviceId),
      columns: {
        id: true,
        salonId: true,
        duration: true,
        durationMax: true,
        allowedWeekdays: true,
        allowedStartTimes: true,
        isActive: true,
      },
    }),
    db.query.professionals.findFirst({
      where: eq(professionals.id, professionalId),
      columns: { id: true, salonId: true, isActive: true, personKey: true },
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

  // Parse da data usando o módulo centralizado
  const parseResult = parseBrazilianDateTime(parse.data.date)
  if (!parseResult.success) {
    return { success: false, error: parseResult.error }
  }
  const { utcDate: startUtc, brazilComponents } = parseResult

  // Calcula horário de término — reserva o MAIOR tempo da faixa (duration_max ?? duration).
  const blockingMinutes = getBlockingDuration(service.duration, service.durationMax)
  const endUtc = new Date(startUtc.getTime() + blockingMinutes * 60 * 1000)

  // Cria um Date com os componentes para validações (getDay, etc)
  const requestedStartBrazil = new Date(
    brazilComponents.year,
    brazilComponents.month,
    brazilComponents.day,
    brazilComponents.hour,
    brazilComponents.minute,
    brazilComponents.second
  )
  const dayOfWeek = requestedStartBrazil.getDay()

  // Regras de agenda POR SERVIÇO (dias permitidos / horários de início específicos).
  // A IA nunca passa allowServiceRuleOverride; a reserva manual pode furar (após
  // confirmação). Conflito de agenda e expediente continuam valendo mesmo no override.
  if (!input.allowServiceRuleOverride) {
    const allowedWeekdays = parseAllowedWeekdays(service.allowedWeekdays)
    if (!isWeekdayAllowed(allowedWeekdays, dayOfWeek)) {
      return {
        success: false,
        code: 'service_rule_violation',
        error: `Este serviço só é realizado em: ${formatWeekdaysPtBr(allowedWeekdays!)}.`,
      }
    }

    const allowedStartTimes = parseAllowedStartTimes(service.allowedStartTimes)
    const requestedTime = `${String(brazilComponents.hour).padStart(2, '0')}:${String(brazilComponents.minute).padStart(2, '0')}`
    if (!isStartTimeAllowed(allowedStartTimes, requestedTime)) {
      return {
        success: false,
        code: 'service_rule_violation',
        error: `Para este serviço, os horários de início disponíveis são: ${allowedStartTimes!.join(', ')}.`,
      }
    }
  }

  // Valida se o horário está dentro do expediente do profissional
  const proDayRules = await db
    .select({ startTime: availability.startTime, endTime: availability.endTime, isBreak: availability.isBreak })
    .from(availability)
    .where(and(eq(availability.professionalId, professionalId), eq(availability.dayOfWeek, dayOfWeek)))

  const workSpans = proDayRules.filter((r) => !r.isBreak)

  if (workSpans.length === 0) {
    return { success: false, error: "Profissional não possui horários cadastrados neste dia" }
  }

  const withinWork = workSpans.some((span) => {
    const startSpanUtc = createBrazilDateTimeFromComponents(brazilComponents, String(span.startTime))
    const endSpanUtc = createBrazilDateTimeFromComponents(brazilComponents, String(span.endTime))

    if (!startSpanUtc || !endSpanUtc) return false

    return startUtc.getTime() >= startSpanUtc.getTime() && endUtc.getTime() <= endSpanUtc.getTime()
  })

  if (!withinWork) {
    return { success: false, error: "Horário fora do expediente do profissional" }
  }

  // Trava de conflito com o Google Calendar (FreeBusy ao vivo).
  // Fecha o gap em que um evento criado direto no Google ainda não foi
  // sincronizado como linha local. Fail-open: só bloqueia se o Google
  // responder explicitamente que o horário está ocupado; ausência de
  // integração ([]) ou instabilidade do Google (exceção) NÃO trava o cliente.
  // Pulado quando o próprio agendamento vem de um sync do Google.
  if (!input.skipExternalSync) {
    try {
      const googleBusy = await getGoogleFreeBusyForProfessional(salonId, professionalId, startUtc, endUtc)
      const overlapsGoogle = googleBusy.some(
        (b) => b.start.getTime() < endUtc.getTime() && b.end.getTime() > startUtc.getTime()
      )
      if (overlapsGoogle) {
        return { success: false, error: "Horário indisponível (conflito com Google Calendar)" }
      }
    } catch (error) {
      console.warn(
        "[createAppointmentService] FreeBusy do Google indisponível — seguindo sem checagem (fail-open):",
        error
      )
    }
  }

  // Resolve todas as linhas de profissional da MESMA pessoa (cross-salão) para
  // travar e checar conflito por pessoa — impede double-booking de quem atende
  // em mais de um salão (inclusive com o dia dividido entre salões).
  const personProfessionalIds = await getPersonProfessionalIdsByKey(
    professional.personKey,
    professionalId
  )
  const personLockKey = professional.personKey ?? professionalId

  // TRANSAÇÃO: Advisory lock + verificação de conflito + inserção atômica
  // O advisory lock garante que apenas uma transação por vez pode criar/modificar
  // agendamentos para a mesma PESSOA, prevenindo race conditions entre salões
  try {
    const result = await db.transaction(async (tx) => {
      // Advisory lock na pessoa — previne criações concorrentes (em qualquer salão)
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${personLockKey}))`)

      // Verifica conflitos com agendamentos existentes da pessoa (dentro da transação)
      const overlappingAppointment = await tx.query.appointments.findFirst({
        where: and(
          inArray(appointments.professionalId, personProfessionalIds),
          ne(appointments.status, 'cancelled'),
          lt(appointments.date, endUtc),
          gt(appointments.endTime, startUtc)
        ),
      })

      if (overlappingAppointment) {
        throw new Error("Horário indisponível (conflito de agenda)")
      }

      // Insere o agendamento
      const [newAppointment] = await tx.insert(appointments).values({
        salonId,
        clientId,
        professionalId,
        serviceId: service.id,
        date: startUtc,
        endTime: endUtc,
        status: 'pending',
        syncSource: input.skipExternalSync ? 'google' : 'app',
        notes: parse.data.notes
      }).returning({ id: appointments.id })

      return { appointmentId: newAppointment.id }
    })

    // Fire-and-forget: Sync to external calendars (Google Calendar, Trinks)
    fireAndForgetCreate(result.appointmentId, salonId, input.skipExternalSync)

    return { success: true, data: result }
  } catch (error) {
    // Se o erro veio da verificação de conflito, retorna mensagem amigável
    if (error instanceof Error && error.message === "Horário indisponível (conflito de agenda)") {
      return { success: false, error: error.message }
    }
    // Outros erros (ex: banco indisponível)
    throw error
  }
}

/**
 * Atualiza um agendamento existente no sistema.
 *
 * **Regras de Negócio:**
 * - Valida que o agendamento existe e não está cancelado
 * - Se professionalId for fornecido: valida que o profissional existe, está ativo e pertence ao salão
 * - Se serviceId for fornecido: valida que o serviço existe, está ativo e pertence ao salão
 * - Se serviceId mudar: verifica se o novo profissional executa o serviço
 * - Se date for fornecido: verifica se o horário está dentro do expediente do profissional
 * - Se date for fornecido: verifica conflitos com agendamentos existentes usando transação
 * - Converte a data/hora do horário de Brasília para UTC antes de salvar
 *
 * @param input - Dados do agendamento a ser atualizado
 * @param input.appointmentId - ID do agendamento (UUID)
 * @param input.professionalId - ID do profissional (UUID, opcional)
 * @param input.serviceId - ID do serviço (UUID, opcional)
 * @param input.date - Data/hora do agendamento (string ISO ou Date, opcional) - interpretada como horário de Brasília
 * @param input.notes - Notas opcionais do agendamento (máx. 1000 caracteres, opcional)
 *
 * @returns Resultado da operação com o ID do agendamento atualizado em caso de sucesso
 *
 * @throws Não lança exceções, retorna erro via ActionResult
 */
export async function updateAppointmentService(input: {
  appointmentId: string
  professionalId?: string
  serviceId?: string
  date?: string | Date
  notes?: string
  skipExternalSync?: boolean
  /** Ver createAppointmentService: permite furar regra de dia/horário (só reserva manual). */
  allowServiceRuleOverride?: boolean
}): Promise<ActionResult<{ appointmentId: string }>> {
  const schema = z.object({
    appointmentId: z.string().uuid(),
    professionalId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    date: z.union([
      z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Data inválida"),
      z.date(),
    ]).optional(),
    notes: z.string().max(1000).optional(),
  })

  const parse = schema.safeParse(input)
  if (!parse.success) {
    return { success: false, error: formatZodError(parse.error) }
  }

  // Busca agendamento existente
  const existingAppointment = await db.query.appointments.findFirst({
    where: eq(appointments.id, parse.data.appointmentId),
    columns: {
      id: true,
      salonId: true,
      professionalId: true,
      serviceId: true,
      date: true,
      endTime: true,
      status: true,
      notes: true,
    },
  })

  if (!existingAppointment) {
    return { success: false, error: "Agendamento não encontrado" }
  }

  if (existingAppointment.status === "cancelled") {
    return { success: false, error: "Não é possível atualizar um agendamento cancelado" }
  }

  // Determina os valores finais (usa novos se fornecidos, senão mantém os existentes)
  const finalProfessionalId = parse.data.professionalId || existingAppointment.professionalId
  const finalServiceId = parse.data.serviceId || existingAppointment.serviceId
  const finalNotes = parse.data.notes !== undefined ? parse.data.notes : existingAppointment.notes

  // Busca serviço para obter duração e regras de agenda
  const service = await db.query.services.findFirst({
    where: eq(services.id, finalServiceId),
    columns: {
      id: true,
      salonId: true,
      duration: true,
      durationMax: true,
      allowedWeekdays: true,
      allowedStartTimes: true,
      isActive: true,
    },
  })

  if (!service || service.salonId !== existingAppointment.salonId || !service.isActive) {
    return { success: false, error: "Serviço inválido ou inativo" }
  }

  // Reserva o MAIOR tempo da faixa (duration_max ?? duration).
  const blockingMinutes = getBlockingDuration(service.duration, service.durationMax)

  // Valida o profissional
  const professional = await db.query.professionals.findFirst({
    where: eq(professionals.id, finalProfessionalId),
    columns: { id: true, salonId: true, isActive: true, personKey: true },
  })

  if (!professional || professional.salonId !== existingAppointment.salonId || !professional.isActive) {
    return { success: false, error: "Profissional inválido ou inativo" }
  }

  // Verifica se o profissional executa o serviço (se mudou serviço ou profissional)
  if (finalServiceId !== existingAppointment.serviceId || finalProfessionalId !== existingAppointment.professionalId) {
    const proService = await db.query.professionalServices.findFirst({
      where: and(eq(professionalServices.professionalId, finalProfessionalId), eq(professionalServices.serviceId, finalServiceId)),
      columns: { id: true },
    })
    if (!proService) {
      return { success: false, error: "Profissional não executa este serviço" }
    }
  }

  // Determina datas de início e fim
  let startUtc: Date = existingAppointment.date
  let endUtc: Date = existingAppointment.endTime
  let brazilComponents: DateComponents | null = null

  if (parse.data.date !== undefined) {
    // Parse da nova data usando o módulo centralizado
    const parseResult = parseBrazilianDateTime(parse.data.date)
    if (!parseResult.success) {
      return { success: false, error: parseResult.error }
    }
    startUtc = parseResult.utcDate
    brazilComponents = parseResult.brazilComponents
    endUtc = new Date(startUtc.getTime() + blockingMinutes * 60 * 1000)
  } else if (finalServiceId !== existingAppointment.serviceId) {
    // Se date não mudou mas serviceId mudou, recalcula endTime
    endUtc = new Date(startUtc.getTime() + blockingMinutes * 60 * 1000)
  }

  // Se date foi fornecido, valida horário dentro do expediente
  if (parse.data.date !== undefined && brazilComponents) {
    const requestedStartBrazil = new Date(
      brazilComponents.year,
      brazilComponents.month,
      brazilComponents.day,
      brazilComponents.hour,
      brazilComponents.minute,
      brazilComponents.second
    )
    const dayOfWeek = requestedStartBrazil.getDay()

    // Regras de agenda POR SERVIÇO (mesma lógica do create). Override só na reserva manual.
    if (!input.allowServiceRuleOverride) {
      const allowedWeekdays = parseAllowedWeekdays(service.allowedWeekdays)
      if (!isWeekdayAllowed(allowedWeekdays, dayOfWeek)) {
        return {
          success: false,
          code: 'service_rule_violation',
          error: `Este serviço só é realizado em: ${formatWeekdaysPtBr(allowedWeekdays!)}.`,
        }
      }

      const allowedStartTimes = parseAllowedStartTimes(service.allowedStartTimes)
      const requestedTime = `${String(brazilComponents.hour).padStart(2, '0')}:${String(brazilComponents.minute).padStart(2, '0')}`
      if (!isStartTimeAllowed(allowedStartTimes, requestedTime)) {
        return {
          success: false,
          code: 'service_rule_violation',
          error: `Para este serviço, os horários de início disponíveis são: ${allowedStartTimes!.join(', ')}.`,
        }
      }
    }

    const proDayRules = await db
      .select({ startTime: availability.startTime, endTime: availability.endTime, isBreak: availability.isBreak })
      .from(availability)
      .where(and(eq(availability.professionalId, finalProfessionalId), eq(availability.dayOfWeek, dayOfWeek)))

    const workSpans = proDayRules.filter((r) => !r.isBreak)

    if (workSpans.length === 0) {
      return { success: false, error: "Profissional não possui horários cadastrados neste dia" }
    }

    const withinWork = workSpans.some((span) => {
      const startSpanUtc = createBrazilDateTimeFromComponents(brazilComponents!, String(span.startTime))
      const endSpanUtc = createBrazilDateTimeFromComponents(brazilComponents!, String(span.endTime))

      if (!startSpanUtc || !endSpanUtc) return false

      return startUtc.getTime() >= startSpanUtc.getTime() && endUtc.getTime() <= endSpanUtc.getTime()
    })

    if (!withinWork) {
      return { success: false, error: "Horário fora do expediente do profissional" }
    }
  }

  // Resolve as linhas da mesma pessoa (cross-salão) para lock/conflito por pessoa.
  const personProfessionalIds = await getPersonProfessionalIdsByKey(
    professional.personKey,
    finalProfessionalId
  )
  const personLockKey = professional.personKey ?? finalProfessionalId

  // TRANSAÇÃO: Advisory lock + verificação de conflito + atualização atômica
  try {
    await db.transaction(async (tx) => {
      // Verifica conflitos se data ou profissional mudou
      const needsConflictCheck = parse.data.date !== undefined ||
        finalProfessionalId !== existingAppointment.professionalId

      if (needsConflictCheck) {
        // Advisory lock na pessoa — previne modificações concorrentes (em qualquer salão)
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${personLockKey}))`)

        const overlappingAppointment = await tx.query.appointments.findFirst({
          where: and(
            inArray(appointments.professionalId, personProfessionalIds),
            ne(appointments.id, parse.data.appointmentId),
            ne(appointments.status, 'cancelled'),
            lt(appointments.date, endUtc),
            gt(appointments.endTime, startUtc)
          ),
        })

        if (overlappingAppointment) {
          throw new Error("Horário indisponível (conflito de agenda)")
        }
      }

      // Atualiza o agendamento
      await tx
        .update(appointments)
        .set({
          professionalId: finalProfessionalId,
          serviceId: finalServiceId,
          date: startUtc,
          endTime: endUtc,
          notes: finalNotes,
          syncSource: input.skipExternalSync ? 'google' : 'app',
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, parse.data.appointmentId))
    })

    // Fire-and-forget: Sync updates to external calendars
    fireAndForgetUpdate(parse.data.appointmentId, existingAppointment.salonId, input.skipExternalSync)

    return { success: true, data: { appointmentId: parse.data.appointmentId } }
  } catch (error) {
    if (error instanceof Error && error.message === "Horário indisponível (conflito de agenda)") {
      return { success: false, error: error.message }
    }
    throw error
  }
}

/**
 * Deleta um agendamento do sistema.
 *
 * **Regras de Negócio:**
 * - Valida que o agendamento existe
 * - Deleta completamente do banco de dados (não apenas cancela)
 *
 * @param input - Dados do agendamento a ser deletado
 * @param input.appointmentId - ID do agendamento (UUID)
 *
 * @returns Resultado da operação em caso de sucesso
 *
 * @throws Não lança exceções, retorna erro via ActionResult
 */
export async function deleteAppointmentService(input: {
  appointmentId: string
  skipExternalSync?: boolean
}): Promise<ActionResult<void>> {
  const schema = z.object({
    appointmentId: z.string().uuid(),
  })

  const parse = schema.safeParse(input)
  if (!parse.success) {
    return { success: false, error: formatZodError(parse.error) }
  }

  // Verifica se o agendamento existe
  const existingAppointment = await db.query.appointments.findFirst({
    where: eq(appointments.id, parse.data.appointmentId),
    columns: { id: true, salonId: true, professionalId: true, serviceId: true, date: true },
  })

  if (!existingAppointment) {
    return { success: false, error: "Agendamento não encontrado" }
  }

  // Fire-and-forget: Sync deletion to external calendars BEFORE deleting from DB
  fireAndForgetDelete(parse.data.appointmentId, existingAppointment.salonId, input.skipExternalSync)

  // Deleta o agendamento
  await db.delete(appointments).where(eq(appointments.id, parse.data.appointmentId))

  // Tenta preencher a vaga (não trava o processo)
  processVacantSlot({
    salonId: existingAppointment.salonId,
    professionalId: existingAppointment.professionalId,
    serviceId: existingAppointment.serviceId,
    dateUtc: existingAppointment.date
  }).catch(console.error)

  return { success: true, data: undefined }
}

/**
 * Cria um "bloqueio de horário" a partir de um evento do Google Calendar.
 *
 * Diferente do createAppointmentService, este NÃO valida disponibilidade
 * nem executa sync de volta para o Google Calendar (evita loop).
 * Cria automaticamente servico/cliente placeholder se necessário.
 */
export async function createBlockedTimeService(input: {
  salonId: string
  professionalId: string
  startTime: Date
  endTime: Date
  googleEventId: string
  summary?: string | null
}): Promise<ActionResult<{ appointmentId: string }>> {
  const { salonId, professionalId, startTime, endTime, googleEventId, summary } = input

  // Buscar ou criar serviço placeholder "Bloqueio de Horário"
  let blockedService = await db.query.services.findFirst({
    where: and(
      eq(services.salonId, salonId),
      eq(services.name, GOOGLE_BLOCKED_TIME_SERVICE_NAME)
    ),
    columns: { id: true },
  })

  if (!blockedService) {
    const durationMinutes = Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / (60 * 1000)))
    const [created] = await db.insert(services).values({
      salonId,
      name: GOOGLE_BLOCKED_TIME_SERVICE_NAME,
      duration: durationMinutes,
      price: '0',
      isActive: true,
    }).returning({ id: services.id })
    blockedService = created
  }

  // Buscar ou criar cliente placeholder "Google Calendar"
  let placeholderCustomer = await db.query.customers.findFirst({
    where: and(
      eq(customers.salonId, salonId),
      eq(customers.phone, GOOGLE_CALENDAR_PLACEHOLDER_PHONE)
    ),
    columns: { id: true },
  })

  if (!placeholderCustomer) {
    const [created] = await db.insert(customers).values({
      salonId,
      name: 'Google Calendar',
      phone: GOOGLE_CALENDAR_PLACEHOLDER_PHONE,
    }).returning({ id: customers.id })
    placeholderCustomer = created
  }

  // Verificar se já existe appointment com este googleEventId
  const existing = await db.query.appointments.findFirst({
    where: eq(appointments.googleEventId, googleEventId),
    columns: { id: true },
  })

  if (existing) {
    return { success: true, data: { appointmentId: existing.id } }
  }

  // Criar o bloqueio (sem validação de disponibilidade, sem sync externo)
  const [newAppointment] = await db.insert(appointments).values({
    salonId,
    professionalId,
    clientId: placeholderCustomer.id,
    serviceId: blockedService.id,
    date: startTime,
    endTime,
    status: 'confirmed',
    syncSource: 'google',
    syncStatus: 'synced',
    googleEventId,
    notes: summary ? `Evento do Google Calendar: ${summary}` : 'Evento do Google Calendar',
  }).returning({ id: appointments.id })

  return { success: true, data: { appointmentId: newAppointment.id } }
}
